/**
 * Live scores, straight from the scoreboard.
 *
 * The published feed is rebuilt by a scheduled job, which is fine for lines,
 * rosters and finals but is minutes behind a game in progress — and minutes is
 * an eternity when you are watching a number you have money on. So the app also
 * polls ESPN's public scoreboard itself, for every league that has games
 * loaded: every 20 seconds while something is live, every two minutes
 * otherwise, and not at all while the app is in the background or the tab is
 * hidden.
 *
 * There is a second, slower loop over the published dataset itself, because a
 * score poll never moves a line. Left open on a desk all evening the app used
 * to fetch the feed once at startup and then show that same number until it was
 * restarted. It is re-fetched every fifteen minutes and whenever the app comes
 * back to the foreground — fifteen rather than two because the job behind it
 * only rebuilds three times a day, so anything faster is bandwidth spent to
 * re-download a file that has not changed. Between those, the scoreboard poll
 * is what actually moves on screen.
 *
 * It is strictly an overlay. Anything it cannot match falls back to the feed,
 * and if the endpoint is unreachable — a network without it, a browser blocking
 * it — the poller disables itself after a few failures and the app carries on
 * exactly as it did before. Nothing here is load-bearing.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useLeague } from '@/league/LeagueContext';
import { usePrefs } from '@/context/PrefsContext';
import { LEAGUE_BY_KEY } from '@/sports/types';
import type { GameStatus } from '@/data/liveTypes';
import type { LeagueGame, LeagueId } from '@/league/types';

/**
 * The scoreboard path per league. The generic leagues carry theirs in the
 * registry, so this only has to name the two football feeds that predate it.
 */
const ENDPOINTS: Partial<Record<LeagueId, string>> = {
  nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  cfb: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=200',
};

const endpointFor = (id: LeagueId): string | null => {
  if (ENDPOINTS[id]) return ENDPOINTS[id] as string;
  const meta = LEAGUE_BY_KEY[id];
  return meta?.espn ? `https://site.api.espn.com/apis/site/v2/sports/${meta.espn}/scoreboard?limit=200` : null;
};

/** ESPN's abbreviation is not always ours. */
const ALIAS: Record<string, string> = { WSH: 'WAS', LA: 'LAR', JAX: 'JAX', LV: 'LV', NWE: 'NE', GNB: 'GB', KAN: 'KC', SFO: 'SF', TAM: 'TB', NOR: 'NO' };

const LIVE_MS = 20_000;
/** Nothing in progress. Still a floor on how stale the board is allowed to get. */
const IDLE_MS = 120_000;
/** How often the published dataset itself is re-fetched. */
const DATA_MS = 900_000;
const TIMEOUT_MS = 8_000;
const MAX_FAILURES = 3;

export interface LiveScore {
  gameId: string;
  awayScore: number | null;
  homeScore: number | null;
  status: GameStatus;
  statusDetail: string | null;
  /** Seconds since this score was read. */
  updatedAt: number;
}

interface State {
  /** Keyed by our own game id. */
  scores: Map<string, LiveScore>;
  /** True while the poller is running and getting answers. */
  connected: boolean;
  lastPoll: number | null;
  /** How many games the scoreboard says are in progress right now. */
  liveCount: number;
  refresh: () => void;
}

const Ctx = createContext<State | null>(null);

const statusOf = (state: string, completed: boolean): GameStatus =>
  completed || state === 'post' ? 'final' : state === 'in' ? 'in_progress' : 'scheduled';

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

