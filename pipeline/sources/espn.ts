/**
 * ESPN public endpoints — best-effort enrichment only. These are undocumented,
 * so every access is guarded and any surprise in the payload just means we
 * skip the enrichment and say so in meta.json.
 */
import { fetchJson } from '../lib/fetch';

export const ESPN_ABBR: Record<string, string> = { lar: 'lar', was: 'wsh', jax: 'jax' };
export const espnLogo = (id: string) => `https://a.espncdn.com/i/teamlogos/nfl/500/${ESPN_ABBR[id] ?? id}.png`;

export interface EspnInjury { team: string; name: string; status: string; detail: string; }

/** Current injury list per team from ESPN. Returns [] when unreachable or unexpected. */
export async function loadEspnInjuries(): Promise<EspnInjury[]> {
  const data = await fetchJson<any>('https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries', 'ESPN injuries (best-effort)');
  const out: EspnInjury[] = [];
  try {
    const teams: any[] = Array.isArray(data?.injuries) ? data.injuries : [];
    for (const t of teams) {
      const abbr = String(t?.team?.abbreviation ?? t?.abbreviation ?? '').toLowerCase();
      const list: any[] = Array.isArray(t?.injuries) ? t.injuries : [];
      for (const inj of list) {
        const name = inj?.athlete?.displayName ?? inj?.athlete?.fullName;
        const status = inj?.status ?? inj?.type?.description;
        if (!abbr || !name || !status) continue;
        out.push({ team: abbr === 'wsh' ? 'was' : abbr, name: String(name), status: String(status), detail: String(inj?.details?.type ?? inj?.shortComment ?? '') });
      }
    }
  } catch {
    return [];
  }
  return out;
}

export interface EspnGame {
  id: string; kickoff: string; status: string;
  homeAbbr: string; awayAbbr: string;
  /** Scores once the game has started; `final` when ESPN marks it complete. */
  homeScore: number | null; awayScore: number | null; final: boolean;
  homeSpread: number | null; total: number | null; provider: string | null;
}

const ABBR_TO_ID: Record<string, string> = { wsh: 'was', la: 'lar' };
const teamId = (abbr: string) => { const a = abbr.toLowerCase(); return ABBR_TO_ID[a] ?? a; };

/**
 * One week's scoreboard. ESPN posts a final within minutes of the whistle,
 * hours before the schedule mirror catches up, so this is what lets records
 * and prediction grading move right after a game.
 */
export async function loadScoreboard(season: number, week: number, seasonType = 2): Promise<Map<string, EspnGame>> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100&dates=${season}&seasontype=${seasonType}&week=${week}`;
  const data = await fetchJson<any>(url, `ESPN scoreboard week ${week} (best-effort)`);
  const out = new Map<string, EspnGame>();
  try {
    for (const ev of Array.isArray(data?.events) ? data.events : []) {
      const comp = ev?.competitions?.[0];
      if (!ev?.id || !comp) continue;
      const home = (comp.competitors ?? []).find((c: any) => c?.homeAway === 'home');
      const away = (comp.competitors ?? []).find((c: any) => c?.homeAway === 'away');
      if (!home?.team?.abbreviation || !away?.team?.abbreviation) continue;
      const st = String(comp.status?.type?.name ?? '');
      const started = st !== 'STATUS_SCHEDULED' && st !== '';
      const sc = (c: any) => { const v = Number(c?.score); return started && Number.isFinite(v) ? v : null; };
      const odds = comp.odds?.[0];
      let homeSpread: number | null = typeof odds?.spread === 'number' ? odds.spread : null;
      if (homeSpread === null && typeof odds?.details === 'string') {
        const m = odds.details.match(/^([A-Z]+)\s+(-?\d+(?:\.\d+)?)$/);
        if (m) homeSpread = m[1] === home.team.abbreviation ? Number(m[2]) : -Number(m[2]);
        else if (/EVEN/i.test(odds.details)) homeSpread = 0;
      }
      out.set(String(ev.id), {
        id: String(ev.id), kickoff: String(comp.date ?? ev.date ?? ''), status: st,
        homeAbbr: teamId(home.team.abbreviation), awayAbbr: teamId(away.team.abbreviation),
        homeScore: sc(home), awayScore: sc(away), final: st === 'STATUS_FINAL' || !!comp.status?.type?.completed,
        homeSpread, total: typeof odds?.overUnder === 'number' ? odds.overUnder : null, provider: odds?.provider?.name ?? null,
      });
    }
  } catch {
    return new Map();
  }
  return out;
}

export interface EspnOdds { espnEventId: string; spread?: string; overUnder?: number; provider?: string; }

/** Consensus odds for the current scoreboard, keyed by ESPN event id. */
export async function loadEspnOdds(): Promise<Map<string, EspnOdds>> {
  const data = await fetchJson<any>('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard', 'ESPN scoreboard odds (best-effort)');
  const out = new Map<string, EspnOdds>();
  try {
    for (const ev of Array.isArray(data?.events) ? data.events : []) {
      const comp = ev?.competitions?.[0];
      const odds = comp?.odds?.[0];
      if (!ev?.id || !odds) continue;
      out.set(String(ev.id), { espnEventId: String(ev.id), spread: odds.details, overUnder: typeof odds.overUnder === 'number' ? odds.overUnder : undefined, provider: odds.provider?.name });
    }
  } catch {
    return new Map();
  }
  return out;
}
