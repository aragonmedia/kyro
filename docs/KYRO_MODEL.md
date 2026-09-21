# KYRO — Commercial Model (settled)

_Last updated: 2026-09-09. This is the source of truth for how money moves through KYRO.
`docs/legal/TERMS_OF_SERVICE.md` is this document written in legal language; if the two
ever disagree, fix both._

> **Operating entity:** Kyvo LLC · 131 Continental Drive, Suite 305, Newark, DE 19713 ·
> contact@itskyro.com · governing law Delaware · effective 31 Aug 2026.
>
> **Domain:** `itskyro.com`, live on Vercel since 17 Sep 2026. Both legal docs name it.

---

## 1. What KYRO is

KYRO connects Shopify brands with vetted creators, turns approved creator video into
**whitelisted Meta Partnership Ads** running in the brand's own ad account, tracks the
orders those ads drive through the brand's Shopify store, and settles commission between
brand and creator.

**Scope boundary:** KYRO is off-platform only — Meta ads plus Shopify. TikTok Shop is
Kyvo's lane, as a registered TikTok Shop partner. Keep the products, the data and the
compliance surfaces separate.

**Note on the entity:** KYRO currently operates under **Kyvo LLC**, the same entity behind
Kyvo. So KYRO and Kyvo are separate *products* of one company, not separate companies.
That is workable, but it means TikTok Shop partner obligations and the Meta/Shopify
business share a balance sheet and a liability surface. Worth asking counsel whether KYRO
should be its own entity, or at minimum a registered DBA, before real money moves.

---

## 2. Who pays whom

Three separate money flows. Confusing them is the single easiest way to get this wrong.

| Flow | From | To | Touches KYRO? |
|---|---|---|---|
| **Media spend** | Brand | Meta, directly | **No.** Ads run in the brand's own ad account on the brand's own billing. |
| **Creator commission** | Brand | Creator, via KYRO | Yes |
| **KYRO fee** | Brand | KYRO | Yes |

**Say this to every brand during onboarding.** Otherwise they assume the deposit covers
their media and are annoyed when Meta bills them separately.

---

## 3. Rates

- **Creator commission rate is set by the brand**, per campaign, because it depends on
  their margins and SKUs. Typical is 15-25% of attributed sales. It is displayed to
  creators before they apply.
- **KYRO fee is 1%**, applied to exactly one base depending on how the brand pays:

| Brand pays creators on | KYRO charges 1% of |
|---|---|
| Sales commission (% of GMV or per order) | Attributed sales |
| Ad performance | Ad spend |
| Flat rate (per submission, retainer, bonus) | Creator earnings |

**Fees never stack.** One rate per payout type.

For reference, Trybe's published rack rate is 1.5% / 1.25% / 1.5% on the same three bases.

### Commissionable value — define it once, use it everywhere

> **Commissionable value = product subtotal, after discounts, excluding shipping, taxes
> and duties, net of refunds and chargebacks.**

Not gross order total. This one sentence prevents most billing disputes.

---

## 4. Brand onboarding gates

A brand cannot launch a campaign until all four are done:

1. **Connect Meta ad account.** Required. Ads must run here and nowhere else.
2. **Connect Shopify store.** Required. This is the source of truth for orders.
3. **Add payment methods.** Card for the deposit, bank account (ACH) for commission billing.
4. **Sign the Campaign Agreement.** Signature at campaign creation; the per-video license
   attaches individually at the moment the brand approves each video.

---

## 5. The deposit and billing cycle

- **Security deposit: $2,500** held on file. It is collateral, not prepayment of a
  specific campaign, and it is refundable when the brand offboards with a zero balance.
- **Billing trigger:** accrued unbilled commission plus KYRO fee reaches **30% of the
  deposit ($750)**, or monthly, whichever comes first.
- **Payment rail:** **ACH** for commission billing, **card** for the deposit.
  This matters more than it looks. At a 1% take rate, card processing (~2.9%) exceeds
  KYRO's entire margin on large brands. ACH is ~0.8% capped at $5.
  Never run recurring commission volume over a card.
- **Accrual cap:** if a charge fails or unbilled accrual exceeds the deposit, the campaign
  **auto-pauses**. Exposure is capped at roughly one billing cycle, not the whole campaign.
- **Brand-side usage tracker:** a progress bar showing accrued-versus-deposit, so the brand
  always sees what they owe before they are billed.

### Graduation
After 3 successful campaigns (paid on time, no chargebacks), a brand earns a higher
accrual cap and a longer billing cycle. **Graduate the credit limit, not the deposit.**
Escrow is protection for KYRO, not a feature a brand will pay extra for.

