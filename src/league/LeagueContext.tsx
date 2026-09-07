/**
 * One app, two leagues.
 *
 * Both feeds are mounted at once — the NFL dataset ships in the bundle and the
 * college dataset streams in behind it — so switching leagues is instant and
 * anything that spans both (the track record on the paywall, a pick card with
 * a Saturday and a Sunday leg on it) can read them together.
 *
 * Screens never touch a league's own context. They ask for the active view and
 * get the same shape either way.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTeams as useNflTeams } from '@/context/TeamsContext';
import { useTeams as useCfbTeams } from '@/cfb/context/TeamsContext';
import type { LeagueId, LeagueView, LeagueTeamRef } from '@/league/types';

const KEY = 'gridiron-ai.league.v1';

interface State {
  league: LeagueId;
  setLeague: (l: LeagueId) => void;
  active: LeagueView;
  nfl: LeagueView;
  cfb: LeagueView;
  /** Both leagues in switcher order. */
  all: LeagueView[];
  /** Look a game up in whichever league owns it — used by the pick card. */
  viewFor: (league: LeagueId) => LeagueView;
}

const Ctx = createContext<State | null>(null);

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const nflRaw = useNflTeams();
  const cfbRaw = useCfbTeams();
  const [league, setLeagueState] = useState<LeagueId>('nfl');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => { if (v === 'nfl' || v === 'cfb') setLeagueState(v); })
      .catch(() => {});
  }, []);

  const setLeague = useCallback((l: LeagueId) => {
    setLeagueState(l);
    AsyncStorage.setItem(KEY, l).catch(() => {});
  }, []);

  const nfl: LeagueView = useMemo(() => {
    const teams: LeagueTeamRef[] = nflRaw.teams.map((t) => ({
      id: t.id, abbr: t.abbr, name: `${t.city} ${t.name}`, group: `${t.conference} ${t.division}`,
      colors: t.colors, logoUrl: t.logoUrl, record: t.record,
    }));
    const byId = new Map(teams.map((t) => [t.id, t]));
    return {
      id: 'nfl', short: 'NFL', label: 'Pro football',
      season: nflRaw.season, week: nflRaw.week, phase: nflRaw.phase, generatedAt: nflRaw.generatedAt,
      refreshing: nflRaw.refreshing, refresh: nflRaw.refresh,
      games: nflRaw.games, weekGames: nflRaw.weekGames, weeks: nflRaw.weeks, gamesForWeek: nflRaw.gamesForWeek,
      records: nflRaw.records, findRecord: nflRaw.findRecord,
      teams,
      hasTeam: nflRaw.hasTeam,
      teamRef: (id) => byId.get(id) ?? null,
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
      id: 'cfb', short: 'NCAA', label: 'College football',
      season: cfbRaw.season, week: cfbRaw.week, phase: cfbRaw.phase, generatedAt: cfbRaw.generatedAt,
      refreshing: cfbRaw.refreshing, refresh: cfbRaw.refresh,
      games: cfbRaw.games, weekGames: cfbRaw.weekGames, weeks: cfbRaw.weeks, gamesForWeek: cfbRaw.gamesForWeek,
      records: cfbRaw.records, findRecord: cfbRaw.findRecord,
      teams,
      hasTeam: cfbRaw.hasTeam,
      teamRef: (id) => byId.get(id) ?? null,
      abbrOf: (id) => byId.get(id)?.abbr ?? id.toUpperCase(),
      nameOf: (id) => byId.get(id)?.name ?? id,
    };
  }, [cfbRaw]);

  const value = useMemo<State>(() => ({
    league,
    setLeague,
    active: league === 'cfb' ? cfb : nfl,
    nfl,
    cfb,
    all: [nfl, cfb],
    viewFor: (l) => (l === 'cfb' ? cfb : nfl),
  }), [league, setLeague, nfl, cfb]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLeague(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLeague outside LeagueProvider');
  return v;
}

/** The league on screen right now. */
export const useActiveLeague = (): LeagueView => useLeague().active;
