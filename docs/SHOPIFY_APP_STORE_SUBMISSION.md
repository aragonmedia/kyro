# KYRO: Shopify App Store submission

Everything to paste into the Partner Dashboard, in the order the review page asks for it.
Partner ID 5180755, app client ID `df3d593d79cf8787c3a6d8db517efe38`.

Do these in order. Steps 1 to 4 have to happen before you press Submit, or the automated
checks fail.

---

## 1. Push the code and run the SQL first

The review team and Shopify's automated checks install KYRO on a fresh store. The code in
this push changes what happens then. Without it, the install fails review under
requirement 2.3.2 ("authenticate immediately").

1. Push the commit.
2. Run every migration through `0032_hold_payout_without_tax.sql` in the Supabase SQL
   editor, in order, if you have not already. The four this submission leans on are
   `0021_shopify_app_store.sql` (install and claim), `0022_app_store_fee_trial.sql` (the
   30-day trial), `0025_usage_billing.sql` (what gets reported, and once only) and
   `0026_shopify_plan.sql` (which plan the store is on).

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

## 3. App Pricing (Partner Dashboard, inside the listing editor)

This is the step the last review failed on. The listing advertised $1 a month while no
subscribable plan existed, so the reviewer could not approve a charge. The plan below is
the one `api/cron/usage.ts` already reports against, so the handle and the price have to
match it exactly.

There is no page called "App Pricing" and searching the Partner Dashboard for it returns
nothing. Plans live inside the listing editor, which is also where the listing's pricing
text lives, so both halves of this fix are done in the same place:

