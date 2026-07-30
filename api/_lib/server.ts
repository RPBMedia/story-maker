/**
 * Shared server-only helpers for the Stripe serverless functions.
 *
 * SECURITY: everything here uses SERVER env vars (no VITE_ prefix) — the Stripe
 * secret key, the Supabase service-role key, and the webhook secret. None of
 * these are ever bundled into the browser. Set them in the Vercel project's
 * Environment Variables (see STRIPE-SETUP.md).
 */
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";

export type PlanId = "free" | "creator" | "professional";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const stripe = new Stripe(required("STRIPE_SECRET_KEY"));

/** Supabase client with the service-role key — bypasses RLS. Server only. */
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var.",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---- plan <-> Stripe price mapping (env-driven; prices live in Stripe) ------

export function priceForPlan(plan: PlanId): string | null {
  if (plan === "creator") return process.env.STRIPE_PRICE_CREATOR ?? null;
  if (plan === "professional") return process.env.STRIPE_PRICE_PRO ?? null;
  return null; // free has no price
}

export function planForPrice(priceId: string | null | undefined): PlanId {
  if (priceId && priceId === process.env.STRIPE_PRICE_CREATOR) return "creator";
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return "professional";
  return "free";
}

// ---- request helpers --------------------------------------------------------

/** The public app origin, for building Stripe redirect URLs. */
export function appUrl(req: VercelRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

/**
 * Validate the caller's Supabase access token (sent as `Authorization:
 * Bearer <jwt>`) and return the authenticated user. Throws on any failure so
 * endpoints can 401 cleanly.
 */
export async function requireUser(
  req: VercelRequest,
): Promise<{ id: string; email: string | null }> {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Error("unauthorized");
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new Error("unauthorized");
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Read the raw request body (needed for Stripe webhook signature checks). */
export async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
