import {
  Menu, X, ArrowRight, Star, TrendingUp, Zap, DollarSign,
  CheckCircle, Briefcase, Camera, Shield, ChevronRight,
  Plus, Upload, Eye, Users, Wallet, FileVideo, AlertCircle, Activity,
  Sparkles, Bell, LogOut, Filter, Search, Award, Target,
  ArrowUpRight, RefreshCw, MessageSquare, Globe, Mail, Trophy, Hash,
  Instagram, Youtube, ShieldCheck, Cpu, Layers, Heart,
  ChevronLeft, Share2, Sun, Moon, EyeOff, BarChart3, PieChart, Calendar, ArrowDownRight, ImagePlus,
  MessagesSquare, Settings as SettingsIcon
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { mockApi } from './lib/api';
import { useTheme } from './lib/theme';
import {
  describeAuthError,
  getCurrentUser,
  getMyProfile,
  isSupabaseConfigured,
  saveMyProfile,
  sendPasswordReset,
  signInWithPassword,
  signUpWithPassword,
  updatePassword,
} from './lib/supabase';
import { useSession } from './lib/session';
import {
  centsToDollars,
  connectProvider,
  createCampaign,
  disconnectProvider,
  getOnboardingStatus,
  createSubmission,
  listCampaignsOpenToCreators,
  listCampaignsWithStats,
  listConnections,
  listApplicationsForBrand,
  listRosterForBrand,
  listMyApplications,
  listMySubmissions,
  listSubmissionsForBrand,
  saveTaxDetails,
  saveCreatorSocials,
  setApplicationStatus,
  setEmailNotifications,
  setSubmissionUsage,
  updateCampaignStatus,
  applyToCampaign,
  setCampaignCover,
  openCampaignThread,
  openSubmissionThread,
  completeBrandSetup,
  createAnotherBrand,
  listBrandLeaderboard,
  normalizeMetaAdAccount,
  normalizeShopifyDomain,
  parseMoneyToCents,
  parsePercentToFraction,
  signCampaignAgreement,
} from './lib/db';
import type { LeaderboardCreator, BrandApplication, RosterCreator, BrandConnection, CampaignSubmission, CampaignWithStats, MyApplication, MySubmission, OnboardingStatus, OpenCampaign } from './lib/db';
import { uploadSubmissionVideo, uploadCampaignCover, uploadBrandLogo } from './lib/storage';
import type { CommissionType } from './lib/types';
import { PRIVACY_POLICY_MD, TERMS_OF_SERVICE_MD } from './lib/legal';
import { saveBankAccount, saveBrandBankAccount, startShopifyInstall, takeConnectionOutcome, type ConnectOutcome } from './lib/platform';
import { EarningsCard } from './components/EarningsCard';
import { AffiliateOrdersCard, AffiliateOrdersPage } from './components/AffiliateOrders';
import { CoverImage, VideoTile } from './components/MediaTile';
import { CampaignCoverControl } from './components/CampaignCover';
import { SubmissionDetailModal } from './components/SubmissionDetail';
import { PayoutsPanel } from './components/PayoutsPanel';
import { ChatPanel, useUnreadTotal } from './components/Chat';
import { BrandMark, CampaignDetailModal } from './components/CampaignDetail';
import { BrandPerformanceCard } from './components/BrandPerformance';
import { BrandSetupWizard } from './components/BrandSetup';
import { SupportWidget } from './components/SupportWidget';
import { CreatorInviteCard, InviteLanding } from './components/Invite';
import { BrandDrilldown, CreatorProfileSheet, type DrilldownKind } from './components/BrandDrilldown';
import { Markdown } from './lib/markdown';

/* ─────────────────────────────────────────────────────────────
   THEME TOGGLE — shared control (landing nav + settings)
   ───────────────────────────────────────────────────────────── */
function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      aria-label="Toggle theme"
      className={`p-2 rounded-lg text-muted hover:text-heading hover:bg-surface-2 transition ${className}`}
    >
      {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  );
}