> [App distribution](https://partners.shopify.com/current/apps) → **KYRO** → **Distribution**
> → beside **Shopify App Store listing**, **Manage listing** → under **Published languages**,
> **Edit** the English locale → under **Pricing content**, **Manage**

From that page: **Settings → Pricing method** opts the app into Shopify App Pricing,
**Public plans → Add** creates the plan and its billing model, and the plan's **Display
name** and **Top features** are what a merchant actually reads on the listing.

Choose **Shopify App Pricing** (managed pricing), not the Billing API. KYRO creates no
charge itself: the merchant approves the plan on Shopify's own pricing page, and migration
`0026_shopify_plan.sql` only records which plan they are on.

| Field | Value |
|---|---|
| Plan name | `Commission` |
| Recurring price | **$0.00 / month** |
| Free trial | **30 days** (matches `0022_app_store_fee_trial.sql`, which waives the fee on orders landing inside it) |
| Usage meter handle | `attributed_sales_usd` |
| Usage meter price | **$0.01 per unit** |
| Capped amount | leave unset unless Shopify requires one |

One unit is one dollar of attributed sales, so a $120 attributed order reports 120 units
and Shopify charges $1.20. That is the 1%, and the rate lives in the merchant's plan where
they can see it rather than buried in code.

**The meter handle must read `attributed_sales_usd` exactly.** It is `USAGE_METER` in
`api/_lib/shopify-usage.ts`. A different handle makes every usage event fail silently,
because Shopify answers 202 as soon as it accepts the request and discards the event
afterwards.

Shopify's own constraints on this, worth knowing before the form argues back: usage
charges are billed monthly only, a plan carries at most 5 usage meters and 6 tiers each,
usage caps are not supported, and prices are USD only. If the form will not accept a
30-day free trial alongside a $0 recurring price, drop the Shopify trial rather than
fighting it. `0022_app_store_fee_trial.sql` already waives the fee on orders landing inside
the trial, so KYRO reports no usage during it and the merchant is charged nothing either
way. Only the listing text then has to stop promising a trial.

After saving the plan, approve it once on the dev store at
`https://admin.shopify.com/store/<store>/charges/<app handle>/pricing_plans`, the same URL
`pricingPlansUrl()` builds, so the path a reviewer walks is proven before they walk it.

## 4. Protected customer data (Partner Dashboard → API access → Protected customer data)

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

## 5. Emergency developer contact (Partner Dashboard → Settings)

Email and phone for critical issues. Requirement 4.5.6. Use `contact@itskyro.com`.
**The contact email must not contain the word "Shopify".**

## 6. App listing

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

**Pricing:** Shopify App Pricing, one plan. $0 a month with a 30-day free trial, then usage
based. This has to read as the same plan configured in step 3, because 4.2.1 asks for all
pricing options including the trial length and the charge details.
Pricing details text:
> Free for 30 days. After that $0 a month, plus 1% of the sales your creator content is attributed, billed by Shopify as $0.01 for every $1 of attributed sales. Nothing is charged on sales KYRO did not attribute, and the fee is never stacked. You also pay your creators the commission you set on each campaign, and only on the orders their content drove.

**Languages:** English only.
**Online Store required?** No. KYRO reads orders, so any sales channel works.
**Geographic requirements:** if you limit which countries creators can be paid in, say so here.

**Privacy policy URL:** `https://itskyro.com/privacy`
**Support:** `contact@itskyro.com`

### Images you need to make (rules that get listings rejected are in bold)

| Asset | Size | Notes |
|---|---|---|
| App icon | 1200 × 1200 PNG/JPG | KYRO mark on a solid background with padding. **No text, no Shopify logo.** |
| Feature image | 1600 × 900 | **Solid background. No pricing, no stats, no reviews, no "best" or "#1".** |
| Screenshots, 3 to 6 | 1600 × 900 each | Real KYRO screens, **no browser frame or desktop around them**, each one different. Good set: Dashboard with KPI cards · Content library · Campaign summary · Creator profile · Finance · Chat. Alt text on each. |

Screenshot tip: log in as Bold Buns on a desktop browser window set to 1600 × 900 and use a
full-window capture, not a screen capture with the browser bar.

## 7. Demo screencast (required, 4.5.3)

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

## 8. Testing instructions (paste into the review form)

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
> Billing: KYRO's own fee runs through Shopify App Pricing, per requirement 1.2.1. The plan
> is $0 a month with a 30-day free trial and one usage meter, `attributed_sales_usd`, at
> $0.01 per unit, where a unit is a dollar of attributed sales. That is 1% of attributed
> sales. It is reported daily by /api/cron/usage, only on sales that have cleared their
> return window, and only after the trial. KYRO creates no charge itself: the merchant
> approves the plan on Shopify's pricing page.
>
> Creator commission is separate and is not an app charge. The merchant sets the rate per
> campaign, the money is owed to the creators and is paid to them through Stripe Connect,
> and KYRO keeps none of it. We read this the way 5.5.3 reads cost of goods: money owed to
> a third party, moved through a PCI-compliant gateway rather than through Shopify, while
> every charge KYRO makes for itself goes through Shopify.

**The review account:** create a new brand login yourself, for example `review@itskyro.com`,
and point the Bold Buns demo data at it the same way `move_bold_buns.sql` did for yours.
Don't give reviewers your own login. I can adapt that SQL for the review account. Tell me
the email once it exists.

## 9. Submit

App Store review page → run **automated checks**. They must all pass. Then **Submit for
review**. Review usually takes a few business days, and back-and-forth is normal.

## After approval

1. Your listing goes live at `https://apps.shopify.com/<your app handle>`.
2. In Vercel set `VITE_SHOPIFY_INSTALL_URL` to that address and redeploy. The "Connect
   Shopify" button then goes straight to Shopify, and the store-name field disappears
   everywhere. That field breaks rule 2.3.1, so don't leave it once you're listed.
3. Watch the first few days of /api/cron/usage in the Vercel logs. A store that has not
   approved the plan is skipped rather than charged, so a quiet run on a live store means
   the merchant never finished step 3's pricing page, not that nothing sold.

## Known risks to be ready for

- **1.2.1, creator commission via Stripe.** KYRO's own fee is now a Shopify usage charge,
  so what is left outside Shopify is only the commission owed to creators. No Shopify
  ruling exists for that case. The testing notes raise it openly, with the 5.5.3 reading,
  so the reviewer answers it rather than rejecting on it.
- **1.1.14, "no connecting merchants to agencies or freelancers."** Affiliate and influencer apps
  fill the Affiliate programs category, so this rule is read as store services (developers, agencies), not creators. The
  listing frames KYRO as running *the brand's own* creator program.
- **The listing and the plan have to agree.** This is what the last review caught: $1 a
  month advertised against a plan that did not exist. If step 3 and step 6 ever disagree
  again, the automated checks will not catch it and a human will.
- **Live mode on Stripe.** The payment path is proven end to end in sandbox, card and bank
  debit both. Before a reviewer touches it, confirm the live-mode keys are in Vercel and
  that manual payouts are set in live mode as well as test, or the platform account sweeps
  creator money to your bank.
