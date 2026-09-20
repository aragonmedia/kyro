/**
 * Image and video tiles that never render a broken box.
 *
 * Two problems this solves:
 *
 *   1. A campaign with no cover image. Falling back to a stock photo is worse
 *      than falling back to nothing, because a creator choosing what to make
 *      is looking at the product and a generic image actively misleads them.
 *   2. A submitted video, which has no thumbnail because KYRO does not
 *      generate one. The card still needs to read as a piece of video.
 *
 * Both fall back to a generated tile whose colours are derived from the name,
 * so the same brand or campaign always gets the same treatment and a grid of
 * them looks intentional rather than random.
 */

import { useState } from 'react';
import { Play } from 'lucide-react';

/**
 * Deterministic hue from a string. Same input, same colour, every render and
 * every device. Math.random here would make a grid flicker on each paint.
 */
function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) % 360;
  }
  return h;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function GeneratedTile({ name, className }: { name: string; className?: string }) {
  const h = hueFor(name);
  return (
    <div
      className={`w-full h-full flex items-center justify-center ${className ?? ''}`}
      style={{
        background: `linear-gradient(135deg, hsl(${h} 62% 32%) 0%, hsl(${(h + 48) % 360} 58% 22%) 100%)`,
      }}
      aria-hidden
    >
      <span className="text-2xl font-bold text-white/85 tracking-tight">{initials(name)}</span>
    </div>
  );
}

/** A campaign or brand cover. Falls back to a generated tile, never a stock photo. */
export function CoverImage({
  src,
  name,
  className,
}: {
  src: string | null | undefined;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return <GeneratedTile name={name} className={className} />;

  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className={`w-full h-full object-cover ${className ?? ''}`}
    />
  );
}

/**
 * A submitted video.
 *
 * KYRO stores the file but does not extract a frame, so there is no thumbnail
 * of the video itself. The campaign's product image is the next best thing and
 * the one a creator recognises at a glance, so it sits behind the play
 * affordance when the campaign has one. Failing that, the generated tile keeps
 * the card from reading as broken.
 */
export function VideoTile({
  name,
  label,
  src,
  /**
   * Whether to draw the play button.
   *
   * Off when the image already carries one — a frame captured from a player
   * has it baked in, and stacking ours on top produces two concentric rings.
   */
  showPlay = true,
}: {
  name: string;
  label?: string;
  src?: string | null;
  showPlay?: boolean;
}) {
  return (
    <div className="relative w-full h-full">
      <CoverImage src={src} name={name} />
      {showPlay && <div className="absolute inset-0 bg-black/20" aria-hidden />}
      {showPlay && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
            <Play size={18} className="text-white ml-0.5" fill="currentColor" />
          </div>
        </div>
      )}
      {label && (
        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
          <p className="text-xs font-semibold text-white/90 truncate">{label}</p>
        </div>
      )}
    </div>
  );
}
