/**
 * The two audience pages: /for-brands and /for-creators.
 *
 * One page, two sets of words. A brand and a creator want opposite things
 * from the same product, and a single page that tries to answer both ends up
 * answering neither, which is what the old home page was doing by listing
 * "For Creators" and "For Brands" as anchors to sections of itself.
 *
 * Deliberately simple, and deliberately short of proof. There is no
 * testimonial rail, no logo wall and no counter of creators, because KYRO has
 * not earned any of those yet and a page that borrows them is a page that
 * reads as true until someone checks. The slots are easy to add the day there
 * is something real to put in them, and the layout does not collapse without
 * them.
 *
 * The video is a placeholder until a file exists. Give `VideoFrame` a `src`
 * and it plays; leave it off and it draws the frame at the right size in the
 * right place, so the page can be judged now and filled in later.
 */

import { useState } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { MotionButton } from './MotionButton';

export type Audience = 'brands' | 'creators';

interface Step {
  title: string;
  body: string;
}

interface Qa {
  q: string;
  a: string;
}

interface Pitch {
  eyebrow: string;
  headline: string;
  sub: string;
  /** What the video is, shown on the placeholder so the gap reads as planned. */
  videoLabel: string;
  cta: string;
  steps: Step[];
  /** The money, stated plainly. Each line is a fact, not a claim. */
  terms: Array<{ label: string; value: string; note: string }>;
  faq: Qa[];
  closing: string;
}

const PITCH: Record<Audience, Pitch> = {
  brands: {
    eyebrow: 'For brands',
    headline: 'Creator videos you can run as ads, paid for out of what they sell.',
    sub: 'Connect your Shopify store and your Meta ad account, open a campaign, and keep the videos that work. Creators earn a share of the sales their video actually drove, so there is nothing to pay up front and nothing to write off.',
    videoLabel: 'A walkthrough of KYRO, start to finish',
    cta: 'Start a campaign',
    steps: [
      {
        title: 'Connect Shopify and Meta',
        body: 'Two OAuth connections. KYRO reads orders from your store and the ad account you nominate, and nothing else.',
      },
      {
        title: 'Open a campaign',
        body: 'Set the commission rate you are willing to pay on a sale. Invite creators with a link, or let them apply.',
      },
      {
        title: 'Keep the videos you want',
        body: 'Review every submission. Approving one licenses it to run as a paid ad in your connected Meta account for the campaign plus thirty days.',
      },
      {
        title: 'Pay on what sold',
        body: 'Each approved video carries a tracking code. Orders that come back carrying it are attributed to that creator, and you pay their commission on those orders only.',
      },
    ],
    terms: [
      { label: 'To join', value: 'Free', note: 'No seats, no minimum, no contract.' },
      { label: 'Creator commission', value: 'You set it', note: 'Paid only on attributed sales.' },
      { label: 'KYRO', value: '1%', note: 'Of attributed sales. Nothing else.' },
    ],
    faq: [
      {
        q: 'How is a sale attributed to a creator?',
        a: 'Every approved video gets its own tracking code. You put the link KYRO gives you in the ad, Shopify records it on the customer visit, and KYRO matches it back when the order lands. If the code is not in the ad, the order is not attributed, so always take the link from KYRO rather than building the URL yourself.',
      },
      {
        q: 'Who owns the video?',
        a: 'The creator does. Approving a submission gives you a licence to run it as paid advertising in the Meta ad account you connected, for the campaign plus thirty days. It does not cover your website, email, organic posts, marketplaces or another ad account.',
      },
      {
        q: 'When am I charged?',
        a: 'Commission becomes payable after the order clears its return window. You authorise a payment run, KYRO charges your saved method once, and the money goes straight through to the creators in that run.',
      },
      {
        q: 'What does KYRO cost?',
        a: 'One percent of attributed sales. Card or bank processing is added to the charge at cost and passed to the processor in full, and is shown before you authorise anything.',
      },
      {
        q: 'What if a creator submits something that never sells?',
        a: 'You pay nothing. That is the whole point of the model. You also do not have to approve it, and an unapproved video is never licensed to you.',
      },
    ],
    closing: 'Open a campaign and see what your creators can sell.',
  },

  creators: {
    eyebrow: 'For creators',
    headline: 'Get paid on what your video sells, not on what it cost to make.',
    sub: 'Brands put real ad budget behind the videos that work. When yours is one of them, you earn a share of every sale it drives, for as long as it runs. You keep your commission in full, because KYRO charges creators nothing.',
    videoLabel: 'How KYRO works, in ninety seconds',
    cta: 'Join free',
    steps: [
      {
        title: 'Join a campaign',
        body: 'Browse what is open, or follow a brand\'s invite link. You see the commission rate before you make anything.',
      },
      {
        title: 'Submit your video',
        body: 'Upload it to KYRO. The brand reviews it and either keeps it or passes. Nothing is used unless they approve it.',
      },
      {
        title: 'The brand runs it',
        body: 'An approved video can run as a paid ad in the brand\'s Meta account. Their budget is what puts it in front of people, which is why earnings here are not capped by your follower count.',
      },
      {
        title: 'You get paid',
        body: 'Orders carrying your tracking code are credited to you. Once they clear, the brand pays the run and Stripe sends your share to your bank.',
      },
    ],
    terms: [
      { label: 'To join', value: 'Free', note: 'No fee to join, submit, or get paid.' },
      { label: 'KYRO takes', value: '0%', note: 'Of your commission. The brand pays our fee.' },
      { label: 'You keep', value: '100%', note: 'Of the rate the brand agreed.' },
    ],
    faq: [
      {
        q: 'What does it cost me?',
        a: 'Nothing. No onboarding fee, no participation fee, no transaction fee, no payout fee. KYRO is paid by the brand, not out of your commission.',
      },
      {
        q: 'How much can I actually earn?',
        a: 'It depends on the rate the brand set and how much they spend running your video. A straight answer: not every video gets scaled. The ones that do can earn far more than a flat content fee, because the brand\'s ad budget is doing the distribution, and the ones that do not earn little or nothing. Treat it as upside on work you were making anyway rather than a salary.',
      },
      {
        q: 'Who owns what I make?',
        a: 'You do. Approving your video licenses the brand to run it as a paid ad in one Meta ad account, for the campaign plus thirty days. It does not give them your video for their website, their email, their organic feed, or anywhere else.',
      },
      {
        q: 'When do I get paid?',
        a: 'After a sale clears its return window it becomes payable, and it is sent when the brand authorises their next payment run. You will need Stripe payouts set up and your tax details on file before any money can move.',
      },
      {
        q: 'What if a brand does not pay?',
        a: 'Their licence to keep running your videos ends automatically while they are overdue. Using the video after that is unlicensed use of your work.',
      },
    ],
    closing: 'Join free and see what is open right now.',
  },
};

