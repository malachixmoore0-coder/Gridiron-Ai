/**
 * The PGA Tour build.
 *
 *   npm run data:golf
 *
 * Two sources and one file. The scoreboard gives the tournaments and, once one
 * is under way, its field with live scores; the league statistics endpoint
 * gives every player's season line and their headshot. They are joined by
 * athlete id and written as a single document, because unlike a team league
 * there is nothing here worth fetching separately.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fetchJson, sourceLog } from '../lib/fetch';
import type { GolfEntry, GolfFile, GolfPlayer, GolfTournament } from '../../src/sports/golf';
import type { RosterStat } from '../../src/sports/roster';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga';
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/golf/pga';
const OUT = path.resolve(__dirname, '../../data/live/sports/pga');

/** How much of the calendar to publish, either side of today. */
const BACK_DAYS = 45;
const AHEAD_DAYS = 90;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const numOf = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^0-9.\-]/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
};
const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

/** The stats worth showing, in the order they answer "is this player good?". */
const HEADLINE: { key: string; label: string; lowerIsBetter?: boolean }[] = [
  { key: 'scoringAverage', label: 'Scoring', lowerIsBetter: true },
  { key: 'topTenFinishes', label: 'Top 10s' },
  { key: 'cutsMade', label: 'Cuts' },
];

const EXTRA: { key: string; label: string }[] = [
  { key: 'wins', label: 'Wins' },
  { key: 'greensInRegPct', label: 'GIR %' },
  { key: 'driveAccuracyPct', label: 'Accuracy %' },
  { key: 'yardsPerDrive', label: 'Drive yds' },
  { key: 'birdiesPerRound', label: 'Birdies/rd' },
  { key: 'tournamentsPlayed', label: 'Events' },
];

interface Cell { display: string; value: number | null; rank: number | null }

/** ESPN returns this columnar: names at the top, values per athlete in order. */
async function loadPlayers(season: number): Promise<GolfPlayer[]> {
  const out: GolfPlayer[] = [];
  const columns = new Map<string, string[]>();
  const LIMIT = 500;
  let pages = 1;

  for (let page = 1; page <= Math.min(pages, 6); page += 1) {
    const url = `${WEB}/statistics/byathlete?region=us&lang=en&contentorigin=espn&qualified=false&limit=${LIMIT}&page=${page}&season=${season}&seasontype=2`;
    const json = await fetchJson<any>(url, `pga athlete stats p${page}`, 25000).catch(() => null);
    for (const cat of json?.categories ?? []) {
      const name = String(cat?.name ?? '');
      if (name && Array.isArray(cat?.names) && !columns.has(name)) columns.set(name, cat.names.map(String));
    }
    const count = numOf(json?.pagination?.count);
    const reported = numOf(json?.pagination?.pages) ?? (count != null ? Math.ceil(count / LIMIT) : null);
    if (reported != null && reported > pages) pages = reported;

    const rows = json?.athletes ?? [];
    if (!rows.length) break;

    for (const row of rows) {
      const a = row?.athlete;
      const id = a?.id != null ? String(a.id) : null;
      const name = str(a?.displayName) ?? str(a?.fullName);
      if (!id || !name || out.some((p) => p.id === id)) continue;

      const line = new Map<string, Cell>();
      for (const cat of row?.categories ?? []) {
        const names = columns.get(String(cat?.name ?? ''));
        if (!names) continue;
        names.forEach((n, i) => {
          const display = typeof cat?.totals?.[i] === 'string' ? cat.totals[i] : null;
          if (!display || display === '-' || line.has(n)) return;
          line.set(n, { display, value: numOf(cat?.values?.[i]), rank: numOf(cat?.ranks?.[i]) });
        });
      }

      const stats: RosterStat[] = [];
      for (const spec of [...HEADLINE, ...EXTRA]) {
        const cell = line.get(spec.key);
        // A player who has not teed it up shows zeros across the board; a row
        // of zeros is worse than no row, so it is left off.
        if (!cell || cell.value === 0 || cell.value == null) continue;
        stats.push({ label: spec.label, value: cell.display, rank: cell.rank, rankOf: null, percentile: null });
      }

      const scoringAverage = line.get('scoringAverage')?.value ?? null;
      out.push({
        id, name,
        short: str(a?.shortName) ?? name,
        headshotUrl: str(a?.headshot?.href),
        flagUrl: str(a?.flag?.href),
        country: str(a?.flag?.alt) ?? str(a?.citizenship),
        scoringAverage: scoringAverage && scoringAverage > 50 ? Math.round(scoringAverage * 100) / 100 : null,
        stats,
        line: stats.slice(0, 3).map((s) => `${s.value} ${s.label}`).join(' · ') || null,
        rating: null,
      });
    }
  }

  // Grade on scoring average, where lower is better, across everyone who has
  // one. Nobody else is graded rather than being given the middle.
  const ranked = out.filter((p) => p.scoringAverage != null).sort((a, b) => (a.scoringAverage! - b.scoringAverage!));
  ranked.forEach((p, i) => {
    const pct = ranked.length > 1 ? 1 - i / (ranked.length - 1) : 1;
    p.rating = Math.round(40 + pct * 59);
    if (p.stats[0]) p.stats[0] = { ...p.stats[0], percentile: Math.round(pct * 100), rankOf: ranked.length };
  });

  return out;
}

