/**
 * The shared backend.
 *
 * Supabase because it gives Google and Apple sign-in, Postgres with row-level
 * security, and a realtime channel for free — which is every piece the social
 * layer needs and nothing it does not. Set two env vars and the app switches
 * from device-only to a real network:
 *
 *   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
 *
 * Then run docs/social-schema.sql in the SQL editor and enable Google and Apple
 * under Authentication → Providers. The anon key is meant to be public; every
 * rule that matters is enforced by the policies in that file, not by this code.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Backend, FeedScope, Post, PostPick, Profile, ReportInput, Session, colorFor, handleFrom, hashtagsIn } from './types';
import { screen } from './moderation';
import { sortFeed } from './local';
// Imported for its side effect as much as its value: reading the URL happens at
// this module's load, which is before anything here constructs a client and
// consumes the fragment.
import { authCallback } from './callback';
import { appUrl } from './links';
import { emailCodeEnabled } from './emailCode';

const URL = (process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined)?.trim();
const ANON = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const supabaseConfigured = !!(URL && ANON);

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!client) {
    client = createClient(URL as string, ANON as string, {
      auth: { storage: AsyncStorage as never, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web' },
    });
  }
  return client;
}

const rowToProfile = (r: Record<string, unknown>): Profile => ({
  id: String(r.id),
  handle: String(r.handle ?? ''),
  displayName: String(r.display_name ?? ''),
  bio: String(r.bio ?? ''),
  avatarColor: String(r.avatar_color ?? colorFor(String(r.handle ?? 'x'))),
  avatarUrl: (r.avatar_url as string | null) ?? null,
  bannerUrl: (r.banner_url as string | null) ?? null,
  provider: (r.provider as Profile['provider']) ?? 'google',
  createdAt: Date.parse(String(r.created_at ?? '')) || Date.now(),
  isPrivate: !!r.is_private,
  showRecord: r.show_record !== false,
  showPicks: r.show_picks !== false,
  followers: Number(r.followers ?? 0),
  following: Number(r.following ?? 0),
  record: (r.record as Profile['record']) ?? null,
});

const rowToPost = (r: Record<string, unknown>, meId: string | null): Post => ({
  id: String(r.id),
  authorId: String(r.author_id),
  author: r.profiles ? rowToProfile(r.profiles as Record<string, unknown>) : undefined,
  text: String(r.text ?? ''),
  hashtags: (r.hashtags as string[]) ?? [],
  gifUrl: (r.gif_url as string | null) ?? null,
  pick: (r.pick as PostPick | null) ?? null,
  replyTo: (r.reply_to as string | null) ?? null,
  createdAt: Date.parse(String(r.created_at ?? '')) || Date.now(),
  likes: Number(r.likes ?? 0),
  likedByMe: Array.isArray(r.likes_by) ? (r.likes_by as string[]).includes(meId ?? '') : false,
  tails: Number(r.tails ?? 0),
  tailedByMe: Array.isArray(r.tails_by) ? (r.tails_by as string[]).includes(meId ?? '') : false,
  replies: Number(r.replies ?? 0),
});

type AuthUser = { id: string; email?: string | null; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };

export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const;
  readonly live = true;
  private me: string | null = null;
  private problem: string | null = null;

  /** Read once and cleared, so the same complaint is not shown twice. */
  lastProblem(): string | null {
    const p = this.problem;
    this.problem = null;
    return p;
  }

  async restore(): Promise<Session | null> {
    const { data, error } = await db().auth.getSession();
    if (error) throw new Error(error.message);
    if (!data.session) {
      // No session and no error is the ordinary signed-out case — unless this
      // page load began with a link, in which case the link is why, and the
      // reason is sitting in the URL that brought us here.
      const cb = authCallback();
      if (cb.kind === 'error') throw new Error(cb.message);
      return null;
    }
    return this.adopt(data.session.user as AuthUser, data.session.access_token);
  }

  /**
   * Turn a Supabase user into our session, and make sure a profile row exists.
   *
   * The profile insert used to run before the session was returned, so a failure
   * to create it threw away a perfectly valid sign-in — the user clicked their
   * link, authenticated, and landed back on the sign-in card. The session is
   * built first now and the profile problem is recorded beside it, because being
   * signed in with a broken profile is a state worth showing and repairing, and
   * being silently signed out is not.
   */
  private async adopt(user: AuthUser, token?: string | null): Promise<Session> {
    this.me = user.id;
    const session: Session = {
      userId: user.id,
      provider: (user.app_metadata?.provider as Session['provider']) ?? 'email',
      token: token ?? null,
    };
    try { await this.ensureProfile(user); }
    catch (e) { this.problem = (e as Error).message; }
    return session;
  }

  /**
   * A session can turn up long after boot: a link opened in a second tab, an
   * expired token quietly refreshed, a sign-out somewhere else. Without this the
   * app only ever learns about the session it had at mount.
   */
  onAuthChange(fn: (s: Session | null) => void): () => void {
    const { data } = db().auth.onAuthStateChange((event, session) => {
      // Nothing may await inside this callback — auth-js holds its own lock
      // while it runs, and calling back into the client here deadlocks it. Hand
      // the work to the next tick instead.
      setTimeout(() => {
        if (!session) {
          if (event === 'SIGNED_OUT') { this.me = null; fn(null); }
          return;
        }
        this.adopt(session.user as AuthUser, session.access_token).then(fn).catch(() => {});
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }

  async signIn(provider: Session['provider']): Promise<Session | null> {
    // Email is not an OAuth provider — it goes through signInWithEmail.
    if (provider === 'local' || provider === 'email') return null;
    const { error } = await db().auth.signInWithOAuth({ provider, options: { redirectTo: appUrl() } });
    if (error) throw new Error(error.message);
    // Web redirects away and comes back; the session is picked up by restore().
    return null;
  }

  /**
   * A magic link, which is the whole account system for a product that has no
   * business storing passwords. Supabase sends the mail; there is no OAuth
   * console to configure, no Apple developer programme to pay for, and nothing
   * to leak in a breach because there is no credential on our side at all.
   */
  async signInWithEmail(email: string): Promise<{ sent: boolean; message: string }> {
    const to = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(to)) {
      return { sent: false, message: 'That does not look like an email address.' };
    }
    const { error } = await db().auth.signInWithOtp({ email: to, options: { emailRedirectTo: appUrl() } });
    if (error) return { sent: false, message: error.message };
    // Only mention the code when the template actually sends one.
    return {
      sent: true,
      message: emailCodeEnabled
        ? `Sent to ${to}. Open the link in this browser, or type the code from the email. Both expire in an hour.`
        : `Sent to ${to}. Open the link in this browser — it expires in an hour, and only works once.`,
    };
  }

  /**
   * The same one-time password, typed instead of clicked.
   *
   * `type: 'email'` covers both a first sign-up and a returning sign-in, so one
   * entry box handles every case the link handles. The code only reaches the
   * user if the email template includes `{{ .Token }}` — the default template
   * ships the link alone, which is exactly the thing scanners keep eating.
   */
  async verifyEmailCode(email: string, code: string): Promise<Session | null> {
    const token = code.replace(/\D/g, '');
    if (token.length < 6) throw new Error('That code is six digits.');
    const to = email.trim().toLowerCase();

    /*
     * A one-time code has a *type*, and the client does not know which one it
     * just asked for.
     *
     * `signInWithOtp` sends the "Confirm signup" mail to an address Supabase
     * has never seen and the "Magic Link" mail to one it has, and the token it
     * mints carries that distinction. Verifying with the wrong type is refused
     * exactly like a wrong code — which is what happened here: the link in the
     * very same email worked, and the code beside it came back invalid, because
     * this asked for 'email' and the token was a 'signup'.
     *
     * There is no way to know whether an address is new without asking, and
     * asking would leak which addresses have accounts. So all three plausible
     * types are tried. A rejected attempt does not spend the token, so this
     * costs a round trip and nothing else, and the error surfaced is the last
     * real one rather than a mismatch we caused.
     */
    const TYPES = ['email', 'signup', 'magiclink'] as const;
    let last: string | null = null;

    for (const type of TYPES) {
      const { data, error } = await db().auth.verifyOtp({ email: to, token, type });
      if (!error) {
        if (!data.session) return null;
        return this.adopt(data.session.user as AuthUser, data.session.access_token);
      }
      last = error.message;
    }
    throw new Error(last ?? 'That code did not work.');
  }

  async signOut(): Promise<void> { await db().auth.signOut(); this.me = null; }

  /**
   * Erasure, server side. One RPC, because the delete has to reach auth.users
   * and a client cannot. `delete_account()` takes no argument on purpose — it
   * reads auth.uid() itself, so there is no id to tamper with and no way to
   * point it at somebody else.
   */
  async deleteAccount(): Promise<void> {
    const { error } = await db().rpc('delete_account');
    if (error) throw new Error(error.message);
    await db().auth.signOut();
    this.me = null;
  }

  /**
   * First sign-in writes the profile row the rest of the app reads.
   *
   * Handles are unique, and the obvious source for one — the local part of an
   * email — is not: john@gmail and john@yahoo both want `john`, and the second
   * one loses. The insert used to ignore its own error, so that person signed
   * in successfully, got no profile row, and the app showed them the sign-in
   * card again with nothing to explain it. A few suffixed retries, then a real
   * error rather than a silent no-op.
   */
  private async ensureProfile(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
    const { data } = await db().from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (data) return;
    const name = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'fan');
    const base = handleFrom(name);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      // The first try keeps the name they would recognise; only a clash adds
      // digits, and the slice keeps it inside the column's 18-character check.
      const handle = attempt === 0 ? base : `${base.slice(0, 14)}${Math.floor(Math.random() * 9000 + 1000)}`;
      const { error } = await db().from('profiles').insert({
        id: user.id,
        handle,
        display_name: name,
        bio: '',
        avatar_color: colorFor(handle),
        avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      });
      if (!error) return;
      // 23505 is unique_violation — the only error worth another go.
      if (error.code !== '23505') throw new Error(`Could not create your profile: ${error.message}`);
    }
    throw new Error('Could not find a free handle. Try again in a moment.');
  }

  async getProfile(userId: string): Promise<Profile | null> {
    const { data } = await db().from('profiles').select('*').eq('id', userId).maybeSingle();
    return data ? rowToProfile(data) : null;
  }

  async profileByHandle(handle: string): Promise<Profile | null> {
    const t = handle.trim().replace(/^@/, '');
    const { data } = await db().from('profiles').select('*').ilike('handle', t).maybeSingle();
    return data ? rowToProfile(data) : null;
  }

  async upsertProfile(p: Profile): Promise<Profile> {
    const { data, error } = await db().from('profiles').update({
      handle: p.handle, display_name: p.displayName, bio: p.bio,
      avatar_url: p.avatarUrl ?? null, banner_url: p.bannerUrl ?? null,
      is_private: p.isPrivate, show_record: p.showRecord, show_picks: p.showPicks,
      record: p.record ?? null,
    }).eq('id', p.id).select().single();
    if (error) throw new Error(error.message);
    return rowToProfile(data);
  }

  async searchProfiles(q: string): Promise<Profile[]> {
    const t = q.trim().replace(/^@/, '');
    let query = db().from('profiles').select('*').limit(25);
    if (t) query = query.or(`handle.ilike.%${t}%,display_name.ilike.%${t}%`);
    const { data } = await query;
    return (data ?? []).map(rowToProfile);
  }

  async follow(userId: string, on: boolean): Promise<void> {
    if (!this.me) throw new Error('Sign in first');
    if (on) await db().from('follows').upsert({ follower_id: this.me, followee_id: userId });
    else await db().from('follows').delete().eq('follower_id', this.me).eq('followee_id', userId);
  }

  async isFollowing(userId: string): Promise<boolean> {
    if (!this.me) return false;
    const { data } = await db().from('follows').select('followee_id').eq('follower_id', this.me).eq('followee_id', userId).maybeSingle();
    return !!data;
  }

  async blocked(): Promise<string[]> {
    if (!this.me) return [];
    const { data } = await db().from('blocks').select('blocked_id').eq('blocker_id', this.me).limit(1000);
    return (data ?? []).map((r) => String((r as Record<string, unknown>).blocked_id));
  }

  async block(userId: string, on: boolean): Promise<void> {
    if (!this.me) throw new Error('Sign in first');
    if (on) {
      await db().from('blocks').upsert({ blocker_id: this.me, blocked_id: userId });
      // Blocking is also unfollowing, both ways: the point of a block is that
      // neither timeline carries the other any more.
      await db().from('follows').delete().eq('follower_id', this.me).eq('followee_id', userId);
      await db().from('follows').delete().eq('follower_id', userId).eq('followee_id', this.me);
    } else {
      await db().from('blocks').delete().eq('blocker_id', this.me).eq('blocked_id', userId);
    }
  }

  async report(input: ReportInput): Promise<void> {
    if (!this.me) throw new Error('Sign in first');
    const { error } = await db().from('reports').insert({
      reporter_id: this.me,
      post_id: input.postId ?? null,
      subject_id: input.subjectId,
      reason: input.reason,
      detail: input.detail ?? null,
    });
    if (error) throw new Error(error.message);
  }

  async followersOf(userId: string): Promise<Profile[]> {
    const { data } = await db().from('follows').select('profiles!follows_follower_id_fkey(*)').eq('followee_id', userId).limit(100);
    return (data ?? []).map((r) => rowToProfile((r as Record<string, unknown>).profiles as Record<string, unknown>));
  }

  async followingOf(userId: string): Promise<Profile[]> {
    const { data } = await db().from('follows').select('profiles!follows_followee_id_fkey(*)').eq('follower_id', userId).limit(100);
    return (data ?? []).map((r) => rowToProfile((r as Record<string, unknown>).profiles as Record<string, unknown>));
  }

  async feed(scope: FeedScope): Promise<Post[]> {
    const view = scope === 'following' ? 'feed_following' : 'feed_public';
    let q = db().from(view).select('*, profiles:author_id(*)').is('reply_to', null).order('created_at', { ascending: false }).limit(60);
    if (scope === 'picks') q = q.not('pick', 'is', null);
    const { data } = await q;
    // Screened again on the way in. The database hides blocked authors and
    // moderated posts, but a feed this client does not control is still input,
    // and a rule enforced only where the post is written is not enforced.
    return sortFeed((data ?? []).map((r) => rowToPost(r as Record<string, unknown>, this.me)));
  }

  async postsBy(userId: string): Promise<Post[]> {
    const { data } = await db().from('feed_public').select('*, profiles:author_id(*)').eq('author_id', userId).order('created_at', { ascending: false }).limit(60);
    return (data ?? [])
      .map((r) => rowToPost(r as Record<string, unknown>, this.me))
      .filter((p) => screen(p.text).verdict !== 'block');
  }

  async createPost(input: { text: string; gifUrl?: string | null; pick?: PostPick | null; replyTo?: string | null }): Promise<Post> {
    if (!this.me) throw new Error('Sign in to post');
    const verdict = screen(input.text ?? '');
    if (verdict.verdict === 'block') throw new Error(verdict.reason);
    const { data, error } = await db().from('posts').insert({
      author_id: this.me,
      text: input.text.trim(),
      hashtags: hashtagsIn(input.text),
      gif_url: input.gifUrl ?? null,
      pick: input.pick ?? null,
      reply_to: input.replyTo ?? null,
    }).select('*, profiles:author_id(*)').single();
    if (error) throw new Error(error.message);
    return rowToPost(data as Record<string, unknown>, this.me);
  }

  async deletePost(id: string): Promise<void> { await db().from('posts').delete().eq('id', id); }

  async like(postId: string, on: boolean): Promise<void> {
    if (!this.me) return;
    if (on) await db().from('likes').upsert({ post_id: postId, user_id: this.me });
    else await db().from('likes').delete().eq('post_id', postId).eq('user_id', this.me);
  }

  async tail(postId: string, on: boolean): Promise<void> {
    if (!this.me) return;
    if (on) await db().from('tails').upsert({ post_id: postId, user_id: this.me });
    else await db().from('tails').delete().eq('post_id', postId).eq('user_id', this.me);
  }
}
