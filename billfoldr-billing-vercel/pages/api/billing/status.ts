import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

const querySchema = z.object({ uid: z.string().min(6) });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { uid } = parsed.data;

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('status, current_period_end, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: usage } = await supabaseAdmin
    .rpc('get_docs_count_current_month', { p_user_id: uid })
    .single();

  res.status(200).json({
    active: sub?.status === 'active' || sub?.status === 'trialing',
    current_period_end: sub?.current_period_end,
    docs_this_month: usage?.docs_this_month ?? 0,
    base: 1000,
  });
}
