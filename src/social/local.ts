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
import { Backend, FeedScope, Post, PostPick, Profile, Session, colorFor, handleFrom, hashtagsIn } from './types';

const KEY = 'gridiron-ai.social.local.v1';

interface Store {
  session: Session | null;
  profiles: Record<string, Profile>;
  posts: Post[];
  follows: string[];
  likes: string[];
  tails: string[];
}

const EMPTY: Store = { session: null, profiles: {}, posts: [], follows: [], likes: [], tails: [] };

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

  async getProfile(userId: string): Promise<Profile | null> { const s = await this.load(); return s.profiles[userId] ?? null; }

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

  async followersOf(): Promise<Profile[]> { return []; }

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
    return list
      .filter((p) => !p.replyTo)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => this.hydrate(p));
  }

  async postsBy(userId: string): Promise<Post[]> {
    const s = await this.load();
    return s.posts.filter((p) => p.authorId === userId).sort((a, b) => b.createdAt - a.createdAt).map((p) => this.hydrate(p));
  }

  async createPost(input: { text: string; gifUrl?: string | null; pick?: PostPick | null; replyTo?: string | null }): Promise<Post> {
    const s = await this.load();
    if (!s.session) throw new Error('Sign in to post');
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
