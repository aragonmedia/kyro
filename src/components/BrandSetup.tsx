/**
 * Brand setup.
 *
 * A brand row is created the moment someone picks the brand role, holding
 * nothing but a name. Without this they land on an empty dashboard with no
 * logo, no description and no idea what to do first.
 *
 * Three steps, in the order that a brand can actually answer them: what the
 * business is, what the brand looks like, and then the connections KYRO needs
 * before anything can run. The third step is the one that matters — a brand
 * with no Shopify store connected cannot be paid attribution on anything —
 * so it is last, where the wizard has already earned some momentum.
 *
 * Step one is skippable and step three can be finished later. Step two is not:
 * a nameless, logo-less brand is what creators would see in Browse.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, Info, RefreshCw, Upload } from 'lucide-react';
import { completeBrandSetup } from '../lib/db';
import { uploadBrandLogo } from '../lib/storage';

const BUSINESS_TYPES = [
  { id: 'ecommerce', label: 'E-Commerce' },
  { id: 'mobile_app', label: 'Mobile App' },
  { id: 'saas', label: 'SaaS' },
  { id: 'other', label: 'Other' },
];

const CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR', 'AUD'];

const MAX_DESCRIPTION = 200;

function Progress({ step }: { step: number }) {
  const labels = ['Website', 'Brand details', 'Connections'];
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <span className="font-semibold text-heading">{step} of 3</span>{' '}
        <span className="text-muted">{labels[step - 1]}</span>
      </p>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full bg-gradient-kyro transition-all duration-300"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function BrandSetupWizard({
  brandId,
  brandName,
  displayName,
  connectionsSlot,
  otherBrands,
  onSwitchBrand,
  onDone,
}: {
  brandId: string;
  brandName: string;
  displayName: string;
  /** The existing connection gates, rendered as the third step. */
  connectionsSlot: React.ReactNode;
  /** Brands this account already finished. Empty on a first-ever setup. */
  otherBrands: Array<{ id: string; name: string }>;
  onSwitchBrand: (brandId: string) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(1);

  const [website, setWebsite] = useState('');
  const [businessType, setBusinessType] = useState('');

  const [name, setName] = useState(brandName);
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Object URLs are a resource, not a string. Revoking on change and unmount
  // keeps someone who tries five logos from leaking five blobs.
  useEffect(() => {
    if (!logo) { setLogoPreview(null); return; }
    const url = URL.createObjectURL(logo);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  const finish = async () => {
    setError(null);
    if (!name.trim()) { setStep(2); setError('Give the brand a name.'); return; }
    if (!logo) { setStep(2); setError('Upload a logo. Creators see it on every campaign.'); return; }

    setBusy(true);

    let logoUrl: string | null = null;
    if (logo) {
      const up = await uploadBrandLogo(brandId, logo);
      if (up.error || !up.url) {
        setBusy(false);
        setError(up.error ?? 'The logo did not upload.');
        return;
      }
      logoUrl = up.url;
    }

    const res = await completeBrandSetup(brandId, {
      name: name.trim(),
      websiteUrl: website,
      businessType,
      description,
      currency,
      logoUrl,
    });

    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onDone();
  };

  const next = () => {
    setError(null);
    if (step === 2) {
      if (!name.trim()) { setError('Give the brand a name.'); return; }
      if (!logo) { setError('Upload a logo. Creators see it on every campaign.'); return; }
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const field =
    'w-full px-4 py-2.5 bg-surface-2 border border-line rounded-lg text-heading placeholder-faint focus:outline-none focus:border-purple-500';

  return (
    <div className="min-h-screen bg-app">
      <div className="max-w-xl mx-auto px-4 py-6 sm:py-10 space-y-6">
        {/* The way out. Without this, starting a second brand and changing
            your mind leaves you on a screen whose only other control signs
            you out. */}
        {otherBrands.length > 0 && (
          <button
            type="button"
            onClick={() => onSwitchBrand(otherBrands[0].id)}
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-heading"
          >
            <ChevronLeft size={16} />
            Back to {otherBrands[0].name}
          </button>
        )}

        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-400/25 bg-amber-400/5">
          <Info size={16} className="text-amber-300 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-body leading-relaxed">
            <span className="font-semibold text-heading">Setting up a brand?</span> This is the
            brand creators see and apply to. If you're joining a brand that's already on KYRO, ask
            their admin to invite you instead.
          </p>
        </div>

        <Progress step={step} />

        <div className="bg-surface border border-line rounded-2xl p-6 space-y-5">
          {/* ── 1 ── */}
          {step === 1 && (
            <>
              <div className="text-center space-y-1">
                <h1 className="text-2xl font-bold text-heading">Welcome, {displayName}</h1>
                <p className="text-muted text-sm">Let's set up your brand.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="setup-site" className="text-xs font-semibold text-muted">
                  Website
                </label>
                <input
                  id="setup-site"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourbrand.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={field}
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted">What type of business is this?</p>
                <div className="flex flex-wrap gap-2">
                  {BUSINESS_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setBusinessType(businessType === t.id ? '' : t.id)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
                        businessType === t.id
                          ? 'bg-gradient-kyro text-white border-transparent'
                          : 'bg-surface-2 border-line text-muted hover:text-heading'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── 2 ── */}
          {step === 2 && (
            <>
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => logoInput.current?.click()}
                  className="w-24 h-24 rounded-full border border-line bg-surface-2 overflow-hidden flex flex-col items-center justify-center text-muted hover:text-heading transition"
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Upload size={18} />
                      <span className="text-xs mt-1">Logo</span>
                    </>
                  )}
                </button>
                <p className="text-xs text-faint">
                  Logo <span className="text-pink-300">*</span> required
                </p>
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => { setLogo(e.target.files?.[0] ?? null); e.target.value = ''; }}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="setup-name" className="text-xs font-semibold text-muted">
                  Brand name <span className="text-pink-300">*</span>
                </label>
                <input id="setup-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="setup-desc" className="text-xs font-semibold text-muted">
                  Description <span className="text-faint font-normal">(optional)</span>
                </label>
                <textarea
                  id="setup-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
                  rows={3}
                  placeholder="What you sell, and who for."
                  className={`${field} resize-none`}
                />
                <p className="text-xs text-faint">{description.length}/{MAX_DESCRIPTION}</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="setup-currency" className="text-xs font-semibold text-muted">
                  Store currency
                </label>
                <select
                  id="setup-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={field}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <p className="text-xs text-faint">
                  What your store sells in. Payouts settle in USD.
                </p>
              </div>
            </>
          )}

          {/* ── 3 ── */}
          {step === 3 && (
            <>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-heading">Connect your store and ad account</h2>
                <p className="text-sm text-muted leading-relaxed">
                  KYRO reads orders from Shopify to know which video sold what, and runs the ads
                  through your Meta account. You can finish this later, but campaigns can't open to
                  creators until it's done.
                </p>
              </div>
              {connectionsSlot}
            </>
          )}

          {error && <p className="text-sm text-pink-300">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => { setError(null); setStep((s) => s - 1); }}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-line text-muted hover:text-heading disabled:opacity-40"
            >
              <ArrowLeft size={16} /> Previous
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2.5 text-sm text-faint hover:text-body"
            >
              Skip
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold"
            >
              Next <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void finish()}
              disabled={busy}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold disabled:opacity-50"
            >
              {busy ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
              Complete setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
