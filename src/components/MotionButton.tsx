/**
 * The primary call to action, with a little life in it.
 *
 * The button leans a few degrees toward the cursor while the pointer is over
 * it, carries a soft highlight that follows the same point, and lets the
 * arrow run ahead. On leaving, it springs back past centre and settles,
 * which is what makes it read as a physical object rather than a rectangle
 * changing colour.
 *
 * Three rules it keeps:
 *
 * The lean is small. Six degrees at the corners. Past about eight it stops
 * looking like weight and starts looking like a bug.
 *
 * It never moves on touch. A lean toward the cursor needs a cursor, and on a
 * phone the only pointer event is the tap itself, which would fire the
 * animation at the same moment the page navigates away.
 *
 * It is off entirely under prefers-reduced-motion. Someone who has asked
 * their operating system for less movement has asked every site, and motion
 * sickness is a real condition rather than a preference to talk them out of.
 * They still get the colour and shadow change, so the button is no less
 * obviously a button.
 */

import { useCallback, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

/** Degrees of tilt at the far corner. Deliberately restrained. */
const MAX_TILT = 6;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function MotionButton({
  children,
  onClick,
  size = 'md',
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [tilt, setTilt] = useState<{ x: number; y: number } | null>(null);
  const [glow, setGlow] = useState({ x: 50, y: 50 });

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    // Touch reports a pointer only while a finger is down, which is the tap.
    if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    // Lean toward the cursor: the far edge lifts, the near edge drops.
    setTilt({ x: (0.5 - py) * MAX_TILT * 2, y: (px - 0.5) * MAX_TILT * 2 });
    setGlow({ x: px * 100, y: py * 100 });
  }, []);

  const onPointerLeave = useCallback(() => {
    setTilt(null);
    setGlow({ x: 50, y: 50 });
  }, []);

  const pad = size === 'lg' ? 'px-8 py-4 text-lg' : 'px-8 py-3.5';
  const active = tilt !== null;

  return (
    <button
      ref={ref}
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{
        transform: tilt
          ? `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.03)`
          : undefined,
        // Fast and linear while following the cursor, so the lean tracks
        // rather than lags. Slower with an overshoot on release, which is
        // what reads as a spring.
        transitionTimingFunction: active ? 'linear' : 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        transitionDuration: active ? '90ms' : '520ms',
      }}
      className={`group relative isolate overflow-hidden ${pad} rounded-full bg-gradient-kyro text-white font-semibold
        inline-flex items-center justify-center gap-2 transition-[transform,box-shadow]
        hover:shadow-xl hover:shadow-purple-600/40
        motion-reduce:transform-none motion-reduce:transition-none
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-app
        ${className}`}
    >
      {/* The highlight sits under the label and follows the same point the
          tilt is reading, so the two read as one gesture. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 motion-reduce:hidden"
        style={{
          background: `radial-gradient(18rem circle at ${glow.x}% ${glow.y}%, rgba(255,255,255,0.28), transparent 60%)`,
        }}
      />
      {children}
      <ArrowRight
        size={size === 'lg' ? 20 : 18}
        className="transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
      />
    </button>
  );
}
