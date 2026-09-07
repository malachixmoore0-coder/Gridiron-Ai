/**
 * One app, nine leagues.
 *
 * Two of them — the NFL and college football — run bespoke engines with depth
 * charts, snap counts and play-by-play behind them. The other seven share a
 * generic engine and a generic feed. This is the seam where that stops
 * mattering: every league, however it is produced, presents the same LeagueView,
 * and every shared surface reads that.
 *
 * The football feeds are mounted eagerly because the NFL dataset ships in the
 * bundle; the rest load the first time someone looks at them.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTeams as useNflTeams } from '@/context/TeamsContext';
import { useTeams as useCfbTeams } from '@/cfb/context/TeamsContext';
import { useSports } from '@/sports/SportsContext';
import { LEAGUES, LEAGUE_BY_KEY, type LeagueKey } from '@/sports/types';
import type { LeagueGame, LeagueId, LeagueTeamRef, LeagueView, WeekRef } from '@/league/types';

const KEY = 'gridiron-ai.league.v1';

interface State {
  league: LeagueId;
  setLeague: (l: LeagueId) => void;
  active: LeagueView;
  /** Every league, in picker order. */
  all: LeagueView[];
  viewFor: (league: LeagueId) => LeagueView;
}

const Ctx = createContext<State | null>(null);

