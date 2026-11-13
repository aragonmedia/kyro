/**
 * The y axis, as HTML rather than SVG text.
 *
 * Text inside a scaled SVG shrinks with the viewBox. A label set at 13 units
 * in a 760-unit drawing is thirteen pixels on a laptop and five on a phone,
 * which is how a chart ends up with an axis nobody can read. Keeping the
 * labels in HTML means they are the size the stylesheet says they are, at
 * every width, and they wear the same tokens as the rest of the portal.
 *
 * The caller gives each label the fraction of the panel's height its
 * gridline sits at, which it already knows: it drew the gridline.
 */

export interface AxisLabel {
  /** What the gridline reads. */
  text: string;
  /** Where it sits, 0 at the top of the panel and 1 at the bottom. */
  at: number;
}

/** Width of the gutter, in pixels, shared by the column and the padding. */
export const AXIS_GUTTER = 48;

/**
 * Sits in a positioned box whose height is the plot's, and hangs its labels
 * off the left of it. The caller pads that much space into the row, so the
 * column lands beside the drawing rather than on top of it.
 */
export function AxisGutter({ labels }: { labels: AxisLabel[] }) {
  return (
    <div
      className="absolute inset-y-0 pointer-events-none"
      style={{ width: AXIS_GUTTER, left: -AXIS_GUTTER }}
      aria-hidden
    >
      {labels.map((l) => (
        <span
          key={`${l.at}-${l.text}`}
          className="absolute right-2 -translate-y-1/2 text-[11px] text-faint tabular-nums whitespace-nowrap"
          style={{ top: `${l.at * 100}%` }}
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}
