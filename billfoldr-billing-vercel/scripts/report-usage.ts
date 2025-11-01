// scripts/report-usage.ts
import { supabaseAdmin } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';

function yyyymm(date: Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }

const now = new Date();
const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()-1, 1));
const lastMonthStart = new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth(), 1));
const lastMonthEnd   = new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth()+1, 0, 23, 59, 59));

async function main() {
  // aktive Abos holen (wie gehabt)
  const { data: subs, error } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id, status')
    .in('status', ['active', 'trialing']);

  if (error) throw error;

  for (const s of subs || []) {
    // Nutzungsmenge des Vormonats aus deiner RPC
    const { data: usageRow, error: uErr }: {
      data: { docs_total?: number } | null, error: any
    } = await supabaseAdmin
      .rpc('get_docs_count_month', {
        p_user_id: s.user_id,
        p_year:  lastMonthStart.getUTCFullYear(),
        p_month: lastMonthStart.getUTCMonth() + 1
      })
      .single();

    if (uErr) { console.error('rpc error', s.user_id, uErr); continue; }

    const docs = usageRow?.docs_total ?? 0;

    // 1000 inklusive, danach je angefangene 1000 (also "Overage-Units")
    const base = 1000;
    const over = Math.max(0, Math.ceil(Math.max(0, docs - base) / 1000));
    if (over <= 0) {
      // trotzdem Monatszeile schreiben
      await supabaseAdmin.from('usage_monthly').upsert({
        user_id: s.user_id,
        year_month: yyyymm(lastMonthStart),
        docs_total: docs,
        overage_units: 0,
        reported_to_stripe_at: new Date().toISOString(),
      }, { onConflict: 'user_id,year_month' });
      continue;
    }

    // Stripe-Customer zu diesem User holen
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('app_users')
      .select('stripe_customer_id')
      .eq('user_id', s.user_id)
      .single();

    if (userErr || !userRow?.stripe_customer_id) {
      console.warn('⚠️ keine stripe_customer_id für', s.user_id, userErr);
      continue;
    }

    // >>> NEU: Meter Event statt UsageRecord
    try {
      await stripe.billing.meterEvents.create({
        event_name: 'docs_uploaded', // dein Zähler-Ereignisname
        payload: {
          stripe_customer_id: userRow.stripe_customer_id, // muss mit dem Zähler-Mapping übereinstimmen
          value: String(over),          // <— hier String statt number - Anzahl Over-Units dieses Monats
        },
        timestamp: Math.floor(lastMonthEnd.getTime() / 1000),
      });
      console.log(`✅ reported ${over} over-units for ${userRow.stripe_customer_id}`);
    } catch (e) {
      console.error('❌ stripe.meterEvents.create failed', e);
      continue;
    }

    // Monats-Row festhalten
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
