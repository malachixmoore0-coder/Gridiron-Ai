/**
 * Fast score refresh — everything that has to move the moment a game ends,
 * without rebuilding the dataset.
 *
 *   npm run data:scores
 *
 * Reads the published data/live files, pulls the ESPN scoreboard (with the
 * nflverse schedule as a backstop), then updates team records, finalises games
 * on the slate, grades any locked prediction and refreshes each team's roster
 * schedule. It never touches ratings or depth charts, so it is safe to run
 * every few minutes on a game day: seconds to run, a diff of a few lines.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { Team } from '../src/engine/types';
import type { LivePredictionsFile, LiveScheduleFile, LiveTeamsFile, TeamRosterFile } from '../src/data/liveTypes';
import { loadGames } from '../pipeline/sources/nflverse';
import { loadScoreboard, type EspnGame } from '../pipeline/sources/espn';
import { loadBooks } from '../pipeline/sources/books';
import { loadEspnTeamIds, loadTeamNews } from '../pipeline/sources/news';
import { mergeResults, weekByDate } from '../pipeline/compute/schedule';
import { grade } from '../pipeline/compute/predictions';
import { sourceLog } from '../pipeline/lib/fetch';
import { idFromNv, nvFromId } from '../pipeline/lib/util';

const OUT_DIR = path.resolve(__dirname, '../data/live');
const read = <T>(name: string): T | null => { try { return JSON.parse(fs.readFileSync(path.join(OUT_DIR, name), 'utf8')) as T; } catch { return null; } };
const write = (name: string, data: unknown) => fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data, null, 1));
/** The schedule is a whole season now — written without indentation, as the build does. */
const writeCompact = (name: string, data: unknown) => fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(data));

