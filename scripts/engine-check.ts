/**
 * Runtime sanity checks for the GRIDIRON-AI engine. Run with `npm run test:engine`.
 * Exits non-zero on any failed assertion.
 */
import { analyzeMatchup, DEFAULT_WEIGHTS, normalizeWeights } from '../src/engine';
import fs from 'node:fs';
import path from 'node:path';
import { TEAMS, getTeam } from '../src/data/teams';
import type { Team } from '../src/engine/types';
import { coverProbability, project, seedFor, simulate } from '../src/sports/engine';
import { GENERIC_LEAGUES, LEAGUES, profileFor } from '../src/sports/types';

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

console.log('\n— Live dataset (data/live/teams.json)');
const livePath = path.resolve(__dirname, '../data/live/teams.json');
if (fs.existsSync(livePath)) {
  const live = JSON.parse(fs.readFileSync(livePath, 'utf8')) as { generatedAt: string; season: number; teams: Team[] };
  check(live.teams.length === 32, `live dataset has 32 teams (generated ${live.generatedAt})`);
  check(live.teams.every((t) => t.players.some((p) => p.pos === 'QB' && p.role === 'starter')), 'every live team has a starting QB');
  const liveIds = new Set(live.teams.flatMap((t) => t.players.map((p) => p.id)));
  check(liveIds.size === live.teams.reduce((n, t) => n + t.players.length, 0), 'live player ids are unique');
  let bad: string[] = [];
  for (const t of live.teams) {
    const opp = live.teams.find((o) => o.id !== t.id)!;
    const r = analyzeMatchup({ home: t, away: opp }, { simulations: 1000 });
    if (!Number.isFinite(r.simulation.homeWinPct) || r.simulation.projectedTotal < 28 || r.simulation.projectedTotal > 65) bad.push(t.abbr);
  }
  check(bad.length === 0, `all live teams simulate within bounds${bad.length ? ' — ' + bad.join(', ') : ''}`);
  const sample = live.teams.find((t) => t.id === 'kc')!;
  const vs = live.teams.find((t) => t.id === 'buf')!;
  const r = analyzeMatchup({ home: vs, away: sample }, { simulations: 4000 });
  console.log(`    live KC @ BUF: BUF ${r.simulation.homeWinPct}% · spread ${r.simulation.spread} · total ${r.simulation.projectedTotal}`);
} else {
  console.log('  (no live dataset built yet — run npm run data:build)');
}

console.log('\n— Track record (predictions lock at kickoff, grade on the final)');
{
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { grade, updatePredictions } = require('../pipeline/compute/predictions') as typeof import('../pipeline/compute/predictions');
  const pool: Team[] = fs.existsSync(livePath) ? (JSON.parse(fs.readFileSync(livePath, 'utf8')) as { teams: Team[] }).teams : TEAMS;
  const home = pool.find((t) => t.id === 'buf')!;
  const away = pool.find((t) => t.id === 'kc')!;
  const kickoff = '2026-11-29T21:25:00.000Z';
  const game = {
    id: 'test-1', season: 2026, week: 13, gameType: 'REG', kickoff, weekday: 'Sunday', awayId: away.id, homeId: home.id, neutralSite: false, divisionGame: false,
    stadium: home.stadium.name, roof: 'outdoors', homeSpread: -2.5, totalLine: 47.5, awayMoneyline: null, homeMoneyline: null, primetime: true,
    weather: null, weatherHint: null as null, awayScore: null, homeScore: null, status: 'scheduled' as const, statusDetail: null,
  };
  const before = updatePredictions({ existing: null, season: 2026, now: new Date('2026-11-28T12:00:00Z'), schedule: [game], teams: pool, resolve: () => null });
  const open = before.records[0];
  check(!!open && open.status === 'open' && open.updates === 1, `prediction recorded before kickoff (BUF ${open?.homeWinPct}% · ${open?.spread})`);
  const again = updatePredictions({ existing: before, season: 2026, now: new Date('2026-11-29T12:00:00Z'), schedule: [{ ...game, homeSpread: -3 }], teams: pool, resolve: () => null });
  check(again.records[0].updates === 2 && again.records[0].marketHomeSpread === -3, 'open prediction is re-run and picks up the newer market line');
  const locked = updatePredictions({ existing: again, season: 2026, now: new Date('2026-11-29T21:30:00Z'), schedule: [{ ...game, homeSpread: -4 }], teams: pool, resolve: () => null });
  check(locked.records[0].status === 'locked' && locked.records[0].marketHomeSpread === -3 && locked.records[0].updates === 2, 'prediction freezes at kickoff and ignores later lines');
  const final = updatePredictions({ existing: locked, season: 2026, now: new Date('2026-11-30T02:00:00Z'), schedule: [], teams: pool, resolve: (id) => (id === 'test-1' ? { homeScore: 27, awayScore: 20 } : null) });
  const res = final.records[0].result!;
  check(final.records[0].status === 'final' && res.winner === 'home', 'final score grades the frozen prediction');
  const unseen = updatePredictions({ existing: null, season: 2026, now: new Date('2026-11-29T21:30:00Z'), schedule: [game], teams: pool, resolve: () => ({ homeScore: 27, awayScore: 20 }) });
  check(unseen.records.length === 0, 'a game first seen after kickoff is never back-filled');
  const g = grade({ ...open, homeWinPct: 70, awayWinPct: 30, spread: -7, total: 50, marketHomeSpread: -3, marketTotal: 45 }, 20, 24);
  check(!g.suCorrect && g.atsPick === 'home' && g.ats === 'loss' && g.ouPick === 'over' && g.ou === 'loss' && Math.abs(g.brier - 0.49) < 1e-9, 'grading arithmetic: upset ⇒ SU ✗, ATS ✗, O/U ✗, Brier 0.49');
  const push = grade({ ...open, homeWinPct: 60, awayWinPct: 40, spread: -7, total: 50, marketHomeSpread: -3, marketTotal: 44 }, 24, 21);
  check(push.ats === 'push' && push.ou === 'win', 'push on the number is a push, not a loss');
}

