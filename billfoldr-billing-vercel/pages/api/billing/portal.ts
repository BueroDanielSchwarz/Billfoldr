import type { NextApiRequest, NextApiResponse } from 'next';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

const bodySchema = z.object({
  uid: z.string().min(6),
  returnTo: z.string().url().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = bodySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { uid, returnTo } = parsed.data;

  const { data: userRow, error: userErr } = await supabaseAdmin
    .from('app_users')
    .select('user_id, stripe_customer_id')
    .eq('user_id', uid)
    .single();

  if (userErr || !userRow) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!userRow.stripe_customer_id) {
    return res.status(400).json({ error: 'No Stripe customer found' });
  }

  const fallbackReturnUrl =
    (process.env.NEXT_PUBLIC_APP_URL || '') +
    (process.env.BILLING_PORTAL_RETURN_PATH || '/konto/online-funktionen');

  const session = await stripe.billingPortal.sessions.create({
    customer: userRow.stripe_customer_id,
    return_url: returnTo || fallbackReturnUrl,
  });

  return res.status(200).json({ url: session.url });
}
