/**
 * Rosters for the generic leagues: the published shape, and the fetch.
 *
 * One file per team, fetched the first time someone opens that team and then
 * kept on the device. Nine leagues' worth of rosters up front would be tens of
 * megabytes for a screen most people never open; one team's is a few kilobytes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { LEAGUE_BY_KEY, type LeagueKey, type SportId } from '@/sports/types';
import { MULTI_DATA_URL } from '@/sports/feed';

export interface RosterStat {
  label: string;
  value: string;
  /** The league's own rank at this stat, 1 = best. */
  rank?: number | null;
  rankOf?: number | null;
  percentile?: number | null;
}

export interface SportPlayer {
  id: string;
  name: string;
  short: string;
  jersey: string | null;
  pos: string;
  unit: string;
  headshotUrl: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  experience: number | null;
  college: string | null;
  birthplace: string | null;
  /** National flag, used where a headshot is missing — common in soccer. */
  flagUrl?: string | null;
  status: string | null;
  injury: string | null;
  line: string | null;
  stats: RosterStat[];
  rating: number | null;
  ratingBasis: 'production' | 'roster';
}

export interface SportRosterFile {
  teamId: string;
  league: string;
  generatedAt: string;
  season: number;
  /** Where the season lines came from; 'none' means the league publishes none. */
  statsSource?: 'league' | 'leaders' | 'athlete' | 'none';
  players: SportPlayer[];
}

/** The order units read in, per sport — mirrors the pipeline's grouping. */
export const UNIT_ORDER: Record<SportId, string[]> = {
  basketball: ['Guards', 'Wings', 'Bigs'],
  baseball: ['Starting pitchers', 'Relievers', 'Catchers', 'Infield', 'Outfield'],
  soccer: ['Goalkeepers', 'Defenders', 'Midfield', 'Forwards'],
  hockey: ['Forwards', 'Defense', 'Goaltenders'],
  football: ['Offense', 'Defense', 'Special teams'],
};

const CACHE = 'gridiron-ai.roster.v1.';
const STALE_MS = 12 * 3_600_000;
const memory = new Map<string, SportRosterFile>();

export const rosterUrl = (league: LeagueKey, teamId: string) =>
  `${MULTI_DATA_URL}/${LEAGUE_BY_KEY[league].slug}/rosters/${teamId}.json`;

async function fetchRoster(league: LeagueKey, teamId: string): Promise<SportRosterFile | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${rosterUrl(league, teamId)}?t=${Math.floor(Date.now() / 3_600_000)}`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as SportRosterFile;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A team's roster, from memory, then the device, then the network.
 *
 * `missing` is deliberately distinct from `loading`: a league that publishes
 * no rosters — because it has four hundred teams — is a different thing from
 * one that has not finished loading, and the screen says which.
 */
export function useRoster(league: LeagueKey | null, teamId: string | null) {
  const key = league && teamId ? `${league}:${teamId}` : null;
  const [file, setFile] = useState<SportRosterFile | null>(() => (key ? memory.get(key) ?? null : null));
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    if (!key || !league || !teamId) return;
    const cached = memory.get(key);
    if (cached) { setFile(cached); return; }

    setLoading(true);
    setMissing(false);
    try {
      const raw = await AsyncStorage.getItem(CACHE + key).catch(() => null);
      if (raw) {
        const saved = JSON.parse(raw) as { at: number; file: SportRosterFile };
        memory.set(key, saved.file);
        setFile(saved.file);
        if (Date.now() - saved.at < STALE_MS) { setLoading(false); return; }
      }
      const fresh = await fetchRoster(league, teamId);
      if (fresh) {
        memory.set(key, fresh);
        setFile(fresh);
        AsyncStorage.setItem(CACHE + key, JSON.stringify({ at: Date.now(), file: fresh })).catch(() => {});
      } else if (!raw) {
        setMissing(true);
      }
    } finally {
      setLoading(false);
    }
  }, [key, league, teamId]);

  useEffect(() => { setFile(key ? memory.get(key) ?? null : null); load(); }, [key, load]);

  return { file, players: file?.players ?? [], statsSource: file?.statsSource ?? 'league', loading, missing, reload: load };
}

/** Group a roster the way its sport is read, dropping units nobody is in. */
export function byUnit(players: SportPlayer[], sport: SportId): [string, SportPlayer[]][] {
  const order = UNIT_ORDER[sport];
  const groups = new Map<string, SportPlayer[]>();
  for (const p of players) (groups.get(p.unit) ?? groups.set(p.unit, []).get(p.unit)!).push(p);
  for (const list of groups.values()) {
    list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name));
  }
  return [...groups.entries()].sort((a, b) => {
    const ai = order.indexOf(a[0]);
    const bi = order.indexOf(b[0]);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}
