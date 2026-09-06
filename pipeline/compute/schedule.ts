/**
 * Schedule, betting lines, records and (best-effort) kickoff weather for the
 * current and next week, derived from nflverse's games file.
 */
import type { Team, Weather } from '../../src/engine/types';
import type { GameRow } from '../sources/nflverse';
import { forecastAt } from '../sources/weather';
import { idFromNv } from '../lib/util';
import type { EspnGame } from '../sources/espn';

export type { LiveGame } from '../../src/data/liveTypes';
import type { LiveGame, LiveScheduleFile } from '../../src/data/liveTypes';

const n = (v: number) => (Number.isFinite(v) ? v : null);

/** Kickoff in US Eastern time → ISO. DST ends first Sunday of November and starts second Sunday of March. */
export function kickoffIso(gameday: string, gametime: string): string {
  const [y, m, d] = gameday.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const firstSundayNov = new Date(Date.UTC(y, 10, 1)); firstSundayNov.setUTCDate(1 + ((7 - firstSundayNov.getUTCDay()) % 7));
  const secondSundayMar = new Date(Date.UTC(y, 2, 1)); secondSundayMar.setUTCDate(1 + ((7 - secondSundayMar.getUTCDay()) % 7) + 7);
  const dst = date >= secondSundayMar && date < firstSundayNov;
  return `${gameday}T${gametime || '13:00'}:00${dst ? '-04:00' : '-05:00'}`;
}

export function currentWeek(games: GameRow[], season: number, today: Date): { week: number; phase: 'preseason' | 'regular' | 'postseason' | 'offseason' } {
  const reg = games.filter((g) => g.season === season && g.game_type === 'REG');
  const played = reg.filter((g) => Number.isFinite(g.home_score));
  const unplayed = reg.filter((g) => !Number.isFinite(g.home_score));
  if (!reg.length) return { week: 1, phase: 'offseason' };
  if (!unplayed.length) {
    const post = games.filter((g) => g.season === season && g.game_type !== 'REG' && !Number.isFinite(g.home_score));
    return post.length ? { week: Math.min(...post.map((g) => g.week)), phase: 'postseason' } : { week: Math.max(...reg.map((g) => g.week)), phase: 'offseason' };
  }
  const week = Math.min(...unplayed.map((g) => g.week));
  const firstKick = new Date(kickoffIso(reg.slice().sort((a, b) => a.gameday.localeCompare(b.gameday))[0].gameday, '13:00'));
  return { week, phase: played.length === 0 && today < firstKick ? 'preseason' : 'regular' };
}

/**
 * Fill in scores the schedule mirror has not published yet from ESPN's
 * scoreboard, which posts a final within minutes. This is what lets team
 * records and prediction grading move right after a game ends.
 */
export function mergeResults(games: GameRow[], espn: Map<string, EspnGame> | undefined): GameRow[] {
  if (!espn?.size) return games;
  const byTeams = new Map<string, EspnGame>();
  for (const e of espn.values()) if (e.final) byTeams.set(`${e.awayAbbr}@${e.homeAbbr}`, e);
  return games.map((g) => {
    if (Number.isFinite(g.home_score) && Number.isFinite(g.away_score)) return g;
    // nflverse game ids differ from ESPN's, so match on the team pairing within the fetched weeks.
    const e = byTeams.get(`${idFromNv(g.away_team)}@${idFromNv(g.home_team)}`);
    if (!e || e.homeScore === null || e.awayScore === null) return g;
    return { ...g, home_score: e.homeScore, away_score: e.awayScore };
  });
}

/**
 * Week to fetch scoreboards for, from kickoff dates alone (no results needed),
 * so the ESPN fetch can happen early enough to supply those results.
 */
export function weekByDate(games: GameRow[], season: number, today: Date): { week: number; postseason: boolean } {
  const reg = games.filter((g) => g.season === season && g.game_type === 'REG');
  const upcoming = reg.filter((g) => Date.parse(kickoffIso(g.gameday, g.gametime)) > today.getTime() - 6 * 3_600_000);
  if (upcoming.length) return { week: Math.min(...upcoming.map((g) => g.week)), postseason: false };
  const post = games.filter((g) => g.season === season && g.game_type !== 'REG' && Date.parse(kickoffIso(g.gameday, g.gametime)) > today.getTime() - 6 * 3_600_000);
  if (post.length) return { week: Math.min(...post.map((g) => g.week)), postseason: true };
  return { week: reg.length ? Math.max(...reg.map((g) => g.week)) : 1, postseason: false };
}

export function records(games: GameRow[], season: number): Map<string, string> {
  const w = new Map<string, { w: number; l: number; t: number }>();
  for (const g of games) {
    if (g.season !== season || g.game_type !== 'REG' || !Number.isFinite(g.home_score)) continue;
    const h = w.get(g.home_team) ?? { w: 0, l: 0, t: 0 };
    const a = w.get(g.away_team) ?? { w: 0, l: 0, t: 0 };
    if (g.home_score > g.away_score) { h.w++; a.l++; } else if (g.home_score < g.away_score) { a.w++; h.l++; } else { h.t++; a.t++; }
    w.set(g.home_team, h); w.set(g.away_team, a);
  }
  return new Map([...w].map(([k, v]) => [idFromNv(k), `${v.w}-${v.l}${v.t ? `-${v.t}` : ''}`]));
}

