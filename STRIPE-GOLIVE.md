# StoryMaker — Going live with real payments

The test flow works end-to-end. This guide flips the same system from **test
mode** to **live** so you can accept real money. We'll go through it together.

**Golden rule:** live mode is a completely separate world from your sandbox.
Nothing carries over automatically — products, keys, and the webhook must all be
re-created in **live mode**, and the Vercel env vars swapped to the live values.
Your sandbox/test setup stays intact, so you can keep testing anytime.

**What you'll need on hand:** a photo ID, your business/personal details, and a
**bank account** for payouts. A **real credit card** for one small confirmation
charge at the end.

---

## Step 1 — Activate & verify your Stripe account

This is the part we skipped for testing. Real payments require it.

1. In the Stripe dashboard, click **Verify your business** / **Activate
   payments** (the banner you saw).
2. Fill in:
   - **Business details** — country (Sweden), business type (individual/sole
     trader or company), name, address.
   - **Identity** — your ID document (Stripe may verify instantly or in a few
     hours).
   - **Bank account** — IBAN for **payouts** (where your money lands).
   - **Statement descriptor** — what shows on customers' card statements
     (e.g. `STORYMAKER`).
3. Submit and wait for **"Payments enabled" / account activated**. If Stripe
   requests more info, complete it before continuing.

> You cannot create a live charge until the account is activated. Everything
> below assumes it is.

## Step 2 — Switch to Live mode

Toggle **Test mode OFF** (top-right). The banner should no longer say "sandbox".
Every step below must be done with **Live mode active** — double-check the toggle
before each one.

## Step 3 — Re-create the products & prices (live)

Test products don't exist in live mode. **Product catalogue → + Add product**:

- **Creator** — Recurring, **5.00 USD**, Monthly → copy the **live Price ID**
- **Pro** — Recurring, **15.00 USD**, Monthly → copy the **live Price ID**

Live Price IDs also start with `price_...` but are different from your test ones.
Keep these two — they replace `STRIPE_PRICE_CREATOR` / `STRIPE_PRICE_PRO`.

> Currency note: the app labels say `$5 / $15` (in `src/services/entitlements.ts`).
> Keep the Stripe currency **USD** so charges match the labels. If you'd rather
> bill in SEK/EUR, we change both the Stripe prices **and** the labels together.

## Step 4 — Enable the Customer Portal (live)

**Settings → Billing → Customer portal** → **Activate** in **live** mode too
(it's configured per-mode). Allow **cancel** and **switch plans**, and add the
live Creator + Pro products — same as we did in test.

## Step 5 — Get your live secret key

**Developers → API keys** (live mode) → reveal the **Secret key** → it starts
with **`sk_live_...`**. Copy it. 🔒 Never paste it in chat or the browser — it
goes straight into Vercel.

## Step 6 — Create the live webhook

**Developers → Webhooks / Event destinations** (live mode) → **Add endpoint**:

- **Scope:** Your account
- **API version:** keep the default `2020-08-27` (matches the code)
- **Endpoint URL:**
  ```
  https://story-maker.app/api/webhook
  ```
- **Events (the same four):**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Save, then copy the **live Signing secret** (`whsec_...`) — different from the
test one.

## Step 7 — Swap the Vercel env vars to live values

Vercel → project → **Settings → Environment Variables**. Update these **three**
to their live values (Production + Preview); leave the Supabase ones and
`APP_URL` unchanged:

| Name | New (live) value |
|------|------------------|
| `STRIPE_SECRET_KEY` | `sk_live_...` (Step 5) |
| `STRIPE_PRICE_CREATOR` | live Creator `price_...` (Step 3) |
| `STRIPE_PRICE_PRO` | live Pro `price_...` (Step 3) |
| `STRIPE_WEBHOOK_SECRET` | live `whsec_...` (Step 6) |

Unchanged: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.

> Tip: edit the existing variables in place rather than adding duplicates.

## Step 8 — Redeploy

**Deployments → latest → ⋯ → Redeploy.** Env-var changes need a fresh deploy to
take effect (same as test). Wait for **Ready**.

## Step 9 — Smoke-test the live endpoints

Before spending real money, confirm the functions initialized with the live
vars. These should return the same healthy responses as in test:

- `GET /api/webhook` → **405** (function loads → `STRIPE_SECRET_KEY` live is set)
- `POST /api/webhook` (no signature) → **400** "No stripe-signature header"
  (→ `STRIPE_WEBHOOK_SECRET` live is set)
- `POST /api/checkout` (no auth) → **401** "Please sign in first."

(I can run these for you.)

## Step 10 — One real end-to-end charge

With a **real card**, run the exact flow we tested:

1. Sign in on the live site as a Free user.
2. Add a soundtrack **> 2:00** → **Export** → **Upgrade to Creator**.
3. Pay on Stripe Checkout with your **real card** (real money — this is a live
   charge; you may get a 3D-Secure prompt from your bank).
4. Confirm the plan flips to **Creator** (the live webhook did it) and the long
   export is allowed.
5. **Developers → Webhooks (live)** → your endpoint shows **200** deliveries.
6. **Balance → Payments** shows the live charge; **Balance → Payouts** shows it
   will settle to your bank (payouts are usually on a rolling delay, e.g. a few
   business days for a new account).

## Step 11 — Clean up the test charge

Once confirmed, **refund** that charge so you're not out of pocket:
**Payments → the charge → Refund** (full). The webhook's
`customer.subscription.deleted`/`updated` will drop the plan back to Free when
the subscription ends, or cancel it from the **Customer Portal**.

## Step 12 — Post-launch notes

- **Taxes (Sweden/EU):** if you owe VAT, enable **Stripe Tax** (Settings → Tax)
  so tax is calculated and collected. Worth deciding before heavy traffic.
- **Receipts:** Stripe can email customers automatic receipts — enable under
  **Settings → Customer emails**.
- **Disputes/refunds:** monitor **Payments**; respond to any disputes promptly.
- **Keep prices in sync:** the numbers **charged** live in Stripe; the numbers
  **shown** live in `src/services/entitlements.ts`. If you change one, change the
  other (and redeploy).
- **Keys hygiene:** never expose `sk_live_...` or the Supabase service-role key
  to the browser. They belong only in Vercel server env vars.
- **Rollback:** if anything misbehaves in live, you can point the Vercel vars
  back to the test values and redeploy — the app returns to the working sandbox
  setup instantly.

---

### Quick reference — what changes test → live

| Thing | Test (done) | Live (this guide) |
|---|---|---|
| Account | Sandbox, no verification | Activated + verified + bank linked |
| Products/prices | test `price_...` | new live `price_...` |
| Secret key | `sk_test_...` | `sk_live_...` |
| Webhook secret | test `whsec_...` | new live `whsec_...` |
| Money | fake (`4242` card) | real card, real payout |