---

## 6. Creator earnings lifecycle

Four states. The creator sees all of them, live, and each is labelled distinctly.

| State | Trigger | Withdrawable |
|---|---|---|
| **Pending** | Order placed (Shopify `orders/create`) | No |
| **Clearing** | Order fulfilled | No |
| **Available** | Fulfilled **+ 30 days** | Yes |
| **Reversed** | Order refunded or charged back | Removed from Pending/Clearing |

Notes:
- Shopify reliably reports *fulfilled*. Carrier *delivered* events are patchy, so
  eligibility keys off fulfilled + 30 days rather than delivery confirmation.
- Pending updates live and is shown prominently — that immediacy is the point — but it is
  never presented as money the creator has.
- **Reversals are shown explicitly, never silently decremented.** A creator who watches a
  number drop with no explanation is a creator who stops trusting the platform.
- **W-9 (US) or W-8BEN (non-US) is collected at first withdrawal**, via the payout
  provider, which also handles 1099-NEC filing.

---

## 7. Attribution

Full write-up: `KYRO-Order-Attribution-Model.docx` (v1.0, 16 Sep 2026). This is the
short form. If the two disagree, fix both.

### What can and cannot be proven
KYRO cannot prove causation; no ad platform can. What it proves is a **chain of
custody on a tracking token**: this order carried this identifier, that identifier
was attached to exactly one ad, that ad ran exactly one creator's video. The Terms
therefore owe commission on *tracked orders attributed under the published rule*,
not on "sales the video caused".

### The hinge
Approved videos run as Partnership Ads **inside the brand's own ad account**, billed
by Meta to the brand, published under the creator's handle. KYRO creates the ad, so
**KYRO controls its destination URL** — which is where the token goes. If a brand
built the ad themselves there would be nowhere to inject an identifier and the whole
chain would not exist.

### The flow
1. Submission gets an id.
2. Brand approves; a per-video licence attaches.
3. KYRO pushes it to Meta, setting the link itself:
   `store.com/p/x?utm_source=kyro&utm_medium=paid&utm_content=<submission_id>`
4. Meta returns an ad id → stored in `submissions.meta_ad_id`.
5. Shopper clicks, lands carrying the token. Shopify records it natively; no script
   injection needed.
6. Order webhook fires → token read → `order_attributions` row → `earnings` accrue.

### Reading it back from Shopify
**`landing_site` is deprecated** (REST Admin API retired 1 Oct 2024). Use the GraphQL
`customerJourneySummary` / `customerVisit` objects, which expose `utmParameters`,
`source` and `referrerUrl` **per visit** — multiple touchpoints, not just the last.

> **Dependency:** customer journey data is customer browsing behaviour and sits behind
> Shopify's **protected customer data** approval. Attribution does not work until that
> request is granted. It is a prerequisite, not side paperwork.

### Orders from other channels
An order with no KYRO token **is not a KYRO order**: no attribution row, no accrual,
no bill. The default is to claim nothing, so the exposure is **under-claiming, never
over-claiming**. That is the correct direction to be wrong in when creator trust is
the scarce asset.

### The published rule
> Last click within 7 days. One creator credited per order. Ties broken by most recent
> touch. The connected Shopify store is the source of truth.

Goes in the campaign brief (so creators see it before applying) and the brand
agreement (so it is fixed, not discretionary).

**Meta's conversion numbers are a cross-check, never the bill.** They are modelled and
will not match Shopify. Use them to optimise ads; bill from the store.

### Deliberately not used: discount codes
Codes leak to coupon sites, which means paying commission on traffic no video touched.
One clean signal beats two muddy ones. `order_attributions.method` keeps the
`discount_code` enum value for future use; nothing writes it.

### Known gaps
Cross-device buyers, purchases after the window, ad blockers, and click-then-return-
direct. Most tracked orders are captured, not all. The contract already covers it.

## 8. Content licensing

The commercial protection lives here, not in damages clauses.

- **The creator owns the copyright.** Always.
- The creator grants **KYRO** a license broad enough to sublicense to the brand and to
  enforce against misuse. Without this, KYRO is only a witness to someone else's claim.
- KYRO grants the **brand** a license that is:
  - **limited** — paid advertising only
  - **scoped** — the *connected* Meta ad account, measured through the *connected* Shopify
    store, and nowhere else
  - **non-exclusive, non-transferable, no sublicensing**
  - **time-bound** — campaign term plus a stated tail
  - **conditioned on payment in full**
