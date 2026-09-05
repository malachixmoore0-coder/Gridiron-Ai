import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { InjuryStatus, NodeWeights, Weather } from '@/engine/types';
import { DEFAULT_WEIGHTS, HFA_DEFAULT } from '@/engine/weights';

const KEY = 'gridiron-ai.settings.v1';

export type SimCount = 2000 | 5000 | 10000 | 25000;

export interface RecentMatchup {
  awayId: string;
  homeId: string;
  ts: number;
}

export interface MatchupContext {
  neutralSite: boolean;
  primetime: boolean;
  weather: Weather | 'auto';
}

interface Persisted {
  weights: NodeWeights;
  simulations: SimCount;
  homeFieldBase: number;
  injuredOut: string[];
  questionable: string[];
  recent: RecentMatchup[];
  onboarded: boolean;
}

const DEFAULTS: Persisted = {
  weights: { ...DEFAULT_WEIGHTS },
  simulations: 10000,
  homeFieldBase: HFA_DEFAULT,
  injuredOut: [],
  questionable: [],
  recent: [],
  onboarded: false,
};

interface SettingsState extends Persisted {
  loaded: boolean;
  setWeight: (key: keyof NodeWeights, value: number) => void;
  resetWeights: () => void;
  setSimulations: (n: SimCount) => void;
  setHomeFieldBase: (v: number) => void;
  statusOf: (playerId: string) => InjuryStatus;
  setStatus: (playerId: string, status: InjuryStatus) => void;
  cycleStatus: (playerId: string) => void;
  clearInjuries: () => void;
  pushRecent: (m: Omit<RecentMatchup, 'ts'>) => void;
  setOnboarded: (v: boolean) => void;
}

const Ctx = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Persisted>;
          setState({ ...DEFAULTS, ...parsed, weights: { ...DEFAULT_WEIGHTS, ...(parsed.weights ?? {}) } });
        }
      } catch {
        // Fall back to defaults on any storage error.
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state, loaded]);

  const patch = useCallback((p: Partial<Persisted> | ((s: Persisted) => Partial<Persisted>)) => {
    setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
  }, []);

  const statusOf = useCallback(
    (id: string): InjuryStatus => (state.injuredOut.includes(id) ? 'out' : state.questionable.includes(id) ? 'questionable' : 'healthy'),
    [state.injuredOut, state.questionable],
  );

  const setStatus = useCallback((id: string, status: InjuryStatus) => {
    patch((s) => ({
      injuredOut: status === 'out' ? [...new Set([...s.injuredOut, id])] : s.injuredOut.filter((x) => x !== id),
      questionable: status === 'questionable' ? [...new Set([...s.questionable, id])] : s.questionable.filter((x) => x !== id),
    }));
  }, [patch]);

  const value = useMemo<SettingsState>(() => ({
    ...state,
    loaded,
    setWeight: (key, v) => patch((s) => ({ weights: { ...s.weights, [key]: Math.max(0, Math.min(100, v)) } })),
    resetWeights: () => patch({ weights: { ...DEFAULT_WEIGHTS } }),
    setSimulations: (n) => patch({ simulations: n }),
    setHomeFieldBase: (v) => patch({ homeFieldBase: Math.max(2.5, Math.min(4.5, Math.round(v * 10) / 10)) }),
    statusOf,
    setStatus,
    cycleStatus: (id) => {
      const cur = statusOf(id);
      setStatus(id, cur === 'healthy' ? 'questionable' : cur === 'questionable' ? 'out' : 'healthy');
    },
    clearInjuries: () => patch({ injuredOut: [], questionable: [] }),
    pushRecent: (m) => patch((s) => ({
      recent: [{ ...m, ts: Date.now() }, ...s.recent.filter((r) => !(r.awayId === m.awayId && r.homeId === m.homeId))].slice(0, 8),
    })),
    setOnboarded: (v) => patch({ onboarded: v }),
  }), [state, loaded, patch, statusOf, setStatus]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings must be used inside SettingsProvider');
  return v;
}
