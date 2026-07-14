# KYRO — Build Roadmap & Pillars

**Vision:** KYRO is the operating system for creator programs — brands fund campaigns, creators submit UGC, approved videos run as whitelisted Meta ads, and everyone is paid on real performance. Trybe is the reference; Kyro is the Aragon Media build.

**Legend:** ✅ done · 🔨 in progress · ⬜ not started

---

## The 12 Pillars

### 1. Foundation & Design System
- ✅ Vite + React + TS + Tailwind app, deployed on Vercel
- ✅ Light/dark theming (tokens + Settings toggle)
- ✅ Brand kit (logo, gradient, KYRO wordmark), landing page
- 🔨 Reusable component library (buttons, inputs, cards, tables consolidated)
- ⬜ Loading / empty / error states standardized across every screen

### 2. Auth, Accounts & Roles
- ✅ Passwordless email OTP (Supabase), branded email template
- ✅ `profiles` table + onboarding (Brand/Creator) + role routing
- ✅ `/admin` gated to admin profiles
- ⬜ Session restore on page load (stay signed in on refresh)
- ⬜ Real Account Settings (edit profile, connected accounts, sign out everywhere)
- ⬜ Team/org support (multiple users per brand), invites

### 3. Data Model (Supabase)
- ✅ `profiles`
- ⬜ `brands`, `creators` (extended profiles)
- ⬜ `campaigns`, `applications`, `submissions`
- ⬜ `ledger`, `payouts`, `notifications`
- ⬜ RLS policies per table + seed/migration scripts

### 4. Brand Experience
- ✅ Dashboard UI (demo data)
- ⬜ Create campaign (brief, budget, commission rules) → persisted
- ⬜ Fund campaign pool (Square) → status flips to live
- ⬜ Review submissions: approve / request revision / reject
- ⬜ Creator discovery + invites
- ⬜ Real performance analytics per campaign

### 5. Creator Experience
- ✅ Dashboard UI (demo data, earning notifications)
- ⬜ Browse & apply to campaigns
- ⬜ Upload video submissions (Storage)
- ⬜ Track live performance + earnings per video
- ⬜ Payout history + onboarding (Trolley)
- ⬜ Public creator profile from real data

### 6. Admin & Operations
- ✅ Analytics command center UI
- ✅ Admin-gated access
- ⬜ Brand/creator approval queue + moderation
- ⬜ Curation (propose matches) wired to data
- ⬜ Reconciliation from real ledger (Square ↔ Trolley ↔ Kyro)
- ⬜ Feature flags / platform settings

### 7. Meta Ads Engine  *(core differentiator)*
- ✅ API client stubs (`lib/meta.ts`)
- ⬜ Meta OAuth — connect brand ad account
- ⬜ Creator whitelisting / partnership-ad permissions
- ⬜ Push approved submission → live Meta ad
- ⬜ Pull Ad Insights (spend, ROAS, conversions) per creator
- ⬜ Pause / scale winning ads

### 8. Payments & Ledger
- ⬜ Square — brand pool funding + webhooks
- ⬜ Trolley — creator payouts + tax forms (W-9/W-8)
- ⬜ Double-entry ledger (money as integer cents)
- ⬜ Automated reconciliation + payout scheduling

### 9. Media & Storage
- ⬜ Supabase Storage buckets (submissions, avatars, brand assets)
- ⬜ Upload flow with progress + validation
- ⬜ Thumbnails / preview playback

### 10. Messaging & Notifications
- ⬜ In-app notifications (status changes, earnings)
- ⬜ Email notifications via Resend
- ⬜ Brand↔creator chat (1:1 + channels, Trybe-style)

### 11. Analytics & Attribution
- ⬜ Server-side / order-level attribution
- ⬜ Live leaderboards from real data
- ⬜ Exportable reports

### 12. Trust, Legal & Compliance
- ⬜ Terms, Privacy, cookie/consent
- ⬜ Tax collection (Trolley), data retention
- ⬜ Audit log for money + admin actions

---

## Suggested phasing

**Phase 0 — Demo & foundation** ✅ *(done)*
Themed demo, landing, OTP auth, profiles, onboarding, admin gating.

**Phase 1 — Real data MVP** 🔨 *(next)*
Full Supabase schema (Pillar 3) → brands create & fund campaigns (mock payment ok), creators apply & upload, dashboards render from the database, Storage for video. This turns the demo into a working product for a pilot brand + creators.

**Phase 2 — Money & ads**
Meta OAuth + whitelisting + push-to-ad + insights (Pillar 7); Square funding + Trolley payouts + ledger (Pillar 8). This is where KYRO becomes performance-based for real.

**Phase 3 — Scale & polish**
Chat + notifications (Pillar 10), attribution + live leaderboards (Pillar 11), moderation/curation, compliance (Pillar 12), analytics depth.

---

## Recommended immediate next steps
1. Finish Pillar 3 data model (`brands`, `creators`, `campaigns`, `submissions`) with RLS + migrations.
2. Wire the **Brand → create & fund campaign** flow end to end against the database.
3. Wire **Creator → apply & upload** with Supabase Storage.
4. Then tackle the Meta ads engine (the differentiator).
