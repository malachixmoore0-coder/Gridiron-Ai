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
import { FIELD_LEAGUES, GENERIC_LEAGUES, LEAGUES, profileFor } from '../src/sports/types';
import { probableOf } from '../pipeline/multi/espn';
import { pitcherFactor } from '../pipeline/multi/pitchers';
import { impliedProb, marketHomeProb } from './ledger';
import { computeParkFactors, type ParkGame } from '../pipeline/multi/parks';
import { classify, type Observation } from '../pipeline/sources/weather';
import { applyArchive, emptyWeather, hasObservation, hourKey, noteForecast, noteObservation } from '../pipeline/multi/weatherLog';
import { fieldSeed, simulateField } from '../src/sports/golf';
import { withForecast } from '@/utils/forecast';
import type { LeagueView } from '@/league/types';
import type { Weather } from '../src/engine/types';

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

  // A field league has no opponent, so it must never reach the head-to-head
  // engine — the whole point of the kind flag.
  for (const l of FIELD_LEAGUES) {
    check(!GENERIC_LEAGUES.some((g) => g.key === l.key), `${l.key}: field leagues stay out of the head-to-head build`);
  }
  check(FIELD_LEAGUES.length > 0, 'at least one field league is registered');

  // Golf's own model: a field, and a projection that has to sum to 100.
  const field = Array.from({ length: 24 }, (_, i) => ({ id: `p${i}`, scoringAverage: 69 + i * 0.08 }));
  const odds = simulateField(field, 4, 1500, fieldSeed('t1', 4));
  const totalWin = odds.reduce((t, o) => t + o.winPct, 0);
  check(Math.abs(totalWin - 100) < 0.001, `golf: win probabilities sum to 100 (${totalWin.toFixed(3)})`);
  check(odds.every((o) => o.top10Pct >= o.top5Pct - 1e-9 && o.top5Pct >= o.winPct - 1e-9), 'golf: win ≤ top 5 ≤ top 10 for everyone');
  check(odds[0].winPct > odds[odds.length - 1].winPct, 'golf: the lower scoring average wins more often');
  const repeat = simulateField(field, 4, 1500, fieldSeed('t1', 4));
  check(JSON.stringify(odds) === JSON.stringify(repeat), 'golf: same seed ⇒ identical field');
  const noRounds = simulateField(field, 0, 500, 1);
  check(noRounds.every((o) => o.winPct === 0), 'golf: a finished tournament is not re-simulated');
}

/**
 * Weather reaches the simulation.
 *
 * It is a real term — the Environment node cuts the projected total by up to
 * four points — and it used to be dropped on every launch point except the
 * Slate, because `weather: 'auto'` means "no answer" to the engine and it falls
 * back to clear skies. `withForecast` resolves it at the funnel; these are the
 * assertions that stop it being quietly bypassed again.
 */
{
  console.log('\nForecast');
  const view = { games: [
    { awayId: 'gb', homeId: 'chi', weatherHint: 'snow' },
    { awayId: 'mia', homeId: 'lv', weatherHint: 'dome' },
    { awayId: 'sf', homeId: 'lar', weatherHint: null },
  ] } as unknown as LeagueView;
  const req = (a: string, h: string, weather: unknown = 'auto') =>
    ({ awayId: a, homeId: h, ctx: { neutralSite: false, primetime: false, weather } });
  const wx = (r: ReturnType<typeof req>) => (withForecast(r, view).ctx as { weather: unknown }).weather;

  check(wx(req('gb', 'chi')) === 'snow', "forecast: 'auto' picks up the game's weather");
  check(wx(req('mia', 'lv')) === 'auto', 'forecast: a dome is left to the engine');
  check(wx(req('sf', 'lar')) === 'auto', 'forecast: no forecast on file stays auto');
  check(wx(req('nyj', 'buf')) === 'auto', 'forecast: an unknown game stays auto');
  check(wx(req('gb', 'chi', 'wind')) === 'wind', 'forecast: an explicit choice is never overridden');

  // And it has to actually move the number, or none of the above matters.
  const home = TEAMS.find((t) => t.id === 'chi')!;
  const away = TEAMS.find((t) => t.id === 'gb')!;
  const weights = { scheme: 25, personnel: 35, environment: 15, xfactor: 25 };
  const total = (weather: 'snow' | undefined) => analyzeMatchup(
    { home, away, neutralSite: false, primetime: false, weather, injuredOut: [], questionable: [] },
    { weights, simulations: 8000, homeFieldBase: 3 },
  ).simulation.projectedTotal;
  const clear = total(undefined);
  const snow = total('snow');
  check(clear - snow > 2, `forecast: snow cuts the projected total (${clear.toFixed(1)} → ${snow.toFixed(1)})`);
}

