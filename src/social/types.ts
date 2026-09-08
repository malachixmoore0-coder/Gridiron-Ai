/**
 * The social layer's shapes.
 *
 * A pick is the unit of currency here: everything — a profile, a post, a tail —
 * exists so a pick can travel. Which is why a PostPick carries the model's own
 * numbers with it. A shared pick that loses its edge and probability on the way
 * out is just a screenshot with extra steps.
 */
import type { LeagueId } from '@/league/types';

export type AuthProvider = 'google' | 'apple' | 'email' | 'local';

export interface Profile {
  id: string;
  /** @handle, unique, lowercase. */
  handle: string;
  displayName: string;
  bio: string;
  /** Hex used for the initials avatar when there is no photo. */
  avatarColor: string;
  /** A data: URL for a picture the user chose, or a provider's hosted one. */
  avatarUrl?: string | null;
  /** The wide image across the top of their profile. Data URL, same as above. */
  bannerUrl?: string | null;
  provider: AuthProvider;
  createdAt: number;
  /** Private accounts only show picks to accepted followers. */
  isPrivate: boolean;
  /** Show the win/loss line publicly. Independent of showPicks. */
  showRecord: boolean;
  /** Show the picks themselves — the actual sides and numbers. */
  showPicks: boolean;
  /** Denormalised counts so a card renders without a second round trip. */
  followers: number;
  following: number;
  /** Public record, when the profile allows it. */
  record?: { won: number; lost: number; push: number; units: number } | null;
}

export interface PostPick {
  league: LeagueId;
  gameId: string;
  awayId: string;
  homeId: string;
  market: 'ml' | 'spread' | 'total';
  side: 'home' | 'away' | 'over' | 'under';
  number: number | null;
  label: string;
  modelPct: number;
  edge: number;
  /** Sportsbook the price came from, when one was chosen. */
  book?: string | null;
  odds?: number | null;
}

export interface Post {
  id: string;
  authorId: string;
  author?: Profile;
  text: string;
  hashtags: string[];
  gifUrl?: string | null;
  pick?: PostPick | null;
  createdAt: number;
  likes: number;
  likedByMe: boolean;
  tails: number;
  tailedByMe: boolean;
  replyTo?: string | null;
  replies: number;
}

export interface ReportInput {
  /** The post being reported, when it is about a post rather than an account. */
  postId?: string | null;
  subjectId: string;
  reason: string;
  detail?: string | null;
}

export interface Session {
  userId: string;
  provider: AuthProvider;
  /** Present only when a real backend issued it. */
  token?: string | null;
}

export type FeedScope = 'following' | 'everyone' | 'picks';

export interface Backend {
  readonly kind: 'local' | 'supabase';
  /** True when a real, shared backend is configured. */
  readonly live: boolean;
  restore(): Promise<Session | null>;
  signIn(provider: AuthProvider): Promise<Session | null>;
  /**
   * Email a sign-in link. The cheapest real account there is: no OAuth console,
   * no developer programme, no password to store or leak.
   */
  signInWithEmail(email: string): Promise<{ sent: boolean; message: string }>;
  /**
   * Trade a six-digit code from the same email for a session.
   *
   * The link and the code are the same one-time password wearing different
   * clothes, but only the link can be spent by a machine: mail apps and
   * corporate scanners follow links to check them, and a single-use link that
   * has been followed is a dead link by the time a person taps it. A code has
   * to be read and typed, so nothing can consume it on the user's behalf.
   */
  verifyEmailCode?(email: string, code: string): Promise<Session | null>;
  signOut(): Promise<void>;
  /** Erase the account and everything it owns. Not reversible, by design. */
  deleteAccount(): Promise<void>;
  getProfile(userId: string): Promise<Profile | null>;
  /** Resolve an @handle to an account. This is what makes /@handle a real address. */
  profileByHandle(handle: string): Promise<Profile | null>;
  upsertProfile(p: Profile): Promise<Profile>;
  searchProfiles(q: string): Promise<Profile[]>;
  follow(userId: string, follow: boolean): Promise<void>;
  isFollowing(userId: string): Promise<boolean>;
  followersOf(userId: string): Promise<Profile[]>;
  followingOf(userId: string): Promise<Profile[]>;
  /** Accounts this user has blocked. Their posts never reach the feed. */
  blocked(): Promise<string[]>;
  block(userId: string, on: boolean): Promise<void>;
  report(input: ReportInput): Promise<void>;
  feed(scope: FeedScope, cursor?: number): Promise<Post[]>;
  postsBy(userId: string): Promise<Post[]>;
  createPost(input: { text: string; gifUrl?: string | null; pick?: PostPick | null; replyTo?: string | null }): Promise<Post>;
  deletePost(id: string): Promise<void>;
  like(postId: string, on: boolean): Promise<void>;
  tail(postId: string, on: boolean): Promise<void>;
  /**
   * Something that went wrong alongside a call that otherwise succeeded, read
   * once and cleared. A profile row that would not insert is the case this
   * exists for: it must not cost the user their session, but it cannot be
   * silent either, because every screen that needs a profile will be empty.
   */
  lastProblem?(): string | null;
  /**
   * Sessions that arrive on their own — a link consumed after the app had
   * already booted, a token refresh, a sign-out in another tab. Returns its own
   * unsubscribe.
   */
  onAuthChange?(fn: (s: Session | null) => void): () => void;
}

/** #tags, lowercased, deduped, in the order they appear. */
export function hashtagsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/#([\p{L}\p{N}_]{2,30})/gu)) {
    const t = m[1].toLowerCase();
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** A stable, pleasant avatar colour from a handle. */
export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hues = [152, 168, 190, 210, 42, 28, 340, 262];
  return `hsl(${hues[h % hues.length]} 62% 46%)`;
}

/** What the database will accept: 3-18 of lowercase, digits and underscore. */
export const HANDLE_RE = /^[a-z0-9_]{3,18}$/;

/**
 * A handle from a name or an email local part.
 *
 * The length floor is not cosmetic — `profiles.handle` is checked against
 * exactly this pattern, so a two-character result ("ab@example.com") is not a
 * short handle, it is a failed insert and an account with no profile. Anything
 * under three characters gets padded rather than rejected, because the person
 * signing up did nothing wrong.
 */
export const handleFrom = (name: string) => {
  const base = name.toLowerCase().replace(/[^a-z0-9_]+/g, '').slice(0, 18);
  if (HANDLE_RE.test(base)) return base;
  const padded = `${base}${Math.floor(Math.random() * 9000 + 1000)}`.slice(0, 18);
  return HANDLE_RE.test(padded) ? padded : `fan${Math.floor(Math.random() * 9000 + 1000)}`;
};