/** Pull one tournament's field, which the date-range scoreboard never carries. */
async function loadField(eventId: string): Promise<GolfEntry[]> {
  const json = await fetchJson<any>(`${SITE}/leaderboard?event=${eventId}`, `pga field ${eventId}`, 25000).catch(() => null);
  const ev = json?.events?.[0] ?? json?.event ?? json;
  const comp = ev?.competitions?.[0] ?? ev?.competition;
  const competitors = comp?.competitors ?? ev?.competitors ?? [];

  if (process.env.ROSTER_DEBUG) {
    console.log(`    [debug] field ${eventId}: keys ${json ? Object.keys(json).join(',') : 'null'} · competitors ${competitors.length}`);
    if (competitors[0]) console.log('    [debug] competitor:', String(JSON.stringify(competitors[0])).slice(0, 700));
  }

  const out: GolfEntry[] = [];
  for (const c of competitors) {
    const a = c?.athlete;
    const pid = a?.id != null ? String(a.id) : null;
    if (!pid) continue;
    const linescores = c?.linescores ?? [];
    out.push({
      playerId: pid,
      name: str(a?.displayName) ?? str(a?.fullName) ?? pid,
      headshotUrl: str(a?.headshot?.href) ?? str(a?.headshot),
      flagUrl: str(a?.flag?.href),
      position: str(c?.status?.position?.displayName) ?? str(c?.status?.position?.id) ?? null,
      score: numOf(c?.score?.displayValue) ?? numOf(c?.score) ?? numOf(c?.statistics?.find((x: any) => x?.name === 'scoreToPar')?.displayValue),
      scoreText: str(c?.score?.displayValue) ?? (c?.score != null ? String(c.score) : null),
      today: str(linescores[linescores.length - 1]?.displayValue) ?? null,
      thru: c?.status?.thru != null ? String(c.status.thru) : null,
      rounds: linescores.map((l: any) => numOf(l?.value)).filter((v: number | null): v is number => v != null),
      status: str(c?.status?.type?.description) ?? null,
    });
  }
  out.sort((a, b) => (a.score ?? 999) - (b.score ?? 999));
  return out;
}

