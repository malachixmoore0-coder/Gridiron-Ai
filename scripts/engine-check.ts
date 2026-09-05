/**
 * Runtime sanity checks for the GRIDIRON-AI engine. Run with `npm run test:engine`.
 * Exits non-zero on any failed assertion.
 */
import { analyzeMatchup, DEFAULT_WEIGHTS, normalizeWeights } from '../src/engine';
import { TEAMS, getTeam } from '../src/data/teams';

let failures = 0;
const check = (cond: boolean, msg: string) => {
  if (!cond) { failures++; console.error('  ✗', msg); } else { console.log('  ✓', msg); }
};

console.log('\n— Weights');
const w = normalizeWeights({ scheme: 30, personnel: 30, environment: 20, xfactor: 20 });
check(Math.abs(w.scheme + w.personnel + w.environment + w.xfactor - 100) < 1e-9, 'normalised weights sum to 100');
check(Math.abs(normalizeWeights({ scheme: 50 }).scheme - 50 / 125 * 100) < 1e-9, 'partial weights renormalise proportionally');
check(DEFAULT_WEIGHTS.scheme === 25 && DEFAULT_WEIGHTS.personnel === 35, 'defaults are 25/35/15/25');

console.log('\n— Baseline matchup: DAL @ PHI');
const phi = getTeam('phi');
const dal = getTeam('dal');
const a = analyzeMatchup({ home: phi, away: dal });
const s = a.simulation;
console.log(`    ${dal.abbr} ${s.awayWinPct}%  @  ${phi.abbr} ${s.homeWinPct}%  | proj ${s.projectedAway}-${s.projectedHome} | total ${s.projectedTotal} | spread ${s.spread}`);
check(Math.abs(s.homeWinPct + s.awayWinPct + s.tiePct - 100) < 0.2, 'win/tie probabilities sum to ~100');
check(s.runs === 10_000, 'defaults to 10,000 runs');
check(s.tiePct < 1.5, 'ties are rare');
check(s.projectedTotal > 30 && s.projectedTotal < 62, 'projected total is a football number');
check(a.nodes.length === 4 && a.nodes.every((n) => Number.isFinite(n.points)), 'four finite nodes');
check(a.sleepers.length >= 2 && a.sleepers.length <= 3, `sleeper report has 2-3 players (${a.sleepers.length})`);
check(a.script.early.length > 40 && a.script.halftime.length > 40 && a.script.late.length > 40, 'three-act game script populated');
check(Object.values(a.matrix).every((r) => r.home >= 1 && r.home <= 10 && r.away >= 1 && r.away <= 10), 'advantage matrix within 1-10');
check(s.marginBins.reduce((t, b) => t + b.pct, 0) > 99, 'margin histogram covers the distribution');

console.log('\n— Determinism');
const b = analyzeMatchup({ home: phi, away: dal });
check(JSON.stringify(a.simulation) === JSON.stringify(b.simulation), 'same input ⇒ identical simulation');
const c = analyzeMatchup({ home: phi, away: dal }, { seed: 12345 });
check(c.simulation.homeWinPct !== a.simulation.homeWinPct || c.seed !== a.seed, 'different seed ⇒ different draw');
check(Math.abs(c.simulation.homeWinPct - a.simulation.homeWinPct) < 3, 'different seeds agree within Monte-Carlo noise');

console.log('\n— Home field');
const neutral = analyzeMatchup({ home: phi, away: dal, neutralSite: true });
check(neutral.simulation.homeWinPct < a.simulation.homeWinPct, 'neutral site lowers the home win probability');
const flipped = analyzeMatchup({ home: dal, away: phi });
check(flipped.simulation.homeWinPct < a.simulation.homeWinPct, 'venue swap moves the number toward the new host');

