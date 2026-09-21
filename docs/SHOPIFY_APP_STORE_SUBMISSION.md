# KYRO: Shopify App Store submission

Everything to paste into the Partner Dashboard, in the order the review page asks for it.
Partner ID 5180755, app client ID `df3d593d79cf8787c3a6d8db517efe38`.

Do these in order. Steps 1 to 3 have to happen before you press Submit, or the automated
checks fail.

---

## 1. Push the code and run the SQL first

The review team and Shopify's automated checks install KYRO on a fresh store. The code in
this push changes what happens then. Without it, the install fails review under
requirement 2.3.2 ("authenticate immediately").

1. Push the commit.
2. Run `supabase/migrations/0021_shopify_app_store.sql` in the Supabase SQL editor. The
   last row should show `1 · 1 · 2`.

## 2. App configuration (Dev Dashboard → KYRO → Versions / Configuration)

Check these, don't change them:

| Field | Value |
|---|---|
| App URL | `https://itskyro.com` |
| Allowed redirection URL | `https://itskyro.com/api/shopify/callback` |
| Embed app in Shopify admin | **Off** (KYRO is a standalone app. Shopify confirmed standalone apps are still accepted) |
| Scopes | `read_orders, read_products, read_fulfillments` |
| Compliance webhooks (all three) | `https://itskyro.com/api/shopify/webhooks` |

If the three compliance webhook URLs are **not** in the active version, tell me. They can
only be set by deploying `shopify.app.toml`. I can run that deploy from here, and all you'd
do is approve one Shopify login link.

## 3. Protected customer data (Partner Dashboard → API access → Protected customer data)

KYRO needs **Level 1 only**. Do not request name, email, phone or address fields.

**Why KYRO needs it (select "App functionality"):**
> KYRO attributes each order to the creator video that drove it, so the merchant can pay
> that creator commission. It reads the order's customer journey summary (landing page and
> UTM parameters of the first and last visit) to find the KYRO tracking code, and the
> order total and line items to compute commission.

Suggested answers. Only tick yes where it's true for you. The ones marked **(you)** are
about your company, not the code.

| Question | Answer |
|---|---|
| Process the minimum data required? | Yes. KYRO stores order ID, number, totals, status and the UTM fields. It never stores customer name, email, phone or address. |
| Tell merchants what data you process and why? | Yes. See itskyro.com/privacy, sections 4 and 12. |
| Limit use to the stated purpose? | Yes |
| Respect consent decisions / opt-outs? | Yes. KYRO places no script, pixel or cookie on the storefront. |
| Data retention periods? | Yes. Order data is kept while the store is connected. On shop/redact, UTM fields are erased and the store token is deleted. |
| Encrypt data at rest and in transit? | Yes. TLS everywhere. The database is encrypted at rest (Supabase). Shopify tokens are additionally AES-256-GCM encrypted. |
| Encrypt backups? | Yes (Supabase managed backups) |
| Separate test and production data? | Yes. Dev store data is separate from live stores. |
| Data loss prevention strategy? | **(you)** |
| Limit staff access to customer data? | Yes. Row-level security. Tokens are readable only by the server. |
| Strong passwords for staff accounts? | **(you)** |
| Log access to personal data? | **(you)** Supabase keeps API logs. Say yes only if you review them. |
| Security incident response policy? | **(you)** If you don't have one written yet, write a one-page one before you tick yes. |

## 4. Emergency developer contact (Partner Dashboard → Settings)

Email and phone for critical issues. Requirement 4.5.6. Use `kevin@itskyro.com`.
**The contact email must not contain the word "Shopify".**

## 5. App listing

**Primary category:** Marketing and conversion › Advertising › **Affiliate programs**
**Secondary category (if offered):** an influencer or social media marketing category.

**App name** (30 max, must match the Dev Dashboard name): `KYRO`

**App introduction** (100 max):
> Pay creators commission on the sales their videos drive, tracked from your Shopify orders.

**App details** (500 max):
> KYRO runs your creator program on commission. Invite creators with a link or let them apply to your campaigns. They upload short videos, you choose which ones to run, and KYRO reads your Shopify orders to see which video drove each sale. Creators earn only on attributed orders, after the return window clears. Campaigns, creator videos with previews and downloads, chat with creators and a Finance page showing what is owed all live in one place.

**Features** (80 max each):
1. See which creator video drove each Shopify order
2. Invite creators by link or review applications to your campaigns
3. Preview creator videos, choose what runs, and download the ones in use
4. Commission is payable only after an order clears its return window
5. Chat with creators in a campaign room or one to one
6. Creator leaderboard and profiles with orders and commission per creator

**Search terms** (5): `creator marketing`, `affiliate`, `influencer`, `UGC`, `commission`

