import type { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";

const ALLOWED_ORIGIN = "https://billward.app";

function setCors(res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { uid, returnTo } = req.body || {};

    if (!uid) {
      return res.status(400).json({ error: "Missing uid" });
    }

    const { data: user, error } = await supabaseAdmin
      .from("app_users")
      .select("stripe_customer_id")
      .eq("user_id", uid)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: "No Stripe customer" });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: returnTo || "https://billward.app/dashboard/",
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error("portal.ts error", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
