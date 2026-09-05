export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const sd = (xs: number[]) => {
  if (xs.length < 2) return 1;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) || 1;
};
export const num = (s: string): number => {
  const v = Number(s);
  return s === '' || s === 'NA' || Number.isNaN(v) ? NaN : v;
};
export const bool = (s: string) => s === 'TRUE' || s === 'true' || s === '1';
export const r1 = (v: number) => Math.round(v * 10) / 10;
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Convert one team's metric into a 1-10 rating relative to the league:
 * 5.5 is average, each standard deviation is worth `spread` points.
 */
export function rateAmong(value: number, league: number[], opts: { invert?: boolean; spread?: number } = {}): number {
  const valid = league.filter((x) => Number.isFinite(x));
  if (!Number.isFinite(value) || valid.length < 4) return 5.5;
  const z = (value - mean(valid)) / sd(valid);
  const signed = opts.invert ? -z : z;
  return clamp(r1(5.5 + signed * (opts.spread ?? 1.6)), 1, 10);
}

/** Percentile (0-100) of a value within a population; 50 when unknown. */
export function percentile(value: number, pop: number[]): number {
  const valid = pop.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!Number.isFinite(value) || valid.length < 3) return 50;
  let below = 0;
  for (const x of valid) { if (x < value) below++; else break; }
  return (below / valid.length) * 100;
}

/** Shrink a noisy per-team estimate toward the league mean by sample size. */
export function shrink(value: number, leagueMean: number, n: number, k: number): number {
  if (!Number.isFinite(value)) return leagueMean;
  const w = n / (n + k);
  return w * value + (1 - w) * leagueMean;
}

export const NV_TO_ID: Record<string, string> = { LA: 'lar' };
export const idFromNv = (abbr: string) => NV_TO_ID[abbr] ?? abbr.toLowerCase();
export const nvFromId = (id: string) => (id === 'lar' ? 'LA' : id.toUpperCase());
