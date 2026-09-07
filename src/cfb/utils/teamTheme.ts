/**
 * A team's colours, made safe to build a page out of.
 *
 * Raw brand colours cannot be used directly on a dark UI: half the league is
 * navy (invisible on this ground) and the rest includes Vegas silver and
 * Pittsburgh gold (blinding as a background, illegible as text). So every team
 * colour is pushed through the same treatment — hue kept, lightness and
 * saturation forced into a band that works — which is how the page can feel like
 * the team without any of them breaking it.
 */

interface Hsl { h: number; s: number; l: number }

function hexToHsl(hex: string): Hsl | null {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

const css = (c: Hsl, alpha = 1) =>
  alpha >= 1 ? `hsl(${c.h.toFixed(0)} ${c.s.toFixed(0)}% ${c.l.toFixed(0)}%)`
             : `hsla(${c.h.toFixed(0)}, ${c.s.toFixed(0)}%, ${c.l.toFixed(0)}%, ${alpha})`;

export interface TeamTheme {
  /** Deep tint for the page ground — dark enough that white text always reads. */
  ground: string;
  groundSoft: string;
  /** Panel tint, a step up from the ground. */
  panel: string;
  /** The team colour, forced bright enough to read on a dark ground. */
  accent: string;
  accentSoft: string;
  /** Second colour, when the team has one that is not effectively the first. */
  accent2: string;
  /** Gradient for the top of the page. */
  gradient: readonly [string, string, string];
}

/**
 * `primary` and `secondary` come from the dataset as hex. Anything unparseable
 * falls back to the app's own greens, so a bad value degrades to the default
 * look rather than an invisible page.
 */
export function teamTheme(primary?: string, secondary?: string): TeamTheme {
  const p = (primary && hexToHsl(primary)) || { h: 158, s: 78, l: 46 };
  const s = (secondary && hexToHsl(secondary)) || { h: p.h, s: Math.max(10, p.s - 30), l: 70 };

  // Very dark, lightly saturated: a tint of the ground, never a colour field.
  const ground = { h: p.h, s: Math.min(38, Math.max(14, p.s * 0.45)), l: 7 };
  const panel = { h: p.h, s: Math.min(30, Math.max(10, p.s * 0.35)), l: 11 };
  // Bright enough to read as text or a border on that ground.
  const accent = { h: p.h, s: Math.max(45, Math.min(92, p.s)), l: Math.min(66, Math.max(52, p.l)) };
  const alt = Math.abs(s.h - p.h) < 18 && Math.abs(s.l - p.l) < 14
    ? { h: p.h, s: Math.max(20, p.s * 0.5), l: 76 }
    : { h: s.h, s: Math.max(35, Math.min(85, s.s)), l: Math.min(72, Math.max(56, s.l)) };

  return {
    ground: css(ground),
    groundSoft: css(ground, 0.86),
    panel: css(panel),
    accent: css(accent),
    accentSoft: css(accent, 0.16),
    accent2: css(alt),
    gradient: [css({ ...ground, l: 13 }), css({ ...ground, l: 9 }), css({ ...ground, l: 6 })] as const,
  };
}