/** Open-Meteo only forecasts about two weeks out, so only ask for games inside that window. */
const FORECAST_DAYS = 12;

/**
 * Index of every week the published slate covers, so the app can offer a tab
 * per week without scanning the whole game list.
 */
export function weekIndex(games: LiveGame[]): NonNullable<LiveScheduleFile['weeks']> {
  const byKey = new Map<string, LiveGame[]>();
  for (const g of games) {
    const key = `${g.gameType}|${g.week}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(g);
  }
  const label = (gameType: string, week: number) => {
    if (gameType === 'REG') return `Week ${week}`;
    if (gameType === 'WC') return 'Wild Card';
    if (gameType === 'DIV') return 'Divisional';
    if (gameType === 'CON') return 'Conf. Champ';
    if (gameType === 'SB') return 'Super Bowl';
    return gameType;
  };
  return [...byKey.entries()]
    .map(([key, list]) => {
      const gameType = key.split('|')[0];
      const week = Number(key.split('|')[1]);
      return {
        week, gameType, label: label(gameType, week),
        games: list.length,
        final: list.filter((g) => g.status === 'final').length,
        live: list.filter((g) => g.status === 'in_progress').length,
        start: list.map((g) => g.kickoff).sort()[0] ?? '',
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.week - b.week);
}

export async function buildSchedule(games: GameRow[], season: number, week: number, teams: Team[], withWeather: boolean, espn?: Map<string, EspnGame>, today: Date = new Date()): Promise<LiveGame[]> {
  const byId = new Map(teams.map((t) => [t.id, t]));
  // The whole season ships, so the app can offer a tab per week; the slate
  // still opens on the current one.
  const rows = games
    .filter((g) => g.season === season)
    .sort((a, b) => a.gameday.localeCompare(b.gameday) || a.gametime.localeCompare(b.gametime));
  // nflverse ids differ from ESPN's, so live games are matched on the team pairing.
  const liveByTeams = new Map<string, EspnGame>();
  for (const e of espn?.values() ?? []) liveByTeams.set(`${e.awayAbbr}@${e.homeAbbr}`, e);
  const out: LiveGame[] = [];
  for (const g of rows) {
    const homeId = idFromNv(g.home_team);
    const awayId = idFromNv(g.away_team);
    const home = byId.get(homeId);
    const kickoff = kickoffIso(g.gameday, g.gametime);
    const e = liveByTeams.get(`${awayId}@${homeId}`);
    const espnScored = e && e.homeScore !== null && e.awayScore !== null && (e.final || e.live);
    const homeScore = espnScored ? e!.homeScore! : g.home_score;
    const awayScore = espnScored ? e!.awayScore! : g.away_score;
    const final = (e?.final && espnScored) || (!e?.live && Number.isFinite(homeScore) && Number.isFinite(awayScore));
    const daysOut = (Date.parse(kickoff) - today.getTime()) / 86_400_000;
    const outdoor = g.roof === 'outdoors' || g.roof === 'open';
    let weather: LiveGame['weather'] = null;
    if (final && Number.isFinite(g.temp)) {
      const summary: Weather = !outdoor ? 'dome' : g.wind >= 15 ? 'wind' : g.temp <= 32 ? 'cold' : g.temp >= 88 ? 'heat' : 'clear';
      weather = { tempF: g.temp, windMph: Number.isFinite(g.wind) ? g.wind : 0, precipPct: 0, snowIn: 0, summary, source: 'observed' };
    } else if (!final && outdoor && withWeather && home && g.location !== 'Neutral' && daysOut > -1 && daysOut < FORECAST_DAYS) {
      const f = await forecastAt(home.stadium.lat, home.stadium.lng, kickoff);
      if (f) weather = { ...f, source: 'forecast' };
    }
    const hour = Number((g.gametime || '13:00').slice(0, 2));
    out.push({
      id: g.game_id, season: g.season, week: g.week, gameType: g.game_type, kickoff, weekday: g.weekday, awayId, homeId,
      neutralSite: g.location === 'Neutral', divisionGame: g.div_game, stadium: g.stadium, roof: g.roof,
      homeSpread: Number.isFinite(g.spread_line) ? -g.spread_line : null, totalLine: n(g.total_line), awayMoneyline: n(g.away_moneyline), homeMoneyline: n(g.home_moneyline),
      primetime: hour >= 20 || g.weekday === 'Thursday' || g.weekday === 'Monday',
      weather,
      weatherHint: !outdoor ? 'dome' : weather?.summary ?? null,
      awayScore: n(awayScore), homeScore: n(homeScore),
      status: final ? 'final' : e?.live ? 'in_progress' : 'scheduled',
      statusDetail: e?.live ? e.detail : null,
      broadcast: e?.broadcast ?? null,
    });
  }
  return out;
}
