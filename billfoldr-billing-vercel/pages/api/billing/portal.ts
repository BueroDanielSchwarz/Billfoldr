import type { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const uid = req.query.uid as string;

  if (!uid) {
    return res.status(400).send("Missing uid");
  }

  const { data: user } = await supabaseAdmin
    .from("app_users")
    .select("stripe_customer_id")
    .eq("user_id", uid)
    .single();

  if (!user?.stripe_customer_id) {
    return res.status(400).send("No Stripe customer");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: "https://billfoldr.app/dashboard/",
  });

  res.redirect(session.url);
}
