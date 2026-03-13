import type { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { uid, returnTo } = req.body;

  if (!uid) {
    return res.status(400).json({ error: "Missing uid" });
  }

  const { data: user } = await supabaseAdmin
    .from("app_users")
    .select("stripe_customer_id")
    .eq("user_id", uid)
    .single();

  if (!user?.stripe_customer_id) {
    return res.status(400).json({ error: "No Stripe customer" });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: returnTo || "https://billfoldr.app/dashboard/",
  });

  return res.status(200).json({
    url: session.url,
  });
}
