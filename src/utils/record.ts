import type { PredictionRecord } from '@/data/liveTypes';

export interface RecordSummary {
  finals: number;
  su: number;
  ats: number; atsL: number; atsP: number;
  ou: number; ouL: number; ouP: number;
  brier: number | null;
  /** Mean absolute error of the projected margin and total, in points. */
  spreadMae: number | null;
  totalMae: number | null;
  /** Share of finals where the model favourite was also the market favourite (or no line). */
  open: number;
  locked: number;
}

export function summarize(records: PredictionRecord[]): RecordSummary {
  const finals = records.filter((r) => r.status === 'final' && r.result);
  const n = finals.length;
  const count = (f: (r: PredictionRecord) => boolean) => finals.filter(f).length;
  return {
    finals: n,
    su: count((r) => r.result!.suCorrect),
    ats: count((r) => r.result!.ats === 'win'), atsL: count((r) => r.result!.ats === 'loss'), atsP: count((r) => r.result!.ats === 'push'),
    ou: count((r) => r.result!.ou === 'win'), ouL: count((r) => r.result!.ou === 'loss'), ouP: count((r) => r.result!.ou === 'push'),
    brier: n ? finals.reduce((s, r) => s + r.result!.brier, 0) / n : null,
    spreadMae: n ? finals.reduce((s, r) => s + Math.abs(r.result!.spreadError), 0) / n : null,
    totalMae: n ? finals.reduce((s, r) => s + Math.abs(r.result!.totalError), 0) / n : null,
    open: records.filter((r) => r.status === 'open').length,
    locked: records.filter((r) => r.status === 'locked').length,
  };
}

export const pctOf = (hits: number, n: number) => (n ? `${Math.round((hits / n) * 100)}%` : '—');

export interface CalibrationRow { label: string; lo: number; hi: number; games: number; favWins: number; expected: number; }

/**
 * Calibration by favourite confidence: for games where the model favourite
 * had 50-60%, 60-70%, … how often did that favourite actually win, versus the
 * average probability it was given?
 */
export function calibration(records: PredictionRecord[]): CalibrationRow[] {
  const finals = records.filter((r) => r.status === 'final' && r.result);
  const rows: CalibrationRow[] = [
    { label: '50–60%', lo: 50, hi: 60, games: 0, favWins: 0, expected: 0 },
    { label: '60–70%', lo: 60, hi: 70, games: 0, favWins: 0, expected: 0 },
    { label: '70–80%', lo: 70, hi: 80, games: 0, favWins: 0, expected: 0 },
    { label: '80–90%', lo: 80, hi: 90, games: 0, favWins: 0, expected: 0 },
    { label: '90–100%', lo: 90, hi: 101, games: 0, favWins: 0, expected: 0 },
  ];
  for (const r of finals) {
    const favPct = Math.max(r.homeWinPct, r.awayWinPct);
    const row = rows.find((x) => favPct >= x.lo && favPct < x.hi);
    if (!row) continue;
    row.games++;
    row.expected += favPct;
    if (r.result!.suCorrect) row.favWins++;
  }
  return rows;
}

/**
 * A win rate is a measurement, and a measurement without an error bar is a
 * claim.
 *
 * Eleven graded games at 10-1 reads as a 91% model. The honest version of that
 * same record is "somewhere between 59% and 100%, and we cannot yet tell which"
 * — which is a completely different thing to show somebody deciding whether to
 * trust the projections. Sports records are small samples for a long time, and
 * the gap between the headline and the interval is widest exactly when the
 * headline is most exciting.
 *
 * Wilson rather than the textbook normal approximation: at n=11, or at rates
 * near 0 and 1, the normal interval runs past 100% and stops meaning anything.
 * Wilson stays inside the bounds and behaves at small n, which is the only
 * regime this app will be in for months.
 */
export interface Interval { lo: number; hi: number }

export function wilson(hits: number, n: number, z = 1.96): Interval | null {
  if (n <= 0) return null;
  const p = hits / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    lo: Math.max(0, (centre - spread) / denom),
    hi: Math.min(1, (centre + spread) / denom),
  };
}

/** The interval as a caption, or null when there is nothing to caption. */
export function intervalLabel(hits: number, n: number): string | null {
  const ci = wilson(hits, n);
  if (!ci) return null;
  return `95% CI ${Math.round(ci.lo * 100)}–${Math.round(ci.hi * 100)}%`;
}

/**
 * How much of a verdict a sample supports.
 *
 * The thresholds are not arbitrary. Telling a 54% model from a coin flip needs
 * a standard error near two points, which is roughly six hundred games; below
 * about a hundred the interval is still wide enough to contain outcomes a
 * person would describe completely differently. So: three honest bands, and no
 * point at which the app stops mentioning the sample size, because there is no
 * point at which it stops mattering.
 */
export type Confidence = 'noise' | 'early' | 'meaningful';

export const confidenceOf = (n: number): Confidence =>
  n >= 600 ? 'meaningful' : n >= 100 ? 'early' : 'noise';

export function sampleNote(n: number): string {
  if (n === 0) return 'Nothing graded yet.';
  const games = `${n} graded ${n === 1 ? 'game' : 'games'}`;
  switch (confidenceOf(n)) {
    case 'noise':
      return `${games}. That is far too few to judge a model — a good one and a coin flip look the same over a night or two, and both hot and cold streaks of this length are ordinary. Read the intervals, not the headline.`;
    case 'early':
      return `${games}. Enough to spot something badly wrong, not enough to prove something good. The interval is still wider than the difference between an excellent model and an average one.`;
    case 'meaningful':
      return `${games}. Now the numbers carry real information — the interval is finally tight enough to separate a genuine edge from luck.`;
  }
}
