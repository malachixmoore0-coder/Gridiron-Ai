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
import { authCallback } from './callback';
import type { AuthProvider, FeedScope, Post, PostPick, Profile, ReportInput, Session } from './types';

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
  /** Email a sign-in link. Returns what to tell the user, verbatim. */
  signInWithEmail: (email: string) => Promise<{ sent: boolean; message: string }>;
  /** Trade the code from that email for a session. True when it worked. */
  verifyEmailCode: (email: string, code: string) => Promise<boolean>;
  /** Have another go at the profile row a signed-in account is missing. */
  retryProfile: () => Promise<void>;
  /** True when this backend can accept a typed code as well as a link. */
  canVerifyCode: boolean;
  signOut: () => Promise<void>;
  /** Erase the account. Clears local state here; the backend clears its own. */
  deleteAccount: () => Promise<void>;
  saveProfile: (patch: Partial<Profile>) => Promise<void>;
  /** False when the post was refused — moderation, rate limit, or a backend error. */
  post: (input: { text: string; gifUrl?: string | null; pick?: PostPick | null; replyTo?: string | null }) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  like: (id: string, on: boolean) => Promise<void>;
  tail: (id: string, on: boolean) => Promise<void>;
  follow: (userId: string, on: boolean) => Promise<void>;
  profileOf: (userId: string) => Promise<Profile | null>;
  /** Resolve an @handle, which is how a /@handle link finds its account. */
  profileByHandle: (handle: string) => Promise<Profile | null>;
  followersOf: (userId: string) => Promise<Profile[]>;
  followingOf: (userId: string) => Promise<Profile[]>;
  postsOf: (userId: string) => Promise<Post[]>;
  following: (userId: string) => Promise<boolean>;
  search: (q: string) => Promise<Profile[]>;
  /** Accounts this device has blocked, kept in state so the UI can react. */
  blocked: string[];
  block: (userId: string, on: boolean) => Promise<void>;
  report: (input: ReportInput) => Promise<void>;
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
  const [blocked, setBlocked] = useState<string[]>([]);

  /**
   * A session and its profile, applied together.
   *
   * Every way in ends here — boot, a typed code, a link consumed after the app
   * was already running — so none of them can forget to load the profile or to
   * report a problem the backend recorded on the way.
   */
  const adopt = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) { setMe(null); return; }
    try { setMe(await api.getProfile(s.userId)); }
    catch (e) { setError((e as Error).message); }
    const problem = api.lastProblem?.() ?? null;
    if (problem) setError(problem);
  }, [api]);

  const loadFeed = useCallback(async (s: FeedScope) => {
    try { setFeed(await api.feed(s)); } catch (e) { setError((e as Error).message); }
  }, [api]);

  useEffect(() => {
    (async () => {
      try {
        await adopt(await api.restore());
      } catch (e) {
        // Not silent any more. A sign-in that fails on the way back from a mail
        // link used to land here and end as an empty sign-in card, which reads
        // to the user as a link that did nothing at all.
        setError((e as Error).message);
      }
      try { setBlocked(await api.blocked()); } catch { /* none */ }
      await loadFeed('everyone');
      setReady(true);
    })();
  }, [api, loadFeed, adopt]);

  /* Sessions that arrive on their own: a link opened once the app was already
     up, a refreshed token, a sign-out in another tab. */
  useEffect(() => api.onAuthChange?.((s) => { void adopt(s); }), [api, adopt]);

  /* A link that came back refused says so even before anything is tried, so the
     sign-in card explains itself on the very first paint. */
  useEffect(() => {
    const cb = authCallback();
    if (cb.kind === 'error') setError(cb.message);
  }, []);

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
        if (s) { await adopt(s); await loadFeed(scope); }
      } catch (e) { setError((e as Error).message); }
      setBusy(false);
    },
    canVerifyCode: !!api.verifyEmailCode,
    retryProfile: async () => {
      setBusy(true); setError(null);
      try { await adopt(await api.restore()); }
      catch (e) { setError((e as Error).message); }
      setBusy(false);
    },
    verifyEmailCode: async (email, code) => {
      setBusy(true); setError(null);
      try {
        const s = (await api.verifyEmailCode?.(email, code)) ?? null;
        if (!s) { setError('That code did not work. Check it, or send a new one.'); return false; }
        await adopt(s);
        await loadFeed(scope);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That code did not work.');
        return false;
      } finally { setBusy(false); }
    },
    signInWithEmail: async (email) => {
      setBusy(true); setError(null);
      try {
        const r = await api.signInWithEmail(email);
        // The device-only backend signs you straight in and says so; a real one
        // sends a link and the session arrives when it is clicked.
        const restored = await api.restore().catch(() => null);
        if (restored) { await adopt(restored); await loadFeed(scope); }
        return r;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'That did not go through.';
        setError(message);
        return { sent: false, message };
      } finally {
        setBusy(false);
      }
    },
    signOut: async () => { await api.signOut(); setSession(null); setMe(null); await loadFeed('everyone'); },
    deleteAccount: async () => {
      await api.deleteAccount();
      setSession(null);
      setMe(null);
      setBlocked([]);
      await loadFeed('everyone');
    },
    saveProfile: async (patch) => {
      if (!me) return;
      setBusy(true);
      try { setMe(await api.upsertProfile({ ...me, ...patch })); }
      catch (e) { setError((e as Error).message); }
      setBusy(false);
    },
    post: async (input) => {
      setBusy(true); setError(null);
      let ok = false;
      try { await api.createPost(input); await loadFeed(scope); ok = true; }
      catch (e) { setError((e as Error).message); }
      setBusy(false);
      return ok;
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
    profileByHandle: (handle) => api.profileByHandle(handle),
    followersOf: (userId) => api.followersOf(userId),
    followingOf: (userId) => api.followingOf(userId),
    postsOf: (userId) => api.postsBy(userId),
    following: (userId) => api.isFollowing(userId),
    search: (q) => api.searchProfiles(q),
    blocked,
    block: async (userId, on) => {
      await api.block(userId, on);
      setBlocked(await api.blocked().catch(() => blocked));
      await loadFeed(scope);
    },
    report: (input) => api.report(input),
  }), [ready, api, session, me, busy, error, feed, scope, loadFeed, blocked, adopt]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSocial(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSocial outside SocialProvider');
  return v;
}