/** Everything on the calendar in the window, with a field where one exists. */
async function loadTournaments(): Promise<GolfTournament[]> {
  const from = new Date(); from.setUTCDate(from.getUTCDate() - BACK_DAYS);
  const to = new Date(); to.setUTCDate(to.getUTCDate() + AHEAD_DAYS);
  const json = await fetchJson<any>(`${SITE}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=200`, 'pga scoreboard', 25000).catch(() => null);

  const out: GolfTournament[] = [];
  for (const ev of json?.events ?? []) {
    const id = ev?.id != null ? String(ev.id) : null;
    if (!id) continue;
    const comp = ev?.competitions?.[0];
    const state = str(comp?.status?.type?.state) ?? str(ev?.status?.type?.state) ?? 'pre';
    const status: GolfTournament['status'] = state === 'post' ? 'final' : state === 'in' ? 'in_progress' : 'scheduled';

    const field: GolfEntry[] = [];
    for (const c of comp?.competitors ?? []) {
      const a = c?.athlete;
      const pid = a?.id != null ? String(a.id) : null;
      if (!pid) continue;
      field.push({
        playerId: pid,
        name: str(a?.displayName) ?? str(a?.fullName) ?? pid,
        headshotUrl: str(a?.headshot?.href),
        flagUrl: str(a?.flag?.href),
        position: str(c?.status?.position?.displayName) ?? str(c?.status?.position?.id) ?? null,
        score: numOf(c?.score),
        scoreText: str(c?.score) ?? (numOf(c?.score) != null ? String(c.score) : null),
        today: str(c?.linescores?.[c.linescores.length - 1]?.displayValue) ?? null,
        thru: str(c?.status?.thru) ?? (c?.status?.thru != null ? String(c.status.thru) : null),
        rounds: (c?.linescores ?? []).map((l: any) => numOf(l?.value)).filter((v: number | null): v is number => v != null),
        status: str(c?.status?.type?.description) ?? null,
      });
    }
    field.sort((a, b) => (a.score ?? 999) - (b.score ?? 999));

    // Four rounds, less whatever the leader has already finished.
    const played = Math.max(0, ...field.map((f) => f.rounds.length));
    const roundsLeft = status === 'final' ? 0 : Math.max(0, 4 - played);

    out.push({
      id,
      name: str(ev?.name) ?? 'Tournament',
      short: str(ev?.shortName) ?? str(ev?.name) ?? 'Tournament',
      start: str(ev?.date) ?? new Date().toISOString(),
      end: str(ev?.endDate) ?? str(ev?.date) ?? new Date().toISOString(),
      status,
      statusDetail: str(comp?.status?.type?.detail) ?? str(ev?.status?.type?.detail) ?? null,
      course: str(ev?.courses?.[0]?.name) ?? str(comp?.course?.name) ?? null,
      purse: numOf(ev?.purse) ?? numOf(comp?.purse),
      roundsLeft,
      field,
    });
  }
  out.sort((a, b) => a.start.localeCompare(b.start));

  // The date-range scoreboard lists tournaments but never their fields, so the
  // ones worth showing get a second request each: whatever is being played, the
  // next two up, and the last three finished. Sixteen events is not worth
  // sixteen requests for pages nobody scrolls to.
  const live = out.filter((t) => t.status === 'in_progress');
  const next = out.filter((t) => t.status === 'scheduled').slice(0, 2);
  const past = out.filter((t) => t.status === 'final').slice(-3);
  for (const t of [...live, ...next, ...past]) {
    const field = await loadField(t.id).catch(() => [] as GolfEntry[]);
    if (!field.length) continue;
    t.field = field;
    const played = Math.max(0, ...field.map((f) => f.rounds.length));
    t.roundsLeft = t.status === 'final' ? 0 : Math.max(0, 4 - played);
  }

  return out;
}

async function main() {
  const season = new Date().getUTCFullYear();
  console.log('Gridiron AI golf build — PGA Tour');

  const [players, tournaments] = await Promise.all([loadPlayers(season), loadTournaments()]);
  const ranked = players.filter((p) => p.scoringAverage != null).length;

  const file: GolfFile = {
    generatedAt: new Date().toISOString(),
    season,
    ranked,
    tournaments,
    players: players.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name)),
  };

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'golf.json'), JSON.stringify(file));

  const withField = tournaments.filter((t) => t.field.length).length;
  console.log(`  ${tournaments.length} tournaments (${withField} with a field) · ${players.length} players · ${ranked} with a scoring average`);
  const ok = sourceLog.filter((s) => s.ok).length;
  console.log(`${ok}/${sourceLog.length} sources OK`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