/**
 * The generic engine's own weather term, which the eighteen other leagues use.
 *
 * The two claims worth defending are the ones it refuses to make: no margin
 * shift, because nothing in the feed says which side a wet ball hurts; and no
 * total shift for wind, because whether it blows out or in depends on a
 * stadium orientation the feed does not carry.
 */
{
  console.log('\nGeneric weather');
  const team = (rating: number) => ({ id: `t${rating}`, rating, attack: 1, defence: 1 });
  const runFor = (sport: 'baseball' | 'soccer' | 'basketball', weather: Weather | null) => {
    const p = profileFor(sport === 'baseball' ? 'mlb' : sport === 'soccer' ? 'epl' : 'nba');
    return simulate(
      { home: team(1550), away: team(1500), weather, marketWeight: 0 },
      p, 30000, seedFor('h', 'a'),
    );
  };

  const mlbClear = runFor('baseball', null);
  const mlbCold = runFor('baseball', 'cold');
  const mlbWind = runFor('baseball', 'wind');
  check(mlbClear.total - mlbCold.total > 0.2, `generic: cold cuts a baseball total (${mlbClear.total.toFixed(2)} → ${mlbCold.total.toFixed(2)})`);
  check(Math.abs(mlbWind.total - mlbClear.total) < 0.25, 'generic: wind does not shift the total, only widens it');
  check(Math.abs(mlbCold.spread - mlbClear.spread) < 0.15, 'generic: weather leaves the margin to the ratings');
  check(Math.abs(mlbWind.spread - mlbClear.spread) < 0.15, 'generic: wind leaves the margin alone too');

  /*
   * Where the widening actually lands depends on the model. In a low-count
   * sport both sides' scoring rates move together — wind out is a big day for
   * everyone — so the extra spread goes into the *total* and the margin barely
   * notices, which is why there is no margin-range assertion above. On the
   * normal model it is the margin sigma that is scaled, and that is directly
   * visible, so the mechanism is checked there.
   */
  const normalRun = (weather: Weather | null) => simulate(
    { home: team(1550), away: team(1500), weather, marketWeight: 0 },
    profileFor('nfl'), 30000, seedFor('h', 'a'),
  );
  const nClear = normalRun(null);
  const nWind = normalRun('wind');
  check(nWind.p90 - nWind.p10 > (nClear.p90 - nClear.p10) * 1.05, 'generic: wind widens the range on a continuous sport');

  const eplClear = runFor('soccer', null);
  const eplSnow = runFor('soccer', 'snow');
  check(eplClear.total - eplSnow.total > 0.15, `generic: snow cuts a soccer total (${eplClear.total.toFixed(2)} → ${eplSnow.total.toFixed(2)})`);

  // Indoors is indoors. A cold snap must not reach a basketball court.
  const nbaClear = runFor('basketball', null);
  const nbaCold = runFor('basketball', 'cold');
  check(nbaClear.total === nbaCold.total, 'generic: weather never reaches an indoor sport');
}

