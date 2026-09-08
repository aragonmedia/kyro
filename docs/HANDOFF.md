# KYRO — Full Handoff Document

_Last updated: 2026-09-08. Written for another Claude (Cowork) picking up this project cold. Read this top to bottom before touching anything._

---

## 0. TL;DR — what KYRO is and where it stands

**KYRO** is a creator-marketing / Meta-ads performance platform for Aragon Media (owner: Kevin Aragon). Brands fund campaigns, creators submit short-form UGC, approved videos run as **whitelisted Meta ads**, and everyone is paid on **real performance** (ROAS, orders). **Trybe (jointrybe.com) is the #1 reference/replication target.**

**Current state:** Live on Vercel with **email + password auth** (Supabase), a profiles/onboarding system, admin gating, light/dark theming, a deployed 10-table Postgres schema with RLS, and the **Brand dashboard reading real campaign rows from Postgres**. Creator and Admin dashboards still render mock `SEED_*` data. Creator-side apply/upload is the next chunk.

The user (Kevin) is **not a developer** — he handles dashboard clicks (Supabase, Vercel, GitHub Desktop) with clear step-by-step guidance, and Claude does all the code. Be concrete and patient with dashboard instructions.

---

## 1. Workflow, repo & deployment (CRITICAL — read first)

### The folder
- **Local working folder:** `~/Desktop/Kyro` (the connected Cowork folder — edit files here).
- This folder **is** the git repo, connected via the **GitHub Desktop app** on Kevin's Mac.

### The push flow (Claude does NOT push)
1. Claude edits files in `~/Desktop/Kyro`.
2. **Kevin** reviews in **GitHub Desktop** and pushes to `main` himself. Claude never runs `git push`.
3. Vercel auto-deploys `main`.

### Kevin does not test locally
**He never runs `npm run dev` or `npm run build`.** He pushes and reviews the deployed site. That makes Claude's typecheck/build **the only gate before production**. Always run it before telling him to push.

### Claude CAN build and typecheck
(An earlier version of this doc said the opposite. That is out of date.) The shell on Kevin's Mac has Node 22 + npm 10 with npm-registry access. Use a scratch copy so Linux-built binaries never land in Kevin's macOS `node_modules`:

```bash
# once per session, in the device shell:
rm -rf $HOME/kyrobuild && mkdir -p $HOME/kyrobuild
cd $HOME/mnt/Kyro && cp package.json tsconfig*.json vite.config.ts tailwind.config.js \
    postcss.config.js eslint.config.js index.html $HOME/kyrobuild/
cp -R src public $HOME/kyrobuild/ && cd $HOME/kyrobuild && npm install

# after each edit:
rm -rf $HOME/kyrobuild/src && cp -R $HOME/mnt/Kyro/src $HOME/kyrobuild/src
cd $HOME/kyrobuild && npx tsc --noEmit -p tsconfig.app.json && npx vite build && npx eslint src
```

**Never** run `npm install` inside `~/Desktop/Kyro` from the device shell — it is a Linux VM, and esbuild/rollup ship platform-specific binaries that would break nothing locally but pollute the repo folder.

### Network from the shells
The device shell and the cloud container are both **blocked from `*.supabase.co`** by egress policy. To inspect the live database, drive Kevin's Chrome (`mcp__claude-in-chrome__*`) and `fetch()` from a page already on the Supabase origin.

### GitHub / Vercel
- Repo: **`github.com/aragonmedia/kyro`**.
- Production: **`https://kyro-phi.vercel.app`**. Deep links like `/admin` and `/reset-password` work because of **`vercel.json`** (SPA rewrite `/(.*) → /`).
- The Vercel MCP connected to Cowork shows only `aragon-media-portal`, so **Kyro deploys from a different Vercel account** than the one Claude can see. Don't expect to find it via `list_projects`.
- **Vite bakes `VITE_*` env vars at BUILD time** → after changing any env var in Vercel you MUST **Redeploy**.

---

## 2. Tech stack & codebase map