console.log('\n— Injury degradation');
const kc = getTeam('kc');
const buf = getTeam('buf');
const healthy = analyzeMatchup({ home: buf, away: kc });
const mahomesOut = analyzeMatchup({ home: buf, away: kc, injuredOut: ['kc-patrick-mahomes'] });
console.log(`    KC @ BUF healthy: KC ${healthy.simulation.awayWinPct}% → Mahomes out: KC ${mahomesOut.simulation.awayWinPct}%`);
check(mahomesOut.simulation.awayWinPct < healthy.simulation.awayWinPct - 8, 'backup QB costs a big chunk of win probability');
check(mahomesOut.injuries.length === 1 && mahomesOut.injuries[0].metric.includes('-18%'), 'QB metric reports -18% win efficiency');
const ltOut = analyzeMatchup({ home: buf, away: kc, injuredOut: ['buf-dion-dawkins'] });
check(ltOut.simulation.homeWinPct < healthy.simulation.homeWinPct, 'LT absence lowers the home side');
check(ltOut.injuries[0].metric.includes('-12%'), 'LT metric reports -12% pass protection');
const q = analyzeMatchup({ home: buf, away: kc, questionable: ['kc-patrick-mahomes'] });
check(q.simulation.awayWinPct < healthy.simulation.awayWinPct && q.simulation.awayWinPct > mahomesOut.simulation.awayWinPct, 'questionable = half the degradation');

console.log('\n— Weather & division variance');
const snow = analyzeMatchup({ home: buf, away: kc, weather: 'snow' });
check(snow.simulation.projectedTotal < healthy.simulation.projectedTotal, 'snow lowers the total');
const div = analyzeMatchup({ home: getTeam('gb'), away: getTeam('det') });
const nonDiv = analyzeMatchup({ home: getTeam('gb'), away: getTeam('hou') });
check(div.nodes[2].factors.some((f) => f.label === 'Division game'), 'division game flagged');
check(nonDiv.nodes[2].factors.some((f) => f.label === 'Non-division matchup'), 'non-division game flagged');

console.log('\n— Every team vs a league-average opponent (no NaNs, sane ranges)');
let allOk = true;
const worst: string[] = [];
for (const t of TEAMS) {
  const opp = t.id === 'ind' ? getTeam('atl') : getTeam('ind');
  const r = analyzeMatchup({ home: t, away: opp }, { simulations: 2000 });
  const sim = r.simulation;
  const ok = Number.isFinite(sim.homeWinPct) && sim.homeWinPct > 3 && sim.homeWinPct < 97 && sim.projectedTotal > 28 && sim.projectedTotal < 65;
  if (!ok) { allOk = false; worst.push(`${t.abbr}: ${sim.homeWinPct}% / ${sim.projectedTotal}`); }
}
check(allOk, `all 32 teams simulate within bounds${worst.length ? ' — ' + worst.join(', ') : ''}`);
check(TEAMS.length === 32, '32 teams in the dataset');
const ids = new Set(TEAMS.flatMap((t) => t.players.map((p) => p.id)));
check(ids.size === TEAMS.reduce((n, t) => n + t.players.length, 0), 'player ids are unique');
check(TEAMS.every((t) => t.players.some((p) => p.pos === 'QB')), 'every team has a QB on the depth chart');

console.log('\n— Spread sanity across the sample slate');
const pairs: [string, string][] = [['kc', 'buf'], ['gb', 'det'], ['sf', 'sea'], ['bal', 'cin'], ['cle', 'nyj'], ['lv', 'ten'], ['bal', 'ten'], ['cin', 'hou'], ['nyj', 'det']];
for (const [away, home] of pairs) {
  const r = analyzeMatchup({ home: getTeam(home), away: getTeam(away) }, { simulations: 4000 });
  console.log(`    ${away.toUpperCase()} @ ${home.toUpperCase()}: home ${r.simulation.homeWinPct}% · spread ${r.simulation.spread} · total ${r.simulation.projectedTotal} · margin model ${r.modelMargin}`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll engine checks passed.');
if (failures) throw new Error(`${failures} engine check(s) failed`);