/** An empty view, so a league that has not loaded still renders a screen. */
function placeholder(key: LeagueKey, loading: boolean, error: string | null, refresh: () => Promise<void>): LeagueView {
  const meta = LEAGUE_BY_KEY[key];
  return {
    id: key, sport: meta.sport, bespoke: false, field: meta.kind === 'field', short: meta.short, label: meta.name,
    season: 0, week: 1, phase: 'offseason', generatedAt: '',
    refreshing: loading, refresh, loading, error,
    games: [], weekGames: [], weeks: [], gamesForWeek: () => [],
    records: [], findRecord: () => undefined,
    teams: [], hasTeam: () => false, teamRef: () => null,
    abbrOf: (id) => id.toUpperCase(), nameOf: (id) => id,
  };
}

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const nflRaw = useNflTeams();
  const cfbRaw = useCfbTeams();
  const sports = useSports();
  const [league, setLeagueState] = useState<LeagueId>('nfl');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => { if (v && LEAGUE_BY_KEY[v as LeagueKey]) setLeagueState(v as LeagueId); })
      .catch(() => {});
  }, []);

  // The active league is the one worth having on hand.
  useEffect(() => {
    if (!LEAGUE_BY_KEY[league as LeagueKey]?.bespoke) sports.ensure(league as LeagueKey);
  }, [league, sports]);

  const setLeague = useCallback((l: LeagueId) => {
    setLeagueState(l);
    AsyncStorage.setItem(KEY, l).catch(() => {});
    const meta = LEAGUE_BY_KEY[l as LeagueKey];
    if (meta && !meta.bespoke) sports.ensure(l as LeagueKey);
    if (l === 'cfb' && cfbRaw.source === 'sample' && !cfbRaw.refreshing) cfbRaw.refresh();
  }, [cfbRaw, sports]);

  const nfl: LeagueView = useMemo(() => {
    const teams: LeagueTeamRef[] = nflRaw.teams.map((t) => ({
      id: t.id, abbr: t.abbr, name: `${t.city} ${t.name}`, group: `${t.conference} ${t.division}`,
      colors: t.colors, logoUrl: t.logoUrl, record: t.record,
    }));
    const byId = new Map(teams.map((t) => [t.id, t]));
    return {
      id: 'nfl', sport: 'football', bespoke: true, short: 'NFL', label: 'NFL',
      season: nflRaw.season, week: nflRaw.week, phase: nflRaw.phase, generatedAt: nflRaw.generatedAt,
      refreshing: nflRaw.refreshing, refresh: nflRaw.refresh,
      games: nflRaw.games, weekGames: nflRaw.weekGames, weeks: nflRaw.weeks, gamesForWeek: nflRaw.gamesForWeek,
      records: nflRaw.records, findRecord: nflRaw.findRecord,
      teams, hasTeam: nflRaw.hasTeam, teamRef: (id) => byId.get(id) ?? null,
      abbrOf: (id) => byId.get(id)?.abbr ?? id.toUpperCase(),
      nameOf: (id) => byId.get(id)?.name ?? id,
    };
  }, [nflRaw]);

  const cfb: LeagueView = useMemo(() => {
    const teams: LeagueTeamRef[] = cfbRaw.teams.map((t) => ({
      id: t.id, abbr: t.abbr, name: `${t.school} ${t.mascot}`, group: t.conference,
      colors: t.colors, logoUrl: t.logoUrl, record: t.record, rank: t.rank,
    }));
    const byId = new Map(teams.map((t) => [t.id, t]));
    return {
      id: 'cfb', sport: 'football', bespoke: true, short: 'NCAAF', label: 'College football',
      season: cfbRaw.season, week: cfbRaw.week, phase: cfbRaw.phase, generatedAt: cfbRaw.generatedAt,
      refreshing: cfbRaw.refreshing, refresh: cfbRaw.refresh,
      games: cfbRaw.games, weekGames: cfbRaw.weekGames, weeks: cfbRaw.weeks, gamesForWeek: cfbRaw.gamesForWeek,
      records: cfbRaw.records, findRecord: cfbRaw.findRecord,
      teams, hasTeam: cfbRaw.hasTeam, teamRef: (id) => byId.get(id) ?? null,
      abbrOf: (id) => byId.get(id)?.abbr ?? id.toUpperCase(),
      nameOf: (id) => byId.get(id)?.name ?? id,
    };
  }, [cfbRaw]);

  /** Turn a generic feed into the same view the football leagues present. */
  const genericView = useCallback((key: LeagueKey): LeagueView => {
    const meta = LEAGUE_BY_KEY[key];
    const feed = sports.feeds[key];
    const refresh = () => sports.refresh(key);
    // A field league publishes no teams or board at all — golf lives in its own
    // feed — so it always presents the empty view and its own screens render.
    if (meta.kind === 'field') return placeholder(key, false, null, async () => {});
    // Teams without a board is a real state, not a broken one: a league is out
    // of season for months at a time, and the Teams tab should still work.
    if (!feed?.teams) return placeholder(key, !!feed?.loading, feed?.error ?? null, refresh);

    const teams: LeagueTeamRef[] = feed.teams.teams.map((t) => ({
      id: t.id, abbr: t.abbr, name: t.name, group: t.group,
      colors: t.colors, logoUrl: t.logoUrl ?? undefined, record: t.record ?? undefined,
      rank: t.rank ?? undefined,
    }));
    const byId = new Map(teams.map((t) => [t.id, t]));
    const games = (feed.schedule?.games ?? []) as unknown as LeagueGame[];
    const weeks = (feed.schedule?.weeks ?? []) as WeekRef[];
    const week = feed.schedule?.week ?? feed.teams.week;
    const records = (feed.predictions?.records ?? []) as never[];
    const recById = new Map(records.map((r) => [(r as { id: string }).id, r]));

    return {
      id: key, sport: meta.sport, bespoke: false, short: meta.short, label: meta.name,
      season: feed.teams.season, week, phase: feed.schedule?.phase ?? feed.teams.phase, generatedAt: feed.teams.generatedAt,
      refreshing: !!feed.loading, refresh, loading: !!feed.loading, error: feed.error,
      games,
      weekGames: games.filter((g) => g.week === week),
      weeks,
      gamesForWeek: (w) => games.filter((g) => g.week === w),
      records,
      findRecord: (id) => recById.get(id),
      teams,
      hasTeam: (id) => byId.has(id),
      teamRef: (id) => byId.get(id) ?? null,
      abbrOf: (id) => byId.get(id)?.abbr ?? id.toUpperCase(),
      nameOf: (id) => byId.get(id)?.name ?? id,
    };
  }, [sports]);

  const viewFor = useCallback((l: LeagueId): LeagueView => {
    if (l === 'nfl') return nfl;
    if (l === 'cfb') return cfb;
    return genericView(l as LeagueKey);
  }, [nfl, cfb, genericView]);

  const value = useMemo<State>(() => ({
    league,
    setLeague,
    active: viewFor(league),
    all: LEAGUES.map((l) => viewFor(l.key)),
    viewFor,
  }), [league, setLeague, viewFor]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLeague(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLeague outside LeagueProvider');
  return v;
}

export const useActiveLeague = (): LeagueView => useLeague().active;