- **Vite + React 18 + TypeScript + Tailwind CSS.** No backend server — Supabase is the backend.
- **Single-file app:** almost everything is in **`src/App.tsx`** (~2,500 lines): landing, auth screens, onboarding, app shell, brand/creator/admin dashboards, public profiles, about, settings.
- **`src/lib/`:**
  - `theme.tsx` — ThemeProvider + `useTheme()` (light/dark).
  - `supabase.ts` — client + **email/password auth**: `signInWithPassword`, `signUpWithPassword`, `sendPasswordReset`, `updatePassword`, `describeAuthError`, `getMyProfile`, `saveMyProfile`, `signOut`, `getCurrentUser`, `isSupabaseConfigured`.
  - `session.tsx` — `SessionProvider` / `useSession()`. Restores the persisted session on load, exposes `{ready, configured, userId, email, role, brand, creator, workspaceLoading, workspaceError, refresh, adoptRole, signOut}`, and **provisions the `brands`/`creators` row** a user needs before RLS will let them write. Every boot-path call is time-boxed (8s) so a dead backend can't hang the app on the loading screen.
  - `db.ts` — the typed DB boundary. Row types mirroring Postgres, snake_case↔camelCase mappers, and no-throw `{data, error}` on every call. **Nothing in App.tsx touches `supabase.from(...)` directly.** Money converts cents↔dollars here and nowhere else.
  - `api.ts` — `mockApi` (demo event logger) + `realApi` (partly superseded by `db.ts`).
  - `meta.ts` — Meta Marketing API **stubs** for Phase 2.
  - `types.ts` — **single source of truth for entity shapes.** Money is integer **cents**.
- **Routing:** hand-rolled path router in `App.tsx` (`readRoute()`), no react-router. Paths: `/`, `/signin`, `/login`, `/signup`, `/join`, `/forgot-password`, `/reset-password`, `/admin`.

### Design tokens / theming
- CSS variables in `src/index.css`: `:root` = dark (default), `.light` class flips palette. Tokens: `--app, --surface, --surface-2, --line, --heading, --body, --muted, --faint`.
- `tailwind.config.js` maps semantic colors (`bg-app`, `bg-surface`, `text-heading`, `border-line`) plus `bg-gradient-kyro`.
- **Gotcha:** token-based, NOT Tailwind's `dark:` variant. Build new UI with tokens; keep `text-white` only on gradient/colored buttons.

---

## 3. Auth (email + password)

Switched from 6-digit email OTP to **email + password** in Sept 2026, modeled on Trybe's `/auth/login`. OTP is fully removed, not hidden.

- **Sign In** (`/signin`, `/login`): email + password → routed by profile role.
- **Sign Up** (`/signup`, `/join`): Brand/Creator toggle + full name + email + password + confirm + terms checkbox → `signUpWithPassword` → `saveMyProfile(role, fullName)` → dashboard.
- **Forgot password** (`/forgot-password`): emails a reset link. Always reports success even for unknown addresses, so the form can't enumerate users.
- **Reset** (`/reset-password`): Supabase turns the link's token into a session; the screen sets a new password via `updateUser`. Session restore deliberately **skips** this route so the user isn't bounced past it.
- **Admin** (`/admin`): same form, then gated on `role='admin'`. A non-admin who signs in correctly is **signed back out** before the refusal, so no stray session sits on the admin route.
- Demo mode (no Supabase keys) still lets anyone through so the public demo works.

UI components in `App.tsx`: `AuthShell`, `SignIn`, `SignUp`, `ForgotPassword`, `ResetPassword`, `PasswordField` (show/hide toggle), `SubmitButton`.

### Required Supabase dashboard settings
- **Authentication → URL Configuration → Site URL** = `https://kyro-phi.vercel.app`
- **Redirect URLs** must include `https://kyro-phi.vercel.app/reset-password` — without it the reset link dead-ends.
- **Email Templates → Reset Password** = `email-templates/kyro-reset-password.html`, subject `Reset your KYRO password`.
- **"Confirm email" stays OFF** (sign-up returns a live session immediately). If it is ever switched on, `SignUp` already handles it with a "check your inbox" state.

### Accounts from the old OTP flow have NO password
They must use **Forgot password** once to set one. That includes `aragonkevin239@gmail.com` (the admin).

### Test accounts
One email = one role (single `role` column). Use 3 emails + 3 Chrome profiles:
- `aragonkevin239@gmail.com` → **admin**
- `kvn@kyvoco.com` → **brand**
- a third personal email → **creator**

---

## 4. Supabase (the backend)

