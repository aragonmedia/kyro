# Kyro Demo — Changelog

All notable changes since the initial Vercel deploy.

---

## v0.2.0 — Trybe-aligned, real brands, public profiles, API scaffolding

### 🎨 Branding

- **Logo:** `KyroLogo` component now renders `<img src="/kyro-logo.png" />` with a graceful fallback to `/kyro-logo.svg` if the PNG is missing. Used in nav, footer, app shell, role picker, and all profile screens.
- **Wordmark:** "Kyro" → **"KYRO"** (uppercase) everywhere — nav, footer, role picker, app shell.
- **Subtitle:** Added "The Creator Growth Portal" next to nav wordmark on desktop.
- **Hero tagline:** "Brands scale their creative engine, all with ease." → **"Creators scale their performance. Brands scale their impact."** (matches OG card).
- **CTA copy:** "Start for Free" → **"Join KYRO Free"** on hero.
- **Lander stats:** 10K+ / 500+ / $2M+ → **15K+ / 600+ / $3M+** (matches OG card design + Trybe scale).

### 🏷️ Real partner brands

Replaced fictional `Athletiq / Foundry Goods / Coastal Supply Co.` with real partners:

- **Bold Buns** — `boldbuns` — Activewear that moves with you
- **Fuel** — `fuel` — Recovery for everyday athletes
- **Jaje Health** — `jaje` — Plant-powered wellness
- **Lebanta** — `lebanta` — Sunset-warm everyday essentials
- **NS** — `ns` — Pure honey, performance fuel

Each brand has: id, name, logo path, tagline, category, accent color. New `BRANDS` constant in App.tsx is the single source of truth — every campaign/marketplace card/profile renders from this.

Brand carousel added to lander ("The fastest growing consumer brands choose KYRO") — Trybe-style.

### 🆕 New screens

- **Creator Public Profile** (`/creator-profile` view) — hero with avatar/bio/socials, stats (campaigns / earnings / ROAS / orders), sample work grid, brands worked with. Triggered from BrandDashboard leaderboard + AdminDashboard curation queue.
- **Brand Public Profile** (`/brand-profile` view) — hero with logo/tagline, stats (active campaigns / creators / lifetime spend / ROAS), open campaigns grid, creator roster. Triggered from CreatorDashboard submission cards + marketplace browse.
- **About KYRO** (`/about` view) — mission, how-it-works expanded, Aragon Media credit, contact CTAs. Linked from lander nav + footer.
- **Account Settings** (`/settings` view, stub) — profile, payment method, notifications, connected accounts, security. UI shell only; full editing in V1.

### 🏆 Trybe-aligned features

- **Creator Leaderboard widget** in BrandDashboard — top performers ranked by orders, ads, views. Click-through to creator public profile.
- **Animated earning notifications** in CreatorDashboard — Trybe-style toast that pops in with "You just earned +$24, 2 orders · just now" on a 20s interval (great demo moment).
- **AI tag badges** on submission cards — pink "AI tagged" pill + tag chips (Problem/Solution, Gen-Z, Unboxing, etc.) — sets up the AI angle-tagging story.
- **"Operating system for creator programs" feature grid** on lander — 9 features mirroring Trybe's product breadth (creative management, whitelisting, leaderboards, server-side attribution, AI tagging, earning notifications, chats, auto payouts, scale winners).

### ⚙️ API scaffolding (`src/lib/`)

- **`lib/types.ts`** — Complete TS types for every entity: UserProfile, Brand, Creator, Campaign, Application, Submission, LedgerEntry, Payout, MetaInsightsSnapshot, Notification. Money as `Cents` integer throughout to avoid float drift.
- **`lib/supabase.ts`** — Supabase client init with lazy initialization. `getSupabase()` returns the client if env vars are set, null otherwise. Auth helpers: `signUp`, `signIn`, `signOut`, `getCurrentUser`.
- **`lib/meta.ts`** — Meta Marketing API client stubs. `pushSubmissionToMeta`, `fetchAdInsights`, `pauseAd`, `resumeAd`, `buildOAuthUrl`, `buildWhitelistingLink`. Comments document exact Graph API endpoints + payloads V1 needs.
- **`lib/api.ts`** — Unified API surface. `mockApi` for demo + `realApi` for Supabase-backed calls + `api` that picks the right one based on `isSupabaseConfigured()`. Every dashboard button now routes through these handlers — no inline `onClick` logic.

### 🌐 OG / Meta tags / Favicon

- Title: `KYRO — The Creator Growth Portal`
- Open Graph: og:title, og:description, og:image (`/kyro-og.png`), og:type, og:site_name, og:url, og:locale, og:image:width=1200, og:image:height=630
- Twitter card: `summary_large_image`
- Favicon + Apple touch icon: `/kyro-logo.png`
- Theme color: `#0f172a` (slate-950)
- Meta description + keywords for SEO

### 🌱 Env template

`.env.example` added with every key V1 will need:
- Supabase: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Meta: `VITE_META_APP_ID`, `VITE_META_GRAPH_API_VERSION`, `META_APP_SECRET`
- Square: `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_ENV`
- Trolley: `TROLLEY_API_KEY`, `TROLLEY_API_SECRET`, `TROLLEY_WEBHOOK_SECRET`
- Misc: `NEXT_PUBLIC_SITE_URL`

### 🧹 Polish

- Brand logos on every campaign card, marketplace card, submission card, pool health row, curation queue
- Submission cards now show: orders, impressions, spend, earned, pending, AI tags, brand logo (clickable to brand profile)
- AppShell: notifications bell with unread dot, account icon, role-switcher pill
- App-wide routing extended to handle 7 views: landing / auth / app / about / creator-profile / brand-profile / settings
- All buttons → handlers in `mockApi.*` (console.log every event, easy to spot in DevTools during demo)

### 🧪 Verification

- ✅ TypeScript strict typecheck passes (`tsc --noEmit -p tsconfig.app.json`)
- ✅ Production build clean (`npm run build`)
- ✅ 1514 modules transformed, 243KB JS / 31KB CSS, no warnings
- ✅ All imports used, no dead code

---

## v0.1.0 — Initial demo (already deployed)

Landing page + sign-in flow + three role dashboards (Brand, Creator, Admin) with mocked data and "Demo as..." role switcher.
