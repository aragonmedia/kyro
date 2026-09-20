/**
 * What a campaign actually is, before a creator commits to making anything.
 *
 * Browse gives a name and a brand. That is not enough to decide with. This is
 * the product being sold, the rate, and the direction the brand wants — the
 * three things a creator weighs, in one place.
 */

import { useEffect, useState } from 'react';
import { ExternalLink, Package, RefreshCw, Sparkles, X } from 'lucide-react';
import { listCampaignProducts, type CampaignProduct, type OpenCampaign } from '../lib/db';
import { CoverImage } from './MediaTile';

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function BrandMark({
  name,
  logoUrl,
  size = 40,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const show = Boolean(logoUrl) && !broken;
  return (
    <div
      className="rounded-lg bg-surface-2 border border-line flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {show ? (
        // Logos are stored as square tiles carrying their own background, so
        // they fill the chip. `contain` would leave the app's surface colour
        // showing through a transparent mark, which is how a dark green
        // wordmark disappears on a dark surface.
        <img
          src={logoUrl as string}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          className="font-bold text-white w-full h-full flex items-center justify-center bg-gradient-kyro"
          style={{ fontSize: size * 0.38 }}
        >
          {name.trim().charAt(0).toUpperCase() || 'K'}
        </span>
      )}
    </div>
  );
}

function ProductCard({ product }: { product: CampaignProduct }) {
  return (
    <div className="border border-line rounded-xl overflow-hidden bg-surface-2">
      <div className="aspect-square">
        <CoverImage src={product.imageUrl} name={product.name} />
      </div>
      <div className="p-3 space-y-1">
        <p className="text-sm font-semibold text-heading leading-snug">{product.name}</p>
        {product.priceCents != null && (
          <p className="text-sm text-emerald-400 font-semibold tabular-nums">
            {money(product.priceCents)}
          </p>
        )}
        {product.description && (
          <p className="text-xs text-muted leading-relaxed line-clamp-3">{product.description}</p>
        )}
        {product.externalUrl && (
          <a
            href={product.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200 pt-0.5"
          >
            View listing <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

export function CampaignDetailModal({
  campaign,
  status,
  onClose,
  onApply,
  onUpload,
}: {
  campaign: OpenCampaign;
  status: 'accepted' | 'pending' | 'rejected' | 'withdrawn' | null;
  onClose: () => void;
  onApply: () => void;
  onUpload: () => void;
}) {
  const [products, setProducts] = useState<CampaignProduct[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listCampaignProducts(campaign.id);
      if (alive) setProducts(res.data);
    })();
    return () => {
      alive = false;
    };
  }, [campaign.id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const rate =
    campaign.commissionBps != null
      ? `${(campaign.commissionBps / 100).toFixed(campaign.commissionBps % 100 === 0 ? 0 : 1)}%`
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[21/9]">
          <CoverImage src={campaign.coverUrl} name={campaign.brandName} />
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/90 hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-start gap-3">
            <BrandMark name={campaign.brandName} logoUrl={campaign.brandLogoUrl} size={48} />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-heading leading-tight">{campaign.name}</h2>
              <p className="text-sm text-muted">{campaign.brandName}</p>
            </div>
            {status === 'accepted' && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 whitespace-nowrap">
                You're on this
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-line bg-surface-2">
              <p className="text-xs text-faint">You earn</p>
              <p className="text-base font-bold text-emerald-400 mt-0.5">
                {rate ? `${rate} of each order` : 'Set by the brand'}
              </p>
            </div>
            <div className="p-4 rounded-xl border border-line bg-surface-2">
              <p className="text-xs text-faint">Money clears after</p>
              <p className="text-base font-bold text-heading mt-0.5">
                {campaign.clearingDays ?? 30} days
              </p>
            </div>
          </div>

          {campaign.brief && (
            <Section title="About this campaign">
              <p className="text-sm text-body leading-relaxed">{campaign.brief}</p>
            </Section>
          )}

          {campaign.contentStyle && (
            <Section title="The style they want">
              <div className="p-4 rounded-xl border border-purple-400/25 bg-purple-400/5 flex gap-3">
                <Sparkles size={15} className="text-purple-300 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-body leading-relaxed">{campaign.contentStyle}</p>
              </div>
            </Section>
          )}

          {campaign.deliverableSpec && (
            <Section title="Deliverable">
              <p className="text-sm text-body leading-relaxed">{campaign.deliverableSpec}</p>
            </Section>
          )}

          <Section title="Products you'd be selling">
            {products === null ? (
              <div className="flex items-center gap-2 text-sm text-muted py-2">
                <RefreshCw size={14} className="animate-spin" /> Loading…
              </div>
            ) : products.length === 0 ? (
              <div className="p-5 rounded-xl border border-line bg-surface-2 text-center">
                <Package size={22} className="mx-auto text-faint mb-2" />
                <p className="text-sm text-muted">The brand hasn't listed products yet.</p>
                <p className="text-xs text-faint mt-1">
                  Ask them in the campaign chat before you shoot.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </Section>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-line">
            {status === 'accepted' ? (
              <button
                type="button"
                onClick={() => { onClose(); onUpload(); }}
                className="px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold"
              >
                Upload a video
              </button>
            ) : status === 'pending' ? (
              <span className="px-4 py-2.5 rounded-lg border border-line bg-surface-2 text-sm font-semibold text-muted">
                Applied — waiting on the brand
              </span>
            ) : (
              <button
                type="button"
                onClick={() => { onClose(); onApply(); }}
                className="px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold"
              >
                {status === 'rejected' ? 'Apply again' : 'Apply to join'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-line text-muted hover:text-heading"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