/* ---------------------------------------------------------------------------
   The generic multi-sport engine. Football keeps its own checks above; this
   block is about the properties that have to hold for basketball, baseball and
   soccer, which the football tests cannot speak to at all.
--------------------------------------------------------------------------- */
console.log('\n— Multi-sport engine');
{
  const strong = { id: 'strong', rating: 1650, attack: 1.1, defence: 0.92 };
  const weak = { id: 'weak', rating: 1430, attack: 0.94, defence: 1.08 };
  const even = { id: 'even', rating: 1500 };

  for (const key of GENERIC_LEAGUES.map((l) => l.key)) {
    const prof = profileFor(key);
    const r = simulate({ home: strong, away: weak }, prof, 4000, seedFor('strong', 'weak'));
    const total = r.homeWinPct + r.awayWinPct + r.drawPct;
    check(Math.abs(total - 100) < 0.001, `${key}: outcome probabilities sum to 100 (${total.toFixed(3)})`);
    check(r.homeWinPct > r.awayWinPct, `${key}: the stronger home side is favoured (${r.homeWinPct.toFixed(1)}%)`);
    check(r.drawPct === 0 || prof.draws, `${key}: draws only where the sport has them`);
    if (prof.draws) check(r.drawPct > 1, `${key}: draws happen often enough to price (${r.drawPct.toFixed(1)}%)`);
    check(r.total > prof.baseTotal * 0.4 && r.total < prof.baseTotal * 2, `${key}: total is a plausible ${prof.unit} count (${r.total.toFixed(1)} vs a ${prof.baseTotal} league average)`);
    check(r.p10 <= r.p50 && r.p50 <= r.p90, `${key}: margin percentiles are ordered`);
    check(Math.abs(r.bins.reduce((t, b) => t + b.pct, 0) - 100) < 0.001, `${key}: histogram covers the distribution`);
    check(r.projectedHome >= 0 && r.projectedAway >= 0, `${key}: nobody scores a negative ${prof.unit}`);
  }

  const nba = profileFor('nba');
  const seed = seedFor('strong', 'weak');
  const one = simulate({ home: strong, away: weak }, nba, 4000, seed);
  const two = simulate({ home: strong, away: weak }, nba, 4000, seed);
  check(JSON.stringify(one) === JSON.stringify(two), 'same seed ⇒ identical result');
  const other = simulate({ home: strong, away: weak }, nba, 4000, seed + 1);
  check(other.homeWinPct !== one.homeWinPct, 'different seed ⇒ different draw');
  check(Math.abs(other.homeWinPct - one.homeWinPct) < 4, 'different seeds agree within Monte-Carlo noise');

  const neutral = simulate({ home: strong, away: weak, neutral: true }, nba, 4000, seed);
  check(neutral.homeWinPct < one.homeWinPct, 'a neutral court costs the home side');
  const flat = simulate({ home: even, away: even }, nba, 4000, seed);
  check(Math.abs(flat.homeWinPct - flat.awayWinPct) > 1, 'two equal sides still split by the home edge');

  // The market blend has to actually move the number, and toward the market.
  const pure = project({ home: strong, away: weak }, nba);
  const blended = project({ home: strong, away: weak, marketHomeSpread: -1, marketTotal: 200, marketWeight: 0.8 }, nba);
  check(blended.margin < pure.margin && blended.total < pure.total, 'a market weight pulls the projection toward the market');
  check(project({ home: strong, away: weak, marketHomeSpread: -1, marketWeight: 0 }, nba).margin === pure.margin, 'zero weight ignores the market entirely');

  // A cover probability has to agree with the win probability at a pick-em line.
  const cov = coverProbability(one, 0, nba) * 100;
  check(Math.abs(cov - one.homeWinPct) < 6, `cover at pick-em ≈ win probability (${cov.toFixed(1)}% vs ${one.homeWinPct.toFixed(1)}%)`);
  check(coverProbability(one, -20, nba) < coverProbability(one, 20, nba), 'laying more points lowers the cover probability');

  // Baseball must never publish a tie: it goes to extras.
  const mlb = simulate({ home: even, away: even }, profileFor('mlb'), 4000, seed);
  check(mlb.drawPct === 0, 'baseball settles every game');

  // Every league in the registry has to be internally consistent.
  for (const l of LEAGUES) {
    check(!!l.slug && !!l.short && !!l.accent, `${l.key}: registry row is complete`);
    check(l.bespoke ? !l.espn : !!l.espn, `${l.key}: generic leagues carry an ESPN path, bespoke ones do not`);
  }
  check(new Set(LEAGUES.map((l) => l.slug)).size === LEAGUES.length, 'league slugs are unique');
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll engine checks passed.');
if (failures) throw new Error(`${failures} engine check(s) failed`);