/* ---- starting pitchers ------------------------------------------------- */
{
  const mlb = profileFor('mlb');
  const side = (rating: number) => ({ id: `t${rating}`, rating, attack: 1, defence: 1 });
  const evenly = { home: side(1500), away: side(1500), marketWeight: 0 };
  const run = (homePitcher: number, awayPitcher: number) =>
    simulate({ ...evenly, homePitcher, awayPitcher }, mlb, 30000, seedFor('h', 'a'));

  const none = run(1, 1);

  // An ace at home has to do two things at once: cut the total, because the
  // visitors score less, and move the margin, because his own side is now more
  // likely to win. A version that only lowered the total would be describing a
  // pitchers' duel rather than an advantage.
  const homeAce = run(0.85, 1);
  check(homeAce.total < none.total - 0.05,
    `pitchers: a home ace lowers the total (${none.total.toFixed(2)} → ${homeAce.total.toFixed(2)})`);
  check(homeAce.homeWinPct > none.homeWinPct + 0.5,
    `pitchers: a home ace lifts the home side (${none.homeWinPct.toFixed(1)}% → ${homeAce.homeWinPct.toFixed(1)}%)`);

  // Two aces cancel on the margin and compound on the total.
  const bothAces = run(0.85, 0.85);
  check(Math.abs(bothAces.homeWinPct - none.homeWinPct) < 1.5,
    'pitchers: matched aces leave the margin where it was');
  check(bothAces.total < homeAce.total,
    `pitchers: matched aces cut the total further (${homeAce.total.toFixed(2)} → ${bothAces.total.toFixed(2)})`);

  // Symmetry: the same arm on the other side must be the mirror image, or the
  // adjustment is smuggling in a home-field effect of its own.
  const awayAce = run(1, 0.85);
  check(Math.abs((homeAce.homeWinPct - none.homeWinPct) + (awayAce.homeWinPct - none.homeWinPct)) < 1.5,
    'pitchers: an away ace is the mirror of a home ace');

  // And the term must stay out of every sport that has no starting pitcher.
  const nba = profileFor('nba');
  const nbaPlain = simulate(evenly, nba, 20000, seedFor('h', 'a'));
  const nbaWith = simulate({ ...evenly, homePitcher: 0.85, awayPitcher: 1.1 }, nba, 20000, seedFor('h', 'a'));
  check(nbaPlain.total === nbaWith.total && nbaPlain.homeWinPct === nbaWith.homeWinPct,
    'pitchers: never reach a sport without one');
}

/* ---- reading the probables off ESPN ------------------------------------ */
{
  // ESPN has never documented this and has moved it more than once, so the
  // parser is checked against every shape it is expected to survive rather than
  // against one captured response.
  const arm = (id: string, name: string, era?: string) => ({
    name: 'probableStartingPitcher',
    playerId: id,
    athlete: { id, displayName: name },
    statistics: era ? [{ abbreviation: 'ERA', displayValue: era }] : [],
  });

  const onCompetitor = probableOf({ probables: [arm('1', 'Tarik Skubal', '2.14')] }, {}, 'home');
  check(onCompetitor?.name === 'Tarik Skubal' && onCompetitor?.era === 2.14, 'probables: read off the competitor');

  const onCompetition = probableOf({}, { probables: [{ ...arm('2', 'Logan Gilbert', '3.60'), homeAway: 'away' }] }, 'away');
  check(onCompetition?.era === 3.60, 'probables: read off the competition, filtered by side');

  // The athlete flattened onto the entry, with no nested `athlete` object.
  const flat = probableOf({ probables: [{ name: 'probableStartingPitcher', id: '3', displayName: 'Flat Arm' }] }, {}, 'home');
  check(flat?.id === '3' && flat?.era === null, 'probables: a flattened athlete still resolves, with no ERA');

  // Anything that is not a starting pitcher must be ignored.
  const other = probableOf({ probables: [{ name: 'probableGoalie', athlete: { id: '9', displayName: 'Not A Pitcher' } }] }, {}, 'home');
  check(other === null, 'probables: a non-pitcher entry is ignored');

  // And absence is absence, not a guess.
  check(probableOf({}, {}, 'home') === null, 'probables: nothing listed yields nothing');
  check(probableOf({ probables: [] }, {}, 'home') === null, 'probables: an empty list yields nothing');

  // A nonsense ERA must not reach the model.
  const silly = probableOf({ probables: [arm('4', 'Blowup', '99.00')] }, {}, 'home');
  check(silly?.era === null, 'probables: an implausible ERA is dropped rather than used');

  // The factor itself: unknown arms are a no-op, and the cap holds.
  check(pitcherFactor(null, 4.1) === 1, 'probables: an unknown arm changes nothing');
  check(pitcherFactor({ id: 'x', name: 'x', era: 4.1 }, 4.1) === 1, 'probables: a league-average arm changes nothing');
  check(pitcherFactor({ id: 'x', name: 'x', era: 0.5 }, 4.1) > 0.8, 'probables: even an unhittable ERA stays inside the cap');
  check(pitcherFactor({ id: 'x', name: 'x', era: 11.9 }, 4.1) < 1.2, 'probables: even a disastrous ERA stays inside the cap');
}

