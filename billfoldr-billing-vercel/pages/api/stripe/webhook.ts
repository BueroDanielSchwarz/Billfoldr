import type { NextApiRequest, NextApiResponse } from 'next';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';

export const config = {
  api: {
    bodyParser: false,
  },
};

function buffer(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function toIsoDate(unixSeconds?: number | null): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function getFixedItemId(sub: any): string | null {
  return (
    sub.items?.data?.find((item: any) => item.price?.recurring?.interval === 'year')?.id ||
    null
  );
}

function getMeteredItemId(sub: any): string | null {
  return (
    sub.items?.data?.find(
      (item: any) => item.price?.recurring?.usage_type === 'metered'
    )?.id || null
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const sig = req.headers['stripe-signature'];

  if (!sig) {
    return res.status(400).send('Missing signature');
  }

  const buf = await buffer(req);

  let event: any;

  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig as string,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const subscriptionId = session.subscription as string | undefined;
        const customerId = session.customer as string | undefined;
        const uid = session.metadata?.uid as string | undefined;

        if (!uid || !subscriptionId || !customerId) {
          break;
        }

        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        await supabaseAdmin.from('subscriptions').upsert(
          {
            user_id: uid,
            stripe_subscription_id: sub.id,
            status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
            current_period_start: toIsoDate(sub.current_period_start),
            current_period_end: toIsoDate(sub.current_period_end),
            fixed_item_id: getFixedItemId(sub),
            metered_item_id: getMeteredItemId(sub),
          },
          {
            onConflict: 'stripe_subscription_id',
          }
        );

        await supabaseAdmin.from('entitlements').upsert(
          {
            user_id: uid,
            cloud_access: ['active', 'trialing', 'past_due'].includes(sub.status),
            max_base_per_month: 1000,
            valid_until: toIsoDate(sub.current_period_end),
          },
          {
            onConflict: 'user_id',
          }
        );

        await supabaseAdmin
          .from('app_users')
          .update({ stripe_customer_id: customerId })
          .eq('user_id', uid);

        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as any;
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

        let uid: string | undefined;

        // Zuerst versuchen wir die Zuordnung über subscription_id
        const { data: existingBySub } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();

        if (existingBySub?.user_id) {
          uid = existingBySub.user_id;
        }

        // Falls noch nichts gefunden wurde: Fallback über stripe_customer_id
        if (!uid && customerId) {
          const { data: userByCustomer } = await supabaseAdmin
            .from('app_users')
            .select('user_id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();

          if (userByCustomer?.user_id) {
            uid = userByCustomer.user_id;
          }
        }

        if (uid) {
          await supabaseAdmin.from('subscriptions').upsert(
            {
              user_id: uid,
              stripe_subscription_id: sub.id,
              status: sub.status,
              cancel_at_period_end: sub.cancel_at_period_end ?? false,
              current_period_start: toIsoDate(sub.current_period_start),
              current_period_end: toIsoDate(sub.current_period_end),
              fixed_item_id: getFixedItemId(sub),
              metered_item_id: getMeteredItemId(sub),
            },
            {
              onConflict: 'stripe_subscription_id',
            }
          );

          await supabaseAdmin.from('entitlements').upsert(
            {
              user_id: uid,
              cloud_access: ['active', 'trialing', 'past_due'].includes(sub.status),
              max_base_per_month: 1000,
              valid_until: toIsoDate(sub.current_period_end),
            },
            {
              onConflict: 'user_id',
            }
          );
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

        let uid: string | undefined;

        const { data: existingBySub } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();

        if (existingBySub?.user_id) {
          uid = existingBySub.user_id;
        }

        if (!uid && customerId) {
          const { data: userByCustomer } = await supabaseAdmin
            .from('app_users')
            .select('user_id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();

          if (userByCustomer?.user_id) {
            uid = userByCustomer.user_id;
          }
        }

        if (uid) {
          await supabaseAdmin
            .from('subscriptions')
            .update({
              status: 'canceled',
              cancel_at_period_end: false,
              current_period_end: toIsoDate(sub.current_period_end),
            })
            .eq('stripe_subscription_id', sub.id);

          await supabaseAdmin
            .from('entitlements')
            .update({
              cloud_access: false,
              valid_until: toIsoDate(sub.current_period_end),
            })
            .eq('user_id', uid);
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
