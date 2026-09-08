/**
 * The device-only backend.
 *
 * It exists so the social layer is a working product on day one instead of a
 * screen full of empty states waiting on a server. Everything is real — posting,
 * following, tailing, privacy — it simply never leaves the phone, and the app
 * says so plainly rather than pretending there is an audience out there.
 *
 * The moment Supabase credentials are set, `backendFor()` swaps this for the
 * shared one and the same screens keep working unchanged.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Backend, FeedScope, Post, PostPick, Profile, ReportInput, Session, colorFor, handleFrom, hashtagsIn } from './types';
import { RATE_WINDOW_MS, qualityOf, rateLimited, screen } from './moderation';

const KEY = 'gridiron-ai.social.local.v1';

interface Store {
  session: Session | null;
  profiles: Record<string, Profile>;
  posts: Post[];
  follows: string[];
  likes: string[];
  tails: string[];
  blocks: string[];
  reports: (ReportInput & { at: number })[];
  /** When this device last posted, for the rate limit. */
  postedAt: number[];
}

const EMPTY: Store = { session: null, profiles: {}, posts: [], follows: [], likes: [], tails: [], blocks: [], reports: [], postedAt: [] };

/**
 * A handful of seeded accounts so the feed demonstrates what it is for. They
 * are labelled as samples in the UI and disappear the moment a real backend is
 * configured — nothing here is presented as a real person.
 */
const SAMPLES: Profile[] = [
  { id: 'sample:sharp', handle: 'coldnumbers', displayName: 'Cold Numbers', bio: 'Model-only. No parlays under +200. Sample account.', avatarColor: colorFor('coldnumbers'), provider: 'local', createdAt: Date.now() - 86400000 * 40, isPrivate: false, showRecord: true, showPicks: true, followers: 812, following: 44, record: { won: 61, lost: 49, push: 3, units: 6.5 } },
  { id: 'sample:dogs', handle: 'dogsonly', displayName: 'Dogs Only', bio: 'Underdogs and Upset Radar. Sample account.', avatarColor: colorFor('dogsonly'), provider: 'local', createdAt: Date.now() - 86400000 * 21, isPrivate: false, showRecord: true, showPicks: true, followers: 340, following: 91, record: { won: 24, lost: 22, push: 1, units: 4.1 } },
  { id: 'sample:sat', handle: 'saturdayonly', displayName: 'Saturday Only', bio: 'College or nothing. Sample account.', avatarColor: colorFor('saturdayonly'), provider: 'local', createdAt: Date.now() - 86400000 * 12, isPrivate: false, showRecord: false, showPicks: true, followers: 128, following: 12, record: null },
];

const SAMPLE_POSTS = (): Post[] => [
  { id: 'seed1', authorId: 'sample:sharp', text: 'Model has this one 6.5 off the number and the board has not moved all week. Taking it before it does. #edge #nfl', hashtags: ['edge', 'nfl'], createdAt: Date.now() - 3600_000 * 3, likes: 42, likedByMe: false, tails: 11, tailedByMe: false, replies: 0 },
  { id: 'seed2', authorId: 'sample:dogs', text: 'Upset Radar had three live dogs on Saturday. Two hit. This is the whole reason I pay for it. #upsetradar #cfb', hashtags: ['upsetradar', 'cfb'], createdAt: Date.now() - 3600_000 * 9, likes: 88, likedByMe: false, tails: 26, tailedByMe: false, replies: 0 },
  { id: 'seed3', authorId: 'sample:sat', text: 'Reminder that a 4-leg parlay at +650 the model prices at +900 is not a good bet, it is a good story. #parlaylab', hashtags: ['parlaylab'], createdAt: Date.now() - 3600_000 * 26, likes: 133, likedByMe: false, tails: 3, tailedByMe: false, replies: 0 },
];

/**
 * Feed order: recency, with quality allowed to move a post about a day either
 * way. Chronological alone lets one loud account own the timeline; pure ranking
 * makes a live board feel stale. Weighting recency and demoting noise gets both.
 */
export function sortFeed(list: Post[]): Post[] {
  const DAY = 86_400_000;
  const rank = (p: Post) => p.createdAt + (qualityOf(p.text, !!p.pick) - 50) * (DAY / 100);
  return [...list].filter((p) => screen(p.text).verdict !== 'block').sort((a, b) => rank(b) - rank(a));
}

