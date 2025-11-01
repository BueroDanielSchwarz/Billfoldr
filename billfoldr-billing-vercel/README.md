# Billfoldr Billing (Vercel-ready)

Next.js + API für https://billing.billfoldr.com

## Deploy (Vercel)
1) Repository erstellen, Code pushen.
2) In Vercel als neues Projekt importieren.
3) Environment Variables setzen:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_PRICE_YEARLY_FIXED
- STRIPE_PRICE_OVERAGE_METERED
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_APP_URL=https://billing.billfoldr.com
- BILLING_SUCCESS_PATH=/billing/success
- BILLING_CANCEL_PATH=/billing/cancel

4) Deploy. DNS: Subdomain `billing` als CNAME auf `cname.vercel-dns.com`.

## Endpunkte
- POST /api/billing/checkout
- GET  /api/billing/status?uid=...
- POST /api/billing/portal
- POST /api/stripe/webhook

## Seiten
- /pay
- /billing/success
- /billing/cancel
- /status (Debug)
