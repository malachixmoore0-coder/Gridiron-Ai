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