async function main() {
  const today = new Date();
  console.log(`\nGridiron AI score refresh — ${today.toISOString()}`);
  const teamsFile = read<LiveTeamsFile>('teams.json');
  const scheduleFile = read<LiveScheduleFile>('schedule.json');
  if (!teamsFile || !scheduleFile) { console.error('No published dataset yet — run npm run data:build first.'); process.exitCode = 1; return; }
  const season = teamsFile.season;

  const raw = await loadGames();
  const dateWeek = weekByDate(raw, season, today);
  const fetchWeeks = dateWeek.postseason ? [dateWeek.week] : [dateWeek.week - 1, dateWeek.week, dateWeek.week + 1].filter((w) => w >= 1);
  const boards = await Promise.all(fetchWeeks.map((w) => loadScoreboard(season, w, dateWeek.postseason ? 3 : 2)));
  const espn = new Map<string, EspnGame>(boards.flatMap((b) => [...b]));
  const games = mergeResults(raw, espn);
  console.log(`  weeks ${fetchWeeks.join(', ')} · ${espn.size} games from ESPN · ${[...espn.values()].filter((g) => g.final).length} final`);

  // ESPN ids differ from nflverse's, so live games are matched on the team pairing.
  const liveByTeams = new Map<string, EspnGame>();
  for (const e of espn.values()) if (e.live) liveByTeams.set(`${e.awayAbbr}@${e.homeAbbr}`, e);
  const finalOf = (id: string): { home: number; away: number } | null => {
    const g = games.find((x) => x.game_id === id);
    if (!g) return null;
    if (liveByTeams.has(`${idFromNv(g.away_team)}@${idFromNv(g.home_team)}`)) return null; // under way, not final
    if (Number.isFinite(g.home_score) && Number.isFinite(g.away_score)) return { home: g.home_score, away: g.away_score };
    return null;
  };
  /** Score and clock for a game that is under way. */
  const liveOf = (id: string): { home: number; away: number; detail: string | null } | null => {
    const g = raw.find((x) => x.game_id === id);
    if (!g) return null;
    const e = liveByTeams.get(`${idFromNv(g.away_team)}@${idFromNv(g.home_team)}`);
    return e && e.homeScore !== null && e.awayScore !== null ? { home: e.homeScore, away: e.awayScore, detail: e.detail } : null;
  };

  // ---- records ----
  const wl = new Map<string, { w: number; l: number; t: number }>();
  for (const g of games) {
    if (g.season !== season || g.game_type !== 'REG') continue;
    const f = finalOf(g.game_id);
    if (!f) continue;
    const h = wl.get(g.home_team) ?? { w: 0, l: 0, t: 0 };
    const a = wl.get(g.away_team) ?? { w: 0, l: 0, t: 0 };
    if (f.home > f.away) { h.w++; a.l++; } else if (f.home < f.away) { a.w++; h.l++; } else { h.t++; a.t++; }
    wl.set(g.home_team, h); wl.set(g.away_team, a);
  }
  let recordChanges = 0;
  const teams: Team[] = teamsFile.teams.map((t) => {
    const r = wl.get(nvFromId(t.id));
    const rec = r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}` : '0-0';
    if (rec !== t.record) recordChanges++;
    return { ...t, record: rec };
  });

  // ---- schedule ----
  let scoreChanges = 0;
  let liveChanges = 0;
  const schedule = scheduleFile.games.map((g) => {
    if (g.status === 'final') return g;
    const f = finalOf(g.id);
    if (f) { scoreChanges++; return { ...g, homeScore: f.home, awayScore: f.away, status: 'final' as const, statusDetail: null }; }
    const live = liveOf(g.id);
    if (!live) return g;
    if (g.status === 'in_progress' && g.homeScore === live.home && g.awayScore === live.away && g.statusDetail === live.detail) return g;
    liveChanges++;
    return { ...g, homeScore: live.home, awayScore: live.away, status: 'in_progress' as const, statusDetail: live.detail };
  });
  // Week counters follow the games, so the Slate's tabs stay accurate between builds.
  const weeks = scheduleFile.weeks?.map((w) => {
    const list = schedule.filter((g) => g.week === w.week && g.gameType === w.gameType);
    return { ...w, games: list.length, final: list.filter((g) => g.status === 'final').length, live: list.filter((g) => g.status === 'in_progress').length };
  });

  // ---- predictions ----
  const predFile = read<LivePredictionsFile>('predictions.json');
  let graded = 0;
  let locked = 0;
  if (predFile && predFile.season === season) {
    for (const r of predFile.records) {
      if (r.status === 'open' && Date.parse(r.kickoff) <= today.getTime()) { r.status = 'locked'; r.lockedAt = r.kickoff; locked++; }
      if (r.status === 'locked') {
        const f = finalOf(r.id);
        if (f) { r.result = grade(r, f.home, f.away); r.status = 'final'; graded++; }
      }
    }
  }

  // ---- roster files (the team page reads the record and schedule from these) ----
  let rosterChanges = 0;
  const rosterDir = path.join(OUT_DIR, 'rosters');
  if (fs.existsSync(rosterDir)) {
    for (const t of teams) {
      const p = path.join(rosterDir, `${t.id}.json`);
      let file: TeamRosterFile;
      try { file = JSON.parse(fs.readFileSync(p, 'utf8')) as TeamRosterFile; } catch { continue; }
      let touched = file.record !== (t.record ?? '0-0');
      file.record = t.record ?? '0-0';
      for (const g of file.schedule) {
        if (g.status === 'final') continue;
        const f = finalOf(g.id);
        if (!f) continue;
        const row = games.find((x) => x.game_id === g.id);
        const isHome = row ? idFromNv(row.home_team) === t.id : g.home;
        g.teamScore = isHome ? f.home : f.away;
        g.oppScore = isHome ? f.away : f.home;
        g.result = g.teamScore > g.oppScore ? 'W' : g.teamScore < g.oppScore ? 'L' : null;
        g.status = 'final';
        touched = true;
      }
      const next = file.schedule.find((g) => g.status === 'scheduled');
      if (file.nextGameId !== (next?.id ?? null)) { file.nextGameId = next?.id ?? null; touched = true; }
      if (touched) { file.generatedAt = today.toISOString(); fs.writeFileSync(p, JSON.stringify(file)); rosterChanges++; }
    }
  }

  /* ---- per-book lines ---------------------------------------------------
     One consensus number is not enough to bet off: the Parlay Lab prices every
     leg at a specific book, so every game inside the window gets its provider
     list. Games already final are skipped — nobody shops a closed market. */
  let bookedGames = 0;
  const upcoming = schedule
    .filter((g) => g.status !== 'final' && Date.parse(g.kickoff) > Date.now() - 6 * 3_600_000)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 24);
  if (upcoming.length) {
    const eventFor = new Map<string, string>();
    for (const e of espn.values()) eventFor.set(`${e.awayAbbr}@${e.homeAbbr}`, e.id);
    const wanted = upcoming
      .map((g) => ({ g, eventId: eventFor.get(`${g.awayId}@${g.homeId}`) }))
      .filter((x): x is { g: typeof upcoming[number]; eventId: string } => !!x.eventId);
    const books = await loadBooks('nfl', wanted.map((w) => w.eventId));
    for (const { g, eventId } of wanted) {
      const list = books.get(eventId);
      if (!list?.length) continue;
      (g as unknown as { books: unknown }).books = list;
      bookedGames += 1;
    }
    console.log(`  ${bookedGames}/${wanted.length} games with per-book lines`);
  }

  /* ---- team headlines ---------------------------------------------------
     Pulled once here rather than from every device on every team page. */
  let newsFiles = 0;
  try {
    const espnIds = await loadEspnTeamIds('nfl');
    if (espnIds.size) {
      const newsDir = path.join(OUT_DIR, 'news');
      fs.mkdirSync(newsDir, { recursive: true });
      const queue = teams.map((t) => t.id);
      const run = async () => {
        for (;;) {
          const id = queue.shift();
          if (!id) return;
          const espnId = espnIds.get(id.toLowerCase()) ?? espnIds.get((id === 'was' ? 'wsh' : id === 'lar' ? 'la' : id).toLowerCase());
          if (!espnId) continue;
          const items = await loadTeamNews('nfl', espnId).catch(() => []);
          if (!items.length) continue;
          fs.writeFileSync(path.join(newsDir, `${id}.json`), JSON.stringify({ teamId: id, generatedAt: today.toISOString(), items }));
          newsFiles += 1;
        }
      };
      await Promise.all([run(), run(), run(), run()]);
      console.log(`  ${newsFiles} team news files`);
    }
  } catch {
    console.log('  team news unavailable this run');
  }

  const stamp = today.toISOString();
  if (recordChanges || scoreChanges || liveChanges || bookedGames) {
    if (recordChanges || scoreChanges) write('teams.json', { ...teamsFile, generatedAt: stamp, teams });
    writeCompact('schedule.json', { ...scheduleFile, generatedAt: stamp, weeks, games: schedule });
  }
  if (predFile && (graded || locked)) write('predictions.json', { ...predFile, generatedAt: stamp, records: predFile.records });

  const ok = sourceLog.filter((s) => s.ok).length;
  console.log(`  ${recordChanges} records changed · ${scoreChanges} games finalised · ${liveChanges} live updates · ${locked} predictions locked · ${graded} graded · ${rosterChanges} roster files touched · ${ok}/${sourceLog.length} sources OK`);
  if (!recordChanges && !scoreChanges && !liveChanges && !graded && !locked && !rosterChanges && !bookedGames && !newsFiles) console.log('  Nothing to update.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
