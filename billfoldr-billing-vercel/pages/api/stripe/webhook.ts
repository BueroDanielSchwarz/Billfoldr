import type { NextApiRequest, NextApiResponse } from 'next';
import { stripe, PRICE_YEARLY_FIXED } from '@/lib/stripe';
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

function getFixedItem(sub: any): any | null {
  return (
    sub.items?.data?.find((item: any) => item.price?.id === PRICE_YEARLY_FIXED) ||
    sub.items?.data?.find((item: any) => item.price?.recurring?.interval === 'year') ||
    null
  );
}

function getMeteredItem(sub: any): any | null {
  return (
    sub.items?.data?.find(
      (item: any) => item.price?.recurring?.usage_type === 'metered'
    ) || null
  );
}

function getStripePriceId(sub: any): string | null {
  return getFixedItem(sub)?.price?.id || null;
}

function getPlanCode(sub: any): string | null {
  const fixedPriceId = getStripePriceId(sub);
  if (fixedPriceId === PRICE_YEARLY_FIXED) return 'cloud_yearly';
  return null;
}

function getPlanName(sub: any): string | null {
  const fixed = getFixedItem(sub);
  return fixed?.price?.nickname || fixed?.price?.id || null;
}

function getBillingInterval(sub: any): string | null {
  return getFixedItem(sub)?.price?.recurring?.interval || null;
}

function getCurrency(sub: any): string | null {
  return getFixedItem(sub)?.price?.currency || null;
}

function getLatestInvoiceId(sub: any): string | null {
  if (!sub?.latest_invoice) return null;
  return typeof sub.latest_invoice === 'string'
    ? sub.latest_invoice
    : sub.latest_invoice.id || null;
}

function getSubscriptionStateUi(sub: any): string {
  if (['active', 'trialing', 'past_due'].includes(sub.status)) return 'active';
  if (sub.status === 'canceled') return 'canceled';
  return 'inactive';
}

function hasCloudAccess(sub: any): boolean {
  return ['active', 'trialing', 'past_due'].includes(sub.status);
}

async function resolveUidBySubscriptionOrCustomer(
  stripeSubscriptionId?: string | null,
  stripeCustomerId?: string | null
): Promise<string | undefined> {
  if (stripeSubscriptionId) {
    const { data: existingBySub } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .maybeSingle();

    if (existingBySub?.user_id) return existingBySub.user_id;
  }

  if (stripeCustomerId) {
    const { data: userByCustomer } = await supabaseAdmin
      .from('app_users')
      .select('user_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();

    if (userByCustomer?.user_id) return userByCustomer.user_id;
  }

  return undefined;
}

async function syncAccess(uid: string, sub: any, stripeCustomerId?: string | null) {
  const cloudAccess = hasCloudAccess(sub);
  const planCode = getPlanCode(sub);
  const subscriptionStateUi = getSubscriptionStateUi(sub);

  await supabaseAdmin.from('entitlements').upsert(
    {
      user_id: uid,
      cloud_access: cloudAccess,
      max_base_per_month: 1000,
      valid_until: toIsoDate(sub.current_period_end),
      plan_code: planCode,
      will_cancel: sub.cancel_at_period_end ?? false,
      subscription_state_ui: subscriptionStateUi,
    },
    { onConflict: 'user_id' }
  );

  const appUserPatch: Record<string, any> = {
    cloud_enabled: cloudAccess,
  };

  if (stripeCustomerId) {
    appUserPatch.stripe_customer_id = stripeCustomerId;
  }

  await supabaseAdmin
    .from('app_users')
    .update(appUserPatch)
    .eq('user_id', uid);
}

async function upsertSubscription(uid: string, sub: any, stripeCustomerId?: string | null) {
  await supabaseAdmin.from('subscriptions').upsert(
    {
      user_id: uid,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_start: toIsoDate(sub.current_period_start),
      current_period_end: toIsoDate(sub.current_period_end),
      fixed_item_id: getFixedItem(sub)?.id || null,
      metered_item_id: getMeteredItem(sub)?.id || null,
      stripe_customer_id: stripeCustomerId || null,
      stripe_price_id: getStripePriceId(sub),
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      canceled_at: toIsoDate(sub.canceled_at),
      ended_at: toIsoDate(sub.ended_at),
      currency: getCurrency(sub),
      billing_interval: getBillingInterval(sub),
      plan_code: getPlanCode(sub),
      plan_name: getPlanName(sub),
      latest_invoice_id: getLatestInvoiceId(sub),
    },
    { onConflict: 'stripe_subscription_id' }
  );
}

async function upsertInvoice(invoice: any) {
  const stripeCustomerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || null;

  const stripeSubscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id || null;

  const uid = await resolveUidBySubscriptionOrCustomer(
    stripeSubscriptionId,
    stripeCustomerId
  );

  if (!uid) return;

  await supabaseAdmin.from('billing_invoices').upsert(
    {
      user_id: uid,
      stripe_invoice_id: invoice.id,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      status: invoice.status || null,
      amount_paid: invoice.amount_paid ?? null,
      amount_due: invoice.amount_due ?? null,
      currency: invoice.currency || null,
      invoice_number: invoice.number || null,
      invoice_pdf_url: invoice.invoice_pdf || null,
      hosted_invoice_url: invoice.hosted_invoice_url || null,
      period_start: toIsoDate(invoice.period_start),
      period_end: toIsoDate(invoice.period_end),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_invoice_id' }
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing signature');

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

  // Idempotenz
  const { error: idempotencyError } = await supabaseAdmin
  .from('stripe_event_log')
  .insert({ stripe_event_id: event.id });

if (idempotencyError) {
  if (idempotencyError.code === '23505') {
    return res.status(200).json({ received: true });
  }

  console.error('stripe_event_log insert failed', idempotencyError);
  return res.status(500).send('Webhook idempotency check failed');
}

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const subscriptionId = session.subscription as string | undefined;
        const stripeCustomerId = session.customer as string | undefined;
        const uid = session.metadata?.uid as string | undefined;

        if (!uid || !subscriptionId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await upsertSubscription(uid, sub, stripeCustomerId);
        await syncAccess(uid, sub, stripeCustomerId);

        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as any;

        const stripeCustomerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

        const uid = await resolveUidBySubscriptionOrCustomer(sub.id, stripeCustomerId);
        if (!uid) break;

        await upsertSubscription(uid, sub, stripeCustomerId);
        await syncAccess(uid, sub, stripeCustomerId);

        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;

        const stripeCustomerId =
          typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

        const uid = await resolveUidBySubscriptionOrCustomer(sub.id, stripeCustomerId);
        if (!uid) break;

        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'canceled',
            cancel_at_period_end: false,
            current_period_end: toIsoDate(sub.current_period_end),
            canceled_at: toIsoDate(sub.canceled_at),
            ended_at: toIsoDate(sub.ended_at),
            stripe_customer_id: stripeCustomerId || null,
            stripe_price_id: getStripePriceId(sub),
            currency: getCurrency(sub),
            billing_interval: getBillingInterval(sub),
            plan_code: getPlanCode(sub),
            plan_name: getPlanName(sub),
            latest_invoice_id: getLatestInvoiceId(sub),
          })
          .eq('stripe_subscription_id', sub.id);

        await syncAccess(uid, sub, stripeCustomerId);
        break;
      }

      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        await upsertInvoice(invoice);
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
