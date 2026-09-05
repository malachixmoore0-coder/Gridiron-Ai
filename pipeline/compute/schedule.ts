/**
 * Schedule, betting lines, records and (best-effort) kickoff weather for the
 * current and next week, derived from nflverse's games file.
 */
import type { Team, Weather } from '../../src/engine/types';
import type { GameRow } from '../sources/nflverse';
import { forecastAt } from '../sources/weather';
import { idFromNv } from '../lib/util';

export type { LiveGame } from '../../src/data/liveTypes';
import type { LiveGame } from '../../src/data/liveTypes';

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

export async function buildSchedule(games: GameRow[], season: number, week: number, teams: Team[], withWeather: boolean): Promise<LiveGame[]> {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const rows = games
    .filter((g) => g.season === season && ((g.game_type === 'REG' && (g.week === week || g.week === week + 1)) || (g.game_type !== 'REG' && g.week === week)))
    .sort((a, b) => a.gameday.localeCompare(b.gameday) || a.gametime.localeCompare(b.gametime));
  const out: LiveGame[] = [];
  for (const g of rows) {
    const homeId = idFromNv(g.home_team);
    const awayId = idFromNv(g.away_team);
    const home = byId.get(homeId);
    const kickoff = kickoffIso(g.gameday, g.gametime);
    const final = Number.isFinite(g.home_score);
    const outdoor = g.roof === 'outdoors' || g.roof === 'open';
    let weather: LiveGame['weather'] = null;
    if (final && Number.isFinite(g.temp)) {
      const summary: Weather = !outdoor ? 'dome' : g.wind >= 15 ? 'wind' : g.temp <= 32 ? 'cold' : g.temp >= 88 ? 'heat' : 'clear';
      weather = { tempF: g.temp, windMph: Number.isFinite(g.wind) ? g.wind : 0, precipPct: 0, snowIn: 0, summary, source: 'observed' };
    } else if (!final && outdoor && withWeather && home && g.location !== 'Neutral') {
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
      awayScore: n(g.away_score), homeScore: n(g.home_score), status: final ? 'final' : 'scheduled',
    });
  }
  return out;
}
