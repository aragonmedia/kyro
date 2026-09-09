# KYRO — Commercial Model (settled)

_Last updated: 2026-09-09. This is the source of truth for how money moves through KYRO.
`docs/legal/TERMS_OF_SERVICE.md` is this document written in legal language; if the two
ever disagree, fix both._

> **Fill before publishing anything:** `[ENTITY]` (registered legal entity name),
> `[DOMAIN]`, `[CONTACT_EMAIL]`, `[SUPPORT_EMAIL]`, `[MAILING_ADDRESS]`.
> These appear as placeholders throughout the legal docs.

---

## 1. What KYRO is

KYRO connects Shopify brands with vetted creators, turns approved creator video into
**whitelisted Meta Partnership Ads** running in the brand's own ad account, tracks the
orders those ads drive through the brand's Shopify store, and settles commission between
brand and creator.

**Scope boundary:** KYRO is off-platform only — Meta ads plus Shopify. TikTok Shop is
Kyvo's lane, as a separate registered TikTok Shop partner. Keep the entities, the data,
and the compliance surfaces separate.

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

- **Source of truth is the connected Shopify store**, not Meta.
- Meta's conversion numbers are attributed and partly modeled. They will not match
  Shopify's order count. Use Meta for ad performance and optimization, never as the
  billing number.
- The join is KYRO's own: each approved video becomes its own ad with its own ad ID, and
  KYRO stores that ad ID against the submission (`submissions.meta_ad_id`).
- Per-creator UTM parameters and/or discount codes provide a second signal.
- **Publish the attribution rule before the campaign runs** — which window, which source,
  how ties break between creators who both touched a buyer. Most disputes in this business
  are really about a rule nobody stated.

---

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

- [ ] Register the legal entity; fill every `[ENTITY]` placeholder
- [ ] Buy the domain; fill `[DOMAIN]`, update Supabase Site URL, redirect URLs and email
      templates (currently hardcoded to `kyro-phi.vercel.app`)
- [ ] Have counsel review both legal docs, especially the funds-flow structure
- [ ] Confirm money-transmission posture: structure so the payment processor holds and
      moves funds, not KYRO
- [ ] Confirm Vercel plan permits commercial use (currently Hobby)
- [ ] Decide the extended-usage-rights price list (the licensing upsell in §8)
