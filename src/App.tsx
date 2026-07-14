import {
  Menu, X, ArrowRight, Star, TrendingUp, Zap, DollarSign,
  CheckCircle, Clock, Briefcase, Camera, Shield, ChevronRight,
  Plus, Upload, Eye, Users, Wallet, FileVideo, AlertCircle, Activity,
  Sparkles, Bell, LogOut, Filter, Search, ExternalLink, Award, Target,
  ArrowUpRight, RefreshCw, MessageSquare, Globe, Mail, Trophy, Hash,
  Instagram, Youtube, ShieldCheck, Cpu, Layers, Heart,
  ChevronLeft, Share2, Sun, Moon, BarChart3, PieChart, Calendar, ArrowDownRight
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { mockApi } from './lib/api';
import { useTheme } from './lib/theme';
import { sendEmailOtp, verifyEmailOtp, getMyProfile, saveMyProfile, isSupabaseConfigured } from './lib/supabase';

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
  return (
    <div className="flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-lg">
      {opts.map(({ val, Icon, label }) => (
        <button
          key={val}
          onClick={() => setTheme(val)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition ${theme === val ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'}`}
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

const SEED_CREATOR_SUBMISSIONS = [
  {
    id: 's1',
    campaignId: 'c1',
    brandId: 'boldbuns' as BrandId,
    status: 'live',
    earnings: 1840,
    pending: 320,
    impressions: 68400,
    spend: 1840,
    orders: 124,
    submittedAt: '6 days ago',
    aiTags: ['Problem/Solution', 'Gen-Z', 'Activewear'],
    thumb: 'https://images.pexels.com/photos/2294353/pexels-photo-2294353.jpeg?auto=compress&cs=tinysrgb&w=300',
  },
  {
    id: 's2',
    campaignId: 'c3',
    brandId: 'jaje' as BrandId,
    status: 'live',
    earnings: 980,
    pending: 180,
    impressions: 41200,
    spend: 980,
    orders: 62,
    submittedAt: '3 days ago',
    aiTags: ['Unboxing', 'Wellness', 'Routine'],
    thumb: 'https://images.pexels.com/photos/1183266/pexels-photo-1183266.jpeg?auto=compress&cs=tinysrgb&w=300',
  },
  {
    id: 's3',
    campaignId: 'c2',
    brandId: 'fuel' as BrandId,
    status: 'in_review',
    earnings: 0,
    pending: 0,
    impressions: 0,
    spend: 0,
    orders: 0,
    submittedAt: '8 hours ago',
    aiTags: ['Testimonial', 'Fitness'],
    thumb: 'https://images.pexels.com/photos/1239288/pexels-photo-1239288.jpeg?auto=compress&cs=tinysrgb&w=300',
  },
];

const SEED_MARKETPLACE = [
  {
    id: 'm1',
    name: 'NS — Honey Drop',
    brandId: 'ns' as BrandId,
    budget: 8000,
    commission: '15% of ad spend',
    deliverable: '1 vertical video, 15–30s',
    deadline: 'Apply by Jun 22',
    tags: ['Wellness', 'F&B'],
  },
  {
    id: 'm2',
    name: 'Fuel — Recovery Wear',
    brandId: 'fuel' as BrandId,
    budget: 22000,
    commission: '$8 per conversion',
    deliverable: '2 videos, gym setting',
    deadline: 'Apply by Jun 25',
    tags: ['Fitness', 'Apparel'],
  },
  {
    id: 'm3',
    name: 'Lebanta — Capsule Drop',
    brandId: 'lebanta' as BrandId,
    budget: 15000,
    commission: '12% of ad spend + $5/conv',
    deliverable: 'Day-in-the-life 30s',
    deadline: 'Apply by Jun 28',
    tags: ['Apparel', 'Lifestyle'],
  },
];

const SEED_PAYOUTS = [
  { id: 'p1', date: 'Jun 1, 2026', amount: 2640, status: 'paid', method: 'Trolley · ACH', period: 'May 15–31' },
  { id: 'p2', date: 'May 15, 2026', amount: 1980, status: 'paid', method: 'Trolley · ACH', period: 'May 1–14' },
  { id: 'p3', date: 'May 1, 2026', amount: 2120, status: 'paid', method: 'Trolley · ACH', period: 'Apr 15–30' },
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

/* ─────────────────────────────────────────────────────────────
   LANDING PAGE
   ───────────────────────────────────────────────────────────── */
function Landing({ onSignIn, onGetStarted, onAbout }: { onSignIn: () => void; onGetStarted: () => void; onAbout: () => void }) {
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
            <a href="#creators" className="text-body hover:text-heading transition-colors">For Creators</a>
            <a href="#brands" className="text-body hover:text-heading transition-colors">For Brands</a>
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
            <a href="#creators" className="block py-2.5 text-body hover:text-heading font-medium">For Creators</a>
            <a href="#brands" className="block py-2.5 text-body hover:text-heading font-medium">For Brands</a>
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
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-line">
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
            <div><h4 className="text-heading font-semibold mb-4">Platform</h4><ul className="space-y-2 text-muted text-sm"><li><a href="#creators" className="hover:text-heading transition">For Creators</a></li><li><a href="#brands" className="hover:text-heading transition">For Brands</a></li><li><a href="#how-it-works" className="hover:text-heading transition">How it Works</a></li></ul></div>
            <div><h4 className="text-heading font-semibold mb-4">Company</h4><ul className="space-y-2 text-muted text-sm"><li><button onClick={onAbout} className="hover:text-heading transition">About</button></li><li><a href="#" className="hover:text-heading transition">Blog</a></li><li><a href="#" className="hover:text-heading transition">Careers</a></li></ul></div>
            <div><h4 className="text-heading font-semibold mb-4">Legal</h4><ul className="space-y-2 text-muted text-sm"><li><a href="#" className="hover:text-heading transition">Privacy</a></li><li><a href="#" className="hover:text-heading transition">Terms</a></li><li><a href="#" className="hover:text-heading transition">Contact</a></li></ul></div>
          </div>
          <div className="border-t border-line pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-muted text-sm">© 2026 KYRO · Aragon Media. All rights reserved.</p>
            <div className="flex gap-6"><a href="#" className="text-muted hover:text-heading transition">Twitter</a><a href="#" className="text-muted hover:text-heading transition">Discord</a><a href="#" className="text-muted hover:text-heading transition">GitHub</a></div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SIGN IN — email + 6-digit OTP (real via Supabase, demo fallback)
   ───────────────────────────────────────────────────────────── */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function SignIn({ mode, signupRole, onVerified, onBack }: { mode: 'signin' | 'signup' | 'admin'; signupRole?: Role; onVerified: () => void | Promise<void>; onBack: () => void }) {
  const adminMode = mode === 'admin';
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [demo, setDemo] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const code = digits.join('');

  async function handleSend() {
    if (!emailValid || loading) return;
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const res = await withTimeout(sendEmailOtp(email.trim()), 15000);
      if (res.error) {
        setError(res.error.message || 'Could not send the code. Please try again.');
        return;
      }
      setDemo(res.demo);
      setStep('code');
      setResendIn(30);
      setDigits(['', '', '', '', '', '']);
      setInfo(res.demo ? '' : `Code sent to ${email.trim()} — check your inbox and spam.`);
      setTimeout(() => inputsRef.current[0]?.focus(), 60);
    } catch (err) {
      console.error('[kyro] sendEmailOtp failed', err);
      setError(
        err instanceof Error && err.message === 'timeout'
          ? 'Timed out reaching the server. Check your connection / Supabase settings.'
          : 'Something went wrong sending the code. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (code.length !== 6 || loading) return;
    setLoading(true);
    setError('');
    try {
      if (demo) {
        mockApi.logEvent('auth.otp.verify', { email: email.trim(), mode: 'demo', role: signupRole, admin: adminMode });
        await new Promise((r) => setTimeout(r, 400));
        await onVerified();
        return;
      }
      const res = await withTimeout(verifyEmailOtp(email.trim(), code), 15000);
      if (res.error) {
        setError(res.error.message || 'That code is invalid or expired.');
        return;
      }
      await onVerified();
    } catch (err) {
      console.error('[kyro] verify/onVerified failed', err);
      if (err instanceof Error && err.message === 'timeout') {
        setError('Timed out verifying. Please try again.');
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError('Something went wrong verifying the code. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  function onDigitChange(i: number, val: string) {
    const clean = val.replace(/\D/g, '');
    if (!clean) { setDigits((d) => { const n = [...d]; n[i] = ''; return n; }); return; }
    setDigits((d) => {
      const n = [...d];
      let idx = i;
      for (const ch of clean.split('')) { if (idx > 5) break; n[idx] = ch; idx++; }
      const focusTo = Math.min(idx, 5);
      setTimeout(() => inputsRef.current[focusTo]?.focus(), 0);
      return n;
    });
  }

  function onDigitKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputsRef.current[i - 1]?.focus();
    if (e.key === 'Enter') handleVerify();
  }

  return (
    <div className="min-h-screen bg-app text-body flex flex-col">
      <div className="px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-muted hover:text-heading transition">
          <ChevronLeft size={20} /> Back
        </button>
        <button onClick={onBack} className="flex items-center gap-2">
          <KyroLogo size={28} />
          <span className="text-lg font-bold bg-gradient-kyro bg-clip-text text-transparent tracking-tight">KYRO</span>
        </button>
        <ThemeToggle />
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-20">
        <div className="w-full max-w-md">
          <div className="bg-surface border border-line rounded-3xl p-8 md:p-10 shadow-xl shadow-black/5">
            {adminMode && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-5 bg-purple-500/10 border border-purple-500/20 rounded-full text-xs font-semibold text-purple-500">
                <Shield size={12} /> Admin access
              </div>
            )}
            {mode === 'signup' && signupRole && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-5 bg-kyro-600/10 border border-kyro-600/20 rounded-full text-xs font-semibold text-kyro-600">
                {signupRole === 'brand' ? <Briefcase size={12} /> : <Camera size={12} />} Signing up as {signupRole === 'brand' ? 'a Brand' : 'a Creator'}
              </div>
            )}

            {step === 'email' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-heading">{adminMode ? 'Admin sign in' : mode === 'signup' ? 'Create your account' : 'Sign in to KYRO'}</h1>
                  <p className="text-muted text-sm">{mode === 'signup' ? "Enter your email — we'll send a 6-digit code to confirm it." : "Enter your email and we'll send you a 6-digit sign-in code."}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
                    <input
                      type="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                      placeholder="you@company.com"
                      className="w-full pl-10 pr-4 py-3 bg-surface-2 border border-line rounded-xl text-heading placeholder-faint focus:outline-none focus:ring-2 focus:ring-kyro-600/40 focus:border-kyro-600 transition"
                    />
                  </div>
                </div>
                {error && <p className="text-sm text-pink-500">{error}</p>}
                <button
                  onClick={handleSend}
                  disabled={!emailValid || loading}
                  className="w-full px-4 py-3 bg-gradient-kyro rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-purple-600/40"
                >
                  {loading ? 'Sending code…' : <>Continue <ArrowRight size={18} /></>}
                </button>
                <p className="text-center text-xs text-faint">By continuing you agree to KYRO's Terms &amp; Privacy Policy.</p>
              </div>
            )}

            {step === 'code' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-heading">Enter your code</h1>
                  <p className="text-muted text-sm">We sent a 6-digit code to <span className="text-heading font-semibold">{email.trim()}</span>.</p>
                </div>
                <div
                  className="flex items-center justify-between gap-2"
                  onPaste={(e) => { const t = e.clipboardData.getData('text').replace(/\D/g, ''); if (t) { e.preventDefault(); onDigitChange(0, t); } }}
                >
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputsRef.current[i] = el; }}
                      value={d}
                      inputMode="numeric"
                      maxLength={1}
                      onChange={(e) => onDigitChange(i, e.target.value)}
                      onKeyDown={(e) => onDigitKeyDown(i, e)}
                      className="w-12 h-14 text-center text-2xl font-bold bg-surface-2 border border-line rounded-xl text-heading focus:outline-none focus:ring-2 focus:ring-kyro-600/40 focus:border-kyro-600 transition"
                    />
                  ))}
                </div>
                {demo && (
                  <div className="flex items-start gap-2 p-3 bg-amber-400/10 border border-amber-400/20 rounded-lg">
                    <AlertCircle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-500">Demo mode — no real email sent. Enter any 6 digits to continue. Real codes send once Supabase is connected.</p>
                  </div>
                )}
                {info && !demo && (
                  <div className="flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <CheckCircle size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-emerald-500">{info}</p>
                  </div>
                )}
                {error && <p className="text-sm text-pink-500">{error}</p>}
                <button
                  onClick={handleVerify}
                  disabled={code.length !== 6 || loading}
                  className="w-full px-4 py-3 bg-gradient-kyro rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-purple-600/40"
                >
                  {loading ? 'Verifying…' : <>Verify &amp; continue <ArrowRight size={18} /></>}
                </button>
                <div className="flex items-center justify-between text-sm">
                  <button onClick={() => { setStep('email'); setError(''); setInfo(''); }} className="text-muted hover:text-heading transition">Use a different email</button>
                  <button onClick={handleSend} disabled={resendIn > 0 || loading} className="text-kyro-600 hover:text-kyro-700 font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed">
                    {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="text-center text-xs text-faint mt-6">
            {adminMode ? 'Admin portal · KYRO' : mode === 'signup' ? 'Creating your KYRO account' : 'Sign in to your KYRO account'}
          </p>
        </div>
      </div>
    </div>
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
    { role: 'admin' as Role, icon: Shield, title: 'Admin', desc: 'Oversee platform, curate matches, manage funding pools.', border: 'border-pink-400/30 hover:border-pink-400/60' },
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
function AppShell({ role, onSwitch, onSignOut, onSettings, children }: { role: Role; onSwitch: (r: Role) => void; onSignOut: () => void; onSettings: () => void; children: React.ReactNode }) {
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
              <div className="hidden md:flex items-center gap-1 p-1 bg-surface-2 border border-line rounded-lg">
                <span className="text-xs text-faint px-2">Demo as:</span>
                {(['brand', 'creator', 'admin'] as Role[]).map(r => (
                  <button key={r} onClick={() => onSwitch(r)} className={`text-xs font-semibold px-2.5 py-1 rounded transition ${r === role ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'}`}>
                    {roleLabels[r]}
                  </button>
                ))}
              </div>
              <button className="relative p-2 text-muted hover:text-heading transition" title="Notifications">
                <Bell size={18} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-pink-500 rounded-full"></span>
              </button>
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

/* ─────────────────────────────────────────────────────────────
   BRAND DASHBOARD
   ───────────────────────────────────────────────────────────── */
function BrandDashboard({ onViewCreator }: { onViewCreator: (id: CreatorId) => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const totalSpent = SEED_CAMPAIGNS.reduce((s, c) => s + c.spent, 0);
  const totalPool = SEED_CAMPAIGNS.reduce((s, c) => s + c.pool, 0);
  const totalConv = SEED_CAMPAIGNS.reduce((s, c) => s + c.conversions, 0);
  const totalImpr = SEED_CAMPAIGNS.reduce((s, c) => s + c.impressions, 0);
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div className="flex items-center gap-4">
          <BrandLogo brandId="boldbuns" size={56} />
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-heading">Welcome back, Bold Buns</h1>
            <p className="text-muted mt-1">Here's how your campaigns are performing right now.</p>
          </div>
        </div>
        <button onClick={() => { setShowCreate(true); mockApi.logEvent('brand.create_campaign.open'); }} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition transform hover:scale-105">
          <Plus size={18} /> Create Campaign
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Pool Funded', value: fmt(totalPool), sub: `across ${SEED_CAMPAIGNS.length} campaigns`, icon: Wallet, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
          { label: 'Spend to Date', value: fmt(totalSpent), sub: `${Math.round(totalSpent / totalPool * 100)}% of pool`, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
          { label: 'Conversions', value: totalConv.toLocaleString(), sub: '+18% vs last week', icon: Target, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
          { label: 'Impressions', value: fmtK(totalImpr), sub: 'organic reach via creators', icon: Eye, color: 'text-pink-400', bg: 'bg-pink-400/10 border-pink-400/20' },
        ].map((s, i) => (
          <div key={i} className={`p-5 rounded-2xl border ${s.bg}`}>
            <div className="flex items-center justify-between mb-3"><s.icon size={20} className={s.color} /><span className="text-xs text-faint">Last 30d</span></div>
            <p className="text-xs text-muted mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-faint mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Creator leaderboard (Trybe-style) */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-amber-400" />
            <h2 className="text-xl font-bold text-heading">Creator Leaderboard</h2>
            <span className="text-xs text-faint ml-2">Last 7 days</span>
          </div>
          <button className="text-xs text-muted hover:text-heading">View all</button>
        </div>
        <div className="divide-y divide-line">
          {SEED_LEADERBOARD.map((l, i) => {
            const c = SEED_CREATORS[l.creatorId];
            const brand = BRANDS[l.brandId];
            return (
              <button key={l.creatorId} onClick={() => onViewCreator(l.creatorId)} className="w-full p-4 flex items-center gap-4 hover:bg-surface-2 transition text-left">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-kyro text-white font-bold text-sm">{i + 1}</div>
                <img src={c.avatar} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-heading truncate">{c.name}</p>
                  <p className="text-xs text-muted">{c.handle} · for {brand.name}</p>
                </div>
                <div className="grid grid-cols-3 gap-6 text-right">
                  <div><p className="text-xs text-faint">Orders</p><p className="text-sm font-bold text-emerald-400">{l.orders}</p></div>
                  <div className="hidden sm:block"><p className="text-xs text-faint">Ads</p><p className="text-sm font-bold text-heading">{l.ads}</p></div>
                  <div className="hidden sm:block"><p className="text-xs text-faint">Views</p><p className="text-sm font-bold text-heading">{fmtK(l.views)}</p></div>
                </div>
                <ChevronRight size={16} className="text-faint" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h2 className="text-xl font-bold text-heading">Active Campaigns</h2>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-line rounded-lg text-sm text-muted">
              <Search size={14} /><span>Search</span>
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-line rounded-lg text-sm text-body hover:text-heading">
              <Filter size={14} /> Filter
            </button>
          </div>
        </div>
        <div className="divide-y divide-line">
          {SEED_CAMPAIGNS.map((c) => {
            const poolPct = c.pool ? Math.round((c.spent / c.pool) * 100) : 0;
            const brand = BRANDS[c.brandId];
            return (
              <div key={c.id} className="p-5 hover:bg-surface-2 transition cursor-pointer">
                <div className="flex flex-col lg:flex-row gap-5">
                  <img src={c.cover} alt={c.name} className="w-full lg:w-48 h-32 rounded-xl object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <BrandLogo brandId={c.brandId} size={36} />
                        <div>
                          <div className="flex items-center gap-3 mb-1.5">
                            <h3 className="text-lg font-bold text-heading">{c.name}</h3>
                            <StatusPill status={c.status} />
                          </div>
                          <p className="text-sm text-muted">{brand.name} · {c.creators} creators · {c.submissions} submissions</p>
                        </div>
                      </div>
                      <button className="text-muted hover:text-heading"><ExternalLink size={16} /></button>
                    </div>
                    {c.status === 'live' && (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div><p className="text-xs text-faint">Spend</p><p className="text-sm font-bold text-heading">{fmt(c.spent)}</p></div>
                          <div><p className="text-xs text-faint">Pool</p><p className="text-sm font-bold text-heading">{fmt(c.pool)}</p></div>
                          <div><p className="text-xs text-faint">Conversions</p><p className="text-sm font-bold text-emerald-400">{c.conversions.toLocaleString()}</p></div>
                          <div><p className="text-xs text-faint">ROAS</p><p className="text-sm font-bold text-purple-400">{c.roas}x</p></div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-faint mb-1.5"><span>Pool depletion</span><span>{poolPct}%</span></div>
                          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden"><div className={`h-full ${poolPct > 80 ? 'bg-pink-500' : 'bg-gradient-kyro'} rounded-full transition-all`} style={{ width: `${poolPct}%` }}></div></div>
                        </div>
                      </>
                    )}
                    {c.status === 'pending_fund' && (
                      <div className="flex items-center justify-between p-3 bg-blue-400/10 border border-blue-400/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle size={18} className="text-blue-400" />
                          <p className="text-sm text-blue-300">Fund this campaign pool to launch on Meta.</p>
                        </div>
                        <button onClick={() => mockApi.fundCampaign(c.id)} className="text-xs font-semibold px-3 py-1.5 bg-blue-400/20 text-blue-200 rounded-lg hover:bg-blue-400/30 transition">Fund via Square</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateCampaignModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-line rounded-2xl max-w-lg w-full p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-heading">New Campaign</h2>
          <button onClick={onClose} className="text-muted hover:text-heading"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div><label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Campaign Name</label><input className="w-full px-4 py-2.5 bg-surface-2 border border-line rounded-lg text-heading placeholder-faint focus:outline-none focus:border-purple-500" placeholder="Summer Drop 2026" /></div>
          <div><label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Pool Budget</label><div className="relative"><span className="absolute left-4 top-2.5 text-muted">$</span><input className="w-full pl-8 pr-4 py-2.5 bg-surface-2 border border-line rounded-lg text-heading focus:outline-none focus:border-purple-500" placeholder="25,000" /></div></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Commission Type</label><select className="w-full px-3 py-2.5 bg-surface-2 border border-line rounded-lg text-heading focus:outline-none focus:border-purple-500"><option>% of ad spend</option><option>Per conversion</option><option>Hybrid</option></select></div>
            <div><label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Rate</label><input className="w-full px-3 py-2.5 bg-surface-2 border border-line rounded-lg text-heading focus:outline-none focus:border-purple-500" placeholder="15%" /></div>
          </div>
          <div><label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5 block">Brief</label><textarea rows={3} className="w-full px-4 py-2.5 bg-surface-2 border border-line rounded-lg text-heading placeholder-faint focus:outline-none focus:border-purple-500" placeholder="What creators should know about the brand, the product, and the vibe..." /></div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-line rounded-lg text-body hover:bg-surface-2 font-semibold">Cancel</button>
          <button onClick={() => { mockApi.createCampaign({}); onClose(); }} className="flex-1 px-4 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition">Launch & Fund</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CREATOR DASHBOARD — with earning notifications + AI tags
   ───────────────────────────────────────────────────────────── */
function CreatorDashboard({ onViewBrand }: { onViewBrand: (id: BrandId) => void }) {
  const [tab, setTab] = useState<'submissions' | 'browse' | 'payouts'>('submissions');
  const [liveEarnings, setLiveEarnings] = useState(2820);
  const [notification, setNotification] = useState<{ amount: number; orders: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setLiveEarnings((e) => e + Math.random() * 2.4), 1500);
    return () => clearInterval(id);
  }, []);

  // Trybe-style earning notification — fires every ~20s
  useEffect(() => {
    const id = setInterval(() => {
      setNotification({ amount: 24 + Math.floor(Math.random() * 16), orders: 1 + Math.floor(Math.random() * 3) });
      setTimeout(() => setNotification(null), 5000);
    }, 20000);
    // Show one immediately for the demo
    setTimeout(() => {
      setNotification({ amount: 24, orders: 2 });
      setTimeout(() => setNotification(null), 5000);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const totalPaid = SEED_PAYOUTS.reduce((s, p) => s + p.amount, 0);
  return (
    <div className="max-w-7xl mx-auto space-y-8 relative">
      {/* Earning notification toast */}
      {notification && (
        <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-right">
          <div className="flex items-center gap-3 p-4 bg-gradient-to-br from-emerald-500/95 to-emerald-600/95 backdrop-blur-md border border-emerald-400/50 rounded-xl shadow-2xl shadow-emerald-500/30 max-w-xs">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <DollarSign size={20} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base">You just earned +${notification.amount}</p>
              <p className="text-emerald-100 text-xs">{notification.orders} order{notification.orders > 1 ? 's' : ''} · just now</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-heading">Hey, Maya 👋</h1>
          <p className="text-muted mt-1">Your videos are working. Here's the latest.</p>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 md:p-8">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/15 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3 pointer-events-none"></div>
        <div className="relative z-10 grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest">Earnings — this period</p>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl md:text-6xl font-bold bg-gradient-kyro bg-clip-text text-transparent tabular-nums">${liveEarnings.toFixed(2)}</span>
              <span className="text-emerald-400 text-sm font-semibold flex items-center gap-1"><ArrowUpRight size={14} /> live</span>
            </div>
            <p className="text-sm text-muted">Bi-weekly payout via Trolley — next on <span className="text-heading font-semibold">Jun 15, 2026</span></p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
            <div className="p-4 rounded-xl bg-emerald-400/10 border border-emerald-400/20"><p className="text-xs text-muted">Total Paid</p><p className="text-xl font-bold text-emerald-400">{fmt(totalPaid)}</p></div>
            <div className="p-4 rounded-xl bg-blue-400/10 border border-blue-400/20"><p className="text-xs text-muted">Active Videos</p><p className="text-xl font-bold text-blue-400">2 live</p></div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 bg-surface border border-line rounded-xl w-fit">
        {[
          { id: 'submissions', label: 'My Submissions', icon: FileVideo },
          { id: 'browse', label: 'Browse Campaigns', icon: Search },
          { id: 'payouts', label: 'Payouts', icon: Wallet },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as 'submissions' | 'browse' | 'payouts')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === t.id ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'submissions' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {SEED_CREATOR_SUBMISSIONS.map((s) => {
            const brand = BRANDS[s.brandId];
            return (
              <div key={s.id} className="bg-surface border border-line rounded-2xl overflow-hidden hover:border-line transition group">
                <div className="relative aspect-video">
                  <img src={s.thumb} alt={s.id} className="w-full h-full object-cover" />
                  <div className="absolute top-3 left-3"><StatusPill status={s.status} /></div>
                  <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-md flex items-center gap-1">
                    <Cpu size={10} className="text-pink-400" />
                    <span className="text-[10px] font-semibold text-heading">AI tagged</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 to-transparent"></div>
                  <div className="absolute bottom-3 left-3 right-3">
                    <button onClick={() => onViewBrand(s.brandId)} className="flex items-center gap-2 group/brand">
                      <BrandLogo brandId={s.brandId} size={20} />
                      <p className="text-heading font-bold text-sm group-hover/brand:underline">{brand.name}</p>
                    </button>
                    <p className="text-body text-xs">{s.submittedAt}</p>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {s.aiTags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-pink-400/10 border border-pink-400/20 rounded text-[10px] font-semibold text-pink-300">{tag}</span>
                    ))}
                  </div>
                  {s.status === 'live' ? (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div><p className="text-xs text-faint">Orders</p><p className="text-sm font-bold text-heading">{s.orders}</p></div>
                        <div><p className="text-xs text-faint">Impressions</p><p className="text-sm font-bold text-heading">{fmtK(s.impressions)}</p></div>
                        <div><p className="text-xs text-faint">Spend</p><p className="text-sm font-bold text-heading">{fmt(s.spend)}</p></div>
                      </div>
                      <div className="p-3 bg-emerald-400/10 border border-emerald-400/20 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div><p className="text-xs text-muted">Earned</p><p className="text-lg font-bold text-emerald-400">{fmt(s.earnings)}</p></div>
                          <div className="text-right"><p className="text-xs text-muted">Pending</p><p className="text-sm font-semibold text-amber-300">{fmt(s.pending)}</p></div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="p-3 bg-amber-400/10 border border-amber-400/20 rounded-lg flex items-center gap-2">
                      <Clock size={16} className="text-amber-400" />
                      <p className="text-sm text-amber-200">Awaiting brand review</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <button onClick={() => mockApi.openSubmissionUploader()} className="border-2 border-dashed border-line rounded-2xl flex flex-col items-center justify-center gap-3 p-8 text-muted hover:text-heading hover:border-line transition min-h-[320px]">
            <div className="w-14 h-14 rounded-full bg-surface-2 flex items-center justify-center"><Upload size={22} /></div>
            <div className="text-center"><p className="font-semibold">Submit New Video</p><p className="text-xs text-faint mt-1">Upload to an active campaign</p></div>
          </button>
        </div>
      )}

      {tab === 'browse' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {SEED_MARKETPLACE.map((m) => {
            const brand = BRANDS[m.brandId];
            return (
              <div key={m.id} className="bg-surface border border-line rounded-2xl p-5 hover:border-line transition space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <BrandLogo brandId={m.brandId} size={40} />
                    <div>
                      <h3 className="text-lg font-bold text-heading">{m.name}</h3>
                      <button onClick={() => onViewBrand(m.brandId)} className="text-sm text-muted hover:text-heading transition mt-0.5">{brand.name} →</button>
                    </div>
                  </div>
                  <div className="px-2.5 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20"><p className="text-xs font-semibold text-emerald-300">{fmt(m.budget)}</p></div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted"><Award size={14} /><span>{m.commission}</span></div>
                  <div className="flex items-center gap-2 text-muted"><FileVideo size={14} /><span>{m.deliverable}</span></div>
                  <div className="flex items-center gap-2 text-muted"><Clock size={14} /><span>{m.deadline}</span></div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {m.tags.map((t) => (<span key={t} className="px-2 py-0.5 bg-surface-2 border border-line rounded text-xs text-body">{t}</span>))}
                </div>
                <button onClick={() => mockApi.applyToCampaign(m.id)} className="w-full px-4 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition">Apply</button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'payouts' && (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-line flex items-center justify-between">
            <h2 className="text-xl font-bold text-heading">Payout History</h2>
            <div className="flex items-center gap-2 text-sm text-muted"><RefreshCw size={14} /> Powered by Trolley</div>
          </div>
          <div className="divide-y divide-line">
            {SEED_PAYOUTS.map((p) => (
              <div key={p.id} className="p-5 flex items-center justify-between hover:bg-surface-2 transition">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center"><DollarSign size={16} className="text-emerald-400" /></div>
                  <div><p className="text-heading font-semibold">{fmt(p.amount)}</p><p className="text-xs text-muted">{p.period} · {p.method}</p></div>
                </div>
                <div className="text-right"><p className="text-sm text-body">{p.date}</p><StatusPill status={p.status} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
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
          <button className="text-xs text-muted hover:text-heading flex items-center gap-1"><Filter size={12} /> Filter</button>
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
              {ADMIN_BRAND_PERF.map((b) => {
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
            {SEED_CURATION.map((cu) => {
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
                    <button onClick={() => mockApi.proposeMatch(cu.id)} className="flex-1 px-3 py-1.5 bg-gradient-kyro rounded-lg text-white text-xs font-semibold">Propose Match</button>
                    <button className="px-3 py-1.5 border border-line rounded-lg text-body text-xs font-semibold hover:bg-surface-2">Skip</button>
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
          <button onClick={() => mockApi.shareProfile(c.id)} className="flex items-center gap-2 px-3 py-1.5 text-muted hover:text-heading text-sm">
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
                <a href="#" className="flex items-center gap-2 text-muted hover:text-heading transition"><Instagram size={18} /><span className="text-sm font-semibold">{c.social.instagram}</span></a>
                <a href="#" className="flex items-center gap-2 text-muted hover:text-heading transition"><Hash size={18} /><span className="text-sm font-semibold">{c.social.tiktok}</span></a>
                <a href="#" className="flex items-center gap-2 text-muted hover:text-heading transition"><Youtube size={18} /><span className="text-sm font-semibold">{c.social.youtube}</span></a>
              </div>
            </div>
            <button className="px-5 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition transform hover:scale-105 whitespace-nowrap">
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
          <button onClick={() => mockApi.shareProfile(b.id)} className="flex items-center gap-2 px-3 py-1.5 text-muted hover:text-heading text-sm">
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
            <button className="px-5 py-2.5 bg-white text-slate-900 rounded-lg font-semibold hover:bg-slate-100 transition transform hover:scale-105 whitespace-nowrap">
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
                  <button className="w-full px-4 py-2 bg-gradient-kyro rounded-lg text-white text-sm font-semibold">Apply</button>
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
            Built by Aragon Media, KYRO is the creator growth portal for the next decade of consumer brands.
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
          <h2 className="text-3xl font-bold text-heading">Built by Aragon Media</h2>
          <p className="text-lg text-body leading-relaxed">
            Aragon Media is a Canada-based studio building tools for creators and the brands that work with them. KYRO is our flagship product.
          </p>
          <div className="flex flex-wrap gap-3 pt-3">
            <a href="mailto:hello@kyro.com" className="flex items-center gap-2 px-4 py-2 bg-surface border border-line rounded-lg text-body hover:text-heading transition"><Mail size={16} /> hello@kyro.com</a>
            <a href="#" className="flex items-center gap-2 px-4 py-2 bg-surface border border-line rounded-lg text-body hover:text-heading transition"><Globe size={16} /> aragonmedia.com</a>
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
function AccountSettings({ onBack, role }: { onBack: () => void; role: Role }) {
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

        <div className="bg-surface border border-line rounded-2xl divide-y divide-line">
          {[
            { label: 'Profile', icon: Users, sub: 'Name, email, bio' },
            { label: 'Payment Method', icon: Wallet, sub: role === 'creator' ? 'Trolley payout account' : 'Square billing on file' },
            { label: 'Notifications', icon: Bell, sub: 'Email + in-app preferences' },
            { label: 'Connected Accounts', icon: Heart, sub: 'Meta, Instagram, TikTok' },
            { label: 'Security', icon: ShieldCheck, sub: 'Password, 2FA, sessions' },
          ].map((row) => (
            <button key={row.label} className="w-full p-5 flex items-center gap-4 hover:bg-surface-2 transition text-left">
              <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center">
                <row.icon size={18} className="text-body" />
              </div>
              <div className="flex-1">
                <p className="text-heading font-semibold">{row.label}</p>
                <p className="text-xs text-faint">{row.sub}</p>
              </div>
              <ChevronRight size={16} className="text-faint" />
            </button>
          ))}
        </div>

        <div className="p-4 bg-amber-400/10 border border-amber-400/20 rounded-lg flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-200">Settings are read-only in this demo. Full editing arrives in V1 alongside real Supabase auth.</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ROOT APP
   ───────────────────────────────────────────────────────────── */
type View = 'landing' | 'signup-role' | 'signin' | 'onboard' | 'app' | 'about' | 'creator-profile' | 'brand-profile' | 'settings';

function readRoute(): { view: View; admin: boolean } {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '/admin') return { view: 'signin', admin: true };
    if (path === '/signin' || path === '/login') return { view: 'signin', admin: false };
    if (path === '/signup' || path === '/join') return { view: 'signup-role', admin: false };
  }
  return { view: 'landing', admin: false };
}

function App() {
  const initial = readRoute();
  const [view, setView] = useState<View>(initial.view);
  const [adminEntry, setAdminEntry] = useState(initial.admin);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [signupRole, setSignupRole] = useState<Role>('brand');
  const [role, setRole] = useState<Role>(initial.admin ? 'admin' : 'brand');
  const [profileCreatorId, setProfileCreatorId] = useState<CreatorId>('maya');
  const [profileBrandId, setProfileBrandId] = useState<BrandId>('boldbuns');

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
  const goSignIn = (admin: boolean) => { setAdminEntry(admin); setAuthMode('signin'); setView('signin'); nav(admin ? '/admin' : '/signin'); };
  const goSignUp = () => { setAdminEntry(false); setView('signup-role'); nav('/signup'); };
  const goLanding = () => { setView('landing'); nav('/'); };
  const onVerified = async () => {
    if (adminEntry) {
      // Demo mode (no Supabase keys) → allow, so the admin dashboard is viewable.
      if (!isSupabaseConfigured()) { setRole('admin'); setView('app'); nav('/admin'); return; }
      // Real mode → require an admin profile.
      let adminProfile = null;
      try { adminProfile = await getMyProfile(); } catch { adminProfile = null; }
      if (adminProfile && adminProfile.role === 'admin') { setRole('admin'); setView('app'); nav('/admin'); return; }
      throw new Error("This account doesn't have admin access.");
    }

    // Real mode: look up the user's profile to decide sign-in vs onboarding.
    let profile: Awaited<ReturnType<typeof getMyProfile>> = null;
    try { profile = await getMyProfile(); } catch { profile = null; }

    if (profile && profile.role) {
      // Existing, onboarded account → straight to their dashboard.
      setRole(profile.role as Role);
      setView('app');
      nav('/');
      return;
    }
    if (profile && !profile.role) {
      // Real user with no role yet. If they picked one on the sign-up path, save it.
      if (authMode === 'signup') {
        try { await saveMyProfile(signupRole); } catch { /* table may not exist yet */ }
        setRole(signupRole);
        setView('app');
        nav('/');
        return;
      }
      // Came in via Sign In but has no profile → onboard them.
      setView('onboard');
      return;
    }

    // profile === null → demo mode / no Supabase / table missing: preserve prior behavior.
    if (authMode === 'signup') setRole(signupRole);
    setView('app');
    nav('/');
  };

  const finishOnboarding = async (r: Role) => {
    try { await saveMyProfile(r); } catch { /* table may not exist yet */ }
    setRole(r);
    setView('app');
    nav('/');
  };

  const signInMode = adminEntry ? 'admin' : authMode;

  if (view === 'landing') return <Landing onSignIn={() => goSignIn(false)} onGetStarted={goSignUp} onAbout={() => setView('about')} />;
  if (view === 'signup-role') return (
    <RolePicker
      roles={['brand', 'creator']}
      heading="Create your KYRO account"
      sub="First — are you a brand or a creator?"
      badge="Sign up"
      cta="Continue"
      onPick={(r) => { setSignupRole(r); setAuthMode('signup'); setView('signin'); nav('/signup'); }}
      onBack={goLanding}
    />
  );
  if (view === 'signin') return <SignIn mode={signInMode} signupRole={signupRole} onVerified={onVerified} onBack={authMode === 'signup' && !adminEntry ? () => { setView('signup-role'); nav('/signup'); } : goLanding} />;
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

  return (
    <AppShell role={role} onSwitch={setRole} onSignOut={goLanding} onSettings={() => setView('settings')}>
      {role === 'brand' && <BrandDashboard onViewCreator={(id) => { setProfileCreatorId(id); setView('creator-profile'); }} />}
      {role === 'creator' && <CreatorDashboard onViewBrand={(id) => { setProfileBrandId(id); setView('brand-profile'); }} />}
      {role === 'admin' && <AdminDashboard onViewCreator={(id) => { setProfileCreatorId(id); setView('creator-profile'); }} />}
    </AppShell>
  );
}

export default App;
