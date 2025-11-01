import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

const querySchema = z.object({ uid: z.string().min(6) });

type UsageRow = { docs_this_month?: number } | null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { uid } = parsed.data;

  // letzte Subscription des Users holen (kann null sein)
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('status, current_period_end, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Usage aus RPC holen – defensiv typisieren
  let docsThisMonth = 0;
  const { data: usage }: { data: UsageRow } = await supabaseAdmin
    .rpc('get_docs_count_current_month', { p_user_id: uid });

  if (usage && typeof usage.docs_this_month === 'number') {
    docsThisMonth = usage.docs_this_month;
  }

  return res.status(200).json({
    active: sub?.status === 'active' || sub?.status === 'trialing' || false,
    current_period_end: sub?.current_period_end ?? null,
    docs_this_month: docsThisMonth,
    base: 1000,
  });
}