/**
 * The video, or the space it will fill.
 *
 * Drawn at 16:9 either way, so the page is laid out now and the file arrives
 * later without anything moving. The placeholder says what the video is,
 * because an unexplained grey box reads as broken and a labelled one reads as
 * deliberate.
 */
export function VideoFrame({ label, src, poster }: { label: string; src?: string; poster?: string }) {
  if (src) {
    return (
      <div className="rounded-2xl overflow-hidden border border-line bg-surface-2 shadow-xl shadow-black/10">
        <video src={src} poster={poster} controls playsInline className="w-full aspect-video block" />
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl p-[1.5px] bg-gradient-kyro shadow-xl shadow-black/10">
      <div className="rounded-[14px] bg-surface-2 aspect-video flex flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="w-16 h-16 rounded-full bg-gradient-kyro flex items-center justify-center">
          <Play size={24} className="text-white translate-x-0.5" fill="currentColor" />
        </span>
        <div>
          <p className="text-sm font-semibold text-heading">{label}</p>
          <p className="text-xs text-faint mt-1">Video coming shortly.</p>
        </div>
      </div>
    </div>
  );
}

export function VslPage({
  audience, onGetStarted, onSignIn, onHome, videoSrc,
}: {
  audience: Audience;
  onGetStarted: () => void;
  onSignIn: () => void;
  onHome: () => void;
  /** Swap the placeholder for the real thing by passing a URL. */
  videoSrc?: string;
}) {
  const pitch = PITCH[audience];
  const other = audience === 'brands' ? 'creators' : 'brands';
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-app text-body">
      <nav className="fixed inset-x-0 top-4 z-50 px-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 rounded-full border border-line bg-surface/80 backdrop-blur-md pl-5 pr-3 py-2.5 shadow-lg shadow-black/5">
          <button onClick={onHome} className="flex items-center gap-2.5 shrink-0">
            <span className="text-xl font-bold bg-gradient-kyro bg-clip-text text-transparent tracking-tight">KYRO</span>
          </button>
          <div className="flex items-center gap-1.5">
            <a
              href={`/for-${other}`}
              className="hidden sm:inline px-4 py-2 text-sm font-semibold text-body hover:text-heading transition-colors capitalize"
            >
              For {other}
            </a>
            <button onClick={onSignIn} className="px-4 py-2 text-sm font-semibold text-body hover:text-heading transition-colors">
              Sign in
            </button>
            <button
              onClick={onGetStarted}
              className="px-5 py-2 bg-gradient-kyro rounded-full text-white text-sm font-semibold hover:shadow-lg hover:shadow-purple-600/40 transition"
            >
              {pitch.cta}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero and the video, together. The video is the pitch, so nothing
          sits between the headline and it. */}
      <section className="pt-32 md:pt-40 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-5">
            <span className="inline-block px-4 py-1.5 bg-surface-2 border border-line rounded-full text-sm font-semibold text-muted">
              {pitch.eyebrow}
            </span>
            <h1 className="text-4xl md:text-6xl font-bold leading-[1.08] tracking-tight text-heading">
              {pitch.headline}
            </h1>
            <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto leading-relaxed">
              {pitch.sub}
            </p>
          </div>

          <VideoFrame label={pitch.videoLabel} src={videoSrc} />

          <div className="flex justify-center">
            <MotionButton onClick={onGetStarted} size="lg">{pitch.cta}</MotionButton>
          </div>
        </div>
      </section>

      {/* The money, before the explanation. It is the first thing both
          audiences actually want to know. */}
      <section className="px-4 sm:px-6 lg:px-8 pb-16">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-4">
          {pitch.terms.map((t) => (
            <div key={t.label} className="p-5 rounded-2xl bg-surface border border-line text-center">
              <p className="text-xs uppercase tracking-wider text-faint">{t.label}</p>
              <p className="text-3xl font-bold text-heading mt-1">{t.value}</p>
              <p className="text-xs text-muted mt-1.5">{t.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-line">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-heading text-center mb-12">How it works</h2>
          <div className="space-y-4">
            {pitch.steps.map((s, i) => (
              <div key={s.title} className="flex gap-5 p-5 rounded-2xl bg-surface border border-line">
                <span className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-kyro text-white font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-heading">{s.title}</h3>
                  <p className="text-sm text-muted mt-1 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6 lg:px-8 border-t border-line">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-heading text-center mb-12">Questions worth asking</h2>
          <div className="space-y-3">
            {pitch.faq.map((item, i) => (
              <div key={item.q} className="rounded-2xl bg-surface border border-line overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-left"
                >
                  <span className="font-semibold text-heading">{item.q}</span>
                  <span className={`text-faint transition-transform ${open === i ? 'rotate-90' : ''}`}>
                    <ArrowRight size={16} />
                  </span>
                </button>
                {open === i && (
                  <p className="px-5 pb-5 -mt-1 text-sm text-muted leading-relaxed">{item.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 border-t border-line">
        <div className="max-w-3xl mx-auto text-center rounded-3xl border border-line bg-surface p-10 md:p-14 space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold text-heading">{pitch.closing}</h2>
          <div className="flex justify-center">
            <MotionButton onClick={onGetStarted} size="lg">{pitch.cta}</MotionButton>
          </div>
          <p className="text-sm text-muted">
            <a href={`/for-${other}`} className="text-kyro-500 hover:underline">
              Here for {other} instead?
            </a>
          </p>
        </div>
      </section>

      <footer className="py-10 px-4 border-t border-line">
        <p className="text-center text-xs text-faint">
          KYRO is operated by Kyvo LLC, 131 Continental Drive, Suite 305, Newark, DE 19713.
        </p>
      </footer>
    </div>
  );
}
