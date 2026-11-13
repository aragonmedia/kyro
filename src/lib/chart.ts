/**
 * The maths every KYRO line chart shares.
 *
 * The admin revenue chart and the creator earnings chart plot different
 * things for different people, but they are the same picture: one money
 * series over time, four gridlines, a smoothed path. Keeping the axis and
 * the curve in one place is what stops the two drifting into charts that
 * round differently and curve differently and quietly stop looking like one
 * product.
 *
 * Everything here is pure. No React, no DOM, no formatting decisions beyond
 * what a number reads as on an axis.
 */

/**
 * An axis a person would say out loud.
 *
 * The step is rounded first and the top falls out of it, rather than the
 * other way round. Rounding the top and then quartering it is what produces
 * an axis reading $0, $1.3K, $2.5K, $3.8K: every intermediate tick is a
 * number nobody would ever choose.
 */
export function axisTop(maxValue: number, ticks: number): number {
  if (maxValue <= 0) return ticks;
  const rough = maxValue / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / magnitude;
  /* 1.5 and 3 are on the ladder because without them a series peaking just
     over a round number doubles the axis and spends half the panel on empty
     space above the line. */
  const step = (scaled <= 1 ? 1
    : scaled <= 1.5 ? 1.5
      : scaled <= 2 ? 2
        : scaled <= 2.5 ? 2.5
          : scaled <= 3 ? 3
            : scaled <= 5 ? 5 : 10) * magnitude;
  return step * ticks;
}

/**
 * A smooth path through the points.
 *
 * Catmull-Rom converted to cubic beziers, with every control point clamped
 * inside the range of the two values it sits between. Without the clamp a
 * curve through a spike dips below the points either side of it, and on a
 * money chart that invents a fall that did not happen.
 */
export function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const lo = Math.min(p1.y, p2.y);
    const hi = Math.max(p1.y, p2.y);
    const c1y = Math.min(Math.max(p1.y + (p2.y - p0.y) / 6, lo), hi);
    const c2y = Math.min(Math.max(p2.y - (p3.y - p1.y) / 6, lo), hi);

    d += ` C ${p1.x + (p2.x - p1.x) / 3} ${c1y}, ${p2.x - (p2.x - p1.x) / 3} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** $0, $1.2K, $340K, $1.8M. Compact from a thousand up, as an axis wants. */
export function axisMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(dollars >= 10_000_000 ? 0 : 1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(dollars >= 10_000 ? 0 : 1)}K`;
  return `$${Math.round(dollars)}`;
}

/** 0, 1.2K, 340K. The same ladder for a count rather than money. */
export function axisCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return `${Math.round(n)}`;
}

/**
 * Where a pointer landed, as an index into a set of plotted points.
 *
 * Shared because the fiddly part is the same everywhere: the SVG is scaled
 * to its panel, so a client x has to come back into chart units before it
 * can be compared to anything, and that conversion written twice is a
 * conversion wrong once.
 */
export function nearestIndex(
  clientX: number,
  box: DOMRect,
  viewWidth: number,
  points: Array<{ x: number }>
): number | null {
  if (points.length === 0 || box.width === 0) return null;
  const x = ((clientX - box.left) / box.width) * viewWidth;
  let nearest = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (Math.abs(points[i].x - x) < Math.abs(points[nearest].x - x)) nearest = i;
  }
  return nearest;
}
