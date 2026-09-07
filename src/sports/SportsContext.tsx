/**
 * Feeds for every generic league, fetched only when someone actually looks.
 *
 * Nine leagues at once would be several megabytes on open for a user who cares
 * about one of them, so a league loads on first view and is then cached on the
 * device. Switching back is instant; switching to something new costs one small
 * fetch and says so while it happens.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GENERIC_LEAGUES, LEAGUE_BY_KEY, type LeagueKey } from '@/sports/types';
import { feedUrl, type SportPredictionsFile, type SportScheduleFile, type SportTeamsFile } from '@/sports/feed';

const CACHE = 'gridiron-ai.sports.v1.';
const TIMEOUT_MS = 15_000;
const STALE_MS = 8 * 60_000;

export interface SportFeed {
  key: LeagueKey;
  teams: SportTeamsFile | null;
  schedule: SportScheduleFile | null;
  predictions: SportPredictionsFile | null;
  loading: boolean;
  error: string | null;
  /** When this copy was fetched, not when it was generated. */
  fetchedAt: number | null;
  source: 'network' | 'cache' | 'empty';
}

const EMPTY = (key: LeagueKey): SportFeed =>
  ({ key, teams: null, schedule: null, predictions: null, loading: false, error: null, fetchedAt: null, source: 'empty' });

interface State {
  feeds: Record<string, SportFeed>;
  /** Ask for a league. Safe to call on every render. */
  ensure: (key: LeagueKey) => void;
  refresh: (key: LeagueKey) => Promise<void>;
}

const Ctx = createContext<State | null>(null);

async function getJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}?t=${Math.floor(Date.now() / 300_000)}`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally { clearTimeout(t); }
}

export function SportsProvider({ children }: { children: React.ReactNode }) {
  const [feeds, setFeeds] = useState<Record<string, SportFeed>>(
    () => Object.fromEntries(GENERIC_LEAGUES.map((l) => [l.key, EMPTY(l.key)])),
  );
  const inflight = useRef(new Set<string>());

  const patch = useCallback((key: LeagueKey, next: Partial<SportFeed>) => {
    setFeeds((f) => ({ ...f, [key]: { ...(f[key] ?? EMPTY(key)), ...next } }));
  }, []);

  const load = useCallback(async (key: LeagueKey, force = false) => {
    if (inflight.current.has(key)) return;
    const meta = LEAGUE_BY_KEY[key];
    if (!meta || meta.bespoke) return;
    inflight.current.add(key);
    patch(key, { loading: true, error: null });

    // Cache first so a returning user sees something immediately.
    if (!force) {
      try {
        const raw = await AsyncStorage.getItem(CACHE + key);
        if (raw) {
          const cached = JSON.parse(raw) as { at: number; teams: SportTeamsFile; schedule: SportScheduleFile; predictions: SportPredictionsFile };
          patch(key, { ...cached, fetchedAt: cached.at, source: 'cache', loading: true });
          if (Date.now() - cached.at < STALE_MS) { patch(key, { loading: false }); inflight.current.delete(key); return; }
        }
      } catch { /* no cache */ }
    }

    try {
      const [teams, schedule, predictions] = await Promise.all([
        getJson<SportTeamsFile>(feedUrl(meta.slug, 'teams.json')),
        // A league between seasons publishes teams and no board; that is a
        // state to render, not an error to swallow the whole feed for.
        getJson<SportScheduleFile>(feedUrl(meta.slug, 'schedule.json')).catch(() => null),
        getJson<SportPredictionsFile>(feedUrl(meta.slug, 'predictions.json')).catch(() => null),
      ]);
      const at = Date.now();
      patch(key, { teams, schedule, predictions, fetchedAt: at, source: 'network', loading: false, error: null });
      AsyncStorage.setItem(CACHE + key, JSON.stringify({ at, teams, schedule, predictions })).catch(() => {});
    } catch (e) {
      patch(key, { loading: false, error: (e as Error).message });
    } finally {
      inflight.current.delete(key);
    }
  }, [patch]);

  const value = useMemo<State>(() => ({
    feeds,
    ensure: (key) => {
      const f = feeds[key];
      if (!f || (f.source === 'empty' && !f.loading && !f.error)) load(key);
    },
    refresh: (key) => load(key, true),
  }), [feeds, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSports(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSports outside SportsProvider');
  return v;
}

/** Fetch this league now, and keep it fresh while the screen is open. */
export function useSportFeed(key: LeagueKey): SportFeed {
  const { feeds, ensure } = useSports();
  useEffect(() => { ensure(key); }, [key, ensure]);
  return feeds[key] ?? EMPTY(key);
}
