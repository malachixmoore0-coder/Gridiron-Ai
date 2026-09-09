/**
 * The PGA feed: one document, fetched on first view and cached on the device.
 *
 * Golf is small enough that splitting it up would cost more than it saved —
 * a season's tournaments and every ranked player fit in a few hundred
 * kilobytes, and the leaderboard screen wants all of it at once anyway.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { golfUrl, type GolfFile } from '@/sports/golf';

const CACHE = 'simtoad.golf.v1';
const STALE_MS = 8 * 60_000;

interface State {
  file: GolfFile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  ensure: () => void;
}

const Ctx = createContext<State | null>(null);

export function GolfProvider({ children }: { children: React.ReactNode }) {
  const [file, setFile] = useState<GolfFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [wanted, setWanted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await AsyncStorage.getItem(CACHE).catch(() => null);
      if (raw && !file) {
        const saved = JSON.parse(raw) as { at: number; file: GolfFile };
        setFile(saved.file);
        setFetchedAt(saved.at);
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      const res = await fetch(`${golfUrl()}?t=${Math.floor(Date.now() / 300_000)}`, {
        signal: ctrl.signal, headers: { accept: 'application/json' },
      }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fresh = (await res.json()) as GolfFile;
      const at = Date.now();
      setFile(fresh);
      setFetchedAt(at);
      AsyncStorage.setItem(CACHE, JSON.stringify({ at, file: fresh })).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!wanted) return;
    if (file && fetchedAt && Date.now() - fetchedAt < STALE_MS) return;
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  const value = useMemo<State>(() => ({
    file, loading, error, refresh: load, ensure: () => setWanted(true),
  }), [file, loading, error, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGolf(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGolf outside GolfProvider');
  return v;
}
