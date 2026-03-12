import type { NextApiRequest, NextApiResponse } from 'next';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

const uidSchema = z.string().min(6);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let uid: string | undefined;

    if (req.method === 'GET') {
      const parsed = uidSchema.safeParse(req.query.uid);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid uid' });
      }
      uid = parsed.data;
    } else if (req.method === 'POST') {
      const parsed = uidSchema.safeParse(req.body?.uid);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid uid' });
      }
      uid = parsed.data;
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { data: userRow, error } = await supabaseAdmin
      .from('app_users')
      .select('stripe_customer_id')
      .eq('user_id', uid)
      .single();

    if (error || !userRow?.stripe_customer_id) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: userRow.stripe_customer_id,
      return_url: process.env.NEXT_PUBLIC_APP_URL || 'https://billward.app',
    });

    if (req.method === 'GET') {
      return res.redirect(302, portal.url);
    }

    return res.status(200).json({ url: portal.url });
  } catch (err: any) {
    console.error('Portal creation failed', err);
    return res.status(500).json({ error: 'Portal creation failed' });
  }
}