- **Project ref:** `blmsjeniotlkpsslfrrl` · **URL:** `https://blmsjeniotlkpsslfrrl.supabase.co`
- **Anon key** in `~/Desktop/Kyro/.env.local` (gitignored) and in Vercel env (Production + Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Custom SMTP = Resend.** Sender `kyro@kyvoco.com`, host `smtp.resend.com`, port `465`, user `resend`.
- **Resend account `kyvoco`** — only `kyvoco.com` is verified there, so Kyro's sender must be `@kyvoco.com`.
- **Email template:** `email-templates/kyro-reset-password.html` → Auth → Email Templates → **Reset Password**. `kyro-signin-code.html` is **retired** (OTP is gone), kept for reference only — do not paste it.

### Database — DEPLOYED (all 10 tables live, verified Sept 2026)
- `supabase/migrations/0001_profiles.sql` — `profiles` (1:1 with `auth.users`), auto-create trigger, RLS, `role` enum (brand/creator/admin), `onboarded`.
- `supabase/migrations/0002_core_schema.sql` — `brands, creators, campaigns, applications, submissions, ledger_entries, payouts, meta_insights, notifications` + enums + FKs/indexes + **RLS** + `is_admin()`. Money = `bigint` cents.
- `supabase/make-admin.sql` — grants admin by email (applied for `aragonkevin239@gmail.com`).

**RLS summary:** brand owners manage their brands/campaigns; creators manage own profile/applications/submissions; any signed-in user browses the marketplace; ledger/meta_insights admin-only; notifications per-user; `is_admin()` overrides.

### Verifying the live schema from Cowork
Both shells are egress-blocked from supabase.co. Use Chrome: navigate a tab to `https://<ref>.supabase.co/rest/v1/?apikey=<ANON_KEY>`, then `fetch()` same-origin from `javascript_tool`. `GET /rest/v1/<table>?select=<cols>&limit=1` returns 200 when every named column exists, so it doubles as a column-level schema check. (The OpenAPI root itself needs the service_role key and will 401 with anon.)

### Driving the Supabase SQL editor from the browser
The dashboard renders black in automated screenshots and clicks miss the Monaco editor. Reliable method:
1. Navigate to `.../sql/new`.
2. `window.monaco.editor.getEditors()[0].setValue(\`YOUR SQL\`)`
3. Run with `cmd+Return`.
4. Read results via `get_page_text` or `Array.from(document.querySelectorAll('[role="gridcell"]')).map(e=>e.textContent)`.

---

## 5. Environment variables

| Var | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel (Prod+Preview) + `.env.local` | Must include `https://`. `getSupabase()` normalizes defensively. |
| `VITE_SUPABASE_ANON_KEY` | Vercel (Prod+Preview) + `.env.local` | Public/anon key only — never service_role in a `VITE_` var. |

**Redeploy after any env change** (Vite build-time embedding).

---

## 6. Trybe reference

Full capture in **`docs/TRYBE_REFERENCE.md`**. Key points:

- **Look:** light/white theme, violet-purple accent, floating rounded-pill nav, huge bold near-black hero type, generous whitespace. Kyro supports light **and** dark.
- **Auth pages** (`/auth/login`, `/auth/signup`): centered logo over a white card, pill-shaped grey inputs with placeholder-only labels, violet pill CTA, "Forgot your password?" left-aligned above the button, role segmented control on sign-up (Brand / Agency, with Creator as a text link), terms checkbox gating the button. Kyro's auth screens now mirror this.
- **Partner Portal IA** to mirror as Kyro's app nav: **Dashboard · Submissions · Chat · Brands · Campaigns · Creators · Finance · Settings.**
- Their privacy policy (checked Sept 2026) names only **Trybe Tech, Inc.**; third parties are infrastructure vendors (Cloudflare, Stripe, Meta, Resend, Supabase, Shopify). Notably it contains **no content-usage or whitelisting rights language at all** — if Kyro copies their structure, don't copy that gap.
- Kevin has a live Trybe **partner** login (org "Kyvo") and will screen-share pages for reference.

---

## 7. Roadmap (pillars & phases)

Full detail in **`docs/ROADMAP.md`**. Snapshot:

- **Phase 0 — DONE:** themed demo, landing, auth, profiles, onboarding, admin gating.
- **Phase 1 — IN PROGRESS:**
  - DONE: `lib/db.ts` data layer; `lib/session.tsx` (restore + workspace provisioning); Brand dashboard reads real campaigns with loading/empty/error states; Create Campaign writes a real `campaigns` row; email+password auth with reset.
  - NEXT: **Creator → browse, apply & upload** (writes `applications` + `submissions`, video to Supabase Storage), then **Brand → review/approve submissions**.
- **Phase 2 — Money & ads:** Meta OAuth + whitelisting + push-to-ad + insights; Square (brand pool funding) + Trolley (creator payouts) + double-entry ledger.
- **Phase 3 — Scale:** chat + notifications, server-side attribution, live leaderboards, moderation, compliance.

---

## 8. Files

```
~/Desktop/Kyro/
├── index.html   vercel.json   .gitignore   .env.example   .env.local(gitignored)
├── CHANGELOG.md
├── src/
│   ├── App.tsx                      (the whole app)
│   ├── index.css                    (theme tokens)
│   ├── main.tsx                     (ThemeProvider + SessionProvider wrap)
│   └── lib/  api.ts db.ts meta.ts session.tsx supabase.ts theme.tsx types.ts vite-env.d.ts
├── public/                          (kyro-logo.png/svg, brand-*.png, og)
├── email-templates/  kyro-reset-password.html  kyro-signin-code.html (RETIRED)
├── supabase/  migrations/0001_profiles.sql  migrations/0002_core_schema.sql  make-admin.sql
└── docs/  TRYBE_REFERENCE.md  ROADMAP.md  HANDOFF.md (this file)
```

---

## 9. Gotchas & lessons (don't repeat these)

1. **Vite env vars are build-time** → always Redeploy on Vercel after changing them.
2. **`VITE_SUPABASE_URL` must be a full `https://…` URL.**
3. **Resend sender must be `@kyvoco.com`** (only verified domain in that Resend account).
4. **Do NOT mention "Aragon Media" in Kyro's UI/copy/email.** Kevin asked for it removed. Keep it out.
5. **Claude CAN build** (Section 1) and MUST, because **Kevin never builds or runs the app locally** — he only reviews the deployed site.
6. **Supabase dashboard automation** renders black + flaky; use the `monaco…setValue()` + `cmd+Return` + DOM-read method.
7. **Claude never pushes** — Kevin pushes from GitHub Desktop.
8. Money is **integer cents** everywhere. `db.ts` is the only place cents↔dollars conversion happens.
9. **Supabase Free auto-pauses** after ~1 week idle. It happened Sept 2026: the project ref stopped resolving in DNS and the live site's sign-in broke silently. Restoring from the dashboard fixes it and keeps the same ref/URL/keys. Upgrade to Pro if it keeps biting before demos.
10. **The mounted repo blocks file deletes** from the device shell (`rm` → "Operation not permitted"). `git status` can leave a stale `.git/index.lock` that then blocks commits in GitHub Desktop — `mv` it out of `.git` rather than deleting. Prefer `git --no-optional-locks status`.
11. **RLS keys off ownership:** a brand user cannot insert a campaign until a `brands` row with their `auth.uid()` exists. `session.tsx` guarantees it before any write. Same for creators.
12. Both shells are **egress-blocked from supabase.co** — inspect the live DB through Kevin's Chrome (Section 4).
13. React **StrictMode double-invokes effects**, which would double-insert a brand row. `session.tsx` dedupes provisioning on a module-level in-flight promise. Don't remove that.

---

## 10. How to resume in one paragraph

KYRO is live at kyro-phi.vercel.app on Supabase (project `blmsjeniotlkpsslfrrl`), with **email + password auth** (sign in, sign up with a Brand/Creator toggle, forgot password, reset), a deployed 10-table Postgres schema with RLS, and a **Brand dashboard that reads real campaign rows** through `src/lib/db.ts`. `src/lib/session.tsx` restores the session on reload and provisions the `brands`/`creators` row RLS requires before any write. Creator and Admin dashboards still render `SEED_*` mock data. The next job is the **creator side**: browse live campaigns, apply (writes `applications`), upload video to Supabase Storage (writes `submissions`), then Brand review/approve. Edit in `~/Desktop/Kyro`; **always typecheck and build first** (Section 1) because Kevin never runs the app locally — he reviews the deployed site. Kevin reviews and pushes from GitHub Desktop; Claude never pushes.
