# 🚀 KYRO — Push This to GitHub

**Welcome back! Everything's ready. Total push time: ~5 minutes.**

This folder mirrors your GitHub repo at `aragonmedia/kyro`. Drag it (or its contents) into GitHub's upload UI, commit, and Vercel auto-redeploys.

---

## ⚡ Quick-Path: 4 steps

### 1. Save your 8 brand images into the `public/` subfolder

Open this folder, then open `public/`. You should see:
- `kyro-logo.svg` (placeholder I wrote — you can keep it, the code uses .png first then falls back to .svg)
- `README.txt` (instructions)

You need to add these 8 PNG files into `public/`:

| Save your image as | What it is |
|---|---|
| `kyro-logo.png` | Square Kyro trefoil logo on black |
| `kyro-og.png` | "The New Way to Scale" hero card |
| `kyro-cosmic.png` | Trefoil on starry cosmic background |
| `brand-ns.png` | NS hexagon |
| `brand-fuel.png` | Fuel logo |
| `brand-boldbuns.png` | Bold Buns logo |
| `brand-lebanta.png` | Lebanta logo |
| `brand-jaje.png` | Jaje Health logo |

**How to save:** In your chat with me, right-click each image you uploaded → "Save Image As..." → save into the `public/` folder with the exact filename above. If right-click-save isn't available, use the originals from wherever you got them.

### 2. Open the GitHub upload page

In your browser:

> **https://github.com/aragonmedia/kyro/upload/main**

### 3. Drag the changed files in

You have two options here:

**Option A — drag everything (simpler):**
Select ALL files and folders inside this `kyro-desktop` folder (Cmd+A in Finder) and drag them into the GitHub upload zone. GitHub will replace files that match existing paths and add new ones.

**Option B — drag only the changed files (cleaner):**
Drag just these (the ones I changed):
- `src/App.tsx` (replaces the existing one)
- `src/lib/` folder (new — adds 4 files)
- `index.html` (replaces existing)
- `.env.example` (new)
- `public/` folder (new, with your 8 images)
- `README_PUSH_THIS.md` (this file — optional)
- `CHANGELOG.md` (optional)

### 4. Commit and watch Vercel rebuild

- Scroll down on the GitHub upload page
- Commit message: `Add brand assets, Trybe-aligned features, Meta API scaffolding, public profile pages`
- Click the green **Commit changes** button
- Open your Vercel dashboard in a new tab → you should see a new deployment running
- ~60 seconds later, the new demo is live at your Vercel URL

---

## 🔍 If something breaks

**Build fails on Vercel?**
Vercel will show the error in its build log. Paste the error in chat and I'll fix in under 30 seconds.

**Demo loads but logo doesn't show?**
That means a brand image filename doesn't match what the code expects. Filenames are case-sensitive. Double-check the `public/` folder contents against the table above.

**Demo loads but everything is broken?**
Roll back: GitHub → your repo → "commits" tab → click the last good commit → "Revert" button. Vercel will redeploy the old version in ~30s.

---

## 📋 What changed (high-level)

See `CHANGELOG.md` for the full list. Highlights:

- **Branding:** Logo swapped to image (was inline SVG), "Kyro" → "KYRO" everywhere, new tagline, new stats (15K/600/$3M), "The Creator Growth Portal" subtitle
- **Real brands:** NS, Fuel, Bold Buns, Lebanta, Jaje Health wired into campaigns, marketplace, and brand carousel on lander
- **New pages:** Creator Public Profile, Brand Public Profile, About Kyro, Account Settings (stub)
- **Trybe-aligned features:** Brand carousel, creator leaderboard widget, animated earning notifications, AI tag badges on submissions, server-side attribution mention, "operating system for creator programs" feature grid
- **API scaffolding:** Full `src/lib/` folder — `types.ts`, `supabase.ts`, `meta.ts`, `api.ts`. Every button now routes through `mockApi.*` calls that auto-switch to real Supabase calls when env vars are configured
- **OG meta tags:** Open Graph + Twitter card wired in `index.html` pointing to `/kyro-og.png`. Favicon set to `/kyro-logo.png`
- **Env template:** `.env.example` lists every key V1 will need (Supabase, Meta, Square, Trolley)

---

## 🛠️ For V1 wiring (after demo)

Everything is structured so V1 is small additive PRs, not a rewrite:

1. **Supabase wiring:** drop your URL + publishable key in Vercel env vars. `lib/supabase.ts` initializes lazily, and `lib/api.ts` auto-routes through real Supabase calls once configured.
2. **Meta wiring:** once your Meta App Review clears, fill in `VITE_META_APP_ID` + `META_APP_SECRET` (server-only) in Vercel. The stubs in `lib/meta.ts` show exactly which API endpoints each function should hit.
3. **Square + Trolley:** add as Vercel API routes in `/api/square/*` and `/api/trolley/*`. Mock handlers in `lib/api.ts` show the call sites that need real implementations.

---

**Questions, errors, anything weird? Paste in chat. I'll fix instantly.**

Happy launch. 🔥
