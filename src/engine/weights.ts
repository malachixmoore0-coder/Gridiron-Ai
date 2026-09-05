import type { NodeWeights, Position } from './types';

export const DEFAULT_WEIGHTS: NodeWeights = {
  scheme: 25,
  personnel: 35,
  environment: 15,
  xfactor: 25,
};

/** Normalise partial/edited weights so they always sum to 100. */
export function normalizeWeights(w?: Partial<NodeWeights>): NodeWeights {
  const merged = { ...DEFAULT_WEIGHTS, ...(w ?? {}) };
  const total = merged.scheme + merged.personnel + merged.environment + merged.xfactor;
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  const k = 100 / total;
  return {
    scheme: merged.scheme * k,
    personnel: merged.personnel * k,
    environment: merged.environment * k,
    xfactor: merged.xfactor * k,
  };
}

/**
 * Points of margin one full "edge unit" is worth once the four nodes are
 * blended. A node edge of +10 (a total blow-out on that axis) at 100% weight
 * would move the line by this much.
 */
export const POINTS_PER_EDGE_UNIT = 2.0;

/** League-average expected points per team per game. */
export const LEAGUE_AVG_POINTS = 22.4;

/** Standard deviation of a single team's score around its expectation. */
export const SCORE_SD = 9.6;

/** Extra margin variance in division/rivalry games (multiplier on SD). */
export const RIVALRY_VARIANCE = 1.12;

/**
 * Injury degradation metrics — how much a starter's absence costs in the unit
 * they play in. `winEff` is the win-probability (percentage points) swing of
 * losing the starter for a backup at that position; `label` is what the UI
 * shows.
 */
export const INJURY_DEGRADATION: Record<Position, { winEff: number; label: string }> = {
  QB:   { winEff: 18, label: '-18% win efficiency (backup QB)' },
  LT:   { winEff: 12, label: '-12% pass protection' },
  OL:   { winEff: 5,  label: '-5% pass protection' },
  WR:   { winEff: 7,  label: '-7% passing efficiency' },
  TE:   { winEff: 4,  label: '-4% red-zone efficiency' },
  RB:   { winEff: 4,  label: '-4% rushing efficiency' },
  EDGE: { winEff: 8,  label: '-8% pass-rush win rate' },
  DT:   { winEff: 5,  label: '-5% run-stop rate' },
  LB:   { winEff: 4,  label: '-4% coverage vs TE/RB' },
  CB:   { winEff: 7,  label: '-7% coverage efficiency' },
  NCB:  { winEff: 5,  label: '-5% slot coverage' },
  S:    { winEff: 4,  label: '-4% deep coverage' },
  K:    { winEff: 2,  label: '-2% expected points on kicks' },
};

/** Roughly how many points of margin one win-probability point is worth near 50/50. */
export const POINTS_PER_WIN_PCT = 0.34;

/** Home-field advantage bounds (win-probability points). */
export const HFA_MIN = 2.5;
export const HFA_MAX = 4.5;
export const HFA_DEFAULT = 3.0;