// ---- reading a price -------------------------------------------------------
// The ledger scores the market against the model, so a sign error here would
// not crash anything: it would quietly hand back a confident wrong answer
// about whether the model beats the price.
console.log('\n— Moneylines');
check(Math.abs(impliedProb(-150) - 0.6) < 1e-9, 'odds: -150 implies 60%');
check(Math.abs(impliedProb(150) - 0.4) < 1e-9, 'odds: +150 implies 40%');
check(Math.abs(impliedProb(100) - 0.5) < 1e-9, 'odds: even money implies 50%');
check(impliedProb(-110) > 0.5, 'odds: the favourite side of a -110/-110 pair holds vig');
check(Math.abs((marketHomeProb(-110, -110) ?? 0) - 0.5) < 1e-9, 'odds: de-vigging a -110/-110 pair gives 50/50');
check((marketHomeProb(-200, 170) ?? 0) > 0.6 && (marketHomeProb(-200, 170) ?? 1) < 0.68, 'odds: a -200 home favourite de-vigs into the low sixties');
check(marketHomeProb(-200, null) === null, 'odds: one price alone is refused, not guessed at');
check(marketHomeProb(null, null) === null, 'odds: no prices yields nothing');
{
  // Soccer: the draw is a third outcome and has to be in the denominator.
  const twoWay = marketHomeProb(150, 180) ?? 0;
  const threeWay = marketHomeProb(150, 180, 220) ?? 0;
  check(threeWay < twoWay, 'odds: a draw price lowers the home probability');
  const h = marketHomeProb(150, 180, 220) ?? 0, a = marketHomeProb(180, 150, 220) ?? 0;
  const d = 1 - h - a;
  check(Math.abs(h + a + d - 1) < 1e-9 && d > 0.2 && d < 0.32, 'odds: a three-way market sums to one with a plausible draw');
}