- Anything wider (organic reposting, other paid channels, email, marketplaces, extended
  term, exclusivity) is a **separate paid license**. This is a real upsell, not a
  restriction — and giving it away free means giving away the usage KYRO cannot measure.

### Enforcement, in order of what actually works
1. **Already holding the money** — ACH auto-charge before a dispute exists.
2. **Revoke Meta partnership permissions** — their ads stop serving. Immediate and free.
3. **Suspend the integration** — creative pipeline and dashboard go away.
4. **Terminate the license, then issue takedowns** — post-termination use is copyright
   infringement, which is real law.
5. **Collections for unpaid amounts** plus interest, costs and attorneys' fees.

**Deliberately not used: a flat multiplier penalty (e.g. "3x").** Liquidated damages are
enforceable only as a reasonable pre-estimate of actual loss; a punitive multiplier is
routinely struck as a penalty, which means it fails exactly when it is needed. An
attorneys'-fees clause is worth far more, because it makes small claims worth pursuing.

---

## 9. Creator roster and matching

- Creators **apply and are accepted** into a campaign. Gated, not an open marketplace.
- The brand sees a **niche-filtered roster**, not the whole network — only creators
  plausibly relevant to their product.
- The brand **approves or denies each creator** before the campaign starts, then approves
  or rejects each submitted video.
- Do not expose the full network to any account that signs up; a competitor can sign up.
  Gate the full roster behind completed connections and a signed agreement.

---

## 10. Known leakage points

Not all of these are solvable by instrumentation. The ones that aren't are handled by
defining the deal so they aren't KYRO's problem.

| # | Leak | Handling |
|---|---|---|
| 1 | Unattributable orders (saw ad, bought later direct) | Contract says commission is owed on *tracked* orders only |
| 2 | Multi-touch across creators | Stated attribution rule, published up front |
| 3 | Refunds after payout | 30-day clearing window; reversals |
| 4 | Brand disconnects the store mid-campaign | Auto-pauses campaign and suspends the license |
| 5 | Creative run outside the connected ad account | Breach of license scope |
| 6 | Use after campaign ends | Time-bound license; takedown |
| 7 | Creator self-purchasing to farm commission | Prohibited conduct; flag orders matching creator details |
| 8 | Commission miscalculated on gross | The commissionable-value definition in §3 |

---

## 11. Open items

- [x] Entity, addresses, contact, governing law and effective date filled in both legal docs
- [x] Buy the domain (`itskyro.com`); filled in both legal docs, email templates and
      `shopify.app.toml`. `KYRO_APP_ORIGIN` pins the server-side origin so OAuth redirect
      URIs cannot drift back to the vercel.app hostname.
- [ ] Decide whether KYRO needs its own entity or a DBA rather than sitting inside Kyvo LLC
- [ ] Re-check the Delaware choice of law and forum (see below)
- [ ] Have counsel review both legal docs, especially the funds-flow structure
- [ ] Confirm money-transmission posture: structure so the payment processor holds and
      moves funds, not KYRO
- [ ] Confirm Vercel plan permits commercial use (currently Hobby)
- [ ] Decide the extended-usage-rights price list (the licensing upsell in §8)
- [x] Migration `0003_commercial_model.sql` written — connections, orders, attributions,
      earnings state machine, billing runs, licences and agreements

---

## 12. Choice of law — resolved, with one open question

The entity is a **Delaware** company at a Delaware registered address, and the Terms name
Delaware law and Delaware as the forum. Law and entity now match, which is the normal,
defensible setup. The earlier concern about picking Delaware law for a Wyoming entity is
gone.

**Still worth one question to counsel:** the forum clause is *exclusive*, so KYRO has to
litigate in Delaware, including when chasing an unpaid brand, while the operator is in
Washington. That is standard for a Delaware company and not a defect, but it does make a
small collections claim uneconomic to pursue in person — which is the case the
attorneys'-fees clause in §8 exists to make viable.

A common fix is to keep Delaware law and the Delaware forum for substantive disputes, and
add an arbitration clause with a **small-claims carve-out** so low-value collections can be
brought somewhere cheap. Ask counsel whether that is worth adding.

### Note on the registered-agent phone
The company record carries a phone number at the registered agent. It is deliberately
**not** printed in the public Terms or Privacy Policy: creators and customers reading those
documents would be calling the agent, not KYRO. Public contact stays as
contact@itskyro.com plus the registered address. Add a real business line later if you
want a phone published.
