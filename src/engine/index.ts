/**
 * GRIDIRON-AI — NFL bias & predictive analytics engine.
 *
 * analyzeMatchup() runs the four weighted nodes, converts their edges into a
 * projected margin and total, then Monte-Carlo simulates the game (default
 * 10,000 runs) to produce win probability, spread/total, a game script, an
 * advantage matrix and a sleeper report.
 */
import type { EngineOptions, MatchupAnalysis, MatchupInput, Team } from './types';
import { normalizeWeights, LEAGUE_AVG_POINTS, HFA_DEFAULT } from './weights';
import { hashString } from './rng';
import { assessInjuries, applyDegradation } from './injuries';
import { schemeNode, personnelNode, environmentNode, xfactorNode } from './nodes';
import { buildMatrix } from './matrix';
import { simulate } from './simulate';
import { buildGameScript } from './narrative';
import { clamp, mean, round } from './math';

export * from './types';
export { DEFAULT_WEIGHTS, normalizeWeights, INJURY_DEGRADATION, HFA_MIN, HFA_MAX, HFA_DEFAULT } from './weights';
export { hashString } from './rng';

/** Stable key for a matchup + injury state, used to seed the RNG. */
export function matchupKey(input: MatchupInput): string {
  const inj = [...(input.injuredOut ?? [])].sort().join(',');
  const q = [...(input.questionable ?? [])].sort().join(',');
  return `${input.away.id}@${input.home.id}|${input.neutralSite ? 'N' : 'H'}|${input.weather ?? ''}|${input.primetime ? 'P' : ''}|${inj}|${q}`;
}

/** Overall unit strength relative to league average (positive = better). */
function offenseStrength(t: Team) {
  return mean([t.offense.qb, t.offense.passEfficiency, t.offense.rushEfficiency, t.offense.explosiveness]) - 5.5;
}
function defenseStrength(t: Team) {
  return mean([t.defense.passDefense, t.defense.rushDefense, t.defense.takeaways, (t.defense.prwr - 0.44) * 20 + 5.5]) - 5.5;
}

export function analyzeMatchup(input: MatchupInput, options: EngineOptions = {}): MatchupAnalysis {
  const weights = normalizeWeights(options.weights);
  const runs = clamp(Math.round(options.simulations ?? 10_000), 200, 100_000);
  const seed = options.seed ?? hashString(matchupKey(input));

  // Injury degradation first so every node sees the depth chart that will actually play.
  const injHome = assessInjuries(input.home, 'home', input);
  const injAway = assessInjuries(input.away, 'away', input);
  const home = applyDegradation(input.home, injHome.degradation);
  const away = applyDegradation(input.away, injAway.degradation);

  const scheme = schemeNode(home, away, weights.scheme);
  const personnel = personnelNode(home, away, weights.personnel, injHome.pointsLost, injAway.pointsLost);
  const { node: environment, extras: env } = environmentNode(home, away, input, weights.environment, options.homeFieldBase ?? HFA_DEFAULT);
  const { node: xfactor, sleepers } = xfactorNode(home, away, input, weights.xfactor);
  const nodes = [scheme, personnel, environment, xfactor];

  let modelMargin = nodes.reduce((s, n) => s + n.points, 0);
  if (env.isRivalry) modelMargin *= 0.92; // familiarity compresses spreads
  modelMargin = clamp(modelMargin, -24, 24);

  // Expected total: league average scaled by both offences vs both defences, pace and weather.
  const offH = offenseStrength(home);
  const offA = offenseStrength(away);
  const defH = defenseStrength(home);
  const defA = defenseStrength(away);
  const pace = (home.coaching.pace + away.coaching.pace) / 2;
  const paceFactor = 1 + ((pace - 63) / 63) * 0.6;
  let total = (LEAGUE_AVG_POINTS * 2 + (offH + offA) * 1.9 - (defH + defA) * 1.5) * paceFactor + env.totalAdjust;
  total = clamp(total, 30, 62);

  const expectedHome = clamp((total + modelMargin) / 2, 6, 45);
  const expectedAway = clamp((total - modelMargin) / 2, 6, 45);

  const sim = simulate({
    expectedHome,
    expectedAway,
    varianceMultiplier: env.varianceMultiplier,
    runs,
    seed,
    modelMargin,
  });

  const matrix = buildMatrix(home, away);
  const script = buildGameScript({ home, away, sim, matrix, nodes, env, sleepers, modelMargin });

  const { homeLeadsAtHalfPct: _h, clutchPct: _c, homeComebackPct: _hc, awayComebackPct: _ac, ...simulation } = sim;

  return {
    home: input.home,
    away: input.away,
    input,
    weights,
    nodes,
    matrix,
    injuries: [...injHome.impacts, ...injAway.impacts].sort((a, b) => b.pointsLost - a.pointsLost),
    simulation,
    script,
    sleepers,
    modelMargin: round(modelMargin, 2),
    seed,
  };
}
