import { supabaseAdmin } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';

function yyyymm(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }

const now = new Date();
const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()-1, 1));
const lastMonthStart = new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth(), 1));
const lastMonthEnd = new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth()+1, 0, 23, 59, 59));

async function main() {
  const { data: subs, error } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id, metered_item_id, status')
    .in('status', ['active', 'trialing']);

  if (error) throw error;

  for (const s of subs || []) {
    if (!s.metered_item_id) continue;

    const { data: usageRow, error: uErr } = await supabaseAdmin
      .rpc('get_docs_count_month', {
        p_user_id: s.user_id,
        p_year: lastMonthStart.getUTCFullYear(),
        p_month: lastMonthStart.getUTCMonth() + 1
      }).single();

    if (uErr) { console.error('rpc error', s.user_id, uErr); continue; }

    const docs = usageRow?.docs_total ?? 0;
    const base = 1000;
    const over = Math.max(0, Math.ceil(Math.max(0, docs - base) / 1000));

    if (over > 0) {
      await stripe.subscriptionItems.createUsageRecord(s.metered_item_id, {
        action: 'set',
        quantity: over,
        timestamp: Math.floor(lastMonthEnd.getTime() / 1000),
      });
    }

    await supabaseAdmin.from('usage_monthly').upsert({
      user_id: s.user_id,
      year_month: yyyymm(lastMonthStart),
      docs_total: docs,
      overage_units: over,
      reported_to_stripe_at: new Date().toISOString(),
    }, { onConflict: 'user_id,year_month' });
  }

  console.log('Usage reporting done for', yyyymm(lastMonthStart));
}

main().catch((e) => { console.error(e); process.exit(1); });
