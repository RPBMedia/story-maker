# StoryMaker — Stripe subscriptions setup

The code for subscriptions is done (Checkout, Customer Portal, webhook, and the
account/billing UI). What's left is provisioning **your** Stripe + Supabase
secrets. Do it in **test mode** first — no real money — then flip to live.

Nothing secret here goes in the browser: every key below is a **server** env var
used only by the `/api/*` serverless functions.

---

## How it works (the money path)

```
User clicks "Upgrade" → /api/checkout (verifies login, creates Stripe Checkout)
   → Stripe hosted Checkout page → user pays
   → Stripe → /api/webhook (verified) → writes plan to Supabase profiles
   → app re-reads the profile → user is now Creator/Pro
Manage/cancel → /api/portal → Stripe Customer Portal
```

The **webhook is the only thing that grants a paid plan** — the browser can't.

---

## 1. Supabase — run the migration

Supabase dashboard → **SQL Editor** → paste and run
`supabase/migrations/0002_stripe.sql` (adds `stripe_customer_id`,
`stripe_subscription_id`, `subscription_status`, `current_period_end`).

Then grab, from **Project Settings → API**:
- **Project URL** → `https://ccxxachnmntbvaichioa.supabase.co`
- **`service_role` secret key** (NOT the anon key) — this is powerful; keep it
  server-side only.

## 2. Stripe — create products & prices (test mode)

Toggle **Test mode** (top right). **Products → Add product**:
- **Creator** → recurring price, monthly. For the first real-money test later,
  you can set this low (Stripe minimum is ~$0.50); for production, $5.
- **Pro** → recurring price, monthly ($15 for production).

Copy each **Price ID** (`price_...`).

## 3. Stripe — enable the Customer Portal

**Settings → Billing → Customer portal → Activate.** (Required, or
`/api/portal` errors.) Allow customers to cancel and switch plans.

## 4. Stripe — get your secret key

**Developers → API keys → Secret key** (`sk_test_...`).

## 5. Vercel — set environment variables

Project → **Settings → Environment Variables** (Production **and** Preview):

| Name | Value |
|------|-------|
| `STRIPE_SECRET_KEY` | `sk_test_...` |
| `STRIPE_PRICE_CREATOR` | `price_...` (Creator) |
| `STRIPE_PRICE_PRO` | `price_...` (Pro) |
| `SUPABASE_URL` | `https://ccxxachnmntbvaichioa.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` secret |
| `APP_URL` | `https://story-maker.app` |
| `STRIPE_WEBHOOK_SECRET` | *(fill in after step 6)* |

## 6. Stripe — create the webhook

**Developers → Webhooks → Add endpoint**:
- **Endpoint URL:** `https://story-maker.app/api/webhook`
- **Events to send:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Save, then copy the **Signing secret** (`whsec_...`) into the
  `STRIPE_WEBHOOK_SECRET` env var from step 5.

## 7. Redeploy

Env-var changes need a new deploy. Push any commit, or Vercel → Deployments →
**Redeploy**.

---

## 8. Test the whole flow (test mode)

1. Open the live site, **sign in** (god mode is off in production, so you're a
   real Free user).
2. Add a soundtrack **longer than 2:00**, go to **Export** → the upgrade prompt
   shows → click **Upgrade to Creator**.
3. On Stripe Checkout use test card **`4242 4242 4242 4242`**, any future
   expiry, any CVC/ZIP.
4. You return to the app with a "Payment received" banner; within a few seconds
   your plan flips to **Creator** (the webhook did it). Now the long export is
   allowed.
5. **Account menu → Account & billing → Manage subscription** opens the Stripe
   portal; cancel there and confirm the plan drops back to Free.

Watch **Stripe → Developers → Webhooks → your endpoint** for `200` responses.
If you see `400 signature` errors, double-check `STRIPE_WEBHOOK_SECRET`.

## 9. Go live (real money)

- Turn **off** Test mode in Stripe; recreate the products/prices (or use live
  ones), set real prices.
- Swap the Vercel env vars to the **live** `sk_live_...`, live `price_...`, and a
  **new live webhook** signing secret (create the webhook again in live mode).
- Redeploy, then do one small real charge with a real card to confirm payout to
  your bank (**Stripe → Balance → Payouts**).

---

### Notes
- **God mode** is disabled on the deployed site (only on in local dev, or if you
  set `VITE_ENABLE_GOD_MODE="true"`). That's intentional so you experience the
  real paywall.
- The prices **shown in the app** (Free/$5/$15) live in
  `src/services/entitlements.ts`; the prices **charged** live in Stripe. Keep
  them in sync for production. For a cheap live test you can lower the Stripe
  price without changing the labels.
- Never expose `STRIPE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to the client.
