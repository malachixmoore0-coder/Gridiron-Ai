/**
 * Session, profile and feed state for the social layer.
 *
 * One rule runs through all of it: a pick that travels carries its numbers. The
 * model's probability and edge ride along inside every shared post, so a tail is
 * a real position rather than a screenshot, and the tailer's card grades on the
 * same finals as everyone else's.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { backend } from './backend';
import type { AuthProvider, FeedScope, Post, PostPick, Profile, Session } from './types';

interface State {
  ready: boolean;
  live: boolean;
  session: Session | null;
  me: Profile | null;
  signedIn: boolean;
  busy: boolean;
  error: string | null;
  feed: Post[];
  scope: FeedScope;
  setScope: (s: FeedScope) => void;
  refreshFeed: () => Promise<void>;
  signIn: (p: AuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
  saveProfile: (patch: Partial<Profile>) => Promise<void>;
  post: (input: { text: string; gifUrl?: string | null; pick?: PostPick | null; replyTo?: string | null }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  like: (id: string, on: boolean) => Promise<void>;
  tail: (id: string, on: boolean) => Promise<void>;
  follow: (userId: string, on: boolean) => Promise<void>;
  profileOf: (userId: string) => Promise<Profile | null>;
  postsOf: (userId: string) => Promise<Post[]>;
  following: (userId: string) => Promise<boolean>;
  search: (q: string) => Promise<Profile[]>;
}

const Ctx = createContext<State | null>(null);

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const api = useMemo(backend, []);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [feed, setFeed] = useState<Post[]>([]);
  const [scope, setScope] = useState<FeedScope>('everyone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFeed = useCallback(async (s: FeedScope) => {
    try { setFeed(await api.feed(s)); } catch (e) { setError((e as Error).message); }
  }, [api]);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.restore();
        setSession(s);
        if (s) setMe(await api.getProfile(s.userId));
      } catch { /* signed out */ }
      await loadFeed('everyone');
      setReady(true);
    })();
  }, [api, loadFeed]);

  useEffect(() => { if (ready) loadFeed(scope); }, [scope, ready, loadFeed]);

  const value: State = useMemo(() => ({
    ready,
    live: api.live,
    session,
    me,
    signedIn: !!session,
    busy,
    error,
    feed,
    scope,
    setScope,
    refreshFeed: () => loadFeed(scope),
    signIn: async (p) => {
      setBusy(true); setError(null);
      try {
        const s = await api.signIn(p);
        if (s) { setSession(s); setMe(await api.getProfile(s.userId)); await loadFeed(scope); }
      } catch (e) { setError((e as Error).message); }
      setBusy(false);
    },
    signOut: async () => { await api.signOut(); setSession(null); setMe(null); await loadFeed('everyone'); },
    saveProfile: async (patch) => {
      if (!me) return;
      setBusy(true);
      try { setMe(await api.upsertProfile({ ...me, ...patch })); }
      catch (e) { setError((e as Error).message); }
      setBusy(false);
    },
    post: async (input) => {
      setBusy(true); setError(null);
      try { await api.createPost(input); await loadFeed(scope); }
      catch (e) { setError((e as Error).message); }
      setBusy(false);
    },
    remove: async (id) => { await api.deletePost(id); await loadFeed(scope); },
    like: async (id, on) => {
      setFeed((f) => f.map((p) => (p.id === id ? { ...p, likedByMe: on, likes: Math.max(0, p.likes + (on ? 1 : -1)) } : p)));
      try { await api.like(id, on); } catch { await loadFeed(scope); }
    },
    tail: async (id, on) => {
      setFeed((f) => f.map((p) => (p.id === id ? { ...p, tailedByMe: on, tails: Math.max(0, p.tails + (on ? 1 : -1)) } : p)));
      try { await api.tail(id, on); } catch { await loadFeed(scope); }
    },
    follow: async (userId, on) => { await api.follow(userId, on); if (me) setMe(await api.getProfile(me.id)); },
    profileOf: (userId) => api.getProfile(userId),
    postsOf: (userId) => api.postsBy(userId),
    following: (userId) => api.isFollowing(userId),
    search: (q) => api.searchProfiles(q),
  }), [ready, api, session, me, busy, error, feed, scope, loadFeed]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSocial(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSocial outside SocialProvider');
  return v;
}
