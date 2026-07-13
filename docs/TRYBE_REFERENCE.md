# Trybe Reference — Design System & IA

Captured from Trybe (jointrybe.com) — Kyro's prime inspiration / #1 replication target.
Reviewed live: marketing landing + logged-in Partner Portal (account: "Kyvo", Partner • Owner).

## Overall look & feel
- **Theme: LIGHT.** White cards on a light gray (~#f4f4f7) background. Lots of whitespace.
  - NOTE: Kyro currently ships a **dark slate** theme. Open decision — move Kyro to Trybe's light theme, or keep dark. (Kevin to confirm.)
- **Primary accent: violet/purple**, used as a gradient (~`#7c5cff` → `#6d28d9`). Primary buttons are **rounded-full pills**, purple gradient fill, white text, small leading icon.
- **Typography:** clean geometric sans (Inter/Geist-like). Headlines are **very large, bold, tight tracking, near-black**. Body is muted gray.
- **Corners:** generous rounding — cards ~`rounded-2xl`, buttons `rounded-full`.
- **Voice:** friendly + direct. "Welcome back, Kevin!", "The New Way for Creators To Make Money."

## Marketing landing page (jointrybe.com)
- **Nav:** floating **white rounded-full pill** bar near top-center. Links: `For Creators`, `For Brands`, `For Agencies`; `Sign In` on the right.
- **Hero:** centered. Huge 2-line headline **"The New Way for Creators To Make Money."** One-line subtext: *"Creators earn based on performance. Brands scale their creative engine with ease."* Single purple gradient CTA pill: **"Get Started For Free"**.
- Background: light with a subtle texture/gradient.
- (Full-page lower sections not captured — marketing site redirects to the portal when logged in.)

## Partner Portal (app shell)
- **Top bar:** left = Trybe logo + "Partner Portal" pill. Right = help `?` icon + user chip (avatar initials + name + chevron).
- **Left sidebar (~256px, white):**
  - **Org switcher** card at top: org logo + name (e.g. "Kyvo") + role line ("Partner • Owner") + chevron.
  - **Nav (icon + label):** Dashboard, Submissions, Chat, Brands, Campaigns, Creators, Finance.
  - Section label **"Configuration"** → Settings.
  - **Active item:** light purple background pill + purple **left accent bar** + purple icon.
- **Content area:** page heading + gray subtitle, then white cards. Cards = heading + description on left, action button top-right.

## Component patterns
- **Empty states:** centered icon/emoji, bold heading ("No campaigns yet!", "No brands connected yet"), gray helper line, purple CTA pill below.
- **List/index pages:** full-width **search input** + **Filters** button (right) across the top, list below.
- **Buttons:** primary = purple gradient pill w/ icon; everything rounded-full.

## Kyro nav IA to mirror (dashboards phase)
Dashboard · Submissions · Chat · Brands · Campaigns · Creators · Finance · (Configuration) Settings

## Open decisions for Kevin
1. Light theme (Trybe-style) vs keep Kyro's current dark slate?
2. Adopt Trybe's exact nav IA above, or Kyro's role-specific dashboards?
