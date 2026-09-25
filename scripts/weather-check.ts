/**
 * What the weather is really worth.
 *
 *   npm run weather:check           # every league with observed conditions
 *   npm run weather:check -- mlb
 *
 * The engine's weather multipliers were written from first principles and never
 * checked: dense cold air carries a ball less far, so cold was given 0.95, and
 * so on down the table. This puts each one next to what the games say, now that
 * the conditions in played games are on file.
 *
 * Read the sample size and the t before believing any row. A bucket with forty
 * games in it can move the mean total by half a run on luck alone, and the
 * per-side numbers underneath -- does this club hit in the cold -- are far worse
 * than that: single figures per team, which is why they arrive shrunk to almost
 * nothing and are printed with their game counts attached.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GENERIC_LEAGUES } from '../src/sports/types';
import { WEATHER } from '../src/sports/engine';
import { computeWeatherSplits, type ObservedGame } from '../pipeline/multi/weatherSplits';
import type { WeatherFile } from '../pipeline/multi/weatherLog';

const DIR = path.resolve(__dirname, '../data/live/sports');
const NOW = new Date().toISOString();

function report(slug: string, short: string): boolean {
  const wf = path.join(DIR, slug, 'weather.json');
  const sf = path.join(DIR, slug, 'schedule.json');
  if (!fs.existsSync(wf) || !fs.existsSync(sf)) return false;
  const log = JSON.parse(fs.readFileSync(wf, 'utf8')) as WeatherFile;
  const sched = JSON.parse(fs.readFileSync(sf, 'utf8')) as { games?: any[] };

  // Observations only, joined to a final score.
  const scores = new Map((sched.games ?? []).map((g) => [g.id, g]));
  const games: ObservedGame[] = [];
  for (const [id, w] of Object.entries(log.games ?? {})) {
    if (w.source !== 'observed') continue;
    const g = scores.get(id);
    if (!g || g.homeScore == null || g.awayScore == null) continue;
    games.push({ homeId: g.homeId, awayId: g.awayId, homeScore: g.homeScore, awayScore: g.awayScore, summary: w.summary });
  }
  const forecasts = Object.values(log.games ?? {}).filter((w) => w.source === 'forecast').length;
  if (!games.length) {
    console.log(`\n${short} — nothing observed yet (${forecasts} forecast${forecasts === 1 ? '' : 's'} on file). The archive trails a few days; try after the next refresh.`);
    return true;
  }

  const s = computeWeatherSplits(games, NOW);
  console.log(`\n${'='.repeat(70)}\n${short} — ${games.length} games with observed conditions\n${'='.repeat(70)}`);
  if (!s.league.length) {
    console.log('  No bucket has enough games to measure yet.');
    return true;
  }

  console.log('  weather   games   runs vs this park\'s norm   measured   engine   |t|');
  for (const e of s.league) {
    const eng = WEATHER[e.bucket]?.total ?? 1;
    const gap = Math.abs(e.factor - eng);
    const note = e.t < 2 ? 'inside the noise' : gap > 0.04 ? 'DISAGREES' : 'agrees';
    console.log(
      `  ${e.bucket.padEnd(8)} ${String(e.games).padStart(5)}   ${(e.delta >= 0 ? '+' : '') + e.delta.toFixed(2)}`.padEnd(46)
      + `${e.factor.toFixed(3)}    ${eng.toFixed(3)}   ${e.t.toFixed(2)}  ${note}`,
    );
  }

  console.log(`\n  per-side effects: ${(100 * s.sideReliability).toFixed(0)}% of the spread across ${s.sides.length} team-weather pairs is real`);
  if (s.sideReliability < 0.1) {
    console.log('    -> too little to act on. A club\'s handful of cold games cannot be told');
    console.log('       apart from a club that happened to have a good April.');
  }
  for (const r of s.sides.slice(0, 6)) {
    console.log(`    ${r.teamId.padEnd(6)} ${r.bucket.padEnd(6)} n=${String(r.games).padStart(3)}  raw ${(r.raw >= 0 ? '+' : '') + r.raw.toFixed(2)}  ->  ${(r.edge >= 0 ? '+' : '') + r.edge.toFixed(2)} runs`);
  }
  return true;
}

const want = process.argv.slice(2).map((s) => s.toLowerCase());
let any = false;
for (const l of GENERIC_LEAGUES) {
  if (want.length && !want.includes(l.key)) continue;
  if (report(l.slug, l.short)) any = true;
}
if (!any) console.log('No weather on file yet. It is collected by the refresh, one archive call per venue.');