**Pricing:** Free trial, then usage based. (Decision pending: see "Known risks", 1.2.1.)
Pricing details text:
> Free for your first 30 days. After that, 1% of sales attributed to creator content, never stacked. You also pay your creators the commission you set on each campaign, only on orders their content drove.

**Languages:** English only.
**Online Store required?** No. KYRO reads orders, so any sales channel works.
**Geographic requirements:** if you limit which countries creators can be paid in, say so here.

**Privacy policy URL:** `https://itskyro.com/privacy`
**Support:** `kevin@itskyro.com`

### Images you need to make (rules that get listings rejected are in bold)

| Asset | Size | Notes |
|---|---|---|
| App icon | 1200 × 1200 PNG/JPG | KYRO mark on a solid background with padding. **No text, no Shopify logo.** |
| Feature image | 1600 × 900 | **Solid background. No pricing, no stats, no reviews, no "best" or "#1".** |
| Screenshots, 3 to 6 | 1600 × 900 each | Real KYRO screens, **no browser frame or desktop around them**, each one different. Good set: Dashboard with KPI cards · Content library · Campaign summary · Creator profile · Finance · Chat. Alt text on each. |

Screenshot tip: log in as Bold Buns on a desktop browser window set to 1600 × 900 and use a
full-window capture, not a screen capture with the browser bar.

## 6. Demo screencast (required, 4.5.3)

2 to 4 minutes, English, unlisted YouTube or Loom link. It must show setup, not just
features. Script:

1. **0:00** In a Shopify dev store admin, install KYRO from the test install link. Show
   Shopify's permission screen and click Install.
2. **0:20** You land straight on KYRO sign-up with "your-store is connected". Create a brand
   account.
3. **0:45** Setup wizard: website, logo and name, then connections showing Shopify
   connected.
4. **1:15** Create a campaign with a product and commission rate.
5. **1:45** Creators: copy the invite link. Show an application and accept it.
6. **2:15** Submissions: open a pending video, preview it, mark "Using this".
7. **2:45** Dashboard: attributed orders and the leaderboard. Open a creator profile.
8. **3:15** Finance: what's owed and what's cleared.

## 7. Testing instructions (paste into the review form)

> KYRO is a standalone web app (not embedded). After install, Shopify sends you to
> itskyro.com, which completes OAuth and then asks you to create a brand account. Your
> store is attached to that account automatically.
>
> To see a populated account instead of a new one, sign in at https://itskyro.com with:
> Email: [REVIEW ACCOUNT EMAIL]
> Password: [REVIEW ACCOUNT PASSWORD]
> This brand has demo campaigns, creators, videos and orders.
>
> To see attribution: KYRO attributes an order when the buyer arrived from a creator's
> ad link, identified by a KYRO code in utm_content. On a dev store, place a test order
> from a URL like https://[store].myshopify.com/products/[product]?utm_source=kyro&utm_content=[the tracking code of a submission in the demo account].
>
> Billing: KYRO charges no app fee and is listed as free. Brands pay creator commission,
> which is set by the merchant per campaign and goes to the creators. KYRO keeps none of
> it. Payouts to creators are being moved onto Stripe Connect, and until that is live the
> Pay button says so. If App Review considers creator commission payouts in scope of
> requirement 1.2.1, please tell us and we will move them as directed.

**The review account:** create a new brand login yourself, for example `review@itskyro.com`,
and point the Bold Buns demo data at it the same way `move_bold_buns.sql` did for yours.
Don't give reviewers your own login. I can adapt that SQL for the review account. Tell me
the email once it exists.

## 8. Submit

App Store review page → run **automated checks**. They must all pass. Then **Submit for
review**. Review usually takes a few business days, and back-and-forth is normal.

## After approval

1. Your listing goes live at `https://apps.shopify.com/<your app handle>`.
2. In Vercel set `VITE_SHOPIFY_INSTALL_URL` to that address and redeploy. The "Connect
   Shopify" button then goes straight to Shopify, and the store-name field disappears
   everywhere. That field breaks rule 2.3.1, so don't leave it once you're listed.
3. When you want the 1% back for App Store brands, it has to be a Shopify usage charge.
   That's an app update, not a new review from scratch.

## Known risks to be ready for

- **1.2.1, creator commission via Stripe.** No Shopify ruling exists for this case. The
  testing notes raise it openly so the reviewer answers it rather than rejecting on it.
- **1.1.14, "no connecting merchants to agencies or freelancers."** Affiliate and influencer apps
  fill the Affiliate programs category, so this rule is read as store services (developers, agencies), not creators. The
  listing frames KYRO as running *the brand's own* creator program.
- **Payments not live.** A reviewer who presses Pay gets "Payments are not switched on
  yet". That's an operational message, which is allowed, but it may draw a question. Going
  live on Stripe before submitting removes it.