// ---- park factors ----------------------------------------------------------
console.log('\n— Park factors');
{
  const NOW = '2026-09-24T00:00:00.000Z';
  const ids = Array.from({ length: 12 }, (_, i) => `t${i}`);
  /**
   * A season where one park is genuinely worth +15% and the rest are level.
   * Scores are fixed rather than random so the check cannot flake, which also
   * means the noise estimate sees no noise and should keep nearly all of it.
   */
  const season: ParkGame[] = [];
  for (const h of ids) for (const a of ids) {
    if (h === a) continue;
    for (let k = 0; k < 4; k++) {
      const runs = h === 't0' ? 11.5 : 10;
      season.push({ homeId: h, awayId: a, homeScore: runs / 2, awayScore: runs / 2 });
    }
  }
  const pf = computeParkFactors(season, NOW);
  check(pf.reliability > 0.9, `parks: a clean signal is mostly kept (reliability ${pf.reliability.toFixed(2)})`);
  check(pf.factors.t0 > 1.1 && pf.factors.t0 < 1.2, `parks: the loud park is found at about its real size (${pf.factors.t0})`);
  const avg = Object.values(pf.factors).reduce((s, x) => s + x, 0) / Object.keys(pf.factors).length;
  check(Math.abs(avg - 1) < 0.002, `parks: the league averages 1.00 (${avg.toFixed(4)})`);
  check(Object.values(pf.factors).every((f) => f >= 0.65 && f <= 1.35), 'parks: nothing escapes the cap');

  // A park "worth" triple is bad data, not a discovery: the guard has to hold
  // even though the centring step runs before it.
  const absurd: ParkGame[] = [];
  for (const h of ids) for (const a of ids) {
    if (h === a) continue;
    for (let k = 0; k < 4; k++) {
      const runs = h === 't0' ? 30 : 10;
      absurd.push({ homeId: h, awayId: a, homeScore: runs / 2, awayScore: runs / 2 });
    }
  }
  const cap = computeParkFactors(absurd, NOW);
  check(Object.values(cap.factors).every((f) => f >= 0.65 && f <= 1.35), `parks: the cap holds after centring (max ${Math.max(...Object.values(cap.factors))})`);

  // Coin-flip scoring: every park identical, so any spread found is noise and
  // the shrink has to take essentially all of it away.
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const noisy: ParkGame[] = [];
  for (const h of ids) for (const a of ids) {
    if (h === a) continue;
    for (let k = 0; k < 4; k++) noisy.push({ homeId: h, awayId: a, homeScore: Math.round(rnd() * 9), awayScore: Math.round(rnd() * 9) });
  }
  const np = computeParkFactors(noisy, NOW);
  check(np.spread < np.rawSpread, `parks: pure noise is narrowed (${np.rawSpread.toFixed(2)} -> ${np.spread.toFixed(2)})`);
  check(np.spread < 0.12, `parks: pure noise ends up near neutral (spread ${np.spread.toFixed(3)})`);

  // Too little to measure, and an unplayed season.
  check(computeParkFactors(season.slice(0, 40), NOW).reliability === 0, 'parks: a short sample measures nothing rather than guessing');
  check(computeParkFactors(season.map((g) => ({ ...g, homeScore: null, awayScore: null })), NOW).reliability === 0, 'parks: no results yields no factors');
  // A neutral-site game is in neither club's building.
  const neutral = computeParkFactors(season.map((g) => ({ ...g, neutralSite: true })), NOW);
  check(Object.keys(neutral.factors).length === 0, 'parks: neutral-site games are not credited to a park');
}

console.log('\n— The engine applying one');
{
  const p = profileFor('mlb');
  const base = {
    home: { id: 'h', rating: 1500, attack: 1, defence: 1 },
    away: { id: 'a', rating: 1500, attack: 1, defence: 1 },
    neutral: false, weather: null, marketWeight: 0,
  };
  const flat = project(base, p).total;
  const hot = project({ ...base, parkFactor: 1.1 }, p).total;
  const cold = project({ ...base, parkFactor: 0.9 }, p).total;
  check(hot > flat && flat > cold, `parks: the engine moves the total with the venue (${cold.toFixed(2)} / ${flat.toFixed(2)} / ${hot.toFixed(2)})`);
  check(Math.abs(hot / flat - 1.1) < 0.01, 'parks: the multiplier lands at its stated size');
  check(project({ ...base, parkFactor: 1 }, p).total === flat, 'parks: a neutral park changes nothing');
  check(project({ ...base, parkFactor: null }, p).total === flat, 'parks: an unmeasured park changes nothing');
  check(project({ ...base, neutral: true, parkFactor: 1.3 }, p).total === project({ ...base, neutral: true }, p).total, 'parks: a neutral site ignores the home park');
  // The guard: a run total mistakenly filed as a factor must not multiply.
  check(project({ ...base, parkFactor: 8.6 }, p).total === flat, 'parks: a nonsense factor is refused, not applied');
  check(project({ ...base, parkFactor: 0 }, p).total === flat, 'parks: a zero factor is refused');
}