/** ESPN event → our game id, matched on the day and the two teams. */
function matchGame(
  games: LeagueGame[],
  byAbbr: Map<string, string>,
  awayAbbr: string,
  homeAbbr: string,
  date: string,
): string | null {
  const away = byAbbr.get(awayAbbr) ?? byAbbr.get(ALIAS[awayAbbr] ?? '');
  const home = byAbbr.get(homeAbbr) ?? byAbbr.get(ALIAS[homeAbbr] ?? '');
  if (!away || !home) return null;
  const day = date.slice(0, 10);
  const hit = games.find((g) => {
    if (g.awayId !== away || g.homeId !== home) return false;
    const kick = g.kickoff.slice(0, 10);
    // Kickoffs cross midnight in UTC, so accept the day either side.
    return Math.abs(Date.parse(`${kick}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) <= 86_400_000;
  });
  return hit?.id ?? null;
}

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const { all } = useLeague();
  const prefs = usePrefs();
  const [scores, setScores] = useState<Map<string, LiveScore>>(new Map());
  const [connected, setConnected] = useState(false);
  const [lastPoll, setLastPoll] = useState<number | null>(null);
  const failures = useRef(0);
  const disabled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(true);
  /** When the published feed was last re-read, so returning does not spam it. */
  const lastData = useRef(Date.now());

  // Only leagues with games loaded are worth polling.
  const views = useMemo(() => all.filter((v) => v.games.length > 0), [all]);

  const poll = useCallback(async () => {
    if (disabled.current || !prefs.livePolling) return;
    const next = new Map<string, LiveScore>();
    let ok = false;
    for (const view of views) {
      if (!view.games.length) continue;
      const byAbbr = new Map<string, string>(view.teams.map((t) => [t.abbr.toUpperCase(), t.id]));
      try {
        const endpoint = endpointFor(view.id);
        if (!endpoint) continue;
        const json = (await fetchJson(endpoint)) as {
          events?: { date: string; status?: { type?: { state?: string; completed?: boolean; shortDetail?: string } };
            competitions?: { competitors?: { homeAway?: string; score?: string; team?: { abbreviation?: string } }[] }[] }[];
        };
        ok = true;
        for (const ev of json.events ?? []) {
          const comp = ev.competitions?.[0];
          const away = comp?.competitors?.find((c) => c.homeAway === 'away');
          const home = comp?.competitors?.find((c) => c.homeAway === 'home');
          const aAbbr = (away?.team?.abbreviation ?? '').toUpperCase();
          const hAbbr = (home?.team?.abbreviation ?? '').toUpperCase();
          if (!aAbbr || !hAbbr) continue;
          const id = matchGame(view.games, byAbbr, aAbbr, hAbbr, ev.date ?? '');
          if (!id) continue;
          const state = ev.status?.type?.state ?? 'pre';
          const status = statusOf(state, !!ev.status?.type?.completed);
          next.set(id, {
            gameId: id,
            awayScore: away?.score != null ? Number(away.score) : null,
            homeScore: home?.score != null ? Number(home.score) : null,
            status,
            statusDetail: ev.status?.type?.shortDetail ?? null,
            updatedAt: Date.now(),
          });
        }
      } catch {
        failures.current += 1;
        if (failures.current >= MAX_FAILURES) disabled.current = true;
      }
    }
    if (ok) { failures.current = 0; setScores(next); setConnected(true); }
    else if (disabled.current) setConnected(false);
    setLastPoll(Date.now());
  }, [views, prefs.livePolling]);

  /* Cadence follows the games: fast while anything is in progress, slow when
     the board is quiet, stopped when nobody is looking. */
  useEffect(() => {
    const anyLive = [...scores.values()].some((s) => s.status === 'in_progress')
      || views.some((v) => v.games.some((g) => g.status === 'in_progress'));

    const tick = async () => {
      if (!active.current) return;
      await poll();
      timer.current = setTimeout(tick, anyLive ? LIVE_MS : IDLE_MS);
    };
    timer.current = setTimeout(tick, 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll, scores.size]);

  /** Re-read the published feed for every league that has one loaded. */
  const refreshData = useCallback(() => {
    for (const v of views) if (!v.refreshing) v.refresh().catch(() => {});
    lastData.current = Date.now();
  }, [views]);

  /* The feed behind the numbers, on its own slower beat. A score poll updates
     the scoreboard; only this moves a line, a total or a projection. */
  useEffect(() => {
    if (!prefs.livePolling) return;
    const t = setInterval(() => { if (active.current) refreshData(); }, DATA_MS);
    return () => clearInterval(t);
  }, [refreshData, prefs.livePolling]);

  /* Pause in the background — a phone in a pocket should not be polling. */
  useEffect(() => {
    const wake = () => {
      poll();
      // Coming back to a tab that has been open for hours: re-read the feed too,
      // not just the scoreboard, or the lines stay as stale as when you left.
      if (Date.now() - lastData.current >= DATA_MS) refreshData();
    };
    const onState = (s: string) => {
      active.current = s === 'active';
      if (active.current) wake();
    };
    const sub = AppState.addEventListener('change', onState);
    let onVis: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      onVis = () => { active.current = document.visibilityState === 'visible'; if (active.current) wake(); };
      document.addEventListener('visibilitychange', onVis);
    }
    return () => {
      sub.remove();
      if (onVis && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
    };
  }, [poll, refreshData]);

  const value: State = useMemo(() => ({
    scores,
    connected,
    lastPoll,
    liveCount: [...scores.values()].filter((s) => s.status === 'in_progress').length,
    refresh: () => { disabled.current = false; failures.current = 0; poll(); refreshData(); },
  }), [scores, connected, lastPoll, poll, refreshData]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLive(): State {
  const v = useContext(Ctx);
  return v ?? { scores: new Map(), connected: false, lastPoll: null, liveCount: 0, refresh: () => {} };
}

/** Games with the live overlay applied. Safe to call with anything. */
export function useLiveGames<T extends LeagueGame>(games: T[]): T[] {
  const { scores } = useLive();
  return useMemo(() => {
    if (!scores.size) return games;
    return games.map((g) => {
      const s = scores.get(g.id);
      if (!s) return g;
      // The feed wins once it has a final: it carries the graded result.
      if (g.status === 'final') return g;
      return { ...g, awayScore: s.awayScore ?? g.awayScore, homeScore: s.homeScore ?? g.homeScore, status: s.status, statusDetail: s.statusDetail ?? g.statusDetail };
    });
  }, [games, scores]);
}
