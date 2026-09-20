/**
 * Campaign cover upload, brand side.
 *
 * The cover is the first thing a creator sees when deciding whether to make a
 * video for this campaign, so it should be the brand's product, not a stock
 * photo. `campaigns.cover_url` has existed since the first schema and nothing
 * ever wrote to it; this is what writes to it.
 */

import { useRef, useState } from 'react';
import { ImagePlus, RefreshCw } from 'lucide-react';
import { setCampaignCover } from '../lib/db';
import { uploadCampaignCover } from '../lib/storage';
import { CoverImage } from './MediaTile';

export function CampaignCoverControl({
  campaignId,
  brandId,
  campaignName,
  coverUrl,
  onChanged,
}: {
  campaignId: string;
  brandId: string;
  campaignName: string;
  coverUrl: string | null;
  onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setBusy(true);

    const up = await uploadCampaignCover(brandId, file);
    if (up.error || !up.url) {
      setBusy(false);
      setError(up.error ?? 'Upload failed.');
      return;
    }

    const saved = await setCampaignCover(campaignId, up.url);
    setBusy(false);
    if (saved.error) {
      setError(saved.error);
      return;
    }
    onChanged();
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-line">
        <CoverImage src={coverUrl} name={campaignName} />
      </div>

      <div className="space-y-1 min-w-0">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0] ?? null);
            // Clear the input so picking the same file twice still fires.
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface-2 text-xs font-semibold text-muted hover:text-heading disabled:opacity-50"
        >
          {busy ? <RefreshCw size={12} className="animate-spin" /> : <ImagePlus size={12} />}
          {coverUrl ? 'Change cover' : 'Add cover'}
        </button>
        <p className={`text-xs ${error ? 'text-pink-300' : 'text-faint'}`}>
          {error || 'JPG, PNG or WebP up to 5 MB. Creators see this when browsing campaigns.'}
        </p>
      </div>
    </div>
  );
}