// ---- weather, classified the same way from either source --------------------
console.log('\n— Weather');
{
  const base = { tempF: 62, windMph: 4, snowIn: 0 };
  check(classify({ ...base, precipIn: 0 }) === 'clear', 'weather: a calm dry evening is clear');
  check(classify({ ...base, snowIn: 0.4, precipIn: 0.5 }) === 'snow', 'weather: snow outranks rain');
  check(classify({ ...base, windMph: 22, precipIn: 0.5 }) === 'wind', 'weather: wind outranks rain');
  check(classify({ ...base, precipIn: 0.2 }) === 'rain', 'weather: rain that fell is rain');
  check(classify({ ...base, tempF: 20, precipIn: 0 }) === 'cold', 'weather: cold is cold');
  check(classify({ ...base, tempF: 95, precipIn: 0 }) === 'heat', 'weather: heat is heat');
  /*
   * The one that matters for the splits. A forecast knows a chance and an
   * archive knows an amount; if they disagreed on where "rain" begins then a
   * study of teams in the rain would partly be measuring which source it drew
   * from. Real precipitation decides whenever it is known.
   */
  check(classify({ ...base, precipIn: 0, precipPct: 90 }) === 'clear', 'weather: an amount that fell overrules a chance it might');
  check(classify({ ...base, precipPct: 80 }) === 'rain', 'weather: a chance is used when no amount is known');
  check(classify({ ...base, precipPct: 20 }) === 'clear', 'weather: a low chance is not rain');
}

console.log('\n— The weather log');
{
  const g = { id: 'g1', kickoff: '2026-07-04T23:10:00.000Z', homeId: 'h', awayId: 'a' };
  const fc = { tempF: 70, windMph: 5, precipPct: 60, snowIn: 0, summary: classify({ tempF: 70, windMph: 5, snowIn: 0, precipPct: 60 }) };
  const obs: Observation = { tempF: 68, windMph: 6, precipIn: 0, snowIn: 0, summary: 'clear' };

  const f = emptyWeather('mlb');
  check(noteForecast(f, g, fc) && f.games.g1.source === 'forecast', 'log: a forecast is written down');
  check(f.games.g1.summary === 'rain' && f.games.g1.precipIn === null, 'log: a forecast keeps its chance and claims no amount');
  check(noteObservation(f, g, obs) && f.games.g1.source === 'observed', 'log: an observation replaces the forecast');
  check(f.games.g1.summary === 'clear' && f.games.g1.precipPct === null, 'log: the observation is what is kept');
  // The rule the whole file rests on.
  check(noteForecast(f, g, fc) === false && f.games.g1.source === 'observed', 'log: a forecast never overwrites what happened');
  check(noteObservation(f, g, { ...obs, tempF: 1 }) === false && f.games.g1.tempF === 68, 'log: an observation is written once and left alone');
  check(hasObservation(f, 'g1') && !hasObservation(f, 'nope'), 'log: settled games are distinguishable from unsettled');

  // Matching games to a venue's archived hours, on the kickoff hour in UTC.
  check(hourKey('2026-07-04T23:10:00.000Z') === '2026-07-04T23', 'log: a kickoff resolves to its UTC hour');
  const hours = new Map<string, Observation>([['2026-07-04T23', obs]]);
  const g2 = { id: 'g2', kickoff: '2026-07-04T23:40:00.000Z', homeId: 'h', awayId: 'b' };
  const g3 = { id: 'g3', kickoff: '2026-09-24T18:05:00.000Z', homeId: 'h', awayId: 'c' };
  const f2 = emptyWeather('mlb');
  const settled = applyArchive(f2, [g2, g3], hours);
  check(settled === 1, `log: only the games the archive covers are settled (${settled})`);
  check(hasObservation(f2, 'g2'), 'log: a covered game is settled');
  // The archive trails real time by a few days. A recent game must stay open for
  // a later run, not be recorded as calm and dry because the row was missing.
  check(!hasObservation(f2, 'g3') && !f2.games.g3, 'log: a game past the end of the archive is left unsettled, not invented');
  check(applyArchive(f2, [g2], hours) === 0, 'log: re-running the archive settles nothing twice');
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll engine checks passed.');
if (failures) throw new Error(`${failures} engine check(s) failed`);
