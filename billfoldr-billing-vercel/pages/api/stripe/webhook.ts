import type { NextApiRequest, NextApiResponse } from 'next';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';

export const config = { api: { bodyParser: false } };

function buffer(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing signature');

  const buf = await buffer(req);
  let event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig as string, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;
        const uid = session.metadata?.uid as string | undefined;

        if (uid) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await supabaseAdmin.from('subscriptions').upsert({
            user_id: uid,
            stripe_subscription_id: sub.id,
            status: sub.status,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            fixed_item_id: sub.items.data.find(i => !i.price.recurring?.usage_type)?.id || null,
            metered_item_id: sub.items.data.find(i => i.price.recurring?.usage_type === 'metered')?.id || null,
          }, { onConflict: 'stripe_subscription_id' });

          await supabaseAdmin.from('entitlements').upsert({
            user_id: uid,
            cloud_access: true,
            max_base_per_month: 1000,
            valid_until: new Date(sub.current_period_end * 1000).toISOString(),
          }, { onConflict: 'user_id' });

          await supabaseAdmin.from('app_users').update({ stripe_customer_id: customerId }).eq('user_id', uid);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as any;
        const { data: row } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .single();
        const uid = row?.user_id;
        if (uid) {
          await supabaseAdmin.from('subscriptions').update({
            status: sub.status,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          }).eq('stripe_subscription_id', sub.id);

          await supabaseAdmin.from('entitlements').upsert({
            user_id: uid,
            cloud_access: sub.status === 'active' || sub.status === 'trialing',
            max_base_per_month: 1000,
            valid_until: new Date(sub.current_period_end * 1000).toISOString(),
          }, { onConflict: 'user_id' });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
        const { data: row } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .single();
        const uid = row?.user_id;
        if (uid) {
          await supabaseAdmin.from('subscriptions').update({ status: 'canceled' }).eq('stripe_subscription_id', sub.id);
          await supabaseAdmin.from('entitlements').update({ cloud_access: false }).eq('user_id', uid);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Webhook handling error', err);
    return res.status(500).send('Webhook handler failed');
  }

  return res.status(200).json({ received: true });
}
