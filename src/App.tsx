import {
  Menu, X, ArrowRight, Play, Star, TrendingUp, Zap, DollarSign, BarChart3,
  CheckCircle, Clock, Briefcase, Camera, Shield, ChevronRight,
  Plus, Upload, Eye, Users, Wallet, FileVideo, AlertCircle, Activity,
  Sparkles, Bell, LogOut, Filter, Search, ExternalLink, Award, Target,
  ArrowUpRight, RefreshCw
} from 'lucide-react';
import { useState, useEffect } from 'react';

/* ─────────────────────────────────────────────────────────────
   KYRO LOGO
   ───────────────────────────────────────────────────────────── */
function KyroLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5b9bff" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>
      </defs>
      <path d="M10 10 Q10 55 50 50 Q45 10 10 10Z" fill="url(#lg1)" opacity="0.9" />
      <path d="M90 10 Q90 55 50 50 Q55 10 90 10Z" fill="url(#lg1)" opacity="0.9" />
      <path d="M50 50 Q15 60 30 90 Q50 80 70 90 Q85 60 50 50Z" fill="url(#lg1)" opacity="0.9" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   DEMO SEED DATA
   ───────────────────────────────────────────────────────────── */

type Role = 'brand' | 'creator' | 'admin';

const SEED_CAMPAIGNS = [
  {
    id: 'c1',
    name: 'Athletiq Spring Drop',
    brand: 'Athletiq',
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
    name: 'Foundry Goods — Tee Launch',
    brand: 'Foundry Goods',
    status: 'live',
    pool: 18000,
    spent: 7200,
    creators: 8,
    submissions: 11,
    roas: 2.9,
    impressions: 248000,
    conversions: 612,
    cover: 'https://images.pexels.com/photos/996329/pexels-photo-996329.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    id: 'c3',
    name: 'Coastal Supply Co — Summer',
    brand: 'Coastal Supply Co.',
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

const SEED_CREATOR_SUBMISSIONS = [
  {
    id: 's1',
    campaign: 'Athletiq Spring Drop',
    brand: 'Athletiq',
    status: 'live',
    earnings: 1840,
    pending: 320,
    impressions: 68400,
    spend: 1840,
    submittedAt: '6 days ago',
    thumb: 'https://images.pexels.com/photos/2294353/pexels-photo-2294353.jpeg?auto=compress&cs=tinysrgb&w=300',
  },
  {
    id: 's2',
    campaign: 'Foundry Goods — Tee Launch',
    brand: 'Foundry Goods',
    status: 'live',
    earnings: 980,
    pending: 180,
    impressions: 41200,
    spend: 980,
    submittedAt: '3 days ago',
    thumb: 'https://images.pexels.com/photos/1183266/pexels-photo-1183266.jpeg?auto=compress&cs=tinysrgb&w=300',
  },
  {
    id: 's3',
    campaign: 'Athletiq Spring Drop',
    brand: 'Athletiq',
    status: 'in_review',
    earnings: 0,
    pending: 0,
    impressions: 0,
    spend: 0,
    submittedAt: '8 hours ago',
    thumb: 'https://images.pexels.com/photos/1239288/pexels-photo-1239288.jpeg?auto=compress&cs=tinysrgb&w=300',
  },
];

const SEED_MARKETPLACE = [
  {
    id: 'm1',
    name: 'NorthernBrew Cold Coffee',
    brand: 'NorthernBrew',
    budget: 8000,
    commission: '15% of ad spend',
    deliverable: '1 vertical video, 15–30s',
    deadline: 'Apply by Jun 22',
    tags: ['Beverage', 'Lifestyle'],
  },
  {
    id: 'm2',
    name: 'PeakForm Recovery Wear',
    brand: 'PeakForm',
    budget: 22000,
    commission: '$8 per conversion',
    deliverable: '2 videos, gym setting',
    deadline: 'Apply by Jun 25',
    tags: ['Fitness', 'Apparel'],
  },
  {
    id: 'm3',
    name: 'Lumen Skincare — Hero',
    brand: 'Lumen',
    budget: 15000,
    commission: '12% of ad spend + $5/conv',
    deliverable: 'Tutorial-style 30s',
    deadline: 'Apply by Jun 28',
    tags: ['Beauty', 'Skincare'],
  },
];

const SEED_PAYOUTS = [
  { id: 'p1', date: 'Jun 1, 2026', amount: 2640, status: 'paid', method: 'Trolley · ACH', period: 'May 15–31' },
  { id: 'p2', date: 'May 15, 2026', amount: 1980, status: 'paid', method: 'Trolley · ACH', period: 'May 1–14' },
  { id: 'p3', date: 'May 1, 2026', amount: 2120, status: 'paid', method: 'Trolley · ACH', period: 'Apr 15–30' },
];

const SEED_CURATION = [
  { id: 'cu1', campaign: 'Athletiq Spring Drop', creator: 'Maya Chen', followers: '280K', match: 94, niche: 'Fitness · Lifestyle' },
  { id: 'cu2', campaign: 'Foundry Goods — Tee Launch', creator: 'Sasha Novak', followers: '510K', match: 91, niche: 'Apparel · Streetwear' },
];

const testimonials = [
  { quote: "Kyro completely changed how we run influencer marketing. Our ROAS tripled in the first month.", name: "Jordan Lee", role: "Head of Growth, Athletiq", avatar: "https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=2", stars: 5 },
  { quote: "I went from $400/month to over $8K in 60 days. The performance-based model is a game changer.", name: "Maya Chen", role: "Creator, 280K followers", avatar: "https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=2", stars: 5 },
  { quote: "We scaled our creative output 10x without hiring a single additional team member. Insane.", name: "Marcus Reid", role: "CMO, Foundry Goods", avatar: "https://images.pexels.com/photos/2379005/pexels-photo-2379005.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=2", stars: 5 },
  { quote: "The transparency into earnings and ad performance is unlike anything else out there.", name: "Priya Sharma", role: "Creator, 140K followers", avatar: "https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=2", stars: 5 },
  { quote: "We onboarded 40 creators in a week and had ads running the same day. Nothing else comes close.", name: "Tyler Brooks", role: "Founder, Coastal Supply Co.", avatar: "https://images.pexels.com/photos/91227/pexels-photo-91227.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=2", stars: 5 },
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
  const it = map[status] || { label: status, cls: 'bg-slate-700 text-slate-300 border-slate-600' };
  return <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${it.cls}`}>{it.label}</span>;
}

/* ─────────────────────────────────────────────────────────────
   LANDING PAGE (original lander, untouched aesthetic)
   ───────────────────────────────────────────────────────────── */
function Landing({ onSignIn }: { onSignIn: () => void }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <nav className="fixed w-full top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2.5">
              <KyroLogo size={36} />
              <span className="text-2xl font-bold bg-gradient-kyro bg-clip-text text-transparent">Kyro</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#creators" className="text-slate-300 hover:text-white transition-colors font-medium">For Creators</a>
              <a href="#brands" className="text-slate-300 hover:text-white transition-colors font-medium">For Brands</a>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <button onClick={onSignIn} className="px-5 py-2 text-slate-300 hover:text-white transition-colors font-medium">Sign In</button>
              <button onClick={onSignIn} className="px-5 py-2 bg-gradient-kyro rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition transform hover:scale-105">
                Start for Free
              </button>
            </div>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-white p-1">
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="md:hidden pb-5 space-y-1 border-t border-slate-800/50 pt-4">
              <a href="#creators" className="block text-slate-300 hover:text-white transition py-2.5 font-medium">For Creators</a>
              <a href="#brands" className="block text-slate-300 hover:text-white transition py-2.5 font-medium">For Brands</a>
              <div className="pt-3 space-y-2">
                <button onClick={onSignIn} className="w-full px-4 py-2.5 text-white border border-slate-700 rounded-lg hover:bg-slate-800/50 transition font-medium">Sign In</button>
                <button onClick={onSignIn} className="w-full px-4 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold hover:shadow-lg transition">Start for Free</button>
              </div>
            </div>
          )}
        </div>
      </nav>

      <section className="pt-40 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-800/60 border border-slate-700/60 rounded-full">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
              <span className="text-sm text-slate-300 font-medium">Now live — join for free</span>
            </div>
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold leading-[1.05] tracking-tight">
              <span className="bg-gradient-kyro bg-clip-text text-transparent">The New Way</span><br />
              <span className="bg-gradient-kyro bg-clip-text text-transparent">to Scale</span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Creators scale their performance. Brands scale their creative engine, all with ease.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={onSignIn} className="px-8 py-4 bg-gradient-kyro rounded-xl text-white font-semibold flex items-center justify-center gap-2 hover:shadow-xl hover:shadow-purple-600/40 transition transform hover:scale-105 text-lg">
              Start for Free <ArrowRight size={20} />
            </button>
          </div>
          <div className="flex items-center justify-center gap-10 pt-2">
            <div className="text-center"><p className="text-3xl font-bold text-white">10K+</p><p className="text-slate-400 text-sm mt-0.5">Creators</p></div>
            <div className="w-px h-10 bg-slate-700"></div>
            <div className="text-center"><p className="text-3xl font-bold text-white">500+</p><p className="text-slate-400 text-sm mt-0.5">Brands</p></div>
            <div className="w-px h-10 bg-slate-700"></div>
            <div className="text-center"><p className="text-3xl font-bold text-white">$2M+</p><p className="text-slate-400 text-sm mt-0.5">Paid Out</p></div>
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="relative w-full rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-900 group cursor-pointer" style={{ aspectRatio: '16/7' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-900/40 via-purple-900/30 to-pink-900/40"></div>
            <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl"></div>
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full max-w-3xl px-8 grid grid-cols-3 gap-4 opacity-30">
                {[...Array(6)].map((_, i) => (<div key={i} className="h-16 bg-slate-600/60 rounded-lg"></div>))}
              </div>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="w-20 h-20 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center group-hover:bg-white/20 group-hover:scale-110 transition duration-300">
                <Play size={32} className="text-white ml-1" fill="white" />
              </div>
              <p className="text-white font-semibold text-lg tracking-wide">Watch Demo</p>
            </div>
            <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-sm rounded-md text-xs text-slate-300 font-mono">2:34</div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8 border-t border-slate-800/50">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="text-center mb-16"><h2 className="text-5xl md:text-6xl font-bold text-white mb-4">How Kyro Works</h2></div>

          <div id="creators" className="relative overflow-hidden rounded-3xl border border-slate-700/50 bg-slate-900/60 p-8 md:p-12">
            <div className="absolute top-0 left-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
            <div className="relative z-10 flex flex-col lg:flex-row gap-10 items-start">
              <div className="flex-1 space-y-4 min-w-0">
                <span className="text-5xl font-bold bg-gradient-kyro bg-clip-text text-transparent">01</span>
                <h3 className="text-3xl md:text-4xl font-bold text-white">Creators join brands</h3>
                <p className="text-lg text-slate-400 max-w-md leading-relaxed">Creators discover brands they love and join their creator program in one tap.</p>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {[
                  { label: 'Creator Ads', status: 'Ads built', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
                  { label: 'Whitelisting', status: 'Live', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
                  { label: 'Launching to Meta', status: 'Live', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
                  { label: 'Scaling', status: 'Pending', icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20' },
                ].map((item, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border bg-slate-800/50 ${item.bg}`}>
                    <item.icon size={18} className={item.color} />
                    <div><p className="text-xs text-slate-400">{item.label}</p><p className={`text-sm font-semibold ${item.color}`}>{item.status}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div id="brands" className="relative overflow-hidden rounded-3xl border border-slate-700/50 bg-slate-900/60 p-8 md:p-12">
            <div className="absolute top-0 right-0 w-80 h-80 bg-pink-500/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
            <div className="relative z-10 flex flex-col lg:flex-row gap-10 items-start">
              <div className="flex-1 space-y-4 min-w-0">
                <span className="text-5xl font-bold bg-gradient-kyro bg-clip-text text-transparent">02</span>
                <h3 className="text-3xl md:text-4xl font-bold text-white">Brands launch ads</h3>
                <p className="text-lg text-slate-400 max-w-md leading-relaxed">Brands run creator submissions as Meta ads — at scale, in minutes.</p>
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 mt-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Top Products</p>
                  <div className="space-y-3">
                    {[
                      { name: 'All-Day Jogger', amount: '$4.5K', pct: 80 },
                      { name: 'Quarter Zip', amount: '$3.1K', pct: 55 },
                      { name: 'Performance Tee', amount: '$1.9K', pct: 34 },
                    ].map((p, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-sm"><span className="text-white font-medium">{p.name}</span><span className="text-blue-400 font-semibold">{p.amount}</span></div>
                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-gradient-kyro rounded-full" style={{ width: `${p.pct}%` }}></div></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                <div className="sm:col-span-2 flex items-center gap-4 px-5 py-4 rounded-xl bg-emerald-400/10 border border-emerald-400/20">
                  <DollarSign size={28} className="text-emerald-400 flex-shrink-0" />
                  <div><p className="text-xs text-slate-400">Earnings</p><p className="text-2xl font-bold text-emerald-400">$12.4K <span className="text-base text-emerald-300/70">+ $1.8K pending</span></p></div>
                  <span className="ml-auto text-xs font-semibold px-2.5 py-1 bg-emerald-400/20 text-emerald-300 rounded-full">Paid</span>
                </div>
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-blue-400/10 border border-blue-400/20"><TrendingUp size={18} className="text-blue-400" /><div><p className="text-xs text-slate-400">Orders</p><p className="text-lg font-bold text-blue-400">+18%</p></div></div>
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-purple-400/10 border border-purple-400/20"><BarChart3 size={18} className="text-purple-400" /><div><p className="text-xs text-slate-400">Active Ads</p><p className="text-lg font-bold text-purple-400">24 running</p></div></div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-slate-700/50 bg-slate-900/60 p-8 md:p-12">
            <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2 pointer-events-none"></div>
            <div className="relative z-10 flex flex-col lg:flex-row gap-10 items-start">
              <div className="flex-1 space-y-4 min-w-0">
                <span className="text-5xl font-bold bg-gradient-kyro bg-clip-text text-transparent">03</span>
                <h3 className="text-3xl md:text-4xl font-bold text-white">Performance based earnings</h3>
                <p className="text-lg text-slate-400 max-w-md leading-relaxed">Payouts on auto-pilot. Real-time earnings and analytics for ultimate transparency.</p>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                {[
                  { label: 'Real-time Analytics', status: 'Active', icon: BarChart3, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
                  { label: 'Auto Payouts', status: 'Enabled', icon: Zap, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
                  { label: 'Transparency', status: '100%', icon: CheckCircle, color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
                ].map((item, i) => (
                  <div key={i} className={`flex flex-col gap-3 p-5 rounded-xl border ${item.bg}`}>
                    <item.icon size={22} className={item.color} />
                    <div><p className="text-xs text-slate-400 mb-1">{item.label}</p><p className={`text-xl font-bold ${item.color}`}>{item.status}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-4 sm:px-6 lg:px-8 border-t border-slate-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-3">
            <h2 className="text-5xl md:text-6xl font-bold text-white">Loved by creators<br />and brands alike</h2>
            <p className="text-xl text-slate-400">Real results from real people.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t, idx) => (
              <div key={idx} className="flex flex-col gap-4 p-6 bg-slate-800/40 border border-slate-700/50 rounded-2xl hover:border-slate-600/60 hover:bg-slate-800/60 transition">
                <div className="flex gap-1">{[...Array(t.stars)].map((_, i) => (<Star key={i} size={14} className="text-yellow-400 fill-yellow-400" />))}</div>
                <p className="text-slate-200 leading-relaxed flex-1">"{t.quote}"</p>
                <div className="flex items-center gap-3 pt-2 border-t border-slate-700/40">
                  <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  <div><p className="text-white font-semibold text-sm">{t.name}</p><p className="text-slate-400 text-xs">{t.role}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/50 py-16 px-4 sm:px-6 lg:px-8 bg-slate-950/50">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1">
              <div className="flex items-center gap-2 mb-4"><KyroLogo size={28} /><span className="text-lg font-bold bg-gradient-kyro bg-clip-text text-transparent">Kyro</span></div>
              <p className="text-slate-400 text-sm">Scale your performance with Kyro.</p>
            </div>
            <div><h4 className="text-white font-semibold mb-4">Platform</h4><ul className="space-y-2 text-slate-400 text-sm"><li><a href="#creators" className="hover:text-white transition">For Creators</a></li><li><a href="#brands" className="hover:text-white transition">For Brands</a></li><li><a href="#how-it-works" className="hover:text-white transition">How it Works</a></li></ul></div>
            <div><h4 className="text-white font-semibold mb-4">Company</h4><ul className="space-y-2 text-slate-400 text-sm"><li><a href="#" className="hover:text-white transition">About</a></li><li><a href="#" className="hover:text-white transition">Blog</a></li><li><a href="#" className="hover:text-white transition">Careers</a></li></ul></div>
            <div><h4 className="text-white font-semibold mb-4">Legal</h4><ul className="space-y-2 text-slate-400 text-sm"><li><a href="#" className="hover:text-white transition">Privacy</a></li><li><a href="#" className="hover:text-white transition">Terms</a></li><li><a href="#" className="hover:text-white transition">Contact</a></li></ul></div>
          </div>
          <div className="border-t border-slate-800/50 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-slate-400 text-sm">© 2026 Kyro. All rights reserved.</p>
            <div className="flex gap-6"><a href="#" className="text-slate-400 hover:text-white transition">Twitter</a><a href="#" className="text-slate-400 hover:text-white transition">Discord</a><a href="#" className="text-slate-400 hover:text-white transition">GitHub</a></div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ROLE PICKER (Demo Auth)
   ───────────────────────────────────────────────────────────── */
function RolePicker({ onPick, onBack }: { onPick: (r: Role) => void; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <div className="max-w-3xl w-full">
        <div className="flex justify-between items-center mb-12">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition">
            <KyroLogo size={32} />
            <span className="text-xl font-bold bg-gradient-kyro bg-clip-text text-transparent">Kyro</span>
          </button>
          <span className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Demo Mode</span>
        </div>
        <div className="text-center mb-12 space-y-3">
          <h1 className="text-4xl md:text-5xl font-bold text-white">Welcome to Kyro</h1>
          <p className="text-lg text-slate-400">Choose how you want to explore the platform.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { role: 'brand' as Role, icon: Briefcase, title: 'I\'m a Brand', desc: 'Launch creator-led ads on Meta, fund campaigns, see ROI in real time.', accent: 'from-blue-500/20 to-purple-500/20', border: 'border-blue-400/30 hover:border-blue-400/60' },
            { role: 'creator' as Role, icon: Camera, title: 'I\'m a Creator', desc: 'Apply to brand campaigns, submit videos, earn from ad performance.', accent: 'from-purple-500/20 to-pink-500/20', border: 'border-purple-400/30 hover:border-purple-400/60' },
            { role: 'admin' as Role, icon: Shield, title: 'Admin', desc: 'Oversee platform, curate matches, manage funding pools.', accent: 'from-pink-500/20 to-orange-500/20', border: 'border-pink-400/30 hover:border-pink-400/60' },
          ].map((opt) => (
            <button key={opt.role} onClick={() => onPick(opt.role)} className={`group relative overflow-hidden p-7 rounded-2xl border-2 ${opt.border} bg-slate-900/60 hover:bg-slate-900/80 text-left transition-all duration-300 hover:scale-[1.02]`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${opt.accent} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
              <div className="relative z-10 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-kyro flex items-center justify-center">
                  <opt.icon size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">{opt.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{opt.desc}</p>
                </div>
                <div className="flex items-center gap-1 text-sm font-semibold text-white pt-2">
                  Enter <ChevronRight size={16} className="group-hover:translate-x-1 transition" />
                </div>
              </div>
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-slate-500 mt-10">This is a demo environment. Real Supabase auth, Meta integration, Square + Trolley payments land in V1.</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   APP SHELL (Header + role switcher)
   ───────────────────────────────────────────────────────────── */
function AppShell({ role, onSwitch, onSignOut, children }: { role: Role; onSwitch: (r: Role) => void; onSignOut: () => void; children: React.ReactNode }) {
  const roleLabels: Record<Role, string> = { brand: 'Brand', creator: 'Creator', admin: 'Admin' };
  const roleIcons: Record<Role, typeof Briefcase> = { brand: Briefcase, creator: Camera, admin: Shield };
  const Icon = roleIcons[role];
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2.5">
                <KyroLogo size={32} />
                <span className="text-xl font-bold bg-gradient-kyro bg-clip-text text-transparent">Kyro</span>
              </div>
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 border border-slate-700/60 rounded-full">
                <Icon size={14} className="text-slate-300" />
                <span className="text-xs font-semibold text-slate-300">{roleLabels[role]} Portal</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-1 p-1 bg-slate-800/60 border border-slate-700/60 rounded-lg">
                <span className="text-xs text-slate-500 px-2">Demo as:</span>
                {(['brand', 'creator', 'admin'] as Role[]).map(r => (
                  <button key={r} onClick={() => onSwitch(r)} className={`text-xs font-semibold px-2.5 py-1 rounded transition ${r === role ? 'bg-gradient-kyro text-white' : 'text-slate-400 hover:text-white'}`}>
                    {roleLabels[r]}
                  </button>
                ))}
              </div>
              <button className="relative p-2 text-slate-400 hover:text-white transition">
                <Bell size={18} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-pink-500 rounded-full"></span>
              </button>
              <button onClick={onSignOut} className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-white transition text-sm">
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
function BrandDashboard() {
  const [showCreate, setShowCreate] = useState(false);
  const totalSpent = SEED_CAMPAIGNS.reduce((s, c) => s + c.spent, 0);
  const totalPool = SEED_CAMPAIGNS.reduce((s, c) => s + c.pool, 0);
  const totalConv = SEED_CAMPAIGNS.reduce((s, c) => s + c.conversions, 0);
  const totalImpr = SEED_CAMPAIGNS.reduce((s, c) => s + c.impressions, 0);
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white">Welcome back, Athletiq</h1>
          <p className="text-slate-400 mt-1">Here's how your campaigns are performing right now.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition transform hover:scale-105">
          <Plus size={18} /> Create Campaign
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Pool Funded', value: fmt(totalPool), sub: 'across 3 campaigns', icon: Wallet, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
          { label: 'Spend to Date', value: fmt(totalSpent), sub: `${Math.round(totalSpent / totalPool * 100)}% of pool`, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
          { label: 'Conversions', value: totalConv.toLocaleString(), sub: '+18% vs last week', icon: Target, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
          { label: 'Impressions', value: fmtK(totalImpr), sub: 'organic reach via creators', icon: Eye, color: 'text-pink-400', bg: 'bg-pink-400/10 border-pink-400/20' },
        ].map((s, i) => (
          <div key={i} className={`p-5 rounded-2xl border ${s.bg}`}>
            <div className="flex items-center justify-between mb-3"><s.icon size={20} className={s.color} /><span className="text-xs text-slate-500">Last 30d</span></div>
            <p className="text-xs text-slate-400 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-800/60">
          <h2 className="text-xl font-bold text-white">Active Campaigns</h2>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 border border-slate-700/60 rounded-lg text-sm text-slate-400">
              <Search size={14} /><span>Search</span>
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 border border-slate-700/60 rounded-lg text-sm text-slate-300 hover:text-white">
              <Filter size={14} /> Filter
            </button>
          </div>
        </div>
        <div className="divide-y divide-slate-800/60">
          {SEED_CAMPAIGNS.map((c) => {
            const poolPct = c.pool ? Math.round((c.spent / c.pool) * 100) : 0;
            return (
              <div key={c.id} className="p-5 hover:bg-slate-800/30 transition cursor-pointer">
                <div className="flex flex-col lg:flex-row gap-5">
                  <img src={c.cover} alt={c.name} className="w-full lg:w-48 h-32 rounded-xl object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-3 mb-1.5">
                          <h3 className="text-lg font-bold text-white">{c.name}</h3>
                          <StatusPill status={c.status} />
                        </div>
                        <p className="text-sm text-slate-400">{c.brand} · {c.creators} creators · {c.submissions} submissions</p>
                      </div>
                      <button className="text-slate-400 hover:text-white"><ExternalLink size={16} /></button>
                    </div>
                    {c.status === 'live' && (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div><p className="text-xs text-slate-500">Spend</p><p className="text-sm font-bold text-white">{fmt(c.spent)}</p></div>
                          <div><p className="text-xs text-slate-500">Pool</p><p className="text-sm font-bold text-white">{fmt(c.pool)}</p></div>
                          <div><p className="text-xs text-slate-500">Conversions</p><p className="text-sm font-bold text-emerald-400">{c.conversions.toLocaleString()}</p></div>
                          <div><p className="text-xs text-slate-500">ROAS</p><p className="text-sm font-bold text-purple-400">{c.roas}x</p></div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-slate-500 mb-1.5"><span>Pool depletion</span><span>{poolPct}%</span></div>
                          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full ${poolPct > 80 ? 'bg-pink-500' : 'bg-gradient-kyro'} rounded-full transition-all`} style={{ width: `${poolPct}%` }}></div></div>
                        </div>
                      </>
                    )}
                    {c.status === 'pending_fund' && (
                      <div className="flex items-center justify-between p-3 bg-blue-400/10 border border-blue-400/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle size={18} className="text-blue-400" />
                          <p className="text-sm text-blue-300">Fund this campaign pool to launch on Meta.</p>
                        </div>
                        <button className="text-xs font-semibold px-3 py-1.5 bg-blue-400/20 text-blue-200 rounded-lg hover:bg-blue-400/30 transition">Fund via Square</button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl max-w-lg w-full p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">New Campaign</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="space-y-4">
          <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Campaign Name</label><input className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500" placeholder="Summer Drop 2026" /></div>
          <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Pool Budget</label><div className="relative"><span className="absolute left-4 top-2.5 text-slate-400">$</span><input className="w-full pl-8 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500" placeholder="25,000" /></div></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Commission Type</label><select className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500"><option>% of ad spend</option><option>Per conversion</option><option>Hybrid</option></select></div>
            <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Rate</label><input className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500" placeholder="15%" /></div>
          </div>
          <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">Brief</label><textarea rows={3} className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500" placeholder="What creators should know about the brand, the product, and the vibe..." /></div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800/60 font-semibold">Cancel</button>
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition">Launch & Fund</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CREATOR DASHBOARD
   ───────────────────────────────────────────────────────────── */
function CreatorDashboard() {
  const [tab, setTab] = useState<'submissions' | 'browse' | 'payouts'>('submissions');
  const [liveEarnings, setLiveEarnings] = useState(2820);
  // Animated earnings ticker
  useEffect(() => {
    const id = setInterval(() => setLiveEarnings((e) => e + Math.random() * 2.4), 1500);
    return () => clearInterval(id);
  }, []);
  const totalPaid = SEED_PAYOUTS.reduce((s, p) => s + p.amount, 0);
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white">Hey, Maya 👋</h1>
          <p className="text-slate-400 mt-1">Your videos are working. Here's the latest.</p>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-slate-700/50 bg-slate-900/60 p-6 md:p-8">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/15 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3 pointer-events-none"></div>
        <div className="relative z-10 grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Earnings — this period</p>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl md:text-6xl font-bold bg-gradient-kyro bg-clip-text text-transparent tabular-nums">${liveEarnings.toFixed(2)}</span>
              <span className="text-emerald-400 text-sm font-semibold flex items-center gap-1"><ArrowUpRight size={14} /> live</span>
            </div>
            <p className="text-sm text-slate-400">Bi-weekly payout via Trolley — next on <span className="text-white font-semibold">Jun 15, 2026</span></p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
            <div className="p-4 rounded-xl bg-emerald-400/10 border border-emerald-400/20"><p className="text-xs text-slate-400">Total Paid</p><p className="text-xl font-bold text-emerald-400">{fmt(totalPaid)}</p></div>
            <div className="p-4 rounded-xl bg-blue-400/10 border border-blue-400/20"><p className="text-xs text-slate-400">Active Videos</p><p className="text-xl font-bold text-blue-400">2 live</p></div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 bg-slate-900/60 border border-slate-700/50 rounded-xl w-fit">
        {[
          { id: 'submissions', label: 'My Submissions', icon: FileVideo },
          { id: 'browse', label: 'Browse Campaigns', icon: Search },
          { id: 'payouts', label: 'Payouts', icon: Wallet },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as 'submissions' | 'browse' | 'payouts')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === t.id ? 'bg-gradient-kyro text-white' : 'text-slate-400 hover:text-white'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'submissions' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {SEED_CREATOR_SUBMISSIONS.map((s) => (
            <div key={s.id} className="bg-slate-900/60 border border-slate-700/50 rounded-2xl overflow-hidden hover:border-slate-600/60 transition">
              <div className="relative aspect-video">
                <img src={s.thumb} alt={s.campaign} className="w-full h-full object-cover" />
                <div className="absolute top-3 left-3"><StatusPill status={s.status} /></div>
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent"></div>
                <div className="absolute bottom-3 left-3 right-3">
                  <p className="text-white font-bold text-sm">{s.campaign}</p>
                  <p className="text-slate-300 text-xs">{s.brand} · {s.submittedAt}</p>
                </div>
              </div>
              <div className="p-5 space-y-3">
                {s.status === 'live' ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div><p className="text-xs text-slate-500">Impressions</p><p className="text-sm font-bold text-white">{fmtK(s.impressions)}</p></div>
                      <div><p className="text-xs text-slate-500">Ad Spend</p><p className="text-sm font-bold text-white">{fmt(s.spend)}</p></div>
                    </div>
                    <div className="p-3 bg-emerald-400/10 border border-emerald-400/20 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div><p className="text-xs text-slate-400">Earned</p><p className="text-lg font-bold text-emerald-400">{fmt(s.earnings)}</p></div>
                        <div className="text-right"><p className="text-xs text-slate-400">Pending</p><p className="text-sm font-semibold text-amber-300">{fmt(s.pending)}</p></div>
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
          ))}
          <button className="border-2 border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-3 p-8 text-slate-400 hover:text-white hover:border-slate-500 transition min-h-[300px]">
            <div className="w-14 h-14 rounded-full bg-slate-800/60 flex items-center justify-center"><Upload size={22} /></div>
            <div className="text-center"><p className="font-semibold">Submit New Video</p><p className="text-xs text-slate-500 mt-1">Upload to an active campaign</p></div>
          </button>
        </div>
      )}

      {tab === 'browse' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {SEED_MARKETPLACE.map((m) => (
            <div key={m.id} className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-5 hover:border-slate-600/60 transition space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">{m.name}</h3>
                  <p className="text-sm text-slate-400 mt-0.5">{m.brand}</p>
                </div>
                <div className="px-2.5 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20"><p className="text-xs font-semibold text-emerald-300">{fmt(m.budget)}</p></div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-400"><Award size={14} /><span>{m.commission}</span></div>
                <div className="flex items-center gap-2 text-slate-400"><FileVideo size={14} /><span>{m.deliverable}</span></div>
                <div className="flex items-center gap-2 text-slate-400"><Clock size={14} /><span>{m.deadline}</span></div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.tags.map((t) => (<span key={t} className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300">{t}</span>))}
              </div>
              <button className="w-full px-4 py-2.5 bg-gradient-kyro rounded-lg text-white font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition">Apply</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'payouts' && (
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-800/60 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Payout History</h2>
            <div className="flex items-center gap-2 text-sm text-slate-400"><RefreshCw size={14} /> Powered by Trolley</div>
          </div>
          <div className="divide-y divide-slate-800/60">
            {SEED_PAYOUTS.map((p) => (
              <div key={p.id} className="p-5 flex items-center justify-between hover:bg-slate-800/30 transition">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center"><DollarSign size={16} className="text-emerald-400" /></div>
                  <div><p className="text-white font-semibold">{fmt(p.amount)}</p><p className="text-xs text-slate-400">{p.period} · {p.method}</p></div>
                </div>
                <div className="text-right"><p className="text-sm text-slate-300">{p.date}</p><StatusPill status={p.status} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ADMIN CONTROL CENTER
   ───────────────────────────────────────────────────────────── */
function AdminDashboard() {
  const totalCollected = 43000;
  const totalAccrued = 22020;
  const totalPaidOut = 18740;
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-white">Admin Control Center</h1>
        <p className="text-slate-400 mt-1">Platform health, curation queue, and money reconciliation.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Brands', value: '14', sub: '3 pending approval', icon: Briefcase, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20' },
          { label: 'Active Creators', value: '247', sub: '18 onboarded this week', icon: Users, color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/20' },
          { label: 'Live Campaigns', value: '8', sub: 'across all brands', icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
          { label: 'Platform Spend', value: '$22K', sub: 'last 30 days', icon: TrendingUp, color: 'text-pink-400', bg: 'bg-pink-400/10 border-pink-400/20' },
        ].map((s, i) => (
          <div key={i} className={`p-5 rounded-2xl border ${s.bg}`}>
            <div className="flex items-center justify-between mb-3"><s.icon size={20} className={s.color} /></div>
            <p className="text-xs text-slate-400 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2"><Sparkles size={18} className="text-emerald-400" /> Reconciliation — Today</h2>
            <p className="text-sm text-slate-400 mt-0.5">Three-way diff: Square credits ↔ Trolley debits ↔ Kyro ledger.</p>
          </div>
          <div className="px-3 py-1 bg-emerald-400/15 border border-emerald-400/30 rounded-full"><span className="text-xs font-semibold text-emerald-300">All green</span></div>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2"><DollarSign size={16} className="text-blue-400" /><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Collected (Square)</p></div>
            <p className="text-2xl font-bold text-white">{fmt(totalCollected)}</p>
          </div>
          <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2"><Activity size={16} className="text-purple-400" /><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Earnings Accrued</p></div>
            <p className="text-2xl font-bold text-white">{fmt(totalAccrued)}</p>
          </div>
          <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-2"><Wallet size={16} className="text-emerald-400" /><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Paid Out (Trolley)</p></div>
            <p className="text-2xl font-bold text-white">{fmt(totalPaidOut)}</p>
          </div>
        </div>
        <div className="p-4 rounded-lg bg-emerald-400/10 border border-emerald-400/20 flex items-center gap-3">
          <CheckCircle size={18} className="text-emerald-400" />
          <p className="text-sm text-emerald-200">Ledger balanced. Pool float: <span className="font-bold">{fmt(totalCollected - totalAccrued)}</span> available across all campaigns.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-800/60 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Pool Health</h2>
            <span className="text-xs text-slate-500">3 campaigns</span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {SEED_CAMPAIGNS.filter(c => c.pool > 0).map((c) => {
              const pct = Math.round((c.spent / c.pool) * 100);
              const lowPool = pct > 70;
              return (
                <div key={c.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{c.name}</p>
                      <p className="text-xs text-slate-500">{fmt(c.spent)} of {fmt(c.pool)}</p>
                    </div>
                    {lowPool ? <span className="px-2 py-0.5 bg-amber-400/15 border border-amber-400/30 rounded-full text-xs font-semibold text-amber-300">Top up soon</span> : <span className="px-2 py-0.5 bg-emerald-400/15 border border-emerald-400/30 rounded-full text-xs font-semibold text-emerald-300">Healthy</span>}
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full ${lowPool ? 'bg-amber-400' : 'bg-gradient-kyro'} rounded-full`} style={{ width: `${pct}%` }}></div></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-800/60 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Curation Queue</h2>
            <span className="text-xs text-slate-500">{SEED_CURATION.length} pending matches</span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {SEED_CURATION.map((cu) => (
              <div key={cu.id} className="p-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-white">{cu.creator}</p>
                    <span className="px-2 py-0.5 bg-purple-400/15 border border-purple-400/30 rounded-full text-xs font-semibold text-purple-300">{cu.match}% match</span>
                  </div>
                  <p className="text-xs text-slate-400">{cu.followers} followers · {cu.niche}</p>
                  <p className="text-xs text-slate-500 mt-0.5">For: {cu.campaign}</p>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-1.5 bg-gradient-kyro rounded-lg text-white text-xs font-semibold">Propose Match</button>
                  <button className="px-3 py-1.5 border border-slate-700 rounded-lg text-slate-300 text-xs font-semibold hover:bg-slate-800/60">Skip</button>
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
   ROOT APP
   ───────────────────────────────────────────────────────────── */
type View = 'landing' | 'auth' | 'app';

function App() {
  const [view, setView] = useState<View>('landing');
  const [role, setRole] = useState<Role>('brand');

  if (view === 'landing') return <Landing onSignIn={() => setView('auth')} />;
  if (view === 'auth') return <RolePicker onPick={(r) => { setRole(r); setView('app'); }} onBack={() => setView('landing')} />;

  return (
    <AppShell role={role} onSwitch={setRole} onSignOut={() => setView('landing')}>
      {role === 'brand' && <BrandDashboard />}
      {role === 'creator' && <CreatorDashboard />}
      {role === 'admin' && <AdminDashboard />}
    </AppShell>
  );
}

export default App;
