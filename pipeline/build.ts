/**
 * GRIDIRON-AI live data build.
 *
 *   npm run data:build            # full build → data/live/*.json
 *   npm run data:build -- --no-weather   # skip Open-Meteo calls
 *
 * Sources: nflverse (play-by-play, schedule + lines, rosters, depth charts,
 * injuries, snap counts, FTN charting, PFR advanced stats), ESPN (best-effort
 * injuries/odds), Open-Meteo (best-effort kickoff weather).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { TEAMS } from '../src/data/teams';
import type { Team } from '../src/engine/types';
import { sourceLog } from './lib/fetch';
import { idFromNv, nvFromId } from './lib/util';
import { aggregatePbp, applyFtn, loadAdvDef, loadAdvPass, loadDepthCharts, loadGames, loadInjuries, loadRosters, loadSnapCounts } from './sources/nflverse';
import { loadEspnInjuries } from './sources/espn';
import type { BuildCtx } from './compute/context';
import { buildTeams, detectFront, roundMetrics } from './compute/teams';
import { buildPlayers } from './compute/players';
import { buildSchedule, currentWeek, records } from './compute/schedule';
import { summarize, updatePredictions } from './compute/predictions';
import type { LivePredictionsFile } from '../src/data/liveTypes';
import { blendWeight, gamesPlayed } from './compute/context';

const OUT_DIR = path.resolve(__dirname, '../data/live');
const withWeather = !process.argv.includes('--no-weather');

async function main() {
  const t0 = Date.now();
  const today = new Date();
  console.log(`\nGridiron AI data build — ${today.toISOString()}`);

  console.log('\n[1/7] Schedule & results');
  const games = await loadGames();
  const season = Math.max(...games.map((g) => g.season));
  const priorSeason = season - 1;
  const { week, phase } = currentWeek(games, season, today);
  console.log(`  season ${season} · ${phase} · current week ${week} · ${games.filter((g) => g.season === season).length} games on file`);

  console.log('\n[2/7] Rosters, depth charts, injuries, snap counts');
  const [rosters, depthCur, depthPrior, inj, snaps, snapsPrior] = await Promise.all([
    loadRosters(season), loadDepthCharts(season), loadDepthCharts(priorSeason), loadInjuries(season), loadSnapCounts(season), loadSnapCounts(priorSeason),
  ]);
  console.log(`  ${rosters.length} roster rows · depth charts for ${depthCur.byTeam.size} teams (as of ${depthCur.asOf || 'n/a'}) · injury report week ${inj.week} (${inj.rows.length} rows) · snaps ${snaps.size}/${snapsPrior.size}`);
  const frontFor = (depth: Map<string, any[]>) => new Map<string, '4-3' | '3-4'>(TEAMS.map((b) => {
    const nv = nvFromId(b.id);
    const f = detectFront(depth.get(nv), b.coaching.defFront);
    return [nv, f === '3-4' ? '3-4' : '4-3'];
  }));
  const frontsCur = frontFor(depthCur.byTeam);
  const frontsPrior = depthPrior.byTeam.size ? frontFor(depthPrior.byTeam) : frontsCur;
  const posMap = new Map(rosters.filter((r) => r.gsis_id).map((r) => [r.gsis_id, r.position]));

  console.log('\n[3/7] Play-by-play (streamed)');
  const cur = await aggregatePbp(season, posMap, frontsCur);
  console.log(`  ${season}: ${cur ? `${cur.plays} plays` : 'not published yet'}`);
  const prior = await aggregatePbp(priorSeason, posMap, frontsPrior);
  console.log(`  ${priorSeason}: ${prior ? `${prior.plays} plays` : 'unavailable'}`);
  if (cur) console.log(`  FTN charting ${season}: ${(await applyFtn(season, cur)) ? 'joined' : 'not available'}`);
  if (prior) console.log(`  FTN charting ${priorSeason}: ${(await applyFtn(priorSeason, prior)) ? 'joined' : 'not available'}`);

  console.log('\n[4/7] Advanced stats & ESPN enrichment');
  const [advPass, advDef, espnInjuries] = await Promise.all([loadAdvPass(), loadAdvDef(), loadEspnInjuries()]);
  console.log(`  PFR adv pass ${advPass.length} rows · adv def ${advDef.length} rows · ESPN injuries ${espnInjuries.length}`);

  const ctx: BuildCtx = {
    season, priorSeason, today, games, cur, prior, depth: depthCur.byTeam, depthAsOf: depthCur.asOf, rosters, injuries: inj.rows, injuryWeek: inj.week,
    snaps, snapsPrior, advPass, advDef, espnInjuries, baseline: TEAMS, notes: [],
  };

  console.log('\n[5/7] Building team profiles & depth charts');
  const players = buildPlayers(ctx, frontsCur);
  const built = buildTeams(ctx, (id) => players.qbRating.get(id) ?? 5.0, (id) => players.teSpeed.get(id) ?? 5.0);
  const recs = records(games, season);
  const teams: Team[] = built.map(({ team }) => ({
    ...team,
    players: players.byTeam.get(team.id) ?? team.players,
    record: recs.get(team.id) ?? '0-0',
  }));

  console.log('\n[6/7] Schedule, lines & weather');
  const schedule = await buildSchedule(games, season, week, teams, withWeather);
  console.log(`  ${schedule.length} games for weeks ${week}-${week + 1} · weather on ${schedule.filter((g) => g.weather).length}`);

  console.log('\n[7/7] Model track record');
  const predPath = path.join(OUT_DIR, 'predictions.json');
  let existing: LivePredictionsFile | null = null;
  try { existing = JSON.parse(fs.readFileSync(predPath, 'utf8')) as LivePredictionsFile; } catch { existing = null; }
  const finalsById = new Map(games.filter((g) => g.season === season && Number.isFinite(g.home_score) && Number.isFinite(g.away_score)).map((g) => [g.game_id, { homeScore: g.home_score, awayScore: g.away_score }]));
  const predictions = updatePredictions({ existing, season, now: today, schedule, teams, resolve: (id) => finalsById.get(id) ?? null });
  const sum = summarize(predictions.records);
  console.log(`  ${predictions.records.length} records · ${predictions.records.filter((r) => r.status === 'open').length} open · ${predictions.records.filter((r) => r.status === 'locked').length} locked · ${sum.finals} graded${sum.finals ? ` · SU ${sum.su}/${sum.finals} · ATS ${sum.ats}-${sum.atsL} · O/U ${sum.ou}-${sum.ouL} · Brier ${sum.brier?.toFixed(3)}` : ''}`);

  // ---- validation ----
  const problems: string[] = [];
  if (teams.length !== 32) problems.push(`expected 32 teams, got ${teams.length}`);
  for (const t of teams) {
    if (!t.players.some((p) => p.pos === 'QB')) problems.push(`${t.abbr}: no QB on depth chart`);
    if (t.players.length < 12) problems.push(`${t.abbr}: only ${t.players.length} players`);
    const ratings = [t.offense.passEfficiency, t.offense.rushEfficiency, t.offense.explosiveness, t.offense.qb, t.offense.slotEfficiency, t.offense.teSpeed, t.defense.passDefense, t.defense.rushDefense, t.defense.nickelCorner, t.defense.lbCoverage, t.defense.takeaways, t.coaching.halftimeAdjust, t.coaching.redZoneAggression];
    if (ratings.some((v) => !Number.isFinite(v) || v < 1 || v > 10)) problems.push(`${t.abbr}: rating out of range ${JSON.stringify(ratings)}`);
    if (!(t.offense.pbwr > 0.4 && t.offense.pbwr < 0.8) || !(t.defense.prwr > 0.25 && t.defense.prwr < 0.65)) problems.push(`${t.abbr}: pbwr/prwr out of range`);
  }
  const ids = teams.flatMap((t) => t.players.map((p) => p.id));
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) problems.push(`duplicate player ids: ${[...new Set(dupes)].join(', ')}`);
  if (problems.length) {
    console.error('\nValidation failed:\n  ' + problems.join('\n  '));
    process.exitCode = 1;
    return;
  }

  // ---- write ----
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const gpList = teams.map((t) => gamesPlayed(cur, nvFromId(t.id)));
  const meta = {
    generatedAt: today.toISOString(),
    season,
    priorSeason,
    currentWeek: week,
    phase,
    depthChartsAsOf: depthCur.asOf || null,
    injuryReportWeek: inj.week || null,
    blend: {
      description: 'Team metrics = w·current season + (1−w)·prior season, w = games played / (games played + 6).',
      gamesPlayedMin: Math.min(...gpList),
      gamesPlayedMax: Math.max(...gpList),
      currentWeightMin: Number(blendWeight(Math.min(...gpList)).toFixed(3)),
      currentWeightMax: Number(blendWeight(Math.max(...gpList)).toFixed(3)),
    },
    proxies: {
      pbwr: 'Pass-block win rate proxy = 0.85 − 1.6 × (QB hits + sacks) / dropbacks allowed.',
      prwr: 'Pass-rush win rate proxy = 0.22 + 1.3 × (QB hits + sacks) / opponent dropbacks; per player from PFR pressures per game.',
      tprr: 'Targets per route run proxy = targets / (team dropbacks × snap share).',
      slotEfficiency: 'Offense EPA per target on throws ≤ 10 air yards.',
      nickelCorner: 'Defense EPA allowed per target on WR throws ≤ 10 air yards (inverted).',
      lbCoverage: 'Defense EPA allowed per target to TEs and RBs (inverted).',
      halftimeAdjust: '2nd-half minus 1st-half EPA/play margin, shrunk toward league average.',
      baseCoverage: 'Not available from free sources — curated per team in src/data/teams.ts.',
    },
    sources: sourceLog,
    notes: ctx.notes,
    teamMetrics: Object.fromEntries(built.map((b) => [b.team.id, { gamesPlayed: b.gp, ...roundMetrics(b.metrics) }])),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'teams.json'), JSON.stringify({ generatedAt: meta.generatedAt, season, week, phase, teams }, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'schedule.json'), JSON.stringify({ generatedAt: meta.generatedAt, season, week, phase, games: schedule }, null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 1));
  fs.writeFileSync(predPath, JSON.stringify(predictions, null, 1));

  const ok = sourceLog.filter((s) => s.ok).length;
  console.log(`\nWrote data/live/{teams,schedule,meta,predictions}.json · ${ok}/${sourceLog.length} sources OK · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const s of sourceLog.filter((s) => !s.ok)) console.log(`  ✗ ${s.name}: ${s.note}`);
  const kc = teams.find((t) => t.id === 'kc')!;
  console.log(`\nSample — ${kc.city} ${kc.name} (${kc.record}) · ${kc.coaching.headCoach} · ${kc.coaching.offScheme} / ${kc.coaching.defFront}`);
  console.log(`  QB ${kc.offense.qb} pass ${kc.offense.passEfficiency} rush ${kc.offense.rushEfficiency} expl ${kc.offense.explosiveness} pbwr ${kc.offense.pbwr} | passD ${kc.defense.passDefense} rushD ${kc.defense.rushDefense} prwr ${kc.defense.prwr} blitz ${kc.defense.blitzRate}`);
  console.log(`  PA ${kc.coaching.playActionRate} pass ${kc.coaching.passRate} pace ${kc.coaching.pace} 3rd ${kc.coaching.thirdDownOff} 4th-go ${kc.coaching.fourthDownGoRate} RZ ${kc.coaching.redZoneTd}`);
  for (const p of kc.players.slice(0, 12)) console.log(`  ${p.pos.padEnd(4)} ${p.role.padEnd(10)} ${String(p.rating).padStart(3)} ${p.name.padEnd(24)} snaps ${p.snapPct} ${p.targetShare !== undefined ? `tgt ${p.targetShare} tprr ${p.tprr}` : ''}${p.prwr !== undefined ? `prwr ${p.prwr}` : ''} ${p.reported ? `[${p.reported}: ${p.reportNote}]` : ''} ${p.note ?? ''}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
