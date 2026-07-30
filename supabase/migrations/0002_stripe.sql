-- StoryMaker: Stripe subscription fields on profiles.
-- Run in the Supabase SQL editor (or `supabase db push`).
--
-- `plan` already exists (0001_profiles.sql). These columns let the Stripe
-- webhook (running with the service-role key) record the customer, the active
-- subscription, and its status/period so the app can show real billing state.

alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists current_period_end timestamptz;

create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id);

-- Row-level security note:
-- The webhook writes with the SERVICE ROLE key, which bypasses RLS — good.
-- Clients only ever READ their own row (existing 0001 policy). Never expose
-- the service-role key to the browser; it lives only in Vercel env vars used
-- by the /api serverless functions.
