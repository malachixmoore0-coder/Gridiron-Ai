/**
 * The small switches: haptics, live polling, and whether money is shown at all.
 *
 * They live apart from Settings (which is the engine's node weights) because
 * these are about how the app behaves, not what the model believes.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMigrated, key } from '@/utils/storageKey';
import { setHapticsEnabled } from '@/utils/haptics';

const KEY = 'prefs.v1';

interface Persisted {
  haptics: boolean;
  livePolling: boolean;
  hideMoney: boolean;
  /** Splash runs once a session; this turns it off entirely. */
  splash: boolean;
}

const DEFAULTS: Persisted = { haptics: true, livePolling: true, hideMoney: false, splash: true };

interface State extends Persisted {
  loaded: boolean;
  setHaptics: (v: boolean) => void;
  setLivePolling: (v: boolean) => void;
  setHideMoney: (v: boolean) => void;
  setSplash: (v: boolean) => void;
}

const Ctx = createContext<State | null>(null);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<Persisted>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getMigrated(KEY)
      .then((raw) => {
        const next = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) } : DEFAULTS;
        setS(next);
        setHapticsEnabled(next.haptics);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = useCallback((patch: Partial<Persisted>) => {
    setS((cur) => {
      const next = { ...cur, ...patch };
      AsyncStorage.setItem(key(KEY), JSON.stringify(next)).catch(() => {});
      if (patch.haptics !== undefined) setHapticsEnabled(patch.haptics);
      return next;
    });
  }, []);

  const value = useMemo<State>(() => ({
    ...s,
    loaded,
    setHaptics: (v) => save({ haptics: v }),
    setLivePolling: (v) => save({ livePolling: v }),
    setHideMoney: (v) => save({ hideMoney: v }),
    setSplash: (v) => save({ splash: v }),
  }), [s, loaded, save]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrefs outside PrefsProvider');
  return v;
}
