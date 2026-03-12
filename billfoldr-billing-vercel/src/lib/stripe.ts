import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY missing');

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const PRICE_YEARLY_FIXED = process.env.STRIPE_PRICE_YEARLY_FIXED!;
export const PRICE_OVERAGE_METERED = process.env.STRIPE_PRICE_OVERAGE_METERED!;
