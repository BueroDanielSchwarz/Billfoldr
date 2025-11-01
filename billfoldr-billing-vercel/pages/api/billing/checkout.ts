import type { NextApiRequest, NextApiResponse } from 'next';
import { stripe, PRICE_YEARLY_FIXED, PRICE_OVERAGE_METERED } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

const bodySchema = z.object({
  uid: z.string().min(6),
  email: z.string().email().optional(),
  returnTo: z.string().url().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { uid, email, returnTo } = parsed.data;

  const { data: userRow, error: userErr } = await supabaseAdmin
    .from('app_users')
    .select('user_id, email, stripe_customer_id')
    .eq('user_id', uid)
    .single();

  if (userErr || !userRow) return res.status(404).json({ error: 'User not found' });

  let customerId = userRow.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: email || userRow.email || undefined,
      metadata: { uid },
    });
    customerId = customer.id;
    await supabaseAdmin.from('app_users').update({ stripe_customer_id: customerId }).eq('user_id', uid);
  }

  const successBase = (process.env.NEXT_PUBLIC_APP_URL || '') + (process.env.BILLING_SUCCESS_PATH || '/billing/success');
  const cancelBase  = (process.env.NEXT_PUBLIC_APP_URL || '') + (process.env.BILLING_CANCEL_PATH  || '/billing/cancel');

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    billing_address_collection: 'required',
    allow_promotion_codes: false,
    automatic_tax: { enabled: true },
    line_items: [
      { price: PRICE_YEARLY_FIXED, quantity: 1 },
      { price: PRICE_OVERAGE_METERED },
    ],
    success_url: (returnTo || successBase) + '?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: cancelBase,
    metadata: { uid },
  });

  return res.status(200).json({ url: session.url });
}