function ThemeSegmented() {
  const { theme, setTheme } = useTheme();
  const opts = [
    { val: 'light' as const, Icon: Sun, label: 'Light' },
    { val: 'dark' as const, Icon: Moon, label: 'Dark' },
  ];
  // In the settings card this sits in a flex column on mobile, where a
  // content-width row of buttons stretches to full width and leaves the two
  // options stranded on the left. Equal flex cells fill it evenly instead.
  return (
    <div className="flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-lg w-full sm:w-fit">
      {opts.map(({ val, Icon, label }) => (
        <button
          key={val}
          onClick={() => setTheme(val)}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-md text-sm font-semibold transition ${theme === val ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'}`}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   KYRO LOGO — image-based, matches uploaded asset
   ───────────────────────────────────────────────────────────── */
function KyroLogo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/kyro-logo.png"
      alt="Kyro"
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
      onError={(e) => {
        // Fallback to SVG if PNG missing
        e.currentTarget.src = '/kyro-logo.svg';
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────
   SEED DATA — Real partner brands + creator/brand profiles
   ───────────────────────────────────────────────────────────── */

type Role = 'brand' | 'creator' | 'admin';

const BRANDS = {
  ns: { id: 'ns', name: 'NS', logo: '/brand-ns.png', tagline: 'Pure honey, performance fuel', category: 'Wellness · F&B', accent: 'from-amber-500/30 to-orange-500/30' },
  fuel: { id: 'fuel', name: 'Fuel', logo: '/brand-fuel.png', tagline: 'Recovery for everyday athletes', category: 'Fitness · Supplements', accent: 'from-indigo-500/30 to-purple-500/30' },
  boldbuns: { id: 'boldbuns', name: 'Bold Buns', logo: '/brand-boldbuns.png', tagline: 'Activewear that moves with you', category: 'Apparel · Activewear', accent: 'from-pink-500/30 to-fuchsia-500/30' },
  lebanta: { id: 'lebanta', name: 'Lebanta', logo: '/brand-lebanta.png', tagline: 'Sunset-warm everyday essentials', category: 'Apparel · Lifestyle', accent: 'from-orange-500/30 to-rose-500/30' },
  jaje: { id: 'jaje', name: 'Jaje Health', logo: '/brand-jaje.png', tagline: 'Plant-powered wellness', category: 'Wellness · CPG', accent: 'from-emerald-500/30 to-teal-500/30' },
};

type BrandId = keyof typeof BRANDS;

const SEED_CAMPAIGNS = [
  {
    id: 'c1',
    name: 'Bold Buns — Summer Drop',
    brandId: 'boldbuns' as BrandId,
    status: 'live',
    pool: 25000,
    spent: 14820,
    creators: 12,
    submissions: 18,
    roas: 3.4,
    impressions: 482000,
    conversions: 1240,
    cover: 'https://images.pexels.com/photos/1552242/pexels-photo-1552242.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    id: 'c2',
    name: 'Fuel — Recovery Launch',
    brandId: 'fuel' as BrandId,
    status: 'live',
    pool: 18000,
    spent: 7200,
    creators: 8,
    submissions: 11,
    roas: 2.9,
    impressions: 248000,
    conversions: 612,
    cover: 'https://images.pexels.com/photos/4498151/pexels-photo-4498151.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    id: 'c3',
    name: 'Jaje Health — Hero Tonic',
    brandId: 'jaje' as BrandId,
    status: 'live',
    pool: 32000,
    spent: 9410,
    creators: 14,
    submissions: 22,
    roas: 4.1,
    impressions: 612000,
    conversions: 1840,
    cover: 'https://images.pexels.com/photos/1638280/pexels-photo-1638280.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    id: 'c4',
    name: 'Lebanta — Capsule Collection',
    brandId: 'lebanta' as BrandId,
    status: 'pending_fund',
    pool: 0,
    spent: 0,
    creators: 0,
    submissions: 0,
    roas: 0,
    impressions: 0,
    conversions: 0,
    cover: 'https://images.pexels.com/photos/1078973/pexels-photo-1078973.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
];

const SEED_CREATORS = {
  maya: {
    id: 'maya',
    name: 'Maya Chen',
    handle: '@mayachen',
    avatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=200',
    bio: 'Wellness + lifestyle creator. Tea, movement, and quiet mornings. I love brands that put care into the everyday.',
    location: 'Vancouver, BC',
    social: { instagram: '280K', tiktok: '420K', youtube: '38K' },
    stats: { campaigns: 14, totalEarned: 24820, avgRoasForBrands: 3.7, ordersDriven: 1840 },
    niche: ['Wellness', 'Lifestyle', 'Movement'],
    sampleWork: [
      'https://images.pexels.com/photos/2294353/pexels-photo-2294353.jpeg?auto=compress&cs=tinysrgb&w=300',
      'https://images.pexels.com/photos/1239288/pexels-photo-1239288.jpeg?auto=compress&cs=tinysrgb&w=300',
      'https://images.pexels.com/photos/2294353/pexels-photo-2294353.jpeg?auto=compress&cs=tinysrgb&w=300',
    ],
  },
  sasha: {
    id: 'sasha',
    name: 'Sasha Novak',
    handle: '@sashanovak',
    avatar: 'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=200',
    bio: 'Streetwear, sneakers, and the culture around them. I build videos brands actually want to scale.',
    location: 'Toronto, ON',
    social: { instagram: '510K', tiktok: '880K', youtube: '120K' },
    stats: { campaigns: 22, totalEarned: 48200, avgRoasForBrands: 4.2, ordersDriven: 3120 },
    niche: ['Streetwear', 'Apparel', 'Culture'],
    sampleWork: [
      'https://images.pexels.com/photos/1183266/pexels-photo-1183266.jpeg?auto=compress&cs=tinysrgb&w=300',
      'https://images.pexels.com/photos/2294353/pexels-photo-2294353.jpeg?auto=compress&cs=tinysrgb&w=300',
      'https://images.pexels.com/photos/1239288/pexels-photo-1239288.jpeg?auto=compress&cs=tinysrgb&w=300',
    ],
  },
  priya: {
    id: 'priya',
    name: 'Priya Sharma',
    handle: '@priya.s',
    avatar: 'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=200',
    bio: 'Skincare, science, and demystifying what actually works. Long-form storytelling for product-led brands.',
    location: 'Brooklyn, NY',
    social: { instagram: '140K', tiktok: '210K', youtube: '88K' },
    stats: { campaigns: 9, totalEarned: 16200, avgRoasForBrands: 3.2, ordersDriven: 940 },
    niche: ['Skincare', 'Wellness', 'Education'],
    sampleWork: [
      'https://images.pexels.com/photos/1239288/pexels-photo-1239288.jpeg?auto=compress&cs=tinysrgb&w=300',
      'https://images.pexels.com/photos/2294353/pexels-photo-2294353.jpeg?auto=compress&cs=tinysrgb&w=300',
      'https://images.pexels.com/photos/1183266/pexels-photo-1183266.jpeg?auto=compress&cs=tinysrgb&w=300',
    ],
  },
};

type CreatorId = keyof typeof SEED_CREATORS;

const SEED_LEADERBOARD = [
  { creatorId: 'sasha' as CreatorId, orders: 445, ads: 4, views: 11800, brandId: 'boldbuns' as BrandId },
  { creatorId: 'maya' as CreatorId, orders: 430, ads: 4, views: 21400, brandId: 'jaje' as BrandId },
  { creatorId: 'priya' as CreatorId, orders: 422, ads: 1, views: 40100, brandId: 'fuel' as BrandId },
];

const SEED_CURATION = [
  { id: 'cu1', campaign: 'Bold Buns — Summer Drop', creatorId: 'sasha' as CreatorId, match: 94 },
  { id: 'cu2', campaign: 'Fuel — Recovery Launch', creatorId: 'priya' as CreatorId, match: 91 },
];

const testimonials = [
  { quote: "Kyro completely changed how we run influencer marketing. Our ROAS tripled in the first month.", name: "Jordan Lee", role: "Head of Growth, Bold Buns", avatar: "https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=2", stars: 5 },
  { quote: "I went from $400/month to over $8K in 60 days. The performance-based model is a game changer.", name: "Maya Chen", role: "Creator, 280K followers", avatar: "https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=2", stars: 5 },
  { quote: "We scaled our creative output 10x without hiring a single additional team member.", name: "Marcus Reid", role: "CMO, Fuel", avatar: "https://images.pexels.com/photos/2379005/pexels-photo-2379005.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=2", stars: 5 },
  { quote: "The transparency into earnings and ad performance is unlike anything else out there.", name: "Priya Sharma", role: "Creator, 140K followers", avatar: "https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=2", stars: 5 },
  { quote: "We onboarded 40 creators in a week and had ads running the same day. Nothing else comes close.", name: "Tyler Brooks", role: "Founder, Jaje Health", avatar: "https://images.pexels.com/photos/91227/pexels-photo-91227.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=2", stars: 5 },
  { quote: "Kyro's auto-payout system means I focus on creating, not chasing invoices.", name: "Sasha Novak", role: "Creator, 510K followers", avatar: "https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=2", stars: 5 },
];

/* ─────────────────────────────────────────────────────────────
   SHARED UI HELPERS
   ───────────────────────────────────────────────────────────── */
const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtK = (n: number) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K' : n.toString();

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    live: { label: 'Live', cls: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30' },
    in_review: { label: 'In Review', cls: 'bg-amber-400/15 text-amber-300 border-amber-400/30' },
    pending_fund: { label: 'Awaiting Funding', cls: 'bg-blue-400/15 text-blue-300 border-blue-400/30' },
    draft: { label: 'Draft', cls: 'bg-line text-muted border-line' },
    paused: { label: 'Paused', cls: 'bg-amber-400/15 text-amber-300 border-amber-400/30' },
    complete: { label: 'Complete', cls: 'bg-purple-400/15 text-purple-300 border-purple-400/30' },
    archived: { label: 'Archived', cls: 'bg-line text-faint border-line' },
    approved: { label: 'Approved', cls: 'bg-purple-400/15 text-purple-300 border-purple-400/30' },
    paid: { label: 'Paid', cls: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30' },
  };
  const it = map[status] || { label: status, cls: 'bg-line text-body border-line' };
  return <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${it.cls}`}>{it.label}</span>;
}

function BrandLogo({ brandId, size = 40 }: { brandId: BrandId; size?: number }) {
  const brand = BRANDS[brandId];
  return (
    <div
      className="rounded-lg bg-surface-2 border border-line flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <img
        src={brand.logo}
        alt={brand.name}
        className="w-full h-full object-cover"
        onError={(e) => {
          // Fallback to letter avatar if logo missing
          e.currentTarget.style.display = 'none';
          e.currentTarget.parentElement!.innerHTML = `<span class="text-sm font-bold text-heading">${brand.name.charAt(0)}</span>`;
        }}
      />
    </div>
  );
}

/**
 * Logo for a brand that came out of the database, where the only assets we have
 * are a name and maybe a URL. Falls back to a gradient initial so a brand that
 * hasn't uploaded a logo still looks deliberate rather than broken.
 */
function BrandAvatar({ name, logoUrl, size = 40 }: { name: string; logoUrl?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(logoUrl) && !broken;
  return (
    <div
      className="rounded-lg bg-surface-2 border border-line flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img src={logoUrl as string} alt={name} className="w-full h-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span className="font-bold text-white w-full h-full flex items-center justify-center bg-gradient-kyro" style={{ fontSize: size * 0.4 }}>
          {name.trim().charAt(0).toUpperCase() || 'K'}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   LANDING PAGE
   ───────────────────────────────────────────────────────────── */
function Landing({ onSignIn, onGetStarted, onAbout, onLegal }: { onSignIn: () => void; onGetStarted: () => void; onAbout: () => void; onLegal: (doc: 'privacy' | 'terms') => void }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-app text-body">
      {/* Floating pill nav — Trybe-style */}
      <nav className="fixed inset-x-0 top-4 z-50 px-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 rounded-full border border-line bg-surface/80 backdrop-blur-md pl-5 pr-3 py-2.5 shadow-lg shadow-black/5">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5 shrink-0">
            <KyroLogo size={30} />
            <span className="text-xl font-bold bg-gradient-kyro bg-clip-text text-transparent tracking-tight">KYRO</span>
          </button>
          <div className="hidden md:flex items-center gap-7 text-sm font-medium">
            <a href="#how-it-works" className="text-body hover:text-heading transition-colors">For Creators</a>
            <a href="#features" className="text-body hover:text-heading transition-colors">For Brands</a>
            <button onClick={onAbout} className="text-body hover:text-heading transition-colors">About</button>
          </div>
          <div className="hidden md:flex items-center gap-1.5">
            <ThemeToggle />
            <button onClick={onSignIn} className="px-4 py-2 text-sm font-semibold text-body hover:text-heading transition-colors">Sign In</button>
            <button onClick={onGetStarted} className="px-5 py-2 bg-gradient-kyro rounded-full text-white text-sm font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition transform hover:scale-105">Get Started</button>
          </div>
          <div className="md:hidden flex items-center gap-1">
            <ThemeToggle />
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-heading">
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden max-w-5xl mx-auto mt-2 rounded-2xl border border-line bg-surface/95 backdrop-blur-md p-4 space-y-1 shadow-lg">
            <a href="#how-it-works" className="block py-2.5 text-body hover:text-heading font-medium">For Creators</a>
            <a href="#features" className="block py-2.5 text-body hover:text-heading font-medium">For Brands</a>
            <button onClick={onAbout} className="block w-full text-left py-2.5 text-body hover:text-heading font-medium">About</button>
            <div className="pt-2 space-y-2">
              <button onClick={onSignIn} className="w-full px-4 py-2.5 border border-line rounded-lg text-heading font-semibold hover:bg-surface-2 transition">Sign In</button>
              <button onClick={onGetStarted} className="w-full px-4 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold transition">Get Started</button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-36 md:pt-44 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-surface-2 border border-line rounded-full">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-sm text-muted font-medium">Now live — join for free</span>
            </div>
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold leading-[1.05] tracking-tight">
              <span className="bg-gradient-kyro bg-clip-text text-transparent">The New Way</span><br />
              <span className="bg-gradient-kyro bg-clip-text text-transparent">to Scale</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted max-w-2xl mx-auto leading-relaxed">
              Creators scale their performance. Brands scale their impact.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={onGetStarted} className="px-8 py-4 bg-gradient-kyro rounded-full text-white font-semibold flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-purple-600/40 transition transform hover:scale-105 text-lg">
              Join KYRO Free <ArrowRight size={20} />
            </button>
          </div>
          <div className="flex items-center justify-center gap-8 sm:gap-10 pt-2">
            <div className="text-center"><p className="text-3xl font-bold text-heading">15K+</p><p className="text-muted text-sm mt-0.5">Creators</p></div>
            <div className="w-px h-10 bg-line"></div>
            <div className="text-center"><p className="text-3xl font-bold text-heading">600+</p><p className="text-muted text-sm mt-0.5">Brands</p></div>
            <div className="w-px h-10 bg-line"></div>
            <div className="text-center"><p className="text-3xl font-bold text-heading">$3M+</p><p className="text-muted text-sm mt-0.5">Paid to Creators</p></div>
          </div>
        </div>
      </section>

      {/* Brand row */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-sm font-semibold text-faint uppercase tracking-widest mb-8">
            The fastest growing consumer brands choose KYRO
          </p>
          <div className="flex items-center gap-10 justify-center flex-wrap">
            {Object.values(BRANDS).map((b) => (
              <div key={b.id} className="flex items-center gap-3 opacity-70 hover:opacity-100 transition">
                <img src={b.logo} alt={b.name} className="h-9 w-9 object-contain rounded-lg bg-surface-2 p-1 border border-line" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span className="text-body font-semibold">{b.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-line">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14"><h2 className="text-4xl md:text-5xl font-bold text-heading">How KYRO Works</h2></div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { num: '01', id: 'creators', title: 'Creators join brands', desc: 'Creators discover brands they love and join their creator program in one tap.', icon: Heart },
              { num: '02', id: 'brands', title: 'Brands launch on Meta', desc: 'Approved creator videos run as whitelisted Meta ads — at scale, in minutes.', icon: Zap },
              { num: '03', id: 'earn', title: 'Performance pays out', desc: 'Real-time analytics track every order. Payouts run on auto-pilot via Trolley.', icon: DollarSign },
            ].map((s) => (
              <div key={s.num} id={s.id} className="relative overflow-hidden rounded-3xl border border-line bg-surface p-8 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-bold bg-gradient-kyro bg-clip-text text-transparent">{s.num}</span>
                  <div className="w-11 h-11 rounded-xl bg-gradient-kyro flex items-center justify-center"><s.icon size={20} className="text-white" /></div>
                </div>
                <h3 className="text-2xl font-bold text-heading">{s.title}</h3>
                <p className="text-muted leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-line">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 space-y-3">
            <h2 className="text-4xl md:text-5xl font-bold text-heading">The operating system for creator programs</h2>
            <p className="text-lg text-muted max-w-2xl mx-auto">Submissions, whitelisting, ad launching, payouts, performance — all in one streamlined workflow.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Layers, title: 'Creative management at scale', desc: 'Submissions, revisions, and approvals organized in one workspace.', color: 'text-purple-500' },
              { icon: Zap, title: 'Whitelisting & ad launching', desc: 'Push approved UGC to Meta as whitelisted ads in seconds.', color: 'text-blue-500' },
              { icon: Trophy, title: 'Creator leaderboards', desc: 'Top performers and best-selling products ranked in real time.', color: 'text-amber-500' },
              { icon: ShieldCheck, title: 'Server-side attribution', desc: 'Track conversions at the order level with last-click attribution.', color: 'text-emerald-500' },
              { icon: Cpu, title: 'AI angle & persona tagging', desc: 'Every submission auto-tagged by angle, persona, and creative DNA.', color: 'text-pink-500' },
              { icon: Bell, title: 'Creator earning notifications', desc: 'Creators get notified the moment a sale hits their account.', color: 'text-purple-500' },
              { icon: MessageSquare, title: 'Built-in chats & channels', desc: 'Talk to creators 1:1 or in channels — no Slack, no email threads.', color: 'text-blue-500' },
              { icon: Wallet, title: 'Auto payouts & smart contracts', desc: 'Commission rules execute automatically — paid via Trolley.', color: 'text-emerald-500' },
              { icon: Target, title: 'Spot and scale winners', desc: 'Surface the winning ads instantly and double down.', color: 'text-pink-500' },
            ].map((f, i) => (
              <div key={i} className="p-6 rounded-2xl border border-line bg-surface hover:-translate-y-0.5 transition">
                <div className="w-11 h-11 rounded-xl bg-surface-2 border border-line flex items-center justify-center"><f.icon size={20} className={f.color} /></div>
                <h3 className="text-lg font-bold text-heading mt-4 mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-line">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 space-y-3">
            <h2 className="text-4xl md:text-5xl font-bold text-heading">Loved by creators<br />and brands alike</h2>
            <p className="text-xl text-muted">Real results from real people.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t, idx) => (
              <div key={idx} className="flex flex-col gap-4 p-6 bg-surface border border-line rounded-2xl hover:shadow-lg hover:shadow-black/5 transition">
                <div className="flex gap-1">{[...Array(t.stars)].map((_, i) => (<Star key={i} size={14} className="text-amber-400 fill-amber-400" />))}</div>
                <p className="text-body leading-relaxed flex-1">"{t.quote}"</p>
                <div className="flex items-center gap-3 pt-2 border-t border-line">
                  <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  <div><p className="text-heading font-semibold text-sm">{t.name}</p><p className="text-muted text-xs">{t.role}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-line">
        <div className="max-w-3xl mx-auto text-center rounded-3xl border border-line bg-surface p-10 md:p-14 space-y-5">
          <h2 className="text-3xl md:text-4xl font-bold text-heading">Ready to scale with KYRO?</h2>
          <p className="text-muted text-lg">Free to join. Brands and creators welcome.</p>
          <button onClick={onGetStarted} className="px-8 py-3.5 bg-gradient-kyro rounded-full text-white font-semibold inline-flex items-center gap-2 hover:shadow-xl hover:shadow-purple-600/40 transition transform hover:scale-105">
            Join KYRO Free <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div className="col-span-1">
              <div className="flex items-center gap-2 mb-4"><KyroLogo size={28} /><span className="text-lg font-bold bg-gradient-kyro bg-clip-text text-transparent tracking-tight">KYRO</span></div>
              <p className="text-muted text-sm">The Creator Growth Portal. Scale your performance with KYRO.</p>
            </div>
            <div>
              <h4 className="text-heading font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-muted text-sm">
                <li><a href="#how-it-works" className="hover:text-heading transition">How it Works</a></li>
                <li><a href="#features" className="hover:text-heading transition">Features</a></li>
                <li><button onClick={onGetStarted} className="hover:text-heading transition">Get Started</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-heading font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-muted text-sm">
                <li><button onClick={onAbout} className="hover:text-heading transition">About</button></li>
                <li><a href="mailto:chatwithkyro@gmail.com" className="hover:text-heading transition">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-heading font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-muted text-sm">
                <li><button onClick={() => onLegal('privacy')} className="hover:text-heading transition">Privacy Policy</button></li>
                <li><button onClick={() => onLegal('terms')} className="hover:text-heading transition">Terms of Service</button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-line pt-8 flex flex-col md:flex-row justify-between items-center gap-3">
            <p className="text-muted text-sm">© 2026 KYRO. All rights reserved.</p>
            <p className="text-faint text-xs">KYRO is operated by Kyvo LLC, 131 Continental Drive, Suite 305, Newark, DE 19713.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   AUTH — email + password (sign in, sign up, forgot, reset)
   ───────────────────────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

/** Shared chrome for every auth screen: logo, card, footnote. */
function AuthShell({
  title,
  sub,
  children,
  footer,
  onBack,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-app flex flex-col items-center justify-center px-4 py-10">
      <button onClick={onBack} className="flex items-center gap-2.5 mb-8 group">
        <KyroLogo size={40} />
        <span className="text-2xl font-bold bg-gradient-kyro bg-clip-text text-transparent tracking-tight">KYRO</span>
      </button>

      <div className="w-full max-w-md bg-surface border border-line rounded-3xl p-8 shadow-xl shadow-black/5">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-heading">{title}</h1>
          {sub && <p className="text-sm text-muted mt-1.5">{sub}</p>}
        </div>
        {children}
      </div>

      {footer && <div className="mt-6 text-center text-sm">{footer}</div>}

      <button onClick={onBack} className="mt-8 flex items-center gap-1.5 text-xs text-faint hover:text-muted transition">
        <ChevronLeft size={14} /> Back to home
      </button>
    </div>
  );
}

const authField =
  'w-full px-5 py-3 bg-surface-2 border rounded-full text-heading placeholder-faint focus:outline-none focus:border-purple-500 transition';

function AuthError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 mb-4 rounded-xl border border-pink-400/30 bg-pink-400/10">
      <AlertCircle size={16} className="text-pink-400 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-pink-200">{message}</p>
    </div>
  );
}

/** Password input with a show/hide toggle. */
function PasswordField({
  value,
  onChange,
  placeholder,
  invalid,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  invalid?: boolean;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${authField} pr-12 ${invalid ? 'border-pink-400/60' : 'border-line'}`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-faint hover:text-muted transition"
        title={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function SubmitButton({ loading, disabled, children }: { loading: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full py-3 rounded-full bg-gradient-kyro text-white font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center justify-center gap-2"
    >
      {loading && <RefreshCw size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

/* ─── Sign in ─────────────────────────────────────────────── */

function SignIn({
  mode,
  onDone,
  onBack,
  onForgot,
  onGoSignUp,
}: {
  mode: 'signin' | 'admin';
  onDone: () => void | Promise<void>;
  onBack: () => void;
  onForgot: () => void;
  onGoSignUp: () => void;
}) {
  const adminMode = mode === 'admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    if (!password) return setError('Enter your password.');

    setLoading(true);
    try {
      const res = await signInWithPassword(email, password);
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
      // res.demo === true means no Supabase keys; fall through to the demo app.
      await onDone();
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={adminMode ? 'Admin sign in' : 'Welcome back'}
      sub={adminMode ? 'Restricted to KYRO administrators.' : 'Sign in to your account'}
      onBack={onBack}
      footer={
        adminMode ? null : (
          <span className="text-muted">
            Don't have an account?{' '}
            <button onClick={onGoSignUp} className="font-semibold text-purple-400 hover:text-purple-300">Sign up</button>
          </span>
        )
      }
    >
      <form onSubmit={submit} className="space-y-3">
        {error && <AuthError message={error} />}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          autoComplete="email"
          autoFocus
          className={`${authField} border-line`}
        />
        <PasswordField value={password} onChange={setPassword} placeholder="Password" autoComplete="current-password" />
        <div className="pt-0.5 pb-1">
          <button type="button" onClick={onForgot} className="text-sm font-semibold text-purple-400 hover:text-purple-300">
            Forgot your password?
          </button>
        </div>
        <SubmitButton loading={loading}>Sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}

/* ─── Sign up ─────────────────────────────────────────────── */

function SignUp({
  onDone,
  onBack,
  onGoSignIn,
}: {
  onDone: (role: Role) => void | Promise<void>;
  onBack: () => void;
  onGoSignIn: () => void;
}) {
  const [role, setRole] = useState<Role>('brand');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkInbox, setCheckInbox] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) return setError('Enter your name.');
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < MIN_PASSWORD) return setError(`Use a password of at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError("Those passwords don't match.");

    setLoading(true);
    try {
      const res = await signUpWithPassword(email, password, { fullName, role });
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
      if (res.demo) {
        await onDone(role);
        return;
      }
      if (!res.session) {
        // Email confirmation is switched on in Supabase — no session yet.
        setCheckInbox(true);
        setLoading(false);
        return;
      }
      // Session is live: record the role and name on the profile row before routing.
      await saveMyProfile(role, fullName);
      await onDone(role);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  if (checkInbox) {
    return (
      <AuthShell title="Confirm your email" sub={`We sent a confirmation link to ${email.trim()}.`} onBack={onBack}>
        <div className="text-center py-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-kyro flex items-center justify-center mb-4">
            <Mail size={24} className="text-white" />
          </div>
          <p className="text-sm text-muted">Click the link in that email to finish setting up your account, then come back and sign in.</p>
          <button onClick={onGoSignIn} className="mt-5 text-sm font-semibold text-purple-400 hover:text-purple-300">
            Back to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  const roleTab = (r: Role) =>
    `flex-1 py-2.5 text-sm font-semibold rounded-full transition ${
      role === r ? 'bg-gradient-kyro text-white shadow' : 'text-muted hover:text-heading'
    }`;

  return (
    <AuthShell
      title="Create your account"
      sub="Join KYRO and start working with creators"
      onBack={onBack}
      footer={
        <span className="text-muted">
          Already have an account?{' '}
          <button onClick={onGoSignIn} className="font-semibold text-purple-400 hover:text-purple-300">Sign in</button>
        </span>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        {error && <AuthError message={error} />}

        <div className="flex gap-1 p-1 bg-surface-2 border border-line rounded-full mb-1">
          <button type="button" onClick={() => setRole('brand')} className={roleTab('brand')}>I'm a Brand</button>
          <button type="button" onClick={() => setRole('creator')} className={roleTab('creator')}>I'm a Creator</button>
        </div>

        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={role === 'brand' ? 'Your name' : 'Full name'}
          autoComplete="name"
          className={`${authField} border-line`}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          autoComplete="email"
          className={`${authField} border-line`}
        />
        <PasswordField value={password} onChange={setPassword} placeholder="Password" autoComplete="new-password" />
        <PasswordField
          value={confirm}
          onChange={setConfirm}
          placeholder="Confirm password"
          autoComplete="new-password"
          invalid={Boolean(confirm) && confirm !== password}
        />

        <label className="flex items-start gap-2.5 py-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-line accent-purple-500 flex-shrink-0"
          />
          <span className="text-xs text-muted leading-relaxed">
            I agree to the Terms of Service and Privacy Policy.
          </span>
        </label>

        <SubmitButton loading={loading} disabled={!agreed}>Create account</SubmitButton>
      </form>
    </AuthShell>
  );
}

/* ─── Forgot password ─────────────────────────────────────── */

function ForgotPassword({ onBack, onGoSignIn }: { onBack: () => void; onGoSignIn: () => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    setLoading(true);
    const res = await sendPasswordReset(email);
    setLoading(false);
    if (res.error) return setError(res.error);
    // Deliberately shown whether or not the address has an account.
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title="Check your email" sub={`If an account exists for ${email.trim()}, a reset link is on its way.`} onBack={onBack}>
        <div className="text-center py-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-kyro flex items-center justify-center mb-4">
            <Mail size={24} className="text-white" />
          </div>
          <p className="text-sm text-muted">The link expires in about an hour. Check your spam folder if it doesn't arrive.</p>
          <button onClick={onGoSignIn} className="mt-5 text-sm font-semibold text-purple-400 hover:text-purple-300">
            Back to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      sub="We'll email you a link to set a new one."
      onBack={onBack}
      footer={
        <button onClick={onGoSignIn} className="font-semibold text-purple-400 hover:text-purple-300">
          Back to sign in
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        {error && <AuthError message={error} />}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          autoComplete="email"
          autoFocus
          className={`${authField} border-line`}
        />
        <SubmitButton loading={loading}>Send reset link</SubmitButton>
      </form>
    </AuthShell>
  );
}

/* ─── Set a new password (landing spot for the reset link) ── */

function ResetPassword({ onDone, onBack, onGoSignIn }: { onDone: () => void | Promise<void>; onBack: () => void; onGoSignIn: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [validLink, setValidLink] = useState(false);

  // Supabase turns the token in the URL into a session before we get here.
  // No session means the link was bad, already used, or expired.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isSupabaseConfigured()) {
        if (alive) { setValidLink(true); setChecking(false); }
        return;
      }
      try {
        const user = await getCurrentUser();
        if (alive) setValidLink(Boolean(user));
      } catch {
        if (alive) setValidLink(false);
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD) return setError(`Use a password of at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError("Those passwords don't match.");
    setLoading(true);
    const res = await updatePassword(password);
    setLoading(false);
    if (res.error) return setError(res.error);
    await onDone();
  };

  if (checking) {
    return (
      <AuthShell title="Checking your link" onBack={onBack}>
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
          <RefreshCw size={16} className="animate-spin" /> One moment…
        </div>
      </AuthShell>
    );
  }

  if (!validLink) {
    return (
      <AuthShell title="This link has expired" sub="Reset links are single-use and last about an hour." onBack={onBack}>
        <div className="text-center py-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-pink-400/15 border border-pink-400/30 flex items-center justify-center mb-4">
            <AlertCircle size={24} className="text-pink-400" />
          </div>
          <p className="text-sm text-muted">Request a fresh one and it'll work.</p>
          <button onClick={onGoSignIn} className="mt-5 text-sm font-semibold text-purple-400 hover:text-purple-300">
            Back to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" sub="Choose something you'll remember." onBack={onBack}>
      <form onSubmit={submit} className="space-y-3">
        {error && <AuthError message={error} />}
        <PasswordField value={password} onChange={setPassword} placeholder="New password" autoComplete="new-password" />
        <PasswordField
          value={confirm}
          onChange={setConfirm}
          placeholder="Confirm new password"
          autoComplete="new-password"
          invalid={Boolean(confirm) && confirm !== password}
        />
        <SubmitButton loading={loading}>Update password</SubmitButton>
      </form>
    </AuthShell>
  );
}

/* ─────────────────────────────────────────────────────────────
   ROLE PICKER
   ───────────────────────────────────────────────────────────── */
function RolePicker({
  onPick,
  onBack,
  roles = ['brand', 'creator', 'admin'],
  heading = 'Welcome to KYRO',
  sub = 'Choose how you want to explore the platform.',
  badge = 'Demo Mode',
  cta = 'Enter',
}: {
  onPick: (r: Role) => void;
  onBack: () => void;
  roles?: Role[];
  heading?: string;
  sub?: string;
  badge?: string;
  cta?: string;
}) {
  const allOptions = [
    { role: 'brand' as Role, icon: Briefcase, title: "I'm a Brand", desc: 'Launch creator-led ads on Meta, fund campaigns, see ROI in real time.', border: 'border-blue-400/30 hover:border-blue-400/60' },
    { role: 'creator' as Role, icon: Camera, title: "I'm a Creator", desc: 'Apply to brand campaigns, submit videos, earn from ad performance.', border: 'border-purple-400/30 hover:border-purple-400/60' },
    { role: 'admin' as Role, icon: Shield, title: 'Admin', desc: 'Oversee the platform, curate matches, and keep commission flowing.', border: 'border-pink-400/30 hover:border-pink-400/60' },
  ];
  const options = allOptions.filter((o) => roles.includes(o.role));
  return (
    <div className="min-h-screen bg-app flex items-center justify-center px-4">
      <div className="max-w-3xl w-full">
        <div className="flex justify-between items-center mb-12">
          <button onClick={onBack} className="flex items-center gap-2 text-muted hover:text-heading transition">
            <ChevronLeft size={20} />
            <KyroLogo size={30} />
            <span className="text-xl font-bold bg-gradient-kyro bg-clip-text text-transparent tracking-tight">KYRO</span>
          </button>
          <span className="text-xs uppercase tracking-widest text-faint font-semibold">{badge}</span>
        </div>
        <div className="text-center mb-12 space-y-3">
          <h1 className="text-4xl md:text-5xl font-bold text-heading">{heading}</h1>
          <p className="text-lg text-muted">{sub}</p>
        </div>
        <div className={`grid gap-5 ${options.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
          {options.map((opt) => (
            <button key={opt.role} onClick={() => onPick(opt.role)} className={`group relative overflow-hidden p-7 rounded-2xl border-2 ${opt.border} bg-surface hover:bg-surface/80 text-left transition-all duration-300 hover:scale-[1.02]`}>
              <div className="relative z-10 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-kyro flex items-center justify-center">
                  <opt.icon size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-heading mb-2">{opt.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{opt.desc}</p>
                </div>
                <div className="flex items-center gap-1 text-sm font-semibold text-heading pt-2">
                  {cta} <ChevronRight size={16} className="group-hover:translate-x-1 transition" />
                </div>
              </div>
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-faint mt-10">Demo environment — real Supabase auth, Meta integration, Square + Trolley payments wire in V1.</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   APP SHELL
   ───────────────────────────────────────────────────────────── */
function AppShell({ role, onSwitch, onSignOut, onSettings, showDemoSwitch = true, children }: { role: Role; onSwitch: (r: Role) => void; onSignOut: () => void; onSettings: () => void; showDemoSwitch?: boolean; children: React.ReactNode }) {
  const roleLabels: Record<Role, string> = { brand: 'Brand', creator: 'Creator', admin: 'Admin' };
  const roleIcons: Record<Role, typeof Briefcase> = { brand: Briefcase, creator: Camera, admin: Shield };
  const Icon = roleIcons[role];
  return (
    <div className="min-h-screen bg-app">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-app/80 border-b border-line">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-6">
              <button onClick={onSignOut} className="flex items-center gap-2.5">
                <KyroLogo size={32} />
                <span className="text-xl font-bold bg-gradient-kyro bg-clip-text text-transparent tracking-tight">KYRO</span>
              </button>
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-line rounded-full">
                <Icon size={14} className="text-body" />
                <span className="text-xs font-semibold text-body">{roleLabels[role]} Portal</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {showDemoSwitch && (
                <div className="hidden md:flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-lg">
                  <span className="text-xs text-faint px-2">Demo as:</span>
                  {(['brand', 'creator', 'admin'] as Role[]).map(r => (
                    <button key={r} onClick={() => onSwitch(r)} className={`text-xs font-semibold px-2.5 py-1 rounded transition ${r === role ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'}`}>
                      {roleLabels[r]}
                    </button>
                  ))}
                </div>
              )}
              <NotificationsBell />
              <SupportWidget context={`${roleLabels[role]} portal`} />
              <button onClick={onSettings} className="p-2 text-muted hover:text-heading transition" title="Account">
                <Users size={18} />
              </button>
              <button onClick={onSignOut} className="flex items-center gap-2 px-3 py-1.5 text-muted hover:text-heading transition text-sm">
                <LogOut size={16} />
                <span className="hidden md:inline">Exit</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}

/** "@maya" -> "maya". Social handles are stored with or without the @. */
function stripAt(handle: string): string {
  return handle.replace(/^@+/, '').trim();
}

/** A social handle that actually opens the profile, in a new tab. */
function SocialLink({ href, icon: Icon, label }: { href: string; icon: typeof Instagram; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-2 text-muted hover:text-heading transition"
    >
      <Icon size={18} />
      <span className="text-sm font-semibold">{label}</span>
    </a>
  );
}

/**
 * Notifications.
 *
 * There is no notifications table yet, so this deliberately shows an empty
 * state rather than a badge. The old version rendered a permanent pink "unread"
 * dot over a button that did nothing, which told every user they had messages
 * waiting and then refused to show them.
 */
function NotificationsBell() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-notifications]')) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="relative" data-notifications>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`relative p-2 transition ${open ? 'text-heading' : 'text-muted hover:text-heading'}`}
        title="Notifications"
      >
        <Bell size={18} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 p-4 rounded-xl border border-line bg-surface shadow-xl z-50 space-y-2">
          <p className="text-sm font-semibold text-heading">Notifications</p>
          <p className="text-sm text-muted leading-relaxed">You're all caught up.</p>
          <p className="text-xs text-faint leading-relaxed">
            Creator applications, video submissions and billing runs will appear here once those parts of KYRO are live.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   BRAND ONBOARDING GATES
   docs/KYRO_MODEL.md §4. A brand connects Meta and Shopify, adds payment,
   and signs the Campaign Agreement before a campaign may launch.
   ───────────────────────────────────────────────────────────── */

/** Text input + connect button used by the Meta and Shopify steps. */
function ConnectField({
  placeholder,
  hint,
  cta,
  onConnect,
}: {
  placeholder: string;
  hint: string;
  cta: string;
  onConnect: (value: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    setSaving(true);
    const err = await onConnect(value);
    setSaving(false);
    if (err) setError(err);
    else setValue('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          placeholder={placeholder}
          className={`flex-1 px-4 py-2.5 bg-surface-2 border rounded-lg text-heading placeholder-faint focus:outline-none focus:border-purple-500 ${error ? 'border-pink-400/60' : 'border-line'}`}
        />
        <button
          onClick={() => void submit()}
          disabled={saving || !value.trim()}
          className="px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
        >
          {saving && <RefreshCw size={14} className="animate-spin" />}
          {cta}
        </button>
      </div>
      <p className={`text-xs ${error ? 'text-pink-300' : 'text-faint'}`}>{error || hint}</p>
    </div>
  );
}

/**
 * Re-run the Shopify authorisation for a store that is already connected.
 *
 * Needed because a connected store is not necessarily a working one. Tokens
 * expire, scopes change, and a token issued before KYRO started requesting
 * expiring offline tokens is rejected by the Admin API on every call. Without
 * this the only escape was to uninstall the app from the Shopify side.
 */
function ReconnectShopify({ brandId, shop, errored }: { brandId: string; shop: string; errored: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setError(null);
    setBusy(true);
    const res = await startShopifyInstall(brandId, shop);
    if (res.error || !res.url) {
      setBusy(false);
      setError(res.error ?? 'Could not start the install.');
      return;
    }
    window.location.href = res.url;
  };

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => void go()}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-50 ${
          errored
            ? 'border-pink-400/40 bg-pink-400/10 text-pink-200 hover:bg-pink-400/20'
            : 'border-line bg-surface-2 text-muted hover:text-heading'
        }`}
      >
        {busy && <RefreshCw size={12} className="animate-spin" />}
        Reconnect store
      </button>
      <p className={`text-xs ${error ? 'text-pink-300' : 'text-faint'}`}>
        {error ||
          (errored
            ? 'This store needs reauthorising before KYRO can read its orders.'
            : 'Re-runs the Shopify authorisation. Use this if orders stop arriving.')}
      </p>
    </div>
  );
}

/**
 * Finish setting up.
 *
 * Four things have to be true before a campaign can open to creators. Showing
 * all four at once presents them as a wall and invites a brand to bounce off
 * it; this shows the one they can act on now, with the rest as a quiet strip
 * underneath so the shape of the work is still visible.
 *
 * The strip is clickable. A brand who wants to read ahead, or go back and
 * change something already done, should not have to undo anything first.
 */
function OnboardingGates({
  brandId,
  status,
  onChanged,
}: {
  brandId: string;
  status: OnboardingStatus;
  onChanged: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  /** Null means "follow the first unfinished step"; a number means the brand chose. */
  const [chosen, setChosen] = useState<number | null>(null);
  /** The other steps stay folded away until asked for. */
  const [showAll, setShowAll] = useState(false);

  const sign = async () => {
    setSignError(null);
    setSigning(true);
    const res = await signCampaignAgreement(brandId);
    setSigning(false);
    if (res.error) setSignError(res.error);
    else onChanged();
  };

  const steps = [
    {
      key: 'meta',
      icon: Target,
      title: 'Connect your Meta ad account',
      short: 'Meta ad account',
      blurb: 'Creator videos run as partnership ads here, and nowhere else. The licence you grant is scoped to this account.',
      done: Boolean(status.meta),
      doneLabel: status.meta ? status.meta.externalId : undefined,
      optional: false,
      body: !status.meta ? (
        <ConnectField
          placeholder="act_1234567890"
          hint="Find this in Meta Ads Manager, top left, next to your account name."
          cta="Connect"
          onConnect={async (v) => {
            const id = normalizeMetaAdAccount(v);
            if (!id) return 'That does not look like an ad account ID. It should be act_ followed by digits.';
            const res = await connectProvider(brandId, 'meta', id);
            if (res.error) return res.error;
            onChanged();
            return null;
          }}
        />
      ) : null,
    },
    {
      key: 'shopify',
      icon: Globe,
      title: 'Connect your Shopify store',
      short: 'Shopify store',
      blurb: 'Your store is the source of truth for orders, and therefore for what you owe. Shopify needs to know which store before it can show you its approval screen, so the name goes here first.',
      done: Boolean(status.shopify),
      doneLabel: status.shopify ? status.shopify.externalId : undefined,
      optional: false,
      body: (
        <>
          {!status.shopify && (
            <ConnectField
              placeholder="your-store"
              hint="Just the store name is enough, we add .myshopify.com. Next you land on Shopify to log in and approve the install."
              cta="Continue to Shopify"
              onConnect={async (v) => {
                const domain = normalizeShopifyDomain(v);
                if (!domain) return 'Enter your store name, or the full your-store.myshopify.com address.';
                // Real OAuth. Writing a brand_connections row here instead
                // would mark the store "connected" without ever obtaining a
                // token, so nothing could actually read orders.
                const res = await startShopifyInstall(brandId, domain);
                if (res.error || !res.url) return res.error ?? 'Could not start the install.';
                window.location.href = res.url;
                return null;
              }}
            />
          )}
          {status.shopify && (
            <ReconnectShopify
              brandId={brandId}
              shop={status.shopify.externalId}
              errored={status.shopify.status === 'error'}
            />
          )}
        </>
      ),
    },
    {
      key: 'payment',
      icon: Wallet,
      title: 'Add a payment method',
      short: 'Payment method',
      blurb: 'Commission on attributed orders is billed to your bank account by ACH. There is no ad budget to fund and no deposit to hold.',
      done: status.paymentReady,
      doneLabel: undefined,
      optional: true,
      body: !status.paymentReady ? (
        <p className="text-xs text-faint leading-relaxed">
          Add your bank details under Finance. You can create campaigns before this, but nothing
          can be billed until it is done.
        </p>
      ) : null,
    },
    {
      key: 'agreement',
      icon: ShieldCheck,
      title: 'Sign the Campaign Agreement',
      short: 'Campaign Agreement',
      blurb: 'Covers commission, billing, and the licence you receive to each video you run.',
      done: Boolean(status.agreementSignedAt),
      doneLabel: status.agreementSignedAt
        ? `Signed ${new Date(status.agreementSignedAt).toLocaleDateString()}`
        : undefined,
      optional: false,
      body: !status.agreementSignedAt ? (
        <div className="space-y-3">
          {signError && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg border border-pink-400/30 bg-pink-400/10">
              <AlertCircle size={14} className="text-pink-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-pink-200">{signError}</p>
            </div>
          )}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-line accent-purple-500 flex-shrink-0"
            />
            <span className="text-xs text-muted leading-relaxed">
              I have read and agree to the{' '}
              <a href="/terms" target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300 underline underline-offset-2">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300 underline underline-offset-2">Privacy Policy</a>.
            </span>
          </label>
          <button
            onClick={() => void sign()}
            disabled={!agreed || signing}
            className="px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {signing && <RefreshCw size={14} className="animate-spin" />}
            Sign agreement
          </button>
        </div>
      ) : null,
    },
  ];

  // Required steps are what the counter and the progress bar describe. The
  // optional one is real work but it does not gate a launch, so counting it
  // would make a brand who is ready to go look unfinished.
  const required = steps.filter((s) => !s.optional);
  const doneCount = required.filter((s) => s.done).length;

  // Land on the first thing they can actually do. Optional steps are skipped
  // when choosing automatically, but are still reachable from the strip.
  const firstOpen = steps.findIndex((s) => !s.done && !s.optional);
  const current = chosen ?? (firstOpen === -1 ? steps.findIndex((s) => !s.done) : firstOpen);
  const step = steps[current] ?? steps[steps.length - 1];
  const Icon = step.icon;

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-heading">Finish setting up</h2>
            <p className="text-sm text-muted mt-0.5">
              {doneCount === required.length
                ? 'All set. You can open campaigns to creators.'
                : 'One thing at a time. Campaigns can open to creators once these are done.'}
            </p>
          </div>
          <span className="text-sm font-mono text-muted whitespace-nowrap">
            {doneCount} of {required.length} done
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full bg-gradient-kyro transition-all duration-300"
            style={{ width: `${(doneCount / required.length) * 100}%` }}
          />
        </div>
      </div>

      {/* The one step in focus. */}
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 ${
              step.done
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : 'border-line bg-surface-2 text-body'
            }`}
          >
            {step.done ? <CheckCircle size={16} /> : <Icon size={16} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-heading">{step.title}</h3>
              {step.optional && !step.done && (
                <span className="px-2 py-0.5 rounded-full border border-line bg-surface-2 text-[10px] font-semibold text-faint">
                  OPTIONAL
                </span>
              )}
            </div>
            <p className="text-sm text-muted mt-1 leading-relaxed">{step.blurb}</p>
            {step.done && step.doneLabel && (
              <p className="text-xs text-emerald-300 mt-1 font-mono truncate">{step.doneLabel}</p>
            )}
          </div>
        </div>

        {step.body && <div className="pl-12">{step.body}</div>}

        {step.done && (
          <div className="pl-12">
            <p className="text-sm text-muted">
              Done.{' '}
              {firstOpen !== -1 && (
                <button
                  type="button"
                  onClick={() => setChosen(null)}
                  className="text-purple-400 hover:text-purple-300 font-semibold"
                >
                  Go to what's left →
                </button>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Everything else, folded away. One task on screen is the point; the
          rest is available to anyone who wants to see what is coming. */}
      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="w-full px-5 py-3 border-t border-line flex items-center justify-between gap-2 text-xs font-semibold text-muted hover:text-heading hover:bg-surface-2 transition"
      >
        <span>
          {showAll
            ? 'Hide the other steps'
            : `Show the other ${plural(steps.length - 1, 'step')}`}
        </span>
        <ChevronRight size={14} className={`transition-transform ${showAll ? 'rotate-90' : ''}`} />
      </button>

      <div className={`border-t border-line divide-y divide-line ${showAll ? '' : 'hidden'}`}>
        {steps.map((s, i) =>
          i === current ? null : (
            <button
              key={s.key}
              type="button"
              onClick={() => setChosen(i)}
              className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-surface-2 transition"
            >
              {s.done ? (
                <CheckCircle size={15} className="text-emerald-400 flex-shrink-0" />
              ) : (
                <span className="w-[15px] h-[15px] rounded-full border border-line flex-shrink-0" />
              )}
              <span className={`text-sm flex-1 truncate ${s.done ? 'text-faint line-through' : 'text-body'}`}>
                {s.short}
              </span>
              {s.optional && !s.done && <span className="text-[10px] text-faint">optional</span>}
              <ChevronRight size={14} className="text-faint flex-shrink-0" />
            </button>
          )
        )}
      </div>
    </div>
  );
}

/** "1 creator" / "3 creators". Module level so every panel counts the same way. */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

interface CampaignCard {
  id: string;
  brandId: string | null;
  name: string;
  status: string;
  brandName: string;
  seedBrandId: BrandId | null;
  logoUrl: string | null;
  cover: string | null;
  poolDollars: number;
  spentDollars: number;
  creators: number;
  submissions: number;
  orders: number;
  impressions: number;
  roas: number | null;
}

function seedCampaignCards(): CampaignCard[] {
  return SEED_CAMPAIGNS.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    brandName: BRANDS[c.brandId].name,
    seedBrandId: c.brandId,
    logoUrl: null,
    brandId: null,
    cover: c.cover,
    poolDollars: c.pool,
    spentDollars: c.spent,
    creators: c.creators,
    submissions: c.submissions,
    orders: c.conversions,
    impressions: c.impressions,
    roas: c.roas || null,
  }));
}

function dbCampaignCards(rows: CampaignWithStats[], brandName: string, logoUrl: string | null): CampaignCard[] {
  return rows.map((c) => ({
    id: c.id,
    brandId: c.brandId,
    name: c.name,
    status: c.status,
    brandName,
    seedBrandId: null,
    logoUrl,
    cover: c.coverUrl,
    poolDollars: centsToDollars(c.poolTargetCents),
    spentDollars: centsToDollars(c.stats.spentCents),
    creators: c.stats.creators,
    submissions: c.stats.submissions,
    orders: c.stats.orders,
    impressions: c.stats.impressions,
    roas: c.stats.roas,
  }));
}

function CampaignRowSkeleton() {
  return (
    <div className="p-5 animate-pulse">
      <div className="flex flex-col lg:flex-row gap-5">
        <div className="w-full lg:w-48 h-32 rounded-xl bg-surface-2 flex-shrink-0" />
        <div className="flex-1 space-y-3 py-1">
          <div className="h-5 w-2/5 rounded bg-surface-2" />
          <div className="h-3 w-1/3 rounded bg-surface-2" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded bg-surface-2" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   BRAND — NAVIGATION

   A brand's work is seven different jobs, not one scroll. The sidebar names
   them so the brand can go straight to the one they came for, and so a page
   can be deep without burying everything under it.

   Desktop gets a fixed rail. A phone gets a floating bar with the four things
   a brand touches daily, and everything else behind the menu — a seven-item
   rail on a phone is a wall.
   ───────────────────────────────────────────────────────────── */

type BrandPage = 'dashboard' | 'campaigns' | 'submissions' | 'creators' | 'chat' | 'finance' | 'settings';

const BRAND_NAV: Array<{ id: BrandPage; label: string; icon: typeof Users; primary?: boolean }> = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, primary: true },
  { id: 'campaigns', label: 'Campaigns', icon: Layers, primary: true },
  { id: 'submissions', label: 'Submissions', icon: FileVideo, primary: true },
  { id: 'creators', label: 'Creators', icon: Users },
  { id: 'chat', label: 'Chat', icon: MessagesSquare, primary: true },
  { id: 'finance', label: 'Finance', icon: DollarSign },
];

/**
 * Brand switcher.
 *
 * One account can run several brands — an agency managing clients, or a
 * company with separate labels. Each gets its own portal: own campaigns, own
 * creators, own Shopify store, own money.
 *
 * A new brand is created deliberately incomplete, so the setup wizard runs
 * for it and collects the profile and connections rather than dropping it
 * into an empty dashboard.
 */
function BrandSwitcher({ brandName, logoUrl }: { brandName: string; logoUrl: string | null }) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); setCreating(false); }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setCreating(false); }
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const create = async () => {
    setError(null);
    if (!newName.trim()) { setError('Give the brand a name.'); return; }
    setBusy(true);
    const res = await createAnotherBrand(newName);
    if (res.error || !res.data) {
      setBusy(false);
      setError(res.error ?? 'Could not create that brand.');
      return;
    }
    // Switching to it puts the wizard in front, since it is not set up yet.
    await session.setActiveBrand(res.data.id);
    setBusy(false);
    setOpen(false);
    setCreating(false);
    setNewName('');
  };

  const brands = session.brands.length > 0 ? session.brands : [];

  return (
    <div ref={box} className="relative mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 p-3 rounded-xl border border-line bg-surface hover:border-purple-500/40 transition text-left"
      >
        <BrandAvatar name={brandName} logoUrl={logoUrl} size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-heading truncate">{brandName}</p>
          <p className="text-[11px] text-faint">Brand · Owner</p>
        </div>
        <ChevronRight
          size={14}
          className={`text-faint flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-40 left-0 right-0 mt-1 rounded-xl border border-line bg-surface shadow-xl shadow-black/30 overflow-hidden">
          {!creating && (
            <>
              <div className="max-h-64 overflow-y-auto">
                {brands.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => { void session.setActiveBrand(b.id); setOpen(false); }}
                    className="w-full flex items-center gap-2.5 p-3 hover:bg-surface-2 transition text-left"
                  >
                    <BrandAvatar name={b.name} logoUrl={b.logoUrl} size={26} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-heading truncate">{b.name}</p>
                      {!b.setupComplete && (
                        <p className="text-[11px] text-amber-300">Setup unfinished</p>
                      )}
                    </div>
                    {session.brand?.id === b.id && (
                      <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => { setCreating(true); setError(null); }}
                className="w-full flex items-center gap-2.5 p-3 border-t border-line text-sm font-semibold text-muted hover:text-heading hover:bg-surface-2 transition"
              >
                <Plus size={14} /> Add another brand
              </button>
            </>
          )}

          {creating && (
            <div className="p-3 space-y-2">
              <p className="text-xs font-semibold text-muted">New brand</p>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
                placeholder="Brand name"
                className="w-full px-3 py-2 bg-surface-2 border border-line rounded-lg text-sm text-heading placeholder-faint focus:outline-none focus:border-purple-500"
              />
              <p className="text-xs text-faint leading-relaxed">
                You'll be taken through setup for it — logo, profile, then its own Shopify and Meta
                connections. Your current brand stays exactly as it is.
              </p>
              {error && <p className="text-xs text-pink-300">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-gradient-kyro text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {busy && <RefreshCw size={12} className="animate-spin" />}
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setError(null); }}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-muted hover:text-heading disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BrandSidebar({
  page,
  onGo,
  brandName,
  logoUrl,
  unread,
}: {
  page: BrandPage;
  onGo: (p: BrandPage) => void;
  brandName: string;
  logoUrl: string | null;
  unread: number;
}) {
  const item = (id: BrandPage, label: string, Icon: typeof Users) => {
    const on = page === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onGo(id)}
        className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
          on ? 'bg-surface-2 text-heading' : 'text-muted hover:text-heading hover:bg-surface-2/60'
        }`}
      >
        {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-gradient-kyro" />}
        <Icon size={16} className="flex-shrink-0" />
        <span className="truncate">{label}</span>
        {id === 'chat' && unread > 0 && (
          <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-kyro text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="hidden lg:flex flex-col gap-1 w-56 flex-shrink-0">
      <BrandSwitcher brandName={brandName} logoUrl={logoUrl} />

      {BRAND_NAV.map((n) => item(n.id, n.label, n.icon))}

      <p className="text-[11px] font-semibold text-faint uppercase tracking-wider px-3 pt-5 pb-1">
        Configuration
      </p>
      {item('settings', 'Settings', SettingsIcon)}
    </aside>
  );
}

function BrandMobileNav({
  page,
  onGo,
  unread,
}: {
  page: BrandPage;
  onGo: (p: BrandPage) => void;
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const primary = BRAND_NAV.filter((n) => n.primary);

  return (
    <>
      {/* Floating rather than docked, so it reads as a control over the page
          instead of a second browser chrome. */}
      <div className="lg:hidden fixed bottom-4 inset-x-4 z-40 flex items-center gap-2">
        <div className="flex-1 flex items-center justify-around gap-1 p-1.5 rounded-2xl bg-surface/95 backdrop-blur-md border border-line shadow-lg shadow-black/20">
          {primary.map((n) => {
            const on = page === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onGo(n.id)}
                aria-label={n.label}
                className={`relative flex-1 flex items-center justify-center py-2.5 rounded-xl transition ${
                  on ? 'bg-gradient-kyro text-white' : 'text-muted'
                }`}
              >
                <n.icon size={18} />
                {n.id === 'chat' && unread > 0 && (
                  <span className="absolute top-1 right-1/2 translate-x-3.5 min-w-[15px] h-[15px] px-1 rounded-full bg-gradient-kyro text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-surface">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="All sections"
          className="w-12 h-12 rounded-2xl bg-surface/95 backdrop-blur-md border border-line shadow-lg shadow-black/20 flex items-center justify-center text-body"
        >
          <Menu size={18} />
        </button>
      </div>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50 bg-app/80 backdrop-blur-sm flex items-end" onClick={() => setOpen(false)}>
          <div
            className="w-full bg-surface border-t border-line rounded-t-2xl p-4 pb-8 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold text-heading">Go to</p>
              <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-heading">
                <X size={18} />
              </button>
            </div>
            {[...BRAND_NAV, { id: 'settings' as BrandPage, label: 'Settings', icon: SettingsIcon }].map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => { onGo(n.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition ${
                  page === n.id ? 'bg-gradient-kyro text-white' : 'bg-surface-2 text-body'
                }`}
              >
                <n.icon size={16} />
                {n.label}
                {n.id === 'chat' && unread > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-kyro text-white text-[10px] font-bold flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** A page heading, so every section announces itself the same way. */
function PageHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-heading">{title}</h1>
        {sub && <p className="text-muted mt-1 text-sm">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   BRAND DASHBOARD
   ───────────────────────────────────────────────────────────── */
function BrandDashboard() {
  const session = useSession();
  const { brand, configured, workspaceLoading, workspaceError } = session;

  // Live mode means real keys AND a brands row we own. Anything short of that
  // (no keys, demo role switcher, workspace still provisioning) shows SEED.
  const liveMode = configured && Boolean(brand);
  const brandId = brand?.id ?? null;

  const [page, setPage] = useState<BrandPage>('dashboard');
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'draft' | 'ended' | 'pending_fund'>('all');
  // Result of a Shopify install, read off the query string the callback
  // redirected back with. Read once on mount and stripped from the URL there,
  // so a refresh does not replay a stale banner.
  const [connectOutcome, setConnectOutcome] = useState<ConnectOutcome | null>(() => takeConnectionOutcome());
  const [rows, setRows] = useState<CampaignWithStats[]>([]);
  const [loading, setLoading] = useState(liveMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [drill, setDrill] = useState<DrilldownKind | null>(null);
  const [openCreator, setOpenCreator] = useState<LeaderboardCreator | null>(null);
  const unread = useUnreadTotal();

  // Onboarding gates + deposit usage. Loaded alongside campaigns rather than
  // inside reload() so signing the agreement doesn't refetch the campaign list.
  const loadGates = useCallback(async () => {
    if (!brandId) return;
    const status = await getOnboardingStatus(brandId);
    setOnboarding(status.data);
  }, [brandId]);

  useEffect(() => { void loadGates(); }, [loadGates]);

  // A successful install wrote brand_connections server-side, so the gate
  // state the page loaded with is already stale. Re-read it.
  useEffect(() => {
    if (connectOutcome?.ok) void loadGates();
  }, [connectOutcome, loadGates]);

  const reload = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    const res = await listCampaignsWithStats(brandId);
    setRows(res.data);
    setLoadError(res.error);
    setLoading(false);
  }, [brandId]);

  useEffect(() => {
    if (!brandId) {
      setLoading(false);
      return;
    }
    void reload();
  }, [brandId, reload]);

  const allCards = brand && configured
    ? dbCampaignCards(rows, brand.name, brand.logoUrl || null)
    : seedCampaignCards();

  // KPIs describe the whole account, so they are computed from every campaign.
  // Only the list below is filtered, otherwise typing in the search box would
  // appear to change the brand's actual spend.
  const cards = allCards.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    const q = query.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q);
  });

  // Commission owed, not budget. KYRO has no pools to fund.
  const totalCommission = allCards.reduce((s, c) => s + c.spentDollars, 0);
  const totalOrders = allCards.reduce((s, c) => s + c.orders, 0);
  const totalImpr = allCards.reduce((s, c) => s + c.impressions, 0);
  const totalSubs = allCards.reduce((s, c) => s + c.submissions, 0);

  const busy = loading || workspaceLoading;
  const isEmpty = liveMode && !busy && !loadError && cards.length === 0;
  // Campaigns can only launch once the gates in docs/KYRO_MODEL.md §4 pass.
  // Onboarding no longer blocks CREATING a campaign, only opening one to
  // creators. A brand should be able to write the brief while they are still
  // connecting Meta and Shopify; nothing can run until those are done anyway,
  // and blocking setup on setup is the kind of dead end that loses signups.
  const gatesBlocked = liveMode && onboarding !== null && !onboarding.complete;

  /**
   * Every figure and every sub-label is derived from the rows above.
   *
   * These used to carry hand-written deltas like "+18% vs last week" that
   * nothing computed. A number a brand cannot trace back to an order is worse
   * than no number, so when there is nothing yet the row says so.
   *
   * The KYRO fee is deliberately absent. It belongs on the invoice, under
   * Finance, not on the screen a brand opens every morning.
   */
  const kpis: Array<{ kind: DrilldownKind; label: string; value: string; sub: string; icon: typeof Eye; color: string; bg: string }> = [
    { kind: 'campaigns', label: 'Campaigns', value: allCards.filter((c) => c.status === 'live').length.toString(), sub: `of ${plural(allCards.length, 'campaign')} total`, icon: Layers, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
    { kind: 'videos', label: 'Videos submitted', value: totalSubs.toLocaleString(), sub: 'across every campaign', icon: FileVideo, color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
    { kind: 'orders', label: 'Attributed orders', value: totalOrders.toLocaleString(), sub: 'bought from creator content', icon: Target, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
    { kind: 'impressions', label: 'Impressions', value: totalImpr > 0 ? fmtK(totalImpr) : '—', sub: totalImpr > 0 ? 'from live ads' : 'needs Meta access', icon: Eye, color: 'text-pink-400', bg: 'bg-pink-400/10 border-pink-400/20' },
  ];

  if (liveMode && brand && brandId && !brand.setupComplete) {
    return (
      <BrandSetupWizard
        brandId={brandId}
        brandName={brand.name}
        displayName={session.displayName}
        connectionsSlot={
          onboarding
            ? <OnboardingGates brandId={brandId} status={onboarding} onChanged={() => void loadGates()} />
            : <p className="text-sm text-muted">Loading your connections…</p>
        }
        otherBrands={session.brands
          .filter((b) => b.id !== brandId && b.setupComplete)
          .map((b) => ({ id: b.id, name: b.name }))}
        onSwitchBrand={(id) => void session.setActiveBrand(id)}
        onDone={() => void session.refresh()}
      />
    );
  }

  // Only campaigns creators can actually work on. Inviting someone to a
  // draft would land them on a campaign with nothing to upload against.
  const inviteCampaigns = allCards
    .filter((c) => c.status === 'live')
    .map((c) => ({ id: c.id, name: c.name, brandId: c.brandId ?? '', brandName: c.brandName,
                   status: c.status, coverUrl: c.cover, deliverableSpec: null, brief: null,
                   commissionBps: null, clearingDays: null, contentStyle: null,
                   brandLogoUrl: c.logoUrl }));

  const createButton = (
    <button
      onClick={() => { setShowCreate(true); mockApi.logEvent('brand.create_campaign.open'); }}
      disabled={workspaceLoading}
      title={gatesBlocked ? 'You can draft a campaign now. Connect Meta and Shopify to open it to creators.' : undefined}
      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Plus size={18} /> Create Campaign
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex gap-8">
        <BrandSidebar
          page={page}
          onGo={setPage}
          brandName={liveMode && brand ? brand.name : 'Bold Buns'}
          logoUrl={liveMode && brand ? brand.logoUrl || null : null}
          unread={unread}
        />

        <div className="flex-1 min-w-0 space-y-6 pb-24 lg:pb-0">
          {/* Shown on every page: a failed or successful Shopify install is
              account-level news, not campaign-page news. */}
          {connectOutcome && (
            <div
              className={`flex items-start gap-3 p-4 rounded-xl border ${
                connectOutcome.ok
                  ? 'border-emerald-400/30 bg-emerald-400/10'
                  : 'border-pink-400/30 bg-pink-400/10'
              }`}
            >
              {connectOutcome.ok
                ? <CheckCircle size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                : <AlertCircle size={18} className="text-pink-400 flex-shrink-0 mt-0.5" />}
              <p className={`text-sm flex-1 ${connectOutcome.ok ? 'text-emerald-200' : 'text-pink-200'}`}>
                {connectOutcome.message}
              </p>
              <button onClick={() => setConnectOutcome(null)} className="text-xs text-muted hover:text-heading px-2 py-0.5">
                Dismiss
              </button>
            </div>
          )}

          {workspaceError && (
            <div className="flex items-start gap-3 p-4 rounded-xl border border-pink-400/30 bg-pink-400/10">
              <AlertCircle size={18} className="text-pink-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-heading">We couldn't finish setting up your brand workspace.</p>
                <p className="text-muted mt-0.5">{workspaceError}</p>
              </div>
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {page === 'dashboard' && (
            <>
              <PageHead
                title={`Welcome back, ${liveMode && brand ? brand.name : 'Bold Buns'}`}
                sub={isEmpty
                  ? 'Create your first campaign to start working with creators.'
                  : "Here's how your campaigns are performing right now."}
                action={createButton}
              />

              {liveMode && brandId && onboarding && !onboarding.complete && (
                <OnboardingGates brandId={brandId} status={onboarding} onChanged={() => void loadGates()} />
              )}

              {liveMode && brandId && (
                <BrandPerformanceCard
                  brandId={brandId}
                  campaigns={allCards.map((c) => ({ id: c.id, name: c.name }))}
                />
              )}

              {/* Each figure opens the rows it was computed from. A headline
                  number a brand cannot open is one they have to take on trust. */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {kpis.map((s) => (
                  <button
                    key={s.kind}
                    type="button"
                    onClick={() => setDrill(s.kind)}
                    className={`p-4 sm:p-5 rounded-2xl border text-left transition hover:brightness-125 ${s.bg}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <s.icon size={20} className={s.color} />
                      <ChevronRight size={14} className="text-faint" />
                    </div>
                    <p className="text-xs text-muted mb-1 truncate">{s.label}</p>
                    <p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[11px] sm:text-xs text-faint mt-1 leading-snug">{s.sub}</p>
                  </button>
                ))}
              </div>

              {liveMode && brandId ? (
                <BrandLeaderboard brandId={brandId} onOpenCreator={setOpenCreator} />
              ) : (
                <div className="bg-surface border border-line rounded-2xl p-10 text-center">
                  <Trophy size={28} className="mx-auto text-faint mb-3" />
                  <p className="text-sm text-muted">Sign in with a brand account to see your creators.</p>
                </div>
              )}
            </>
          )}

          {/* ── CAMPAIGNS ── */}
          {page === 'campaigns' && (
            <>
              <PageHead title="Campaigns" sub="What you're asking creators to make, and what it pays." action={createButton} />

              <div className="bg-surface border border-line rounded-2xl overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-line">
                  <h2 className="text-lg font-bold text-heading">All campaigns</h2>
                  <div className="flex items-center gap-2">
                    {liveMode && (
                      <button onClick={() => void reload()} disabled={busy} className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-line rounded-lg text-sm text-body hover:text-heading disabled:opacity-50" title="Refresh">
                        <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Refresh
                      </button>
                    )}
                    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-line rounded-lg">
                      <Search size={14} className="text-faint flex-shrink-0" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search campaigns"
                        className="bg-transparent text-sm text-heading placeholder-faint focus:outline-none w-36"
                      />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-line rounded-lg">
                      <Filter size={14} className="text-faint flex-shrink-0" />
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                        className="bg-transparent text-sm text-heading focus:outline-none cursor-pointer"
                      >
                        <option value="all">All</option>
                        <option value="live">Live</option>
                        <option value="draft">Draft</option>
                        <option value="pending_fund">Pending</option>
                        <option value="ended">Ended</option>
                      </select>
                    </div>
                  </div>
                </div>

                {busy && (
                  <div className="divide-y divide-line">
                    {[0, 1, 2].map((i) => <CampaignRowSkeleton key={i} />)}
                  </div>
                )}

                {!busy && loadError && (
                  <div className="p-10 text-center">
                    <AlertCircle size={28} className="mx-auto text-pink-400 mb-3" />
                    <p className="text-sm text-heading font-semibold">Couldn't load your campaigns.</p>
                    <p className="text-xs text-muted mt-1">{loadError}</p>
                    <button onClick={() => void reload()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-surface-2 border border-line rounded-lg text-sm text-body hover:text-heading">
                      <RefreshCw size={14} /> Try again
                    </button>
                  </div>
                )}

                {isEmpty && (
                  <div className="p-12 text-center">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-kyro flex items-center justify-center mb-4">
                      <FileVideo size={24} className="text-white" />
                    </div>
                    <p className="text-lg font-bold text-heading">No campaigns yet</p>
                    <p className="text-sm text-muted mt-1.5 max-w-sm mx-auto">
                      A campaign is where you set the commission and what you want creators to make.
                    </p>
                    <button
                      onClick={() => { setShowCreate(true); mockApi.logEvent('brand.create_campaign.open'); }}
                      title={gatesBlocked ? 'You can draft a campaign now. Connect Meta and Shopify to open it to creators.' : undefined}
                      className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition"
                    >
                      <Plus size={18} /> Create your first campaign
                    </button>
                  </div>
                )}

                {!busy && !loadError && cards.length > 0 && (
                  <div className="divide-y divide-line">
                    {cards.map((c) => (
                      <div key={c.id} className="p-5 hover:bg-surface-2 transition">
                        <div className="flex flex-col lg:flex-row gap-5">
                          {c.cover
                            ? <img src={c.cover} alt={c.name} className="w-full lg:w-48 h-32 rounded-xl object-cover flex-shrink-0" />
                            : <div className="w-full lg:w-48 h-32 rounded-xl flex-shrink-0 bg-surface-2 border border-line flex items-center justify-center"><FileVideo size={22} className="text-faint" /></div>}
                          <div className="flex-1 min-w-0 space-y-3">
                            <div className="flex items-start gap-3">
                              {c.seedBrandId
                                ? <BrandLogo brandId={c.seedBrandId} size={36} />
                                : <BrandAvatar name={c.brandName} logoUrl={c.logoUrl} size={36} />}
                              <div>
                                <div className="flex items-center gap-3 mb-1.5">
                                  <h3 className="text-lg font-bold text-heading">{c.name}</h3>
                                  <StatusPill status={c.status} />
                                </div>
                                <p className="text-sm text-muted">{c.brandName} · {plural(c.creators, 'creator')} · {plural(c.submissions, 'submission')}</p>
                              </div>
                            </div>
                            {c.status === 'live' && (
                              <div className="grid grid-cols-3 gap-3">
                                <div><p className="text-xs text-faint">Commission</p><p className="text-sm font-bold text-heading">{fmt(c.spentDollars)}</p></div>
                                <div><p className="text-xs text-faint">Attributed orders</p><p className="text-sm font-bold text-emerald-400">{c.orders.toLocaleString()}</p></div>
                                <div><p className="text-xs text-faint">Creators</p><p className="text-sm font-bold text-purple-400">{c.creators}</p></div>
                              </div>
                            )}
                            {liveMode && c.brandId && (
                              <CampaignCoverControl
                                campaignId={c.id}
                                brandId={c.brandId}
                                campaignName={c.name}
                                coverUrl={c.cover}
                                onChanged={() => void reload()}
                              />
                            )}
                            {(c.status === 'pending_fund' || c.status === 'draft') && (
                              <ActivateCampaignRow
                                campaignId={c.id}
                                status={c.status}
                                live={liveMode}
                                blocked={gatesBlocked}
                                onActivated={() => void reload()}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── SUBMISSIONS ── */}
          {page === 'submissions' && (
            <>
              <PageHead title="Submissions" sub="Videos creators have sent you. Say what you're running and what you're not." />
              {liveMode && brandId
                ? <CreatorVideosPanel brandId={brandId} />
                : <NeedsBrand what="submissions" />}
            </>
          )}

          {/* ── CREATORS ── */}
          {page === 'creators' && (
            <>
              <PageHead title="Creators" sub="Who has applied, and who is already making videos for you." />
              {liveMode && brandId ? (
                <>
                  <CreatorInviteCard campaigns={inviteCampaigns} />
                  <ApplicationsPanel brandId={brandId} />
                  <CampaignRoster brandId={brandId} campaigns={allCards} />
                </>
              ) : (
                <NeedsBrand what="creators" />
              )}
            </>
          )}

          {/* ── CHAT ── */}
          {page === 'chat' && (
            <>
              <PageHead title="Chat" sub="Your campaign rooms, and the private threads creators start about their videos." />
              {liveMode ? <ChatPanel /> : <NeedsBrand what="messages" />}
            </>
          )}

          {/* ── FINANCE ── */}
          {page === 'finance' && (
            <>
              <PageHead title="Finance" sub="What you owe creators, and where KYRO bills it from." />
              <div className="p-5 rounded-2xl border border-blue-400/20 bg-blue-400/10">
                <Wallet size={20} className="text-blue-400" />
                <p className="text-xs text-muted mt-3 mb-1">Creator commission</p>
                <p className="text-2xl font-bold text-blue-400">{fmt(totalCommission)}</p>
                <p className="text-xs text-faint mt-1">On attributed orders</p>
              </div>
              <BrandBillingPanel />
            </>
          )}

          {/* ── SETTINGS ── */}
          {page === 'settings' && (
            <>
              <PageHead title="Settings" sub="Your brand profile, as creators see it." />
              {liveMode && brandId ? (
                <BrandProfilePanel brandId={brandId} onSaved={() => void session.refresh()} />
              ) : (
                <NeedsBrand what="settings" />
              )}
              <p className="text-sm text-muted">
                Your own name, email, password, appearance and notifications live in Account
                settings, reachable from the icon in the top bar.
              </p>
            </>
          )}
        </div>
      </div>

      <BrandMobileNav page={page} onGo={setPage} unread={unread} />

      {drill && brandId && (
        <BrandDrilldown
          kind={drill}
          brandId={brandId}
          campaigns={allCards.map((c) => ({
            id: c.id, name: c.name, status: c.status, cover: c.cover,
            orders: c.orders, creators: c.creators, submissions: c.submissions,
            spentDollars: c.spentDollars,
          }))}
          onClose={() => setDrill(null)}
          onOpenCampaigns={() => setPage('campaigns')}
        />
      )}

      {openCreator && (
        <CreatorProfileSheet
          creatorId={openCreator.creatorId}
          stats={{
            submissions: openCreator.submissions,
            inUse: openCreator.inUse,
            orders: openCreator.orders,
            revenueCents: openCreator.revenueCents,
            commissionCents: openCreator.commissionCents,
          }}
          onClose={() => setOpenCreator(null)}
        />
      )}

      {showCreate && (
        <CreateCampaignModal
          brandId={liveMode ? brandId : null}
          onClose={() => setShowCreate(false)}
          onCreated={() => void reload()}
        />
      )}
    </div>
  );
}

/**
 * Shown where a page needs a real brand workspace and there isn't one — the
 * public demo, or a session still provisioning. Says which, rather than
 * rendering an empty panel that reads as broken.
 */
function NeedsBrand({ what }: { what: string }) {
  return (
    <div className="bg-surface border border-line rounded-2xl p-10 text-center">
      <Briefcase size={28} className="mx-auto text-faint mb-3" />
      <p className="text-sm text-muted">Sign in with a brand account to see your {what}.</p>
      <p className="text-xs text-faint mt-1">
        The demo switcher shows the layout, but there is no workspace behind it.
      </p>
    </div>
  );
}

/**
 * Create-campaign form. Writes a real `campaigns` row when the user has a brand
 * workspace, and falls back to the logged mock in demo mode so the public demo
 * keeps working without keys.
 *
 * New campaigns are created as `pending_fund` with a zero balance on purpose:
 * the pool target is an intent, the balance is money that actually arrived, and
 * only Square (Phase 2) may credit it.
 */
function CreateCampaignModal({ brandId, onClose, onCreated }: { brandId: string | null; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [commissionType, setCommissionType] = useState<CommissionType>('percent_spend');
  const [percent, setPercent] = useState('');
  const [perConversion, setPerConversion] = useState('');
  const [deliverable, setDeliverable] = useState('');
  const [brief, setBrief] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Object URLs are a resource, not a string. Revoking on change and unmount
  // keeps a brand who tries five images from leaking five blobs.
  useEffect(() => {
    if (!cover) { setCoverPreview(null); return; }
    const url = URL.createObjectURL(cover);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  const wantsPercent = commissionType === 'percent_spend' || commissionType === 'hybrid';
  const wantsPerConversion = commissionType === 'per_conversion' || commissionType === 'hybrid';

  const field = 'w-full px-4 py-2.5 bg-surface-2 border rounded-lg text-heading placeholder-faint focus:outline-none focus:border-purple-500';
  const borderFor = (key: string) => (errors[key] ? 'border-pink-400/60' : 'border-line');
  const label = 'text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block';

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Give the campaign a name.';


    let percentFraction: number | null = null;
    if (wantsPercent) {
      percentFraction = parsePercentToFraction(percent);
      if (percentFraction === null) next.percent = 'Enter a rate between 0 and 100.';
    }

    let perConversionCents: number | null = null;
    if (wantsPerConversion) {
      perConversionCents = parseMoneyToCents(perConversion);
      if (perConversionCents === null) next.perConversion = 'Enter an amount, like 8.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setSubmitError(null);

    if (!brandId) {
      await mockApi.createCampaign({ name: name.trim() });
      setSaving(false);
      onClose();
      return;
    }

    const res = await createCampaign(brandId, {
      name: name.trim(),
      brief: brief.trim(),
      deliverableSpec: deliverable.trim(),
      commissionType,
      commissionPercentSpend: percentFraction,
      commissionPerConversionCents: perConversionCents,
    });

    if (res.error) {
      setSaving(false);
      setSubmitError(res.error);
      return;
    }

    // The cover needs a campaign id, so it can only be attached after the row
    // exists. If this half fails the campaign is still real — say so plainly
    // and let them add the image from the campaign row, rather than implying
    // nothing was created.
    const created = res.data;
    if (cover && created) {
      const up = await uploadCampaignCover(brandId, cover);
      if (up.error || !up.url) {
        setSaving(false);
        setSubmitError(`Campaign created, but the product image didn't upload (${up.error ?? 'unknown error'}). Add it from the campaign row.`);
        onCreated();
        return;
      }
      const saved = await setCampaignCover(created.id, up.url);
      if (saved.error) {
        setSaving(false);
        setSubmitError(`Campaign created, but the product image didn't save (${saved.error}). Add it from the campaign row.`);
        onCreated();
        return;
      }
    }

    setSaving(false);
    mockApi.logEvent('campaign.created', { id: created?.id, name: created?.name });
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app/80 backdrop-blur-sm" onClick={() => { if (!saving) onClose(); }}>
      <div className="bg-surface border border-line rounded-2xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-heading">New Campaign</h2>
          <button onClick={onClose} disabled={saving} className="text-muted hover:text-heading disabled:opacity-40"><X size={20} /></button>
        </div>

        {submitError && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-pink-400/30 bg-pink-400/10">
            <AlertCircle size={16} className="text-pink-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-pink-200">{submitError}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className={label}>Campaign Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`${field} ${borderFor('name')}`} placeholder="Summer Drop 2026" />
            {errors.name && <p className="text-xs text-pink-300 mt-1.5">{errors.name}</p>}
          </div>

          {/* The product image is the first thing a creator sees when deciding
              whether to make a video, so it belongs in the create form rather
              than being something to remember afterwards. */}
          <div>
            <label className={label}>Product Image</label>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-xl overflow-hidden border border-line flex-shrink-0 bg-surface-2">
                <CoverImage src={coverPreview} name={name || 'Campaign'} />
              </div>
              <div className="space-y-1 min-w-0">
                <input
                  ref={coverInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => { setCover(e.target.files?.[0] ?? null); e.target.value = ''; }}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => coverInput.current?.click()}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface-2 text-xs font-semibold text-muted hover:text-heading disabled:opacity-50"
                  >
                    <ImagePlus size={12} /> {cover ? 'Change image' : 'Add image'}
                  </button>
                  {cover && (
                    <button
                      type="button"
                      onClick={() => setCover(null)}
                      disabled={saving}
                      className="text-xs text-faint hover:text-body disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-xs text-faint">
                  JPG, PNG or WebP up to 5 MB. Creators see this when they browse, apply, and look
                  back at what they submitted.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Commission Type</label>
              <select
                value={commissionType}
                onChange={(e) => setCommissionType(e.target.value as CommissionType)}
                className="w-full px-3 py-2.5 bg-surface-2 border border-line rounded-lg text-heading focus:outline-none focus:border-purple-500"
              >
                <option value="percent_spend">% of order value</option>
                <option value="per_conversion">Flat fee per order</option>
              </select>
            </div>
            {wantsPercent && (
              <div>
                <label className={label}>Rate</label>
                <div className="relative">
                  <input value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="decimal" className={`${field} pr-8 ${borderFor('percent')}`} placeholder="15" />
                  <span className="absolute right-4 top-2.5 text-muted">%</span>
                </div>
                {errors.percent && <p className="text-xs text-pink-300 mt-1.5">{errors.percent}</p>}
              </div>
            )}
            {wantsPerConversion && (
              <div>
                <label className={label}>Per Conversion</label>
                <div className="relative">
                  <span className="absolute left-4 top-2.5 text-muted">$</span>
                  <input value={perConversion} onChange={(e) => setPerConversion(e.target.value)} inputMode="decimal" className={`${field} pl-8 ${borderFor('perConversion')}`} placeholder="8" />
                </div>
                {errors.perConversion && <p className="text-xs text-pink-300 mt-1.5">{errors.perConversion}</p>}
              </div>
            )}
          </div>

          <div>
            <label className={label}>Deliverable</label>
            <input value={deliverable} onChange={(e) => setDeliverable(e.target.value)} className={`${field} ${borderFor('deliverable')}`} placeholder="1 vertical video, 15–30s" />
          </div>

          <div>
            <label className={label}>Brief</label>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} className={`${field} ${borderFor('brief')}`} placeholder="What creators should know about the brand, the product, and the vibe..." />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-line rounded-lg text-body hover:bg-surface-2 font-semibold disabled:opacity-50">Cancel</button>
          <button onClick={() => void submit()} disabled={saving} className="flex-1 px-4 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <RefreshCw size={16} className="animate-spin" />}
            {saving ? 'Creating…' : 'Create Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CREATOR DASHBOARD — with earning notifications + AI tags
   ───────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────
   CREATOR DASHBOARD — with earning notifications + AI tags
   ───────────────────────────────────────────────────────────── */
function CreatorDashboard({ onViewOrders }: { onViewOrders: () => void }) {
  const session = useSession();
  const creatorId = session.creator?.id ?? null;
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitFor, setSubmitFor] = useState<string | null>(null);
  const [openSub, setOpenSub] = useState<MySubmission | null>(null);
  const [mine, setMine] = useState<MySubmission[]>([]);
  const [accepted, setAccepted] = useState<OpenCampaign[]>([]);
  const [tab, setTab] = useState<'submissions' | 'browse' | 'chat' | 'payouts'>('submissions');
  const [section, setSection] = useState<'in_use' | 'not_used' | 'campaigns'>('in_use');
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const unread = useUnreadTotal();

  const loadMine = useCallback(async () => {
    if (!creatorId) { setMine([]); setAccepted([]); return; }
    const [subs, apps, campaigns] = await Promise.all([
      listMySubmissions(creatorId),
      listMyApplications(creatorId),
      listCampaignsOpenToCreators(),
    ]);
    setMine(subs.data);
    const onIt = new Set(apps.data.filter((a) => a.status === 'accepted').map((a) => a.campaignId));
    setAccepted(campaigns.data.filter((c) => onIt.has(c.id)));
  }, [creatorId]);

  useEffect(() => { void loadMine(); }, [loadMine]);

  /** Open the private thread with the brand about one video. */
  const messageBrand = async (submissionId: string) => {
    const res = await openSubmissionThread(submissionId);
    if (res.data) {
      setChatThreadId(res.data);
      setTab('chat');
    }
  };

  const inUse = mine.filter((s) => s.usage === 'in_use');
  const notUsed = mine.filter((s) => s.usage === 'not_used');
  const awaiting = mine.filter((s) => s.usage === 'awaiting');

  const SECTIONS = [
    { id: 'not_used' as const, label: 'Not used', count: notUsed.length },
    { id: 'in_use' as const, label: 'In use', count: inUse.length },
    { id: 'campaigns' as const, label: 'Active campaigns', count: accepted.length },
  ];

  const shown = section === 'in_use' ? inUse : section === 'not_used' ? notUsed : [];

  return (
    <div className="max-w-7xl mx-auto space-y-8 relative">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-heading">Hey, {session.displayName} 👋</h1>
          <p className="text-muted mt-1">Your videos are working. Here's the latest.</p>
        </div>
      </div>

      {creatorId && <EarningsCard creatorId={creatorId} />}

      {/* Two by two on a phone, one compact row from sm up. Each cell carries
          its own border at phone width so it reads as four things; on desktop
          the outer card comes back and the cells sit inside it. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-1 sm:p-1 sm:bg-surface sm:border sm:border-line sm:rounded-xl sm:w-fit">
        {[
          { id: 'submissions', short: 'Videos', label: 'My Submissions', icon: FileVideo },
          { id: 'browse', short: 'Browse', label: 'Browse', icon: Search },
          { id: 'chat', short: 'Chat', label: 'Chat', icon: MessagesSquare },
          { id: 'payouts', short: 'Payouts', label: 'Payouts', icon: Wallet },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`flex items-center gap-2.5 sm:gap-2 px-4 sm:px-4 py-4 sm:py-2.5 rounded-xl sm:rounded-lg text-sm font-semibold transition border sm:border-0 ${
              tab === t.id
                ? 'bg-gradient-kyro text-white border-transparent'
                : 'bg-surface-2 sm:bg-transparent border-line sm:border-transparent text-muted hover:text-heading'
            }`}
          >
            <t.icon size={16} className="flex-shrink-0" />
            <span className="sm:hidden truncate">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
            {t.id === 'chat' && unread > 0 && (
              <span
                className={`ml-auto sm:ml-0 flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                  tab === 'chat' ? 'bg-white/25 text-white' : 'bg-gradient-kyro text-white'
                }`}
              >
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'submissions' && (
        <div className="space-y-6">
          {/* Uploading is the thing a creator came to do, so it sits above the
              archive of what they already sent rather than at the end of it. */}
          {accepted.length > 0 && (
            <div className="bg-surface border border-line rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold text-heading">
                  You're on {plural(accepted.length, 'campaign')}
                </p>
                <p className="text-sm text-muted mt-0.5">
                  Post whenever you like. No approval needed before you upload.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSubmitFor(null); setShowSubmit(true); }}
                className="px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Upload size={16} /> Upload a video
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`px-3.5 py-2 rounded-lg text-sm font-semibold border transition ${
                  section === s.id
                    ? 'bg-gradient-kyro text-white border-transparent'
                    : 'bg-surface border-line text-muted hover:text-heading'
                }`}
              >
                {s.label}
                <span className={`ml-2 text-xs ${section === s.id ? 'text-white/70' : 'text-faint'}`}>
                  {s.count}
                </span>
              </button>
            ))}
            {awaiting.length > 0 && section !== 'campaigns' && (
              <span className="text-xs text-faint ml-1">
                {plural(awaiting.length, 'video')} still with the brand
              </span>
            )}
          </div>

          {section === 'campaigns' ? (
            <ActiveCampaigns
              campaigns={accepted}
              onUpload={(id) => { setSubmitFor(id); setShowSubmit(true); }}
              onChat={async (id) => {
                const res = await openCampaignThread(id);
                if (res.data) { setChatThreadId(res.data); setTab('chat'); }
              }}
            />
          ) : (
            <>
              {/* Portrait tiles: the video is 9:16, so the card should be too.
                  A landscape frame around vertical footage reads as the wrong
                  medium before a creator has read a word. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {shown.map((sub) => (
                  <MySubmissionCard
                    key={sub.id}
                    sub={sub}
                    onOpen={() => setOpenSub(sub)}
                    onMessage={() => void messageBrand(sub.id)}
                  />
                ))}
              </div>

              {shown.length === 0 && (
                <div className="bg-surface border border-line rounded-2xl p-10 text-center">
                  <FileVideo size={28} className="mx-auto text-faint mb-3" />
                  <p className="text-sm text-muted">
                    {section === 'in_use'
                      ? 'Nothing running yet.'
                      : 'Nothing has been passed on. Good sign.'}
                  </p>
                  <p className="text-xs text-faint mt-1">
                    {section === 'in_use'
                      ? 'Videos the brand is running show up here with what they earned.'
                      : 'When a brand passes on a video they have to say why and what they want instead.'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'browse' && creatorId && (
        <BrowseCampaigns
          creatorId={creatorId}
          onChat={async (id) => {
            const res = await openCampaignThread(id);
            if (res.data) { setChatThreadId(res.data); setTab('chat'); }
          }}
        />
      )}

      {tab === 'chat' && <ChatPanel openThreadId={chatThreadId} />}

      {tab === 'payouts' && creatorId && (
        <div className="space-y-6">
          <PayoutsPanel creatorId={creatorId} />
          <AffiliateOrdersCard creatorId={creatorId} onOpen={onViewOrders} />
          <PayoutAccountCard />
        </div>
      )}

      {openSub && (
        <SubmissionDetailModal
          sub={openSub}
          onClose={() => setOpenSub(null)}
          onMessage={() => { const id = openSub.id; setOpenSub(null); void messageBrand(id); }}
        />
      )}

      {showSubmit && creatorId && (
        <SubmitVideoModal
          creatorId={creatorId}
          presetCampaignId={submitFor}
          onClose={() => { setShowSubmit(false); setSubmitFor(null); }}
          onSubmitted={() => void loadMine()}
        />
      )}
    </div>
  );
}

/**
 * The campaigns a creator is actually on.
 *
 * Distinct from Browse, which is about finding work. This is the work they
 * already have, with the two things they do with it: post, and ask.
 */
function ActiveCampaigns({
  campaigns,
  onUpload,
  onChat,
}: {
  campaigns: OpenCampaign[];
  onUpload: (campaignId: string) => void;
  onChat: (campaignId: string) => void;
}) {
  const [detail, setDetail] = useState<OpenCampaign | null>(null);

  if (campaigns.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-10 text-center">
        <Briefcase size={28} className="mx-auto text-faint mb-3" />
        <p className="text-sm text-muted">You're not on any campaigns yet.</p>
        <p className="text-xs text-faint mt-1">Browse open campaigns and apply to the ones that fit.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid md:grid-cols-2 gap-4">
        {campaigns.map((c) => (
          <div key={c.id} className="bg-surface border border-line rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-line">
              <div className="w-14 h-14 rounded-xl overflow-hidden border border-line flex-shrink-0">
                <CoverImage src={c.coverUrl} name={c.brandName} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-heading truncate">{c.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <BrandMark name={c.brandName} logoUrl={c.brandLogoUrl} size={16} />
                  <p className="text-xs text-muted truncate">{c.brandName}</p>
                </div>
              </div>
              {c.commissionBps != null && (
                <span className="text-sm font-bold text-emerald-400 tabular-nums whitespace-nowrap">
                  {(c.commissionBps / 100).toFixed(c.commissionBps % 100 === 0 ? 0 : 1)}%
                </span>
              )}
            </div>
            <div className="p-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onUpload(c.id)}
                className="px-4 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                <Upload size={14} /> Upload a video
              </button>
              <button
                type="button"
                onClick={() => setDetail(c)}
                className="px-3 py-2 rounded-lg border border-line bg-surface-2 text-sm font-semibold text-muted hover:text-heading"
              >
                View campaign
              </button>
              <button
                type="button"
                onClick={() => onChat(c.id)}
                className="px-3 py-2 rounded-lg border border-line bg-surface-2 text-sm font-semibold text-muted hover:text-heading inline-flex items-center gap-2"
              >
                <MessagesSquare size={14} /> Chat
              </button>
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <CampaignDetailModal
          campaign={detail}
          status="accepted"
          onClose={() => setDetail(null)}
          onApply={() => {}}
          onUpload={() => onUpload(detail.id)}
        />
      )}
    </>
  );
}

function MySubmissionCard({
  sub,
  onOpen,
  onMessage,
}: {
  sub: MySubmission;
  onOpen: () => void;
  onMessage: () => void;
}) {
  const tone =
    sub.usage === 'in_use'
      ? { border: 'border-emerald-400/30', bg: 'bg-emerald-400/10', text: 'text-emerald-300', label: 'In use' }
      : sub.usage === 'not_used'
        ? { border: 'border-amber-400/30', bg: 'bg-amber-400/10', text: 'text-amber-300', label: 'Not used' }
        : { border: 'border-line', bg: 'bg-surface-2', text: 'text-muted', label: 'With the brand' };

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden flex flex-col">
      <button type="button" onClick={onOpen} className="relative aspect-[9/16] block w-full group">
        <VideoTile
          name={sub.campaignName}
          label={sub.brandName}
          src={sub.thumbnailUrl ?? sub.coverUrl}
          showPlay={!sub.thumbnailUrl}
        />
        <span className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-sm ${tone.border} ${tone.bg} ${tone.text}`}>
          {tone.label}
        </span>
      </button>

      <div className="p-3.5 space-y-2.5 flex-1 flex flex-col">
        <button type="button" onClick={onOpen} className="text-left min-w-0">
          <h3 className="font-bold text-heading text-sm truncate">{sub.campaignName}</h3>
          <p className="text-xs text-muted truncate">{sub.brandName}</p>
          <p className="text-[11px] text-faint mt-1">
            Uploaded {new Date(sub.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        </button>

        {sub.usage === 'not_used' && (
          <div className="p-2.5 rounded-lg border border-amber-400/25 bg-amber-400/5">
            <p className="text-[11px] font-semibold text-amber-300 mb-1">Why, and what they want next</p>
            <p className="text-xs text-body leading-relaxed line-clamp-4">
              {sub.brandNote || 'The brand did not leave a note.'}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1 mt-auto">
          <button
            type="button"
            onClick={onMessage}
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-line bg-surface-2 text-[11px] font-semibold text-muted hover:text-heading inline-flex items-center justify-center gap-1.5"
          >
            <MessagesSquare size={12} /> Reply
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-line bg-surface-2 text-[11px] font-semibold text-purple-300 hover:text-purple-200"
          >
            Performance
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Open a campaign to creators.
 *
 * Replaces the old "fund the pool to launch" prompt, which described a model
 * KYRO deliberately does not use: brands are billed after the fact against a
 * deposit, so there is no pool to prefund. Without this control nothing ever
 * moved out of draft, which is why the creator campaign picker was empty.
 */
function ActivateCampaignRow({
  campaignId,
  status,
  live,
  blocked,
  onActivated,
}: {
  campaignId: string;
  status: string;
  live: boolean;
  blocked: boolean;
  onActivated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = async () => {
    setError(null);
    setBusy(true);
    const res = await updateCampaignStatus(campaignId, 'live');
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onActivated();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-blue-400/10 border border-blue-400/20 rounded-lg">
      <div className="flex items-center gap-2 min-w-0">
        <AlertCircle size={18} className="text-blue-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-blue-300">
            {blocked
              ? 'Finish connecting Meta and Shopify and sign the agreement to open this to creators.'
              : `${status === 'draft' ? 'Still a draft.' : 'Set up but not open yet.'} Creators can't see it until you open it.`}
          </p>
          {error && <p className="text-xs text-pink-300 mt-0.5">{error}</p>}
        </div>
      </div>
      {live ? (
        <button
          type="button"
          onClick={() => void activate()}
          disabled={busy || blocked}
          title={blocked ? 'Onboarding has to be finished first.' : undefined}
          className="text-xs font-semibold px-3 py-1.5 bg-gradient-kyro text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          {busy && <RefreshCw size={12} className="animate-spin" />}
          Open to creators
        </button>
      ) : (
        <span className="text-xs font-semibold px-3 py-1.5 bg-surface-2 border border-line text-faint rounded-lg">
          Demo campaign
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CREATOR — BROWSE AND APPLY
   ───────────────────────────────────────────────────────────── */
function BrowseCampaigns({ creatorId, onChat }: { creatorId: string; onChat: (campaignId: string) => void }) {
  const [campaigns, setCampaigns] = useState<OpenCampaign[] | null>(null);
  const [apps, setApps] = useState<MyApplication[]>([]);
  const [applying, setApplying] = useState<OpenCampaign | null>(null);
  const [detail, setDetail] = useState<OpenCampaign | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, a] = await Promise.all([listCampaignsOpenToCreators(), listMyApplications(creatorId)]);
    setCampaigns(c.data);
    setApps(a.data);
    setError(c.error || a.error);
  }, [creatorId]);

  useEffect(() => { void load(); }, [load]);

  const statusFor = (campaignId: string) => apps.find((a) => a.campaignId === campaignId)?.status ?? null;

  if (campaigns !== null && campaigns.length === 0) return null;

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line">
        <h2 className="text-xl font-bold text-heading">Open campaigns</h2>
        <p className="text-sm text-muted mt-0.5">Apply to join. You can start making content as soon as you're on.</p>
      </div>

      {error && <p className="p-5 text-sm text-pink-300">{error}</p>}
      {campaigns === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}

      <div className="divide-y divide-line">
        {(campaigns ?? []).map((c) => {
          const status = statusFor(c.id);
          return (
            <div key={c.id} className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-line">
                  <CoverImage src={c.coverUrl} name={c.brandName || c.name} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-heading truncate">{c.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <BrandMark name={c.brandName} logoUrl={c.brandLogoUrl} size={18} />
                    <p className="text-xs text-muted truncate">{c.brandName}</p>
                    {c.commissionBps != null && (
                      <span className="text-xs font-semibold text-emerald-400 tabular-nums whitespace-nowrap">
                        · {(c.commissionBps / 100).toFixed(c.commissionBps % 100 === 0 ? 0 : 1)}% per order
                      </span>
                    )}
                  </div>
                  {c.contentStyle && (
                    <p className="text-xs text-faint mt-1 line-clamp-2">{c.contentStyle}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setDetail(c)}
                  className="px-3 py-2 rounded-lg border border-line bg-surface-2 text-sm font-semibold text-muted hover:text-heading whitespace-nowrap"
                >
                  View campaign
                </button>

                {status === 'accepted' ? (
                  <button
                    type="button"
                    onClick={() => onChat(c.id)}
                    className="px-3 py-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <MessagesSquare size={14} /> Chat
                  </button>
                ) : status === 'pending' ? (
                  <span className="px-3 py-2 rounded-lg border border-line bg-surface-2 text-muted text-sm font-semibold whitespace-nowrap">
                    Applied
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setApplying(c)}
                    className="px-4 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold whitespace-nowrap"
                  >
                    {status === 'rejected' ? 'Apply again' : 'Apply'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {detail && (
        <CampaignDetailModal
          campaign={detail}
          status={statusFor(detail.id)}
          onClose={() => setDetail(null)}
          onApply={() => setApplying(detail)}
          onUpload={() => {}}
        />
      )}

      {applying && (
        <ApplyModal
          campaign={applying}
          creatorId={creatorId}
          reapply={statusFor(applying.id) === 'rejected'}
          onClose={() => setApplying(null)}
          onApplied={() => void load()}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CREATOR — APPLY TO A CAMPAIGN
   Applying used to be a single click with no confirmation and nothing shown
   about what was being agreed to. This is the form: the terms on one side,
   an optional note to the brand on the other, and an explicit send.
   ───────────────────────────────────────────────────────────── */
function ApplyModal({
  campaign,
  creatorId,
  reapply,
  onClose,
  onApplied,
}: {
  campaign: OpenCampaign;
  creatorId: string;
  reapply: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const session = useSession();
  const [message, setMessage] = useState('');
  const [instagram, setInstagram] = useState(
    (session.creator?.social?.instagram?.handle ?? '').replace(/^@+/, '')
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, busy]);

  const send = async () => {
    setError(null);
    setBusy(true);

    // The handle is saved to the profile, not just attached to this one
    // application: partnership ads publish under it, so it has to survive
    // past the application. The existing TikTok handle is passed through
    // rather than dropped, since this form does not collect it.
    const ig = instagram.trim().replace(/^@+/, '');
    if (!ig) {
      setBusy(false);
      setError('Add your Instagram handle. Partnership ads run under your own account.');
      return;
    }
    const saved = await saveCreatorSocials(creatorId, {
      instagram: ig,
      tiktok: (session.creator?.social?.tiktok?.handle ?? '').replace(/^@+/, ''),
    });
    if (saved.error) {
      setBusy(false);
      setError(saved.error);
      return;
    }

    const res = await applyToCampaign(campaign.id, creatorId, message);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    await session.refresh();
    onApplied();
    onClose();
  };

  const rate =
    campaign.commissionBps != null
      ? `${(campaign.commissionBps / 100).toFixed(campaign.commissionBps % 100 === 0 ? 0 : 1)}% of each order`
      : 'Set by the brand';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app/80 backdrop-blur-sm"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className="bg-surface border border-line rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[21/9]">
          <CoverImage src={campaign.coverUrl} name={campaign.brandName} />
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/90 hover:text-white disabled:opacity-40"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <p className="text-xs font-semibold text-purple-300 uppercase tracking-wide">
              {reapply ? 'Apply again' : 'Apply to join'}
            </p>
            <h2 className="text-xl font-bold text-heading mt-1">{campaign.name}</h2>
            <p className="text-sm text-muted">{campaign.brandName}</p>
          </div>

          {campaign.brief && (
            <p className="text-sm text-body leading-relaxed">{campaign.brief}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-line bg-surface-2">
              <p className="text-xs text-faint">You earn</p>
              <p className="text-base font-bold text-emerald-400 mt-0.5">{rate}</p>
            </div>
            <div className="p-4 rounded-xl border border-line bg-surface-2">
              <p className="text-xs text-faint">Money clears after</p>
              <p className="text-base font-bold text-heading mt-0.5">
                {campaign.clearingDays ?? 30} days
              </p>
            </div>
          </div>

          {campaign.deliverableSpec && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted">What they're asking for</p>
              <p className="text-sm text-body leading-relaxed">{campaign.deliverableSpec}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="apply-ig" className="text-xs font-semibold text-muted">
              Instagram handle
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-sm">@</span>
              <input
                id="apply-ig"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                disabled={busy}
                placeholder="yourhandle"
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full pl-8 pr-4 py-2.5 bg-surface-2 border border-line rounded-lg text-sm text-heading placeholder:text-faint focus:outline-none focus:border-purple-500"
              />
            </div>
            <p className="text-xs text-faint">
              Ads run under your own account, so the brand needs the handle before they can accept you.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="apply-note" className="text-xs font-semibold text-muted">
              Note to the brand <span className="text-faint font-normal">(optional)</span>
            </label>
            <textarea
              id="apply-note"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={busy}
              rows={3}
              maxLength={600}
              placeholder="What you'd make for them, or work you've done that's close to this."
              className="w-full px-4 py-2.5 bg-surface-2 border border-line rounded-lg text-sm text-heading placeholder:text-faint focus:outline-none focus:border-purple-500 resize-none"
            />
            <p className="text-xs text-faint">{message.length}/600</p>
          </div>

          <div className="p-3 rounded-lg border border-line bg-surface-2">
            <p className="text-xs text-muted leading-relaxed">
              The brand reviews applications. Once you're on, you can upload videos whenever you
              like — no per-video approval, and you keep the full commission on every order.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-pink-400/30 bg-pink-400/10">
              <AlertCircle size={14} className="text-pink-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-pink-200">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy}
              className="px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold disabled:opacity-50 inline-flex items-center gap-2"
            >
              {busy && <RefreshCw size={14} className="animate-spin" />}
              Send application
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2.5 rounded-lg border border-line text-muted hover:text-heading disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   BRAND — CAMPAIGN ROSTER
   Who is actually on each campaign, and whether they are producing.
   ───────────────────────────────────────────────────────────── */
function CampaignRoster({ brandId, campaigns }: { brandId: string; campaigns: CampaignCard[] }) {
  const [roster, setRoster] = useState<Record<string, RosterCreator[]> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listRosterForBrand(brandId);
    setRoster(res.data);
    setError(res.error);
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  const total = Object.values(roster ?? {}).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-heading">Creators on your campaigns</h2>
          <p className="text-sm text-muted mt-0.5">Everyone you've accepted, and what they've posted.</p>
        </div>
        {total > 0 && (
          <span className="text-sm font-mono text-muted whitespace-nowrap">{plural(total, 'creator')}</span>
        )}
      </div>

      {error && <p className="p-5 text-sm text-pink-300">{error}</p>}
      {roster === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}

      {roster !== null && total === 0 && (
        <div className="p-10 text-center">
          <Users size={28} className="mx-auto text-faint mb-3" />
          <p className="text-sm text-muted">No creators on your campaigns yet.</p>
          <p className="text-xs text-faint mt-1">
            Open a campaign to creators, then accept them from Creator applications above. They'll show here.
          </p>
        </div>
      )}

      {roster !== null && total > 0 && (
        <div className="divide-y divide-line">
          {campaigns
            .filter((c) => (roster[c.id] ?? []).length > 0)
            .map((c) => (
              <div key={c.id} className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-heading">{c.name}</p>
                  <span className="text-xs text-faint whitespace-nowrap">{plural((roster[c.id] ?? []).length, 'creator')}</span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(roster[c.id] ?? []).map((r) => (
                    <div key={r.applicationId} className="p-3 rounded-xl border border-line bg-surface-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-heading truncate">{r.handle}</p>
                        <span className={`text-xs font-semibold whitespace-nowrap ${r.submissions > 0 ? 'text-emerald-400' : 'text-faint'}`}>
                          {plural(r.submissions, 'video')}
                        </span>
                      </div>
                      {r.niche.length > 0 && (
                        <p className="text-xs text-faint truncate">{r.niche.join(' · ')}</p>
                      )}
                      {(r.instagramFollowers || r.tiktokFollowers) && (
                        <p className="text-xs text-muted">
                          {r.instagramFollowers ? `${fmtK(r.instagramFollowers)} IG` : ''}
                          {r.instagramFollowers && r.tiktokFollowers ? ' · ' : ''}
                          {r.tiktokFollowers ? `${fmtK(r.tiktokFollowers)} TT` : ''}
                        </p>
                      )}
                      <p className="text-xs text-faint">Joined {new Date(r.joinedAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   BRAND — CREATOR APPLICATIONS
   ───────────────────────────────────────────────────────────── */
function ApplicationsPanel({ brandId }: { brandId: string }) {
  const [rows, setRows] = useState<BrandApplication[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listApplicationsForBrand(brandId);
    setRows(res.data);
    setError(res.error);
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, status: 'accepted' | 'rejected') => {
    setBusy(id);
    const res = await setApplicationStatus(id, status);
    setBusy(null);
    if (res.error) { setError(res.error); return; }
    await load();
  };

  const all = rows ?? [];
  const pending = all.filter((r) => r.status === 'pending');

  if (rows !== null && all.length === 0) return null;

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-heading">Creator applications</h2>
          <p className="text-sm text-muted mt-0.5">Who wants to work on your campaigns.</p>
        </div>
        {pending.length > 0 && (
          <span className="px-3 py-1.5 rounded-lg border border-purple-400/30 bg-purple-400/10 text-purple-300 text-xs font-semibold whitespace-nowrap">
            {pending.length} to review
          </span>
        )}
      </div>

      {error && <p className="p-5 text-sm text-pink-300">{error}</p>}
      {rows === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}

      <div className="divide-y divide-line">
        {all.map((a) => (
          <div key={a.id} className="p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-heading truncate">{a.creatorHandle}</p>
              <p className="text-xs text-muted truncate">{a.campaignName}</p>
              {a.creatorNiche.length > 0 && (
                <p className="text-xs text-faint mt-0.5 truncate">{a.creatorNiche.join(' · ')}</p>
              )}
              {a.message && <p className="text-sm text-muted mt-1.5 leading-relaxed">{a.message}</p>}
            </div>

            {a.status === 'pending' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void decide(a.id, 'accepted')}
                  disabled={busy === a.id}
                  className="px-3 py-1.5 rounded-lg bg-gradient-kyro text-white text-xs font-semibold disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => void decide(a.id, 'rejected')}
                  disabled={busy === a.id}
                  className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-muted hover:text-heading disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            ) : (
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                a.status === 'accepted'
                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                  : 'border-line bg-surface-2 text-muted'
              }`}>
                {a.status === 'accepted' ? 'On the campaign' : 'Declined'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   BRAND — CREATOR VIDEOS
   Creators post without waiting. The brand decides what runs, and owes a
   reason when it does not.
   ───────────────────────────────────────────────────────────── */
function SubmissionReviewCard({ sub, onDecided }: { sub: CampaignSubmission; onDecided: () => void }) {
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState(sub.brandNote ?? '');
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening the thread creates it if it does not exist yet, then scrolls the
  // brand's own inbox further down the page to it.
  const openThread = async () => {
    setError(null);
    setOpening(true);
    const res = await openSubmissionThread(sub.id);
    setOpening(false);
    if (res.error) { setError(res.error); return; }
    document.getElementById('brand-messages')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const decide = async (usage: 'in_use' | 'not_used') => {
    setError(null);
    setBusy(true);
    const res = await setSubmissionUsage(sub.id, usage, note);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setWriting(false);
    onDecided();
  };

  const decided = sub.usage !== 'awaiting';

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-heading truncate">{sub.creatorHandle}</p>
          <p className="text-xs text-muted truncate">{sub.campaignName}</p>
          <p className="text-xs text-faint mt-0.5">Uploaded {new Date(sub.submittedAt).toLocaleDateString()}</p>
        </div>
        {decided && (
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
            sub.usage === 'in_use'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
              : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
          }`}>
            {sub.usage === 'in_use' ? 'In use' : 'Not used'}
          </span>
        )}
      </div>

      {decided && sub.brandNote && (
        <p className="text-sm text-muted leading-relaxed border-l-2 border-line pl-3">{sub.brandNote}</p>
      )}

      {writing && (
        <div className="space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Why this one isn't running, and what you want in the next video."
            className="w-full px-3 py-2 bg-surface-2 border border-line rounded-lg text-sm text-heading placeholder-faint focus:outline-none focus:border-purple-500 resize-y"
          />
          <p className="text-xs text-faint">
            The creator sees this. It is the only thing telling them what to make next, so be specific.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-pink-300">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void decide('in_use')}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-gradient-kyro text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {busy && <RefreshCw size={12} className="animate-spin" />}
          {sub.usage === 'in_use' ? 'Still in use' : 'Using this'}
        </button>

        {writing ? (
          <>
            <button
              type="button"
              onClick={() => void decide('not_used')}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 text-amber-200 text-xs font-semibold disabled:opacity-50"
            >
              Send feedback
            </button>
            <button
              type="button"
              onClick={() => { setWriting(false); setNote(sub.brandNote ?? ''); setError(null); }}
              className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-muted hover:text-heading"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setWriting(true)}
              className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-muted hover:text-heading"
            >
              {sub.usage === 'not_used' ? 'Edit feedback' : 'Not using it'}
            </button>
            {/* A note is a verdict. This is where the back and forth happens. */}
            <button
              type="button"
              onClick={() => void openThread()}
              disabled={opening}
              className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-muted hover:text-heading inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <MessagesSquare size={12} /> Message {sub.creatorHandle}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CreatorVideosPanel({ brandId }: { brandId: string }) {
  const [rows, setRows] = useState<CampaignSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);

  const load = useCallback(async () => {
    const res = await listSubmissionsForBrand(brandId);
    setRows(res.data);
    setError(res.error);
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  const all = rows ?? [];
  const pending = all.filter((r) => r.usage === 'awaiting');
  const shown = onlyPending ? pending : all;

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-heading">Creator videos</h2>
          <p className="text-sm text-muted mt-0.5">
            Creators post without waiting on you. Say what you're running, and why when you're not.
          </p>
        </div>
        {pending.length > 0 && (
          <button
            type="button"
            onClick={() => setOnlyPending((v) => !v)}
            className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-muted hover:text-heading whitespace-nowrap"
          >
            {onlyPending ? 'Show all' : `${pending.length} awaiting you`}
          </button>
        )}
      </div>

      {error && <p className="p-5 text-sm text-pink-300">{error}</p>}

      {rows === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}

      {rows !== null && shown.length === 0 && (
        <div className="p-10 text-center">
          <FileVideo size={28} className="mx-auto text-faint mb-3" />
          <p className="text-sm text-muted">
            {onlyPending ? 'Nothing waiting on you.' : 'No videos yet.'}
          </p>
          {!onlyPending && (
            <p className="text-xs text-faint mt-1">Creators on your live campaigns can upload at any time.</p>
          )}
        </div>
      )}

      <div className="divide-y divide-line">
        {shown.map((sub) => (
          <SubmissionReviewCard key={sub.id} sub={sub} onDecided={() => void load()} />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CREATOR — SUBMIT A VIDEO
   Upload to private storage, then record the submission. The brand still
   approves it before anything runs as an ad.
   ───────────────────────────────────────────────────────────── */
function SubmitVideoModal({
  creatorId,
  presetCampaignId,
  onClose,
  onSubmitted,
}: {
  creatorId: string;
  presetCampaignId?: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [campaigns, setCampaigns] = useState<OpenCampaign[] | null>(null);
  const [campaignId, setCampaignId] = useState(presetCampaignId ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<'idle' | 'uploading' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await listCampaignsOpenToCreators();
      setCampaigns(res.data);
      if (res.error) setError(res.error);
      // Opened from a specific campaign, or there is only one to choose from.
      if (presetCampaignId) setCampaignId(presetCampaignId);
      else if (res.data.length === 1) setCampaignId(res.data[0].id);
    })();
  }, [presetCampaignId]);

  const chosen = campaigns?.find((c) => c.id === campaignId) ?? null;
  const busy = stage !== 'idle';

  const submit = async () => {
    setError(null);
    if (!chosen) { setError('Choose which campaign this video is for.'); return; }
    if (!file) { setError('Choose a video file.'); return; }

    setStage('uploading');
    const up = await uploadSubmissionVideo(creatorId, file);
    if (up.error || !up.path) {
      setStage('idle');
      setError(up.error ?? 'Upload failed.');
      return;
    }

    setStage('saving');
    const res = await createSubmission({
      campaignId: chosen.id,
      creatorId,
      brandId: chosen.brandId,
      videoUrl: up.path,
    });
    setStage('idle');
    if (res.error) { setError(res.error); return; }
    onSubmitted();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app/80 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }}>
      <div className="bg-surface border border-line rounded-2xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-heading">Upload a video</h2>
          <button type="button" onClick={onClose} disabled={busy} className="text-muted hover:text-heading disabled:opacity-40"><X size={20} /></button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted">Campaign</label>
          {campaigns === null ? (
            <p className="text-sm text-muted">Loading campaigns…</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted">
              No campaigns are live right now. A brand has to set one live before you can submit to it.
            </p>
          ) : (
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              disabled={busy}
              className="w-full px-4 py-2.5 bg-surface-2 border border-line rounded-lg text-heading focus:outline-none focus:border-purple-500"
            >
              <option value="">Choose a campaign…</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.brandName}</option>
              ))}
            </select>
          )}
          {chosen?.deliverableSpec && (
            <p className="text-xs text-faint leading-relaxed">What they asked for: {chosen.deliverableSpec}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted">Video</label>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-muted file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-surface-2 file:text-body file:font-semibold file:cursor-pointer"
          />
          <p className="text-xs text-faint">
            MP4, MOV or WebM, up to 500 MB. Your video is stored privately and only the brand running this campaign can view it.
          </p>
          {file && <p className="text-xs text-body">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-pink-400/30 bg-pink-400/10">
            <AlertCircle size={14} className="text-pink-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-pink-200">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !campaignId || !file}
            className="px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {busy && <RefreshCw size={14} className="animate-spin" />}
            {stage === 'uploading' ? 'Uploading…' : stage === 'saving' ? 'Saving…' : 'Upload video'}
          </button>
          <p className="text-xs text-faint">Upload as many as you like. You'll see whether the brand used each one, and why if they didn't.</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CREATOR — PAYOUT ACCOUNT AND TAX FORM
   ───────────────────────────────────────────────────────────── */
function PayoutAccountCard() {
  const session = useSession();
  const creator = session.creator;

  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<'ach' | 'wire'>('ach');
  const [holder, setHolder] = useState('');
  const [bank, setBank] = useState('');
  const [routing, setRouting] = useState('');
  const [account, setAccount] = useState('');
  const [confirmAccount, setConfirmAccount] = useState('');
  const [swift, setSwift] = useState('');
  const [bankAddress, setBankAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [taxEditing, setTaxEditing] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [entityType, setEntityType] = useState<'individual' | 'business'>('individual');
  const [taxAddress, setTaxAddress] = useState('');
  const [taxCountry, setTaxCountry] = useState('United States');
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxError, setTaxError] = useState<string | null>(null);

  /** Wipe the numbers out of component state the moment we are done with them. */
  const clearSecrets = () => {
    setRouting(''); setAccount(''); setConfirmAccount(''); setSwift('');
  };

  if (!creator) return null;

  const save = async () => {
    setError(null);
    if (account !== confirmAccount) {
      setError('The two account numbers do not match.');
      return;
    }
    setSaving(true);
    const res = await saveBankAccount({
      method,
      accountHolder: holder,
      bankName: bank,
      routingNumber: routing,
      accountNumber: account,
      swiftCode: method === 'wire' ? swift : undefined,
      bankAddress: method === 'wire' ? bankAddress : undefined,
    });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    clearSecrets();
    await session.refresh();
    setEditing(false);
  };

  const cancel = () => { clearSecrets(); setEditing(false); setError(null); };

  const submitTax = async () => {
    setTaxError(null);
    setTaxSaving(true);
    const res = await saveTaxDetails(creator.id, {
      legalName, entityType, address: taxAddress, country: taxCountry,
    });
    setTaxSaving(false);
    if (res.error) { setTaxError(res.error); return; }
    await session.refresh();
    setTaxEditing(false);
  };

  const taxDone = creator.taxFormStatus === 'complete';
  const onFile = Boolean(creator.payoutBankLast4);

  const field = "w-full px-3 py-2 bg-surface-2 border border-line rounded-lg text-heading placeholder-faint focus:outline-none focus:border-purple-500";

  return (
    <div className="grid md:grid-cols-2 gap-5">
      {/* Payout account */}
      <div className="bg-surface border border-line rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-body" />
            <h3 className="font-semibold text-heading">Payout account</h3>
          </div>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-purple-400 hover:text-purple-300">
              {onFile ? 'Change' : 'Add account'}
            </button>
          )}
        </div>

        {!editing && (
          onFile ? (
            <div className="space-y-1">
              <p className="text-lg font-semibold text-heading tabular-nums">•••• •••• •••• {creator.payoutBankLast4}</p>
              <p className="text-sm text-muted">
                {creator.payoutBankName || 'Bank account'}
                {creator.payoutMethod ? ` · ${creator.payoutMethod === 'wire' ? 'Wire' : 'ACH'}` : ''}
              </p>
              {creator.payoutUpdatedAt && (
                <p className="text-xs text-faint">Updated {new Date(creator.payoutUpdatedAt).toLocaleDateString()}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">No payout account on file. Add one so KYRO knows where to send your earnings.</p>
          )
        )}

        {editing && (
          <div className="space-y-3">
            <div className="flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-lg w-fit">
              {(['ach', 'wire'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded transition ${m === method ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'}`}
                >
                  {m === 'ach' ? 'ACH' : 'Wire'}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Name on the account</label>
              <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Full legal name" className={field} autoComplete="off" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Bank name</label>
              <input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Chase" className={field} autoComplete="off" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">
                {method === 'ach' ? 'Routing number (9 digits)' : 'Routing / sort code'}
              </label>
              <input
                value={routing}
                onChange={(e) => setRouting(e.target.value.replace(/\D/g, '').slice(0, 11))}
                inputMode="numeric"
                autoComplete="off"
                className={`${field} tabular-nums`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Account number</label>
              <input
                type="password"
                value={account}
                onChange={(e) => setAccount(e.target.value.replace(/\D/g, '').slice(0, 17))}
                inputMode="numeric"
                autoComplete="off"
                className={`${field} tabular-nums`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Confirm account number</label>
              <input
                value={confirmAccount}
                onChange={(e) => setConfirmAccount(e.target.value.replace(/\D/g, '').slice(0, 17))}
                inputMode="numeric"
                autoComplete="off"
                className={`${field} tabular-nums`}
              />
              <p className="text-xs text-faint">Typed twice because a wrong digit sends your money to a stranger.</p>
            </div>

            {method === 'wire' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted">SWIFT / BIC (optional)</label>
                  <input value={swift} onChange={(e) => setSwift(e.target.value.toUpperCase().slice(0, 11))} autoComplete="off" className={field} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted">Bank address (optional)</label>
                  <input value={bankAddress} onChange={(e) => setBankAddress(e.target.value)} autoComplete="off" className={field} />
                </div>
              </>
            )}

            {error && <p className="text-xs text-pink-300">{error}</p>}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !holder || !routing || !account || !confirmAccount}
                className="px-4 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {saving && <RefreshCw size={14} className="animate-spin" />}
                Save account
              </button>
              <button type="button" onClick={cancel} className="px-4 py-2 rounded-lg border border-line text-sm text-muted hover:text-heading">
                Cancel
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-faint leading-relaxed">
          Your account number is encrypted before it is stored and is never sent back to your browser. Only the last four digits are shown, here or anywhere else in KYRO.
        </p>
      </div>

      {/* 1099 tax info */}
      <div className="bg-surface border border-line rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-body" />
          <h3 className="font-semibold text-heading">1099 tax info</h3>
        </div>

        <div className={`flex items-start gap-3 p-3 rounded-xl border ${taxDone ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-amber-400/30 bg-amber-400/10'}`}>
          {taxDone
            ? <CheckCircle size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            : <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />}
          <div className="space-y-0.5">
            <p className={`text-sm font-semibold ${taxDone ? 'text-emerald-200' : 'text-amber-200'}`}>
              {taxDone ? 'Tax info on file' : creator.taxFormStatus === 'pending' ? 'Tax info in review' : 'Tax info needed'}
            </p>
            {taxDone && creator.taxFormSubmittedAt && (
              <p className="text-xs text-emerald-200/70">Submitted {new Date(creator.taxFormSubmittedAt).toLocaleDateString()}</p>
            )}
          </div>
        </div>

        {!taxEditing && (
          <>
            <p className="text-sm text-muted leading-relaxed">
              Earn $600 or more in a calendar year and KYRO issues you a 1099-NEC. To do that we need your tax details on file first, which is why the withdraw button stays locked until this is done.
            </p>
            {creator.taxLegalName && (
              <p className="text-xs text-faint">On file for {creator.taxLegalName}{creator.taxCountry ? ` · ${creator.taxCountry}` : ''}</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setTaxEditing(true)}
                className="px-4 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold"
              >
                {creator.taxLegalName ? 'Update tax info' : 'Submit tax info'}
              </button>
              {/* A 1099-NEC only exists once KYRO has issued one, which happens
                  after the calendar year closes and only past $600. Disabled
                  with the reason on it, rather than a button that 404s. */}
              <button
                type="button"
                disabled
                title={
                  taxDone
                    ? 'Your 1099-NEC is issued after the calendar year closes, once you have earned $600 or more.'
                    : 'Submit your tax info first.'
                }
                className="px-4 py-2 rounded-lg border border-line bg-surface-2 text-sm font-semibold text-faint cursor-not-allowed"
              >
                View tax form
              </button>
            </div>
          </>
        )}

        {taxEditing && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Full legal name</label>
              <input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="As it appears on your tax return" className={field} />
              <p className="text-xs text-faint">This has to match the name on your payout account before money can move.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Filing as</label>
              <div className="flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-lg w-fit">
                {(['individual', 'business'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEntityType(t)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded transition capitalize ${t === entityType ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Address</label>
              <input value={taxAddress} onChange={(e) => setTaxAddress(e.target.value)} placeholder="Street, city, state, ZIP" className={field} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Country</label>
              <input value={taxCountry} onChange={(e) => setTaxCountry(e.target.value)} placeholder="United States" className={field} />
              <p className="text-xs text-faint">US creators file a W-9. Everyone else files a W-8BEN.</p>
            </div>

            <div className="p-3 rounded-xl border border-line bg-surface-2">
              <p className="text-xs text-muted leading-relaxed">
                KYRO does not ask for your Social Security or EIN number and has nowhere to put one. The payout provider collects it directly on the form itself, which is the last step before your first withdrawal.
              </p>
            </div>

            {taxError && <p className="text-xs text-pink-300">{taxError}</p>}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void submitTax()}
                disabled={taxSaving || !legalName || !taxAddress || !taxCountry}
                className="px-4 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {taxSaving && <RefreshCw size={14} className="animate-spin" />}
                Submit
              </button>
              <button type="button" onClick={() => { setTaxEditing(false); setTaxError(null); }} className="px-4 py-2 rounded-lg border border-line text-sm text-muted hover:text-heading">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ADMIN — ANALYTICS COMMAND CENTER
   ───────────────────────────────────────────────────────────── */
const ADMIN_MONTHS = [
  { m: 'Jan', rev: 18200, spend: 41000 },
  { m: 'Feb', rev: 22400, spend: 52000 },
  { m: 'Mar', rev: 26800, spend: 61000 },
  { m: 'Apr', rev: 24100, spend: 58000 },
  { m: 'May', rev: 31430, spend: 74000 },
  { m: 'Jun', rev: 38900, spend: 92000 },
];

const ADMIN_BRAND_PERF = [
  { brandId: 'boldbuns' as BrandId, revenue: 12400, spend: 34200, roas: 3.4, orders: 1240 },
  { brandId: 'jaje' as BrandId, revenue: 10800, spend: 28600, roas: 4.1, orders: 1840 },
  { brandId: 'fuel' as BrandId, revenue: 7600, spend: 21800, roas: 2.9, orders: 612 },
  { brandId: 'ns' as BrandId, revenue: 5200, spend: 14200, roas: 3.1, orders: 480 },
  { brandId: 'lebanta' as BrandId, revenue: 2900, spend: 8100, roas: 2.4, orders: 210 },
];

function KpiCard({ label, value, delta, up = true, icon: Icon }: { label: string; value: string; delta: string; up?: boolean; icon: typeof Trophy }) {
  return (
    <div className="p-5 rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center"><Icon size={16} className="text-purple-500" /></div>
        <span className={`flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-500' : 'text-pink-500'}`}>
          {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{delta}
        </span>
      </div>
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold text-heading">{value}</p>
    </div>
  );
}

function RevSpendChart() {
  const max = Math.max(...ADMIN_MONTHS.flatMap((d) => [d.rev, d.spend]));
  return (
    <div>
      <div className="flex items-end gap-4 h-52">
        {ADMIN_MONTHS.map((d) => (
          <div key={d.m} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full flex items-end justify-center gap-1.5 h-full">
              <div className="w-1/2 max-w-[18px] rounded-t bg-line" style={{ height: `${(d.spend / max) * 100}%` }} title={`Spend ${fmt(d.spend)}`}></div>
              <div className="w-1/2 max-w-[18px] rounded-t bg-gradient-kyro" style={{ height: `${(d.rev / max) * 100}%` }} title={`Revenue ${fmt(d.rev)}`}></div>
            </div>
            <span className="text-[11px] text-faint">{d.m}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-5 mt-4 text-xs">
        <span className="flex items-center gap-1.5 text-muted"><span className="w-3 h-3 rounded-sm bg-gradient-kyro"></span> Platform revenue</span>
        <span className="flex items-center gap-1.5 text-muted"><span className="w-3 h-3 rounded-sm bg-line"></span> Ad spend managed</span>
      </div>
    </div>
  );
}

function AdminDashboard({ onViewCreator }: { onViewCreator: (id: CreatorId) => void }) {
  // Curation cards the operator has passed on this session.
  const [skipped, setSkipped] = useState<string[]>([]);
  // Brand Performance ordering. Spend descending is the useful default.
  const [perfSort, setPerfSort] = useState<'spend' | 'name'>('spend');
  const totalRevenue = ADMIN_MONTHS.reduce((s, m) => s + m.rev, 0);
  const totalSpend = ADMIN_MONTHS.reduce((s, m) => s + m.spend, 0);
  const totalOrders = ADMIN_BRAND_PERF.reduce((s, b) => s + b.orders, 0);
  const blendedRoas = (ADMIN_BRAND_PERF.reduce((s, b) => s + b.roas, 0) / ADMIN_BRAND_PERF.length).toFixed(1);
  const maxBrandSpend = Math.max(...ADMIN_BRAND_PERF.map((b) => b.spend));
  const totalCollected = 75000;
  const totalAccrued = 31430;
  const totalPaidOut = 24890;
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-heading">Admin Analytics</h1>
          <p className="text-muted mt-1">Platform-wide performance, revenue, and reconciliation.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-surface border border-line rounded-lg text-sm text-muted">
          <Calendar size={14} /> Last 6 months
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Platform Revenue" value={fmt(totalRevenue)} delta="+24%" up icon={DollarSign} />
        <KpiCard label="Ad Spend Managed" value={fmt(totalSpend)} delta="+18%" up icon={TrendingUp} />
        <KpiCard label="Orders Driven" value={totalOrders.toLocaleString()} delta="+31%" up icon={Target} />
        <KpiCard label="Blended ROAS" value={`${blendedRoas}x`} delta="+0.3x" up icon={BarChart3} />
      </div>

      {/* Trend + breakdown */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface border border-line rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-heading">Revenue vs Ad Spend</h2>
            <span className="text-xs text-faint">Monthly</span>
          </div>
          <RevSpendChart />
        </div>
        <div className="bg-surface border border-line rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-heading flex items-center gap-2"><PieChart size={16} className="text-purple-500" /> Spend by Brand</h2>
          </div>
          <div className="space-y-4">
            {ADMIN_BRAND_PERF.map((b) => {
              const brand = BRANDS[b.brandId];
              return (
                <div key={b.brandId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-body font-medium"><BrandLogo brandId={b.brandId} size={20} /> {brand.name}</span>
                    <span className="text-faint">{fmt(b.spend)}</span>
                  </div>
                  <div className="h-2 bg-surface-2 rounded-full overflow-hidden"><div className="h-full bg-gradient-kyro rounded-full" style={{ width: `${(b.spend / maxBrandSpend) * 100}%` }}></div></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Brand performance table */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-line flex items-center justify-between">
          <h2 className="text-lg font-bold text-heading">Brand Performance</h2>
          <button
            type="button"
            onClick={() => setPerfSort((cur) => (cur === 'spend' ? 'name' : 'spend'))}
            className="text-xs text-muted hover:text-heading flex items-center gap-1"
            title="Change how this table is ordered"
          >
            <Filter size={12} /> Sorted by {perfSort === 'spend' ? 'spend' : 'name'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-faint border-b border-line">
                <th className="p-4 font-semibold">Brand</th>
                <th className="p-4 font-semibold">Revenue</th>
                <th className="p-4 font-semibold">Spend</th>
                <th className="p-4 font-semibold">Orders</th>
                <th className="p-4 font-semibold">ROAS</th>
                <th className="p-4 font-semibold">Spend share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...ADMIN_BRAND_PERF]
                .sort((a, b) =>
                  perfSort === 'spend'
                    ? b.spend - a.spend
                    : BRANDS[a.brandId].name.localeCompare(BRANDS[b.brandId].name)
                )
                .map((b) => {
                const brand = BRANDS[b.brandId];
                return (
                  <tr key={b.brandId} className="hover:bg-surface-2 transition">
                    <td className="p-4"><span className="flex items-center gap-3 font-semibold text-heading"><BrandLogo brandId={b.brandId} size={28} /> {brand.name}</span></td>
                    <td className="p-4 font-semibold text-emerald-500">{fmt(b.revenue)}</td>
                    <td className="p-4 text-body">{fmt(b.spend)}</td>
                    <td className="p-4 text-body">{b.orders.toLocaleString()}</td>
                    <td className="p-4"><span className={`font-semibold ${b.roas >= 3 ? 'text-emerald-500' : 'text-amber-500'}`}>{b.roas}x</span></td>
                    <td className="p-4 w-40"><div className="h-1.5 bg-surface-2 rounded-full overflow-hidden"><div className="h-full bg-gradient-kyro rounded-full" style={{ width: `${(b.spend / maxBrandSpend) * 100}%` }}></div></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top creators + platform health */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-line flex items-center justify-between">
            <h2 className="text-lg font-bold text-heading flex items-center gap-2"><Trophy size={16} className="text-amber-500" /> Top Creators</h2>
            <span className="text-xs text-faint">by orders</span>
          </div>
          <div className="divide-y divide-line">
            {SEED_LEADERBOARD.map((l, i) => {
              const c = SEED_CREATORS[l.creatorId];
              return (
                <button key={l.creatorId} onClick={() => onViewCreator(l.creatorId)} className="w-full p-4 flex items-center gap-4 hover:bg-surface-2 transition text-left">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-kyro text-white font-bold text-xs">{i + 1}</div>
                  <img src={c.avatar} alt={c.name} className="w-9 h-9 rounded-full object-cover" />
                  <div className="flex-1 min-w-0"><p className="font-semibold text-heading truncate">{c.name}</p><p className="text-xs text-muted">{c.handle}</p></div>
                  <div className="text-right"><p className="text-sm font-bold text-emerald-500">{l.orders}</p><p className="text-[11px] text-faint">orders</p></div>
                  <ChevronRight size={16} className="text-faint" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-heading flex items-center gap-2"><Activity size={16} className="text-purple-500" /> Platform Health</h2>
            <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-semibold text-emerald-500">All systems go</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Active Brands', value: '14', sub: '3 pending' },
              { label: 'Active Creators', value: '247', sub: '+18 this week' },
              { label: 'Live Campaigns', value: '8', sub: 'across brands' },
              { label: 'Avg Approval Time', value: '4.2h', sub: 'submission to live' },
            ].map((s) => (
              <div key={s.label} className="p-4 rounded-xl bg-surface-2 border border-line">
                <p className="text-xs text-muted mb-1">{s.label}</p>
                <p className="text-xl font-bold text-heading">{s.value}</p>
                <p className="text-[11px] text-faint mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reconciliation */}
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-heading flex items-center gap-2"><Sparkles size={18} className="text-emerald-500" /> Reconciliation — Today</h2>
            <p className="text-sm text-muted mt-0.5">Three-way diff: Square credits, Trolley debits, Kyro ledger.</p>
          </div>
          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full"><span className="text-xs font-semibold text-emerald-500">All green</span></div>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: DollarSign, label: 'Collected (Square)', value: fmt(totalCollected) },
            { icon: Activity, label: 'Earnings Accrued', value: fmt(totalAccrued) },
            { icon: Wallet, label: 'Paid Out (Trolley)', value: fmt(totalPaidOut) },
          ].map((r) => (
            <div key={r.label} className="p-5 rounded-xl bg-surface-2 border border-line">
              <div className="flex items-center gap-2 mb-2"><r.icon size={16} className="text-purple-500" /><p className="text-xs font-semibold text-muted uppercase tracking-wider">{r.label}</p></div>
              <p className="text-2xl font-bold text-heading">{r.value}</p>
            </div>
          ))}
        </div>
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
          <CheckCircle size={18} className="text-emerald-500" />
          <p className="text-sm text-body">Ledger balanced. Pool float: <span className="font-bold text-heading">{fmt(totalCollected - totalAccrued)}</span> available across all campaigns.</p>
        </div>
      </div>

      {/* Pool health + curation */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-line flex items-center justify-between">
            <h2 className="text-lg font-bold text-heading">Pool Health</h2>
            <span className="text-xs text-faint">{SEED_CAMPAIGNS.filter((c) => c.pool > 0).length} campaigns</span>
          </div>
          <div className="divide-y divide-line">
            {SEED_CAMPAIGNS.filter((c) => c.pool > 0).map((c) => {
              const pct = Math.round((c.spent / c.pool) * 100);
              const lowPool = pct > 70;
              return (
                <div key={c.id} className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <BrandLogo brandId={c.brandId} size={28} />
                    <div className="flex-1"><p className="text-sm font-semibold text-heading">{c.name}</p><p className="text-xs text-faint">{fmt(c.spent)} of {fmt(c.pool)}</p></div>
                    {lowPool ? <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs font-semibold text-amber-500">Top up soon</span> : <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-semibold text-emerald-500">Healthy</span>}
                  </div>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden"><div className={`h-full ${lowPool ? 'bg-amber-500' : 'bg-gradient-kyro'} rounded-full`} style={{ width: `${pct}%` }}></div></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-line flex items-center justify-between">
            <h2 className="text-lg font-bold text-heading">Curation Queue</h2>
            <span className="text-xs text-faint">{SEED_CURATION.length} pending</span>
          </div>
          <div className="divide-y divide-line">
            {SEED_CURATION.filter((cu) => !skipped.includes(cu.id)).map((cu) => {
              const c = SEED_CREATORS[cu.creatorId];
              return (
                <div key={cu.id} className="p-4 space-y-3">
                  <button onClick={() => onViewCreator(cu.creatorId)} className="w-full flex items-center gap-3 text-left hover:opacity-80 transition">
                    <img src={c.avatar} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1"><p className="text-sm font-semibold text-heading">{c.name}</p><span className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-xs font-semibold text-purple-500">{cu.match}% match</span></div>
                      <p className="text-xs text-muted">{c.social.instagram} IG · {c.niche.join(' · ')}</p>
                      <p className="text-xs text-faint mt-0.5">For: {cu.campaign}</p>
                    </div>
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled
                      title="Proposing a match writes to the applications table, which is not built yet."
                      className="flex-1 px-3 py-1.5 bg-gradient-kyro rounded-lg text-white text-xs font-semibold opacity-50 cursor-not-allowed"
                    >
                      Propose Match
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkipped((cur) => [...cur, cu.id])}
                      className="px-3 py-1.5 border border-line rounded-lg text-body text-xs font-semibold hover:bg-surface-2"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CREATOR PUBLIC PROFILE
   ───────────────────────────────────────────────────────────── */
function CreatorPublicProfile({ creatorId, onBack }: { creatorId: CreatorId; onBack: () => void }) {
  const c = SEED_CREATORS[creatorId];
  return (
    <div className="min-h-screen bg-app">
      <div className="sticky top-0 z-40 backdrop-blur-md bg-app/80 border-b border-line px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto h-16 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-muted hover:text-heading transition">
            <ChevronLeft size={20} /> Back
          </button>
          <div className="flex items-center gap-2">
            <KyroLogo size={28} />
            <span className="text-lg font-bold bg-gradient-kyro bg-clip-text text-transparent tracking-tight">KYRO</span>
          </div>
          <button
            type="button"
            disabled
            title="Public profile links arrive with the creator profile build. There is no shareable URL yet."
            className="flex items-center gap-2 px-3 py-1.5 text-muted text-sm opacity-50 cursor-not-allowed"
          >
            <Share2 size={14} /> Share
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-8 md:p-12">
          <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/15 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3 pointer-events-none"></div>
          <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start">
            <img src={c.avatar} alt={c.name} className="w-32 h-32 rounded-full object-cover ring-4 ring-line" />
            <div className="flex-1 space-y-3">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold text-heading">{c.name}</h1>
                <p className="text-lg text-muted mt-1">{c.handle}</p>
              </div>
              <p className="text-body leading-relaxed max-w-2xl">{c.bio}</p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <span className="flex items-center gap-1.5 text-sm text-muted"><Globe size={14} /> {c.location}</span>
                {c.niche.map((n) => (
                  <span key={n} className="px-2.5 py-0.5 bg-purple-400/10 border border-purple-400/20 rounded-full text-xs font-semibold text-purple-300">{n}</span>
                ))}
              </div>
              <div className="flex gap-4 pt-3">
                <SocialLink href={`https://instagram.com/${stripAt(c.social.instagram)}`} icon={Instagram} label={c.social.instagram} />
                <SocialLink href={`https://tiktok.com/@${stripAt(c.social.tiktok)}`} icon={Hash} label={c.social.tiktok} />
                <SocialLink href={`https://youtube.com/@${stripAt(c.social.youtube)}`} icon={Youtube} label={c.social.youtube} />
              </div>
            </div>
            <button
              type="button"
              disabled
              title="Creator invitations arrive with the creator side of KYRO. Until then, creators apply to your campaigns."
              className="px-5 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold whitespace-nowrap opacity-50 cursor-not-allowed"
            >
              Invite to Campaign
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Campaigns Completed', value: c.stats.campaigns.toString(), icon: Award, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
            { label: 'Total Earnings', value: fmt(c.stats.totalEarned), icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
            { label: 'Avg ROAS for Brands', value: `${c.stats.avgRoasForBrands}x`, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
            { label: 'Orders Driven', value: c.stats.ordersDriven.toLocaleString(), icon: Target, color: 'text-pink-400', bg: 'bg-pink-400/10 border-pink-400/20' },
          ].map((s, i) => (
            <div key={i} className={`p-5 rounded-2xl border ${s.bg}`}>
              <s.icon size={20} className={s.color} />
              <p className="text-xs text-muted mt-3 mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Sample work */}
        <div>
          <h2 className="text-2xl font-bold text-heading mb-5">Sample Work</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {c.sampleWork.map((src, i) => (
              <div key={i} className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-surface border border-line group cursor-pointer">
                <img src={src} alt={`Sample ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent opacity-0 group-hover:opacity-100 transition" />
                <div className="absolute bottom-3 left-3 right-3 opacity-0 group-hover:opacity-100 transition">
                  <p className="text-xs text-body">For brand campaign</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Past brand collaborations */}
        <div>
          <h2 className="text-2xl font-bold text-heading mb-5">Brands worked with</h2>
          <div className="flex flex-wrap gap-3">
            {Object.values(BRANDS).slice(0, 4).map((b) => (
              <div key={b.id} className="flex items-center gap-2 px-3 py-2 bg-surface border border-line rounded-lg">
                <BrandLogo brandId={b.id as BrandId} size={24} />
                <span className="text-sm text-heading font-medium">{b.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   BRAND PUBLIC PROFILE
   ───────────────────────────────────────────────────────────── */
function BrandPublicProfile({ brandId, onBack }: { brandId: BrandId; onBack: () => void }) {
  const b = BRANDS[brandId];
  const campaigns = SEED_CAMPAIGNS.filter(c => c.brandId === brandId);
  return (
    <div className="min-h-screen bg-app">
      <div className="sticky top-0 z-40 backdrop-blur-md bg-app/80 border-b border-line px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto h-16 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-muted hover:text-heading transition">
            <ChevronLeft size={20} /> Back
          </button>
          <div className="flex items-center gap-2">
            <KyroLogo size={28} />
            <span className="text-lg font-bold bg-gradient-kyro bg-clip-text text-transparent tracking-tight">KYRO</span>
          </div>
          <button
            type="button"
            disabled
            title="Public profile links arrive with the brand profile build. There is no shareable URL yet."
            className="flex items-center gap-2 px-3 py-1.5 text-muted text-sm opacity-50 cursor-not-allowed"
          >
            <Share2 size={14} /> Share
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {/* Hero */}
        <div className={`relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br ${b.accent} p-8 md:p-12`}>
          <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start">
            <BrandLogo brandId={brandId} size={120} />
            <div className="flex-1 space-y-3">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold text-heading">{b.name}</h1>
                <p className="text-lg text-body mt-1">{b.tagline}</p>
              </div>
              <span className="inline-block px-3 py-1 bg-white/10 border border-white/20 rounded-full text-xs font-semibold text-heading">{b.category}</span>
            </div>
            <button
              type="button"
              disabled
              title="Applying to a brand arrives with the creator side of KYRO."
              className="px-5 py-2.5 bg-white text-slate-900 rounded-lg font-semibold whitespace-nowrap opacity-50 cursor-not-allowed"
            >
              Apply to work with us
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Active Campaigns', value: campaigns.filter(c => c.status === 'live').length.toString(), icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
            { label: 'Creators Engaged', value: campaigns.reduce((s, c) => s + c.creators, 0).toString(), icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
            { label: 'Lifetime Spend', value: fmt(campaigns.reduce((s, c) => s + c.spent, 0)), icon: DollarSign, color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
            { label: 'Avg ROAS', value: `${(campaigns.filter(c => c.roas > 0).reduce((s, c) => s + c.roas, 0) / Math.max(campaigns.filter(c => c.roas > 0).length, 1)).toFixed(1)}x`, icon: TrendingUp, color: 'text-pink-400', bg: 'bg-pink-400/10 border-pink-400/20' },
          ].map((s, i) => (
            <div key={i} className={`p-5 rounded-2xl border ${s.bg}`}>
              <s.icon size={20} className={s.color} />
              <p className="text-xs text-muted mt-3 mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Active campaigns */}
        <div>
          <h2 className="text-2xl font-bold text-heading mb-5">Open Campaigns</h2>
          <div className="grid md:grid-cols-2 gap-5">
            {campaigns.map((c) => (
              <div key={c.id} className="bg-surface border border-line rounded-2xl overflow-hidden hover:border-line transition">
                <img src={c.cover} alt={c.name} className="w-full h-40 object-cover" />
                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-heading">{c.name}</h3>
                    <StatusPill status={c.status} />
                  </div>
                  {c.status === 'live' && (
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div><p className="text-xs text-faint">Creators</p><p className="font-bold text-heading">{c.creators}</p></div>
                      <div><p className="text-xs text-faint">Conversions</p><p className="font-bold text-emerald-400">{c.conversions.toLocaleString()}</p></div>
                      <div><p className="text-xs text-faint">ROAS</p><p className="font-bold text-purple-400">{c.roas}x</p></div>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled
                    title="Applying to a campaign arrives with the creator side of KYRO."
                    className="w-full px-4 py-2 bg-gradient-kyro rounded-lg text-white text-sm font-semibold opacity-50 cursor-not-allowed"
                  >
                    Apply
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Creator roster */}
        <div>
          <h2 className="text-2xl font-bold text-heading mb-5">Creators in {b.name}'s roster</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.values(SEED_CREATORS).map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-4 bg-surface border border-line rounded-2xl hover:border-line transition">
                <img src={c.avatar} alt={c.name} className="w-12 h-12 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-heading font-semibold truncate">{c.name}</p>
                  <p className="text-xs text-muted truncate">{c.handle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ABOUT KYRO PAGE
   ───────────────────────────────────────────────────────────── */
function AboutPage({ onBack, onSignIn, onGetStarted }: { onBack: () => void; onSignIn: () => void; onGetStarted: () => void }) {
  return (
    <div className="min-h-screen bg-app">
      <div className="sticky top-0 z-40 backdrop-blur-md bg-app/80 border-b border-line px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto h-16 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-muted hover:text-heading transition">
            <ChevronLeft size={20} /> Back
          </button>
          <button onClick={onBack} className="flex items-center gap-2">
            <KyroLogo size={28} />
            <span className="text-lg font-bold bg-gradient-kyro bg-clip-text text-transparent tracking-tight">KYRO</span>
          </button>
          <button onClick={onSignIn} className="px-4 py-1.5 bg-gradient-kyro rounded-lg text-white text-sm font-semibold">Sign In</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 space-y-16">
        <div className="text-center space-y-5">
          <KyroLogo size={80} className="mx-auto" />
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight bg-gradient-kyro bg-clip-text text-transparent">About KYRO</h1>
          <p className="text-xl text-body max-w-2xl mx-auto leading-relaxed">
            We're building the operating system for creator programs — where brands and creators grow together, paid on real performance.
          </p>
        </div>

        <section className="space-y-5">
          <h2 className="text-3xl font-bold text-heading">Our mission</h2>
          <p className="text-lg text-body leading-relaxed">
            Creator marketing has always promised performance, and rarely delivered it. Flat fees, dark attribution, late invoices — the model was built for a media landscape that no longer exists. KYRO is what creator marketing looks like when you build it around the actual economics: creators earn from what their content actually drives, brands pay for outcomes, and a platform connects the two with the trust and transparency both sides need.
          </p>
          <p className="text-lg text-body leading-relaxed">
            KYRO is the creator growth portal for the next decade of consumer brands.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="text-3xl font-bold text-heading">How it works</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { num: '01', title: 'Brand creates a campaign', desc: 'Brands publish a brief, fund a campaign pool via Square, and define commission rules.' },
              { num: '02', title: 'Creators submit videos', desc: 'Approved creators upload short-form video, which becomes a distinct whitelisted ad on Meta.' },
              { num: '03', title: 'Performance pays out', desc: 'Real-time Meta Ads Insights track per-creator performance. Trolley auto-deposits payouts.' },
            ].map((s) => (
              <div key={s.num} className="p-6 bg-surface border border-line rounded-2xl space-y-3">
                <span className="text-3xl font-bold bg-gradient-kyro bg-clip-text text-transparent">{s.num}</span>
                <h3 className="text-xl font-bold text-heading">{s.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="text-3xl font-bold text-heading">Built for the creator economy</h2>
          <p className="text-lg text-body leading-relaxed">
            KYRO is built by a team obsessed with performance marketing — giving creators and the brands they love the tools to grow together, paid on real results.
          </p>
          <div className="flex flex-wrap gap-3 pt-3">
            <a href="mailto:chatwithkyro@gmail.com" className="flex items-center gap-2 px-4 py-2 bg-surface border border-line rounded-lg text-body hover:text-heading transition"><Mail size={16} /> chatwithkyro@gmail.com</a>
          </div>
        </section>

        <section className="text-center bg-surface border border-line rounded-3xl p-10 space-y-5">
          <h2 className="text-3xl font-bold text-heading">Ready to scale with KYRO?</h2>
          <p className="text-muted">Free to join. Brands and creators welcome.</p>
          <button onClick={onGetStarted} className="px-8 py-3 bg-gradient-kyro rounded-xl text-white font-semibold inline-flex items-center gap-2 hover:shadow-xl hover:shadow-purple-600/40 transition transform hover:scale-105">
            Get Started <ArrowRight size={18} />
          </button>
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ACCOUNT SETTINGS (stub)
   ───────────────────────────────────────────────────────────── */
/** One expandable row in Account Settings. */
function SettingsRow({
  label,
  sub,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  label: string;
  sub: string;
  icon: typeof Users;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full p-5 flex items-center gap-4 hover:bg-surface-2 transition text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center">
          <Icon size={18} className="text-body" />
        </div>
        <div className="flex-1">
          <p className="text-heading font-semibold">{label}</p>
          <p className="text-xs text-faint">{sub}</p>
        </div>
        <ChevronRight size={16} className={`text-faint transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5 pt-0 space-y-3">{children}</div>}
    </div>
  );
}

function ProfilePanel() {
  const session = useSession();
  const [name, setName] = useState(session.fullName ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { setName(session.fullName ?? ''); }, [session.fullName]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setMsg({ ok: false, text: 'Enter a name.' }); return; }
    if (!session.role) { setMsg({ ok: false, text: 'Your account has no role yet.' }); return; }
    setMsg(null);
    setSaving(true);
    const { error } = await saveMyProfile(session.role, trimmed);
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error.message || 'Could not save your name.' }); return; }
    await session.refresh();
    setMsg({ ok: true, text: 'Saved.' });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full px-4 py-2.5 bg-surface-2 border border-line rounded-lg text-heading placeholder-faint focus:outline-none focus:border-purple-500"
        />
        <p className="text-xs text-faint">This is the name KYRO greets you by and shows to the brands or creators you work with.</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted">Email</label>
        <input
          value={session.email ?? ''}
          readOnly
          className="w-full px-4 py-2.5 bg-surface-2/50 border border-line rounded-lg text-muted cursor-not-allowed"
        />
        <p className="text-xs text-faint">Your email is your sign-in. Write to chatwithkyro@gmail.com to change it.</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || name.trim() === (session.fullName ?? '')}
          className="px-4 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {saving && <RefreshCw size={14} className="animate-spin" />}
          Save
        </button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-pink-300'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

function SecurityPanel() {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setMsg(null);
    if (pw.length < 8) { setMsg({ ok: false, text: 'Use at least 8 characters.' }); return; }
    if (pw !== confirm) { setMsg({ ok: false, text: 'Those two passwords do not match.' }); return; }
    setSaving(true);
    const { error } = await updatePassword(pw);
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error }); return; }
    setPw(''); setConfirm('');
    setMsg({ ok: true, text: 'Password updated.' });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted">New password</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
          className="w-full px-4 py-2.5 bg-surface-2 border border-line rounded-lg text-heading focus:outline-none focus:border-purple-500"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted">Confirm new password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
          className="w-full px-4 py-2.5 bg-surface-2 border border-line rounded-lg text-heading focus:outline-none focus:border-purple-500"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !pw || !confirm}
          className="px-4 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {saving && <RefreshCw size={14} className="animate-spin" />}
          Update password
        </button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-pink-300'}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-faint">
        Two-factor authentication and a list of active sessions are not built yet. Changing your password here does not sign out your other devices.
      </p>
    </div>
  );
}

/**
 * Creator social accounts.
 *
 * Instagram is required and TikTok is not, and the reason is mechanical
 * rather than editorial: Meta partnership ads publish under the creator's own
 * handle, so a brand cannot run the ad without it. TikTok is portfolio
 * context; KYRO is Meta plus Shopify and TikTok Shop is a different product.
 */
function CreatorSocialsPanel() {
  const session = useSession();
  const creator = session.creator;
  const strip = (v: string | undefined) => (v ?? '').replace(/^@+/, '');

  const [ig, setIg] = useState(strip(creator?.social?.instagram?.handle));
  const [tt, setTt] = useState(strip(creator?.social?.tiktok?.handle));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setIg(strip(creator?.social?.instagram?.handle));
    setTt(strip(creator?.social?.tiktok?.handle));
  }, [creator?.social?.instagram?.handle, creator?.social?.tiktok?.handle]);

  if (!creator) return <p className="text-sm text-muted">No creator profile on this account yet.</p>;

  const save = async () => {
    setMsg(null);
    setSaving(true);
    const res = await saveCreatorSocials(creator.id, { instagram: ig, tiktok: tt });
    setSaving(false);
    if (res.error) { setMsg({ ok: false, text: res.error }); return; }
    await session.refresh();
    setMsg({ ok: true, text: 'Saved.' });
  };

  const field = "w-full pl-7 pr-3 py-2 bg-surface-2 border border-line rounded-lg text-heading placeholder-faint focus:outline-none focus:border-purple-500";

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted">
          Instagram <span className="text-pink-300">· required</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2 text-muted">@</span>
          <input value={ig} onChange={(e) => setIg(e.target.value.replace(/^@+/, ''))} placeholder="yourhandle" className={field} autoComplete="off" />
        </div>
        <p className="text-xs text-faint leading-relaxed">
          Partnership ads publish under your handle, so a brand cannot run your video without this.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted">TikTok · optional</label>
        <div className="relative">
          <span className="absolute left-3 top-2 text-muted">@</span>
          <input value={tt} onChange={(e) => setTt(e.target.value.replace(/^@+/, ''))} placeholder="yourhandle" className={field} autoComplete="off" />
        </div>
        <p className="text-xs text-faint">Context for brands reviewing you. KYRO does not run TikTok ads.</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !ig.trim()}
          className="px-4 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {saving && <RefreshCw size={14} className="animate-spin" />}
          Save
        </button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-pink-300'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

/** One switch, on the address the account was registered with. */
function NotificationsPanel() {
  const session = useSession();
  const [on, setOn] = useState(session.notifyEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setOn(session.notifyEmail); }, [session.notifyEmail]);

  const toggle = async () => {
    if (!session.userId) return;
    const next = !on;
    setOn(next);           // optimistic: a switch that lags feels broken
    setError(null);
    setSaving(true);
    const res = await setEmailNotifications(session.userId, next);
    setSaving(false);
    if (res.error) { setOn(!next); setError(res.error); return; }
    await session.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-line bg-surface-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-heading">Email me about activity</p>
          <p className="text-xs text-faint truncate">{session.email ?? 'your account email'}</p>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={saving}
          role="switch"
          aria-checked={on}
          className={`relative w-11 h-6 rounded-full transition flex-shrink-0 disabled:opacity-60 ${on ? 'bg-gradient-kyro' : 'bg-line'}`}
        >
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-1'}`} />
        </button>
      </div>

      {error && <p className="text-xs text-pink-300">{error}</p>}

      <p className="text-xs text-faint leading-relaxed">
        Goes to the address you registered with, which is the only one KYRO can prove you control.
        Covers a brand answering your video, a creator applying to your campaign, and payouts.
      </p>
      <p className="text-xs text-faint leading-relaxed">
        Password resets and security email always send. Those are not optional.
      </p>
    </div>
  );
}

/** What the creator has on file, summarised. Editing lives on Payouts. */
function CreatorPaymentSummary() {
  const session = useSession();
  const creator = session.creator;
  if (!creator) return <p className="text-sm text-muted">No creator profile on this account yet.</p>;

  const bank = creator.payoutBankLast4;
  const taxDone = creator.taxFormStatus === 'complete';

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl border border-line bg-surface-2 space-y-1">
        <p className="text-xs text-faint">Payout account</p>
        {bank ? (
          <>
            <p className="text-sm font-semibold text-heading tabular-nums">
              ···· ···· ···· {bank}
            </p>
            <p className="text-xs text-muted">
              {creator.payoutBankName || 'Bank account'}
              {creator.payoutMethod ? ` · ${creator.payoutMethod === 'wire' ? 'Wire' : 'ACH'}` : ''}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Nothing on file yet.</p>
        )}
      </div>

      <div className="p-4 rounded-xl border border-line bg-surface-2 space-y-1">
        <p className="text-xs text-faint">Tax info</p>
        <p className={`text-sm font-semibold ${taxDone ? 'text-emerald-400' : 'text-amber-300'}`}>
          {taxDone ? 'On file' : creator.taxFormStatus === 'pending' ? 'In review' : 'Needed'}
        </p>
        {creator.taxFormSubmittedAt && (
          <p className="text-xs text-muted">
            Submitted {new Date(creator.taxFormSubmittedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      <p className="text-xs text-faint">
        Change either of these on the Payouts tab of your dashboard, where the full forms live.
      </p>
    </div>
  );
}

function ConnectedAccountsPanel() {
  const session = useSession();
  const brandId = session.brand?.id ?? null;
  const [rows, setRows] = useState<BrandConnection[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!brandId) { setRows([]); return; }
    const res = await listConnections(brandId);
    setRows(res.data);
    setError(res.error);
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  const drop = async (provider: 'meta' | 'shopify') => {
    if (!brandId) return;
    setBusy(provider);
    const res = await disconnectProvider(brandId, provider);
    setBusy(null);
    if (res.error) { setError(res.error); return; }
    await load();
  };

  if (session.role === 'creator') return <CreatorSocialsPanel />;

  if (!brandId) {
    return <p className="text-sm text-muted">No brand workspace on this account yet.</p>;
  }

  const active = (rows ?? []).filter((c) => c.status === 'active');

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-pink-300">{error}</p>}
      {rows === null && <p className="text-sm text-muted">Loading…</p>}
      {rows !== null && active.length === 0 && (
        <p className="text-sm text-muted">
          Nothing connected. Connect Meta and Shopify from the setup card on your dashboard.
        </p>
      )}
      {active.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line bg-surface-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-heading capitalize">{c.provider}</p>
            <p className="text-xs text-faint truncate">{c.externalId}</p>
          </div>
          <button
            type="button"
            onClick={() => void drop(c.provider)}
            disabled={busy === c.provider}
            className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-muted hover:text-heading disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            {busy === c.provider && <RefreshCw size={12} className="animate-spin" />}
            Disconnect
          </button>
        </div>
      ))}
      <p className="text-xs text-faint">
        Disconnecting stops KYRO reading new data from that account. It does not delete orders already attributed, because creators are still owed commission on them.
      </p>
    </div>
  );
}

/**
 * Brand billing.
 *
 * ACH is a real form. The card deposit is not, and cannot be built here: a
 * card number must be tokenised inside the payment processor's own hosted
 * field so it never touches KYRO's server. Building a card input that posts
 * to our API would drag this codebase into PCI scope and gain nothing,
 * because there is no processor to charge it with yet.
 */
function BrandBillingPanel() {
  const [editing, setEditing] = useState(false);
  const [holder, setHolder] = useState('');
  const [bank, setBank] = useState('');
  const [routing, setRouting] = useState('');
  const [account, setAccount] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = "w-full px-3 py-2 bg-surface-2 border border-line rounded-lg text-heading placeholder-faint focus:outline-none focus:border-purple-500";

  const save = async () => {
    setError(null);
    if (account !== confirm) { setError('The two account numbers do not match.'); return; }
    setSaving(true);
    const res = await saveBrandBankAccount({
      accountHolder: holder, bankName: bank, routingNumber: routing, accountNumber: account,
    });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setRouting(''); setAccount(''); setConfirm('');
    setSaved(res.accountLast4);
    setEditing(false);
  };

  return (
    <div className="space-y-4">
      {/* ACH */}
      <div className="p-4 rounded-xl border border-line bg-surface-2 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-heading">Bank account for commission</p>
            <p className="text-xs text-faint">Creator commission on attributed orders, plus KYRO's 1%, billed by ACH. There is no ad budget to fund and no deposit to hold.</p>
          </div>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-purple-400 hover:text-purple-300 whitespace-nowrap">
              {saved ? 'Change' : 'Add account'}
            </button>
          )}
        </div>

        {!editing && saved && (
          <p className="text-sm text-heading tabular-nums">•••• •••• •••• {saved}{bank ? ` · ${bank}` : ''}</p>
        )}

        {editing && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Name on the account</label>
              <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Legal business name" className={field} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Bank name</label>
              <input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Chase" className={field} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Routing number (9 digits)</label>
              <input value={routing} onChange={(e) => setRouting(e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" autoComplete="off" className={`${field} tabular-nums`} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Account number</label>
              <input type="password" value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, '').slice(0, 17))} inputMode="numeric" autoComplete="off" className={`${field} tabular-nums`} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Confirm account number</label>
              <input value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 17))} inputMode="numeric" autoComplete="off" className={`${field} tabular-nums`} />
            </div>
            {error && <p className="text-xs text-pink-300">{error}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !holder || !routing || !account || !confirm}
                className="px-4 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {saving && <RefreshCw size={14} className="animate-spin" />}
                Save account
              </button>
              <button type="button" onClick={() => { setEditing(false); setError(null); setRouting(''); setAccount(''); setConfirm(''); }} className="px-4 py-2 rounded-lg border border-line text-sm text-muted hover:text-heading">
                Cancel
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-faint leading-relaxed">
          Your account number is encrypted before storage and is never sent back to your browser. Only the last four are shown.
        </p>
      </div>

    </div>
  );
}

function AccountSettings({ onBack, role }: { onBack: () => void; role: Role }) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (key: string) => setOpen((cur) => (cur === key ? null : key));

  return (
    <div className="min-h-screen bg-app">
      <div className="sticky top-0 z-40 backdrop-blur-md bg-app/80 border-b border-line px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto h-16 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-muted hover:text-heading transition">
            <ChevronLeft size={20} /> Back to dashboard
          </button>
          <div className="flex items-center gap-2">
            <KyroLogo size={28} />
            <span className="text-lg font-bold bg-gradient-kyro bg-clip-text text-transparent tracking-tight">KYRO</span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-heading">Account Settings</h1>
          <p className="text-muted mt-1">Manage your profile, payment, and notifications.</p>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center">
                <Sun size={18} className="text-body" />
              </div>
              <div>
                <p className="text-heading font-semibold">Appearance</p>
                <p className="text-xs text-faint">Choose how KYRO looks. Applies across the whole app.</p>
              </div>
            </div>
            <ThemeSegmented />
          </div>
        </div>

        <div className="bg-surface border border-line rounded-2xl divide-y divide-line overflow-hidden">
          <SettingsRow label="Profile" sub="Name and email" icon={Users} open={open === 'profile'} onToggle={() => toggle('profile')}>
            <ProfilePanel />
          </SettingsRow>

          <SettingsRow
            label="Payment Method"
            sub={role === 'creator' ? 'Payout account' : 'Commission billing'}
            icon={Wallet}
            open={open === 'payment'}
            onToggle={() => toggle('payment')}
          >
            {role === 'creator' ? <CreatorPaymentSummary /> : <BrandBillingPanel />}
          </SettingsRow>

          <SettingsRow label="Notifications" sub="Email on activity" icon={Bell} open={open === 'notifications'} onToggle={() => toggle('notifications')}>
            <NotificationsPanel />
          </SettingsRow>

          <SettingsRow label="Connected Accounts" sub={role === 'creator' ? 'Instagram and TikTok' : 'Meta and Shopify'} icon={Heart} open={open === 'connected'} onToggle={() => toggle('connected')}>
            <ConnectedAccountsPanel />
          </SettingsRow>

          <SettingsRow label="Security" sub="Password" icon={ShieldCheck} open={open === 'security'} onToggle={() => toggle('security')}>
            <SecurityPanel />
          </SettingsRow>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ROOT APP
   ───────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────
   LEGAL PAGES — /privacy and /terms
   Rendered from the markdown in docs/legal/, so the published page and the
   document counsel reviews can never drift apart.
   ───────────────────────────────────────────────────────────── */
function LegalPage({ doc, onBack, onOther }: { doc: 'privacy' | 'terms'; onBack: () => void; onOther: () => void }) {
  const source = doc === 'privacy' ? PRIVACY_POLICY_MD : TERMS_OF_SERVICE_MD;
  useEffect(() => { window.scrollTo(0, 0); }, [doc]);
  return (
    <div className="min-h-screen bg-app">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-app/85 border-b border-line">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button onClick={onBack} className="flex items-center gap-2.5">
            <KyroLogo size={30} />
            <span className="text-lg font-bold bg-gradient-kyro bg-clip-text text-transparent tracking-tight">KYRO</span>
          </button>
          <div className="flex items-center gap-5 text-sm">
            <button onClick={onOther} className="text-muted hover:text-heading transition">
              {doc === 'privacy' ? 'Terms of Service' : 'Privacy Policy'}
            </button>
            <button onClick={onBack} className="flex items-center gap-1.5 text-muted hover:text-heading transition">
              <ChevronLeft size={16} /> Home
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-14">
        <Markdown source={source} />
        <div className="mt-16 pt-8 border-t border-line flex flex-wrap items-center justify-between gap-4">
          <p className="text-faint text-xs">Kyvo LLC · 131 Continental Drive, Suite 305, Newark, DE 19713</p>
          <a href="mailto:chatwithkyro@gmail.com" className="text-sm text-purple-400 hover:text-purple-300">chatwithkyro@gmail.com</a>
        </div>
      </main>
    </div>
  );
}

type View =
  | 'landing'
  | 'signin'
  | 'signup'
  | 'forgot'
  | 'reset-password'
  | 'privacy'
  | 'terms'
  | 'onboard'
  | 'app'
  | 'about'
  | 'creator-profile'
  | 'brand-profile'
  | 'affiliate-orders'
  | 'invite'
  | 'settings';

/** The token from /join/<token>, or null. Module level so the router and the
 *  page read it the same way. */
function inviteTokenFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.pathname.match(/^\/join\/([A-Za-z0-9_-]{10,64})\/?$/);
  return m ? m[1] : null;
}

function readRoute(): { view: View; admin: boolean } {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '/admin') return { view: 'signin', admin: true };
    if (path === '/signin' || path === '/login') return { view: 'signin', admin: false };
    if (path === '/signup' || path === '/join') return { view: 'signup', admin: false };
    if (path === '/forgot-password') return { view: 'forgot', admin: false };
    if (path === '/privacy' || path === '/privacy-policy') return { view: 'privacy', admin: false };
    if (path === '/terms' || path === '/terms-of-service') return { view: 'terms', admin: false };
    // Supabase sends password-reset links back here with a token in the hash.
    if (path === '/reset-password') return { view: 'reset-password', admin: false };
    if (path === '/orders') return { view: 'affiliate-orders', admin: false };
    if (inviteTokenFromPath()) return { view: 'invite', admin: false };
  }
  return { view: 'landing', admin: false };
}

/** Shown while the persisted Supabase session is being rehydrated. */
function BootScreen() {
  return (
    <div className="min-h-screen bg-app flex flex-col items-center justify-center gap-4">
      <KyroLogo size={44} />
      <div className="flex items-center gap-2 text-sm text-muted">
        <RefreshCw size={14} className="animate-spin" />
        <span>Loading your workspace…</span>
      </div>
    </div>
  );
}

function App() {
  const initial = readRoute();
  const session = useSession();
  const [view, setView] = useState<View>(initial.view);
  const [adminEntry, setAdminEntry] = useState(initial.admin);
  const [role, setRole] = useState<Role>(initial.admin ? 'admin' : 'brand');
  const [profileCreatorId, setProfileCreatorId] = useState<CreatorId>('maya');
  // The public brand page is still reachable by route; nothing inside the app
  // links to it now that the creator dashboard reads from the database.
  const [profileBrandId] = useState<BrandId>('boldbuns');
  const [restored, setRestored] = useState(false);

  // Keep in sync with browser back/forward
  useEffect(() => {
    const onPop = () => {
      const r = readRoute();
      setAdminEntry(r.admin);
      setView(r.view);
      if (r.admin) setRole('admin');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const nav = (path: string) => { try { window.history.pushState({}, '', path); } catch { /* noop */ } };

  /**
   * Session restore. Supabase keeps the session in localStorage, so a signed-in
   * user who reloads should land back in their dashboard rather than on the
   * marketing page. Runs once, and only from a public entry point.
   *
   * Note the deliberate omission of 'reset-password': clicking a reset link
   * creates a live session, and restoring off that would skip the user past the
   * screen where they actually set the new password.
   */
  useEffect(() => {
    if (!session.ready || restored) return;
    setRestored(true);
    if (!session.userId) return;
    if (view !== 'landing' && view !== 'signin' && view !== 'signup') return;
    if (inviteTokenFromPath()) return;
    if (session.role) {
      setRole(session.role as Role);
      setView('app');
      nav(session.role === 'admin' ? '/admin' : '/');
    } else {
      setView('onboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.ready, session.userId, session.role, restored]);

  /**
   * /orders belongs to a creator. Anyone else who lands on it — a signed-out
   * visitor with the link, a brand account, a refresh that outran the session
   * restore — gets moved on once we actually know who they are, rather than
   * being left on a page with nothing to show.
   */
  useEffect(() => {
    if (view !== 'affiliate-orders') return;
    if (!session.ready || session.workspaceLoading || session.creator) return;
    setView(session.userId ? 'app' : 'landing');
    nav('/');
  }, [view, session.ready, session.workspaceLoading, session.creator, session.userId]);

  const goSignIn = (admin: boolean) => { setAdminEntry(admin); setView('signin'); nav(admin ? '/admin' : '/signin'); };
  const goSignUp = () => { setAdminEntry(false); setView('signup'); nav('/signup'); };
  const goLanding = () => { setView('landing'); nav('/'); };
  const goForgot = () => { setView('forgot'); nav('/forgot-password'); };
  const goLegal = (d: 'privacy' | 'terms') => { setView(d); nav('/' + d); };

  /** Real sign-out: end the Supabase session, not just navigate away. */
  const doSignOut = async () => {
    try { await session.signOut(); } catch { /* already signed out */ }
    setRole('brand');
    setAdminEntry(false);
    setView('landing');
    nav('/');
  };

  /** Called by <SignIn> once Supabase has accepted the password. */
  const handleSignedIn = async () => {
    if (adminEntry) {
      // Demo mode (no Supabase keys) → allow, so the admin dashboard is viewable.
      if (!isSupabaseConfigured()) { setRole('admin'); setView('app'); nav('/admin'); return; }

      let adminProfile = null;
      try { adminProfile = await getMyProfile(); } catch { adminProfile = null; }
      if (adminProfile && adminProfile.role === 'admin') {
        await session.refresh();
        setRole('admin'); setView('app'); nav('/admin');
        return;
      }
      // Correct password, wrong privileges. Don't leave them holding a session
      // on the admin route — drop it, then surface the refusal.
      try { await session.signOut(); } catch { /* noop */ }
      throw new Error("This account doesn't have admin access.");
    }

    let profile: Awaited<ReturnType<typeof getMyProfile>> = null;
    try { profile = await getMyProfile(); } catch { profile = null; }

    if (profile && profile.role) {
      await session.refresh();
      setRole(profile.role as Role);
      setView('app');
      nav('/');
      return;
    }
    if (profile && !profile.role) {
      // Signed in, but never picked a role (e.g. an account from the old OTP flow).
      setView('onboard');
      return;
    }

    // profile === null → demo mode / no Supabase: preserve demo behavior.
    setView('app');
    nav('/');
  };

  /** Called by <SignUp> after the account and profile row are created. */
  const handleSignedUp = async (r: Role) => {
    await session.refresh();
    setRole(r);
    setView('app');
    nav('/');
  };

  /** Called by <ResetPassword> once the new password is saved. */
  const handlePasswordReset = async () => {
    await session.refresh();
    let profile: Awaited<ReturnType<typeof getMyProfile>> = null;
    try { profile = await getMyProfile(); } catch { profile = null; }
    if (profile && profile.role) {
      setRole(profile.role as Role);
      setView('app');
      nav('/');
    } else {
      setView('onboard');
      nav('/');
    }
  };

  const finishOnboarding = async (r: Role) => {
    await session.adoptRole(r);
    setRole(r);
    setView('app');
    nav('/');
  };

  // Hold the first paint until we know whether someone is signed in — otherwise
  // a returning user sees the marketing page flash before their dashboard.
  if (!session.ready) return <BootScreen />;

  if (view === 'invite') {
    const token = inviteTokenFromPath();
    if (token) {
      return (
        <InviteLanding
          token={token}
          signedInCreator={Boolean(session.creator)}
          onSignUp={() => { setView('signup'); nav('/signup'); }}
          onJoined={() => { setRole('creator'); setView('app'); nav('/'); }}
        />
      );
    }
  }

  if (view === 'landing') return <Landing onSignIn={() => goSignIn(false)} onGetStarted={goSignUp} onAbout={() => setView('about')} onLegal={goLegal} />;
  if (view === 'privacy') return <LegalPage doc="privacy" onBack={goLanding} onOther={() => goLegal('terms')} />;
  if (view === 'terms') return <LegalPage doc="terms" onBack={goLanding} onOther={() => goLegal('privacy')} />;
  if (view === 'signin') return (
    <SignIn
      mode={adminEntry ? 'admin' : 'signin'}
      onDone={handleSignedIn}
      onBack={goLanding}
      onForgot={goForgot}
      onGoSignUp={goSignUp}
    />
  );
  if (view === 'signup') return <SignUp onDone={handleSignedUp} onBack={goLanding} onGoSignIn={() => goSignIn(false)} />;
  if (view === 'forgot') return <ForgotPassword onBack={goLanding} onGoSignIn={() => goSignIn(false)} />;
  if (view === 'reset-password') return (
    <ResetPassword onDone={handlePasswordReset} onBack={goLanding} onGoSignIn={() => goSignIn(false)} />
  );
  if (view === 'onboard') return (
    <RolePicker
      roles={['brand', 'creator']}
      heading="Welcome to KYRO"
      sub="One last step — how will you use KYRO?"
      badge="Set up"
      cta="Continue"
      onPick={finishOnboarding}
      onBack={goLanding}
    />
  );
  if (view === 'about') return <AboutPage onBack={goLanding} onSignIn={() => goSignIn(false)} onGetStarted={goSignUp} />;
  if (view === 'creator-profile') return <CreatorPublicProfile creatorId={profileCreatorId} onBack={() => setView('app')} />;
  if (view === 'brand-profile') return <BrandPublicProfile brandId={profileBrandId} onBack={() => setView('app')} />;
  if (view === 'settings') return <AccountSettings onBack={() => setView('app')} role={role} />;
  if (view === 'affiliate-orders') {
    if (session.creator) {
      return (
        <AffiliateOrdersPage
          creatorId={session.creator.id}
          onBack={() => { setView('app'); nav('/'); }}
        />
      );
    }
    // Reached by refreshing or by a direct link, before the session has come
    // back. The effect above sends anyone without a creator workspace
    // somewhere that makes sense; until then this is a loading state, not an
    // empty page.
    return <BootScreen />;
  }

  // The "Demo as" switcher is for exploring the demo. A real signed-in brand or
  // creator shouldn't be able to flip into someone else's portal; admins keep it.
  const showDemoSwitch = !session.configured || !session.userId || session.role === 'admin';

  return (
    <AppShell role={role} onSwitch={setRole} onSignOut={() => void doSignOut()} onSettings={() => setView('settings')} showDemoSwitch={showDemoSwitch}>
      {role === 'brand' && <BrandDashboard />}
      {role === 'creator' && (
        <CreatorDashboard onViewOrders={() => { setView('affiliate-orders'); nav('/orders'); }} />
      )}
      {role === 'admin' && <AdminDashboard onViewCreator={(id) => { setProfileCreatorId(id); setView('creator-profile'); }} />}
    </AppShell>
  );
}

export default App;

/**
 * Brand profile, editable.
 *
 * The same fields the setup wizard collected, so a brand can change what
 * creators see without going back through onboarding. Writes through the same
 * function, which already marks setup complete — harmless here, since it
 * already is.
 */
function BrandProfilePanel({ brandId, onSaved }: { brandId: string; onSaved: () => void }) {
  const { brand } = useSession();
  const [name, setName] = useState(brand?.name ?? '');
  const [website, setWebsite] = useState(brand?.websiteUrl ?? '');
  const [description, setDescription] = useState(brand?.description ?? '');
  const [currency, setCurrency] = useState(brand?.currency ?? 'USD');
  const [businessType, setBusinessType] = useState(brand?.businessType ?? '');
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!logo) { setLogoPreview(null); return; }
    const url = URL.createObjectURL(logo);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  const save = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);

    let logoUrl: string | null = null;
    if (logo) {
      const up = await uploadBrandLogo(brandId, logo);
      if (up.error || !up.url) {
        setSaving(false);
        setError(up.error ?? 'The logo did not upload.');
        return;
      }
      logoUrl = up.url;
    }

    const res = await completeBrandSetup(brandId, {
      name, websiteUrl: website, businessType, description, currency, logoUrl,
    });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setLogo(null);
    setSaved(true);
    onSaved();
  };

  const field =
    'w-full px-4 py-2.5 bg-surface-2 border border-line rounded-lg text-heading placeholder-faint focus:outline-none focus:border-purple-500';

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line">
        <h2 className="text-lg font-bold text-heading">Brand profile</h2>
        <p className="text-sm text-muted mt-0.5">What creators see when they browse and apply.</p>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => logoInput.current?.click()}
            className="w-16 h-16 rounded-xl border border-line bg-surface-2 overflow-hidden flex items-center justify-center text-muted hover:text-heading flex-shrink-0"
          >
            {logoPreview || brand?.logoUrl ? (
              <img src={logoPreview ?? brand?.logoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImagePlus size={18} />
            )}
          </button>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => logoInput.current?.click()}
              className="px-3 py-1.5 rounded-lg border border-line bg-surface-2 text-xs font-semibold text-muted hover:text-heading"
            >
              {brand?.logoUrl ? 'Change logo' : 'Add logo'}
            </button>
            <p className="text-xs text-faint">Square, JPG PNG or WebP, up to 5 MB.</p>
          </div>
          <input
            ref={logoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { setLogo(e.target.files?.[0] ?? null); e.target.value = ''; }}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="bp-name" className="text-xs font-semibold text-muted">Brand name</label>
            <input id="bp-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bp-site" className="text-xs font-semibold text-muted">Website</label>
            <input
              id="bp-site"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourbrand.com"
              autoCapitalize="none"
              autoCorrect="off"
              className={field}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="bp-desc" className="text-xs font-semibold text-muted">Description</label>
          <textarea
            id="bp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 200))}
            rows={3}
            placeholder="What you sell, and who for."
            className={`${field} resize-none`}
          />
          <p className="text-xs text-faint">{description.length}/200</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="bp-type" className="text-xs font-semibold text-muted">Business type</label>
            <select id="bp-type" value={businessType} onChange={(e) => setBusinessType(e.target.value)} className={field}>
              <option value="">Not set</option>
              <option value="ecommerce">E-Commerce</option>
              <option value="mobile_app">Mobile App</option>
              <option value="saas">SaaS</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bp-cur" className="text-xs font-semibold text-muted">Store currency</label>
            <select id="bp-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
              {['USD', 'CAD', 'GBP', 'EUR', 'AUD'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="text-xs text-faint">Payouts settle in USD.</p>
          </div>
        </div>

        {error && <p className="text-sm text-pink-300">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold text-sm disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <RefreshCw size={14} className="animate-spin" />}
            Save changes
          </button>
          {saved && <span className="text-sm text-emerald-400 inline-flex items-center gap-1.5"><CheckCircle size={14} /> Saved</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * A brand's creators, ranked.
 *
 * Ranked by revenue driven, not by video count — posting a lot is not the
 * same as selling. But the video counts are shown alongside, because a
 * creator sending work that is not converting is a conversation the brand
 * should have rather than a row that quietly disappears.
 */
function BrandLeaderboard({
  brandId,
  onOpenCreator,
}: {
  brandId: string;
  onOpenCreator: (c: LeaderboardCreator) => void;
}) {
  const [rows, setRows] = useState<LeaderboardCreator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const res = await listBrandLeaderboard(brandId, 30);
    setRows(res.data);
    setError(res.error);
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  const shown = showAll ? (rows ?? []) : (rows ?? []).slice(0, 5);

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-line">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-amber-400" />
          <h2 className="text-xl font-bold text-heading">Your creators</h2>
          <span className="text-xs text-faint ml-2">Last 30 days</span>
        </div>
        {rows !== null && rows.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-muted hover:text-heading"
          >
            {showAll ? 'Show less' : `View all ${rows.length}`}
          </button>
        )}
      </div>

      {error && <p className="p-5 text-sm text-pink-300">{error}</p>}
      {rows === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}

      {rows !== null && rows.length === 0 && (
        <div className="p-10 text-center">
          <Trophy size={28} className="mx-auto text-faint mb-3" />
          <p className="text-sm text-muted">No creators yet.</p>
          <p className="text-xs text-faint mt-1">
            They appear here as soon as they send you a video, ranked once orders start landing.
          </p>
        </div>
      )}

      {shown.length > 0 && (
        <div className="divide-y divide-line">
          {shown.map((c, i) => (
            <button
              key={c.creatorId}
              type="button"
              onClick={() => onOpenCreator(c)}
              className="w-full p-4 flex items-center gap-4 text-left hover:bg-surface-2 transition"
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm flex-shrink-0 ${
                  c.revenueCents > 0
                    ? 'bg-gradient-kyro text-white'
                    : 'bg-surface-2 border border-line text-faint'
                }`}
              >
                {i + 1}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-heading truncate">@{stripAt(c.handle)}</p>
                <p className="text-xs text-muted">
                  {plural(c.submissions, 'video')}
                  {c.inUse > 0 && <span className="text-emerald-400"> · {c.inUse} in use</span>}
                  {c.submissions > 0 && c.inUse === 0 && (
                    <span className="text-faint"> · none running yet</span>
                  )}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 text-right">
                <div>
                  <p className="text-xs text-faint">Orders</p>
                  <p className="text-sm font-bold text-emerald-400 tabular-nums">{c.orders}</p>
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs text-faint">Revenue</p>
                  <p className="text-sm font-bold text-heading tabular-nums">
                    {fmt(centsToDollars(c.revenueCents))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-faint">You owe</p>
                  <p className="text-sm font-bold text-blue-400 tabular-nums">
                    {fmt(centsToDollars(c.commissionCents))}
                  </p>
                </div>
              </div>
              <ChevronRight size={16} className="text-faint flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
