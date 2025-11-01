import type { NextApiRequest, NextApiResponse } from 'next';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

const bodySchema = z.object({ uid: z.string().min(6) });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { uid } = parsed.data;

  const { data: userRow, error } = await supabaseAdmin
    .from('app_users')
    .select('stripe_customer_id')
    .eq('user_id', uid)
    .single();

  if (error || !userRow?.stripe_customer_id) return res.status(404).json({ error: 'Customer not found' });

  const portal = await stripe.billingPortal.sessions.create({
    customer: userRow.stripe_customer_id,
    return_url: process.env.NEXT_PUBLIC_APP_URL || 'https://billing.billfoldr.com',
  });

  res.status(200).json({ url: portal.url });
}
