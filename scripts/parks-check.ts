/**
 * Are park factors worth applying?
 *
 *   npm run parks:check           # every league with a season on file
 *   npm run parks:check -- mlb
 *
 * The effect is real -- nobody disputes that Petco suppresses runs and that the
 * Athletics' temporary Sacramento park inflates them. The question this answers
 * is narrower and is the only one that matters here: can a single season of our
 * own results measure it well enough to improve a projection? The answer, at the
 * time of writing, is no, and this script exists so that stays a measurement
 * rather than a memory. Re-run it when another season is on file.
 *
 * The test walks forward. Every game is predicted using park factors fitted only
 * on games already played by then, and compared against the same prediction with
 * no park term at all. Fitting on the whole season and scoring on the whole
 * season would show a healthy gain and mean nothing.
 *
 * A note on the lambda sweep at the bottom: it reports the shrinkage that would
 * have worked best, chosen by looking at the very games it is scored on. That is
 * in-sample hyperparameter selection and it flatters the result -- it is printed
 * to show how far an honest walk-forward sits from a number picked in hindsight,
 * because the difference between those two is most of how a model gets fooled.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GENERIC_LEAGUES } from '../src/sports/types';
import { computeParkFactors, type ParkGame } from '../pipeline/multi/parks';

const DIR = path.resolve(__dirname, '../data/live/sports');
const NOW = new Date().toISOString();
/** Refit this often. Often enough not to handicap the factors with stale fits. */
const REFIT = 100;

interface Played extends ParkGame { kickoff: string; homeScore: number; awayScore: number }

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

function check(slug: string, short: string): boolean {
  const file = path.join(DIR, slug, 'schedule.json');
  if (!fs.existsSync(file)) return false;
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { games?: Played[] };
  const done = (data.games ?? [])
    .filter((g) => g.homeScore != null && g.awayScore != null && !g.neutralSite)
    .sort((a, b) => (a.kickoff < b.kickoff ? -1 : 1));
  if (done.length < 400) return false;

  const runs = (g: Played) => g.homeScore + g.awayScore;
  const full = computeParkFactors(done, NOW);
  console.log(`\n${'='.repeat(64)}\n${short} — ${done.length} games on file\n${'='.repeat(64)}`);
  console.log(`  whole-season fit: ${(100 * full.reliability).toFixed(0)}% of the raw spread survives the noise estimate`);
  console.log(`  raw spread ${full.rawSpread.toFixed(3)} narrowed to ${full.spread.toFixed(3)}`);
  if (!full.reliability) {
    console.log('\n  Nothing to apply: this data cannot tell a venue from a lucky week.');
    return true;
  }

  // ---- walk forward --------------------------------------------------------
  const START = Math.floor(done.length * 0.4);
  let pf = computeParkFactors(done.slice(0, START), NOW);
  let priorRuns = done.slice(0, START).reduce((s, g) => s + runs(g), 0);
  const withPark: number[] = [], without: number[] = [];
  for (let i = START; i < done.length; i++) {
    if ((i - START) % REFIT === 0) pf = computeParkFactors(done.slice(0, i), NOW);
    const g = done[i];
    // The run environment so far. Neither side is told the future average.
    const lg = priorRuns / i;
    const f = pf.factors[g.homeId] ?? 1;
    const a = runs(g);
    withPark.push(Math.abs(a - lg * f));
    without.push(Math.abs(a - lg));
    priorRuns += a;
  }
  const mp = mean(withPark), mo = mean(without);
  const delta = ((mp - mo) / mo) * 100;
  console.log(`\n  walk-forward over ${withPark.length} games from ${done[START].kickoff.slice(0, 10)}`);
  console.log(`    MAE without park ${mo.toFixed(4)}`);
  console.log(`    MAE with park    ${mp.toFixed(4)}   ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%  ${delta < -0.5 ? '<- worth applying' : delta < 0 ? '(better, but inside the noise)' : '<- no gain'}`);

  // ---- the flattering version, for contrast -------------------------------
  const half = Math.floor(done.length / 2);
  const trained = computeParkFactors(done.slice(0, half), NOW);
  const test = done.slice(half);
  const lgTest = mean(test.map(runs));
  let best = { lam: 0, mae: Infinity };
  for (let lam = 0; lam <= 1.0001; lam += 0.05) {
    const mae = mean(test.map((g) => {
      const raw = trained.factors[g.homeId];
      const f = raw == null || !trained.reliability ? 1 : 1 + (lam / trained.reliability) * (raw - 1);
      return Math.abs(runs(g) - lgTest * f);
    }));
    if (mae < best.mae) best = { lam, mae };
  }
  const flat = mean(test.map((g) => Math.abs(runs(g) - lgTest)));
  console.log(`\n  picked in hindsight: shrink to ${best.lam.toFixed(2)} scores ${(((best.mae - flat) / flat) * 100).toFixed(2)}%`);
  console.log(`    the honest number above is what to believe; the gap is the self-deception.`);
  return true;
}

const want = process.argv.slice(2).map((s) => s.toLowerCase());
let any = false;
for (const l of GENERIC_LEAGUES) {
  if (want.length && !want.includes(l.key)) continue;
  if (check(l.slug, l.short)) any = true;
}
if (!any) console.log('No league has enough of a season on file to test.');