export class LocalBackend implements Backend {
  readonly kind = 'local' as const;
  readonly live = false;
  private s: Store = EMPTY;
  private loaded = false;

  private async load(): Promise<Store> {
    if (this.loaded) return this.s;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      this.s = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Store>) } : EMPTY;
    } catch { this.s = EMPTY; }
    if (!this.s.posts.length) this.s.posts = SAMPLE_POSTS();
    for (const p of SAMPLES) if (!this.s.profiles[p.id]) this.s.profiles[p.id] = p;
    this.loaded = true;
    return this.s;
  }

  private async save() { try { await AsyncStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* full disk */ } }

  private hydrate(p: Post): Post {
    return { ...p, author: this.s.profiles[p.authorId], likedByMe: this.s.likes.includes(p.id), tailedByMe: this.s.tails.includes(p.id) };
  }

  async restore(): Promise<Session | null> { const s = await this.load(); return s.session; }

  async signIn(provider: Backend extends never ? never : Session['provider']): Promise<Session> {
    const s = await this.load();
    const id = s.session?.userId ?? `me:${Date.now().toString(36)}`;
    s.session = { userId: id, provider };
    if (!s.profiles[id]) {
      const handle = handleFrom(`fan${id.slice(-4)}`);
      s.profiles[id] = {
        id, handle, displayName: 'You', bio: '', avatarColor: colorFor(handle), provider,
        createdAt: Date.now(), isPrivate: false, showRecord: true, showPicks: true, followers: 0, following: 0,
      };
    } else {
      s.profiles[id] = { ...s.profiles[id], provider };
    }
    await this.save();
    return s.session;
  }

  async signOut(): Promise<void> { const s = await this.load(); s.session = null; await this.save(); }

  /**
   * Erasure, on the device. Everything this account authored, follows, blocked
   * or reported goes with it — the seeded sample accounts stay, because they are
   * not the user's data and the app has to have something to show afterwards.
   */
  async deleteAccount(): Promise<void> {
    const s = await this.load();
    const me = s.session?.userId;
    if (!me) return;
    delete s.profiles[me];
    s.posts = s.posts.filter((p) => p.authorId !== me);
    s.session = null;
    s.follows = [];
    s.likes = [];
    s.tails = [];
    s.blocks = [];
    s.reports = [];
    s.postedAt = [];
    await this.save();
  }

  async getProfile(userId: string): Promise<Profile | null> { const s = await this.load(); return s.profiles[userId] ?? null; }

  async profileByHandle(handle: string): Promise<Profile | null> {
    const s = await this.load();
    const t = handle.trim().toLowerCase().replace(/^@/, '');
    return Object.values(s.profiles).find((p) => p.handle.toLowerCase() === t) ?? null;
  }

  async upsertProfile(p: Profile): Promise<Profile> {
    const s = await this.load();
    s.profiles[p.id] = { ...s.profiles[p.id], ...p };
    await this.save();
    return s.profiles[p.id];
  }

  async searchProfiles(q: string): Promise<Profile[]> {
    const s = await this.load();
    const t = q.trim().toLowerCase().replace(/^@/, '');
    return Object.values(s.profiles).filter((p) =>
      p.id !== s.session?.userId && (!t || p.handle.includes(t) || p.displayName.toLowerCase().includes(t)));
  }

  async follow(userId: string, on: boolean): Promise<void> {
    const s = await this.load();
    const had = s.follows.includes(userId);
    s.follows = on ? [...new Set([...s.follows, userId])] : s.follows.filter((f) => f !== userId);
    const p = s.profiles[userId];
    if (p && had !== on) p.followers = Math.max(0, p.followers + (on ? 1 : -1));
    const me = s.session && s.profiles[s.session.userId];
    if (me && had !== on) me.following = Math.max(0, me.following + (on ? 1 : -1));
    await this.save();
  }

  async isFollowing(userId: string): Promise<boolean> { const s = await this.load(); return s.follows.includes(userId); }

  async blocked(): Promise<string[]> { const s = await this.load(); return [...s.blocks]; }

  async block(userId: string, on: boolean): Promise<void> {
    const s = await this.load();
    s.blocks = on ? [...new Set([...s.blocks, userId])] : s.blocks.filter((b) => b !== userId);
    // Blocking is also unfollowing. Leaving the follow in place would keep them
    // in "Following" counts and in a feed the block was meant to end.
    if (on) s.follows = s.follows.filter((f) => f !== userId);
    await this.save();
  }

  async report(input: ReportInput): Promise<void> {
    const s = await this.load();
    s.reports = [...s.reports, { ...input, at: Date.now() }].slice(-200);
    await this.save();
  }

  /**
   * On this device there is exactly one person who can follow anybody — you —
   * so a sample account's followers list is you, or nobody. The denormalised
   * count on the profile is still the seeded number; the list is only ever the
   * part this device can actually vouch for, which is the honest answer until a
   * shared backend can name the rest.
   */
  async followersOf(userId: string): Promise<Profile[]> {
    const s = await this.load();
    const me = s.session && s.profiles[s.session.userId];
    return me && s.follows.includes(userId) ? [me] : [];
  }

  async followingOf(userId: string): Promise<Profile[]> {
    const s = await this.load();
    if (s.session?.userId !== userId) return [];
    return s.follows.map((id) => s.profiles[id]).filter(Boolean);
  }

  async feed(scope: FeedScope): Promise<Post[]> {
    const s = await this.load();
    let list = [...s.posts];
    if (scope === 'following') {
      const mine = s.session?.userId;
      list = list.filter((p) => s.follows.includes(p.authorId) || p.authorId === mine);
    }
    if (scope === 'picks') list = list.filter((p) => !!p.pick);
    return sortFeed(list.filter((p) => !p.replyTo && !s.blocks.includes(p.authorId)))
      .map((p) => this.hydrate(p));
  }

  async postsBy(userId: string): Promise<Post[]> {
    const s = await this.load();
    // A profile is chronological on purpose — it is a record of what somebody
    // said and when, not a ranked feed — but a blocked account still shows
    // nothing, and screened-out posts still go.
    if (s.blocks.includes(userId)) return [];
    return s.posts
      .filter((p) => p.authorId === userId && screen(p.text).verdict !== 'block')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => this.hydrate(p));
  }

  async createPost(input: { text: string; gifUrl?: string | null; pick?: PostPick | null; replyTo?: string | null }): Promise<Post> {
    const s = await this.load();
    if (!s.session) throw new Error('Sign in to post');
    const verdict = screen(input.text ?? '');
    if (verdict.verdict === 'block') throw new Error(verdict.reason);
    if (rateLimited(s.postedAt)) throw new Error('You have posted a lot in the last hour. Give it a few minutes.');
    const post: Post = {
      id: `p${Date.now().toString(36)}`,
      authorId: s.session.userId,
      text: input.text.trim(),
      hashtags: hashtagsIn(input.text),
      gifUrl: input.gifUrl ?? null,
      pick: input.pick ?? null,
      replyTo: input.replyTo ?? null,
      createdAt: Date.now(),
      likes: 0, likedByMe: false, tails: 0, tailedByMe: false, replies: 0,
    };
    s.posts = [post, ...s.posts].slice(0, 500);
    s.postedAt = [...s.postedAt.filter((t) => Date.now() - t < RATE_WINDOW_MS), Date.now()];
    if (input.replyTo) {
      const parent = s.posts.find((p) => p.id === input.replyTo);
      if (parent) parent.replies += 1;
    }
    await this.save();
    return this.hydrate(post);
  }

  async deletePost(id: string): Promise<void> {
    const s = await this.load();
    s.posts = s.posts.filter((p) => p.id !== id);
    await this.save();
  }

  async like(postId: string, on: boolean): Promise<void> {
    const s = await this.load();
    const p = s.posts.find((x) => x.id === postId);
    if (!p) return;
    const had = s.likes.includes(postId);
    if (had === on) return;
    s.likes = on ? [...s.likes, postId] : s.likes.filter((x) => x !== postId);
    p.likes = Math.max(0, p.likes + (on ? 1 : -1));
    await this.save();
  }

  async tail(postId: string, on: boolean): Promise<void> {
    const s = await this.load();
    const p = s.posts.find((x) => x.id === postId);
    if (!p) return;
    const had = s.tails.includes(postId);
    if (had === on) return;
    s.tails = on ? [...s.tails, postId] : s.tails.filter((x) => x !== postId);
    p.tails = Math.max(0, p.tails + (on ? 1 : -1));
    await this.save();
  }
}
