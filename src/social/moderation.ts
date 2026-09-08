/**
 * What is allowed to be posted, and what is allowed to be seen.
 *
 * A betting feed has a specific abuse profile, and it is not the generic one.
 * The dangerous content here is not swearing — it is the tout: "GUARANTEED
 * LOCK, DM me for my card, $50 a week, Telegram @…". That is the post that gets
 * a user scammed, gets the app treated as a picks-selling operation, and gets it
 * pulled from a store. So solicitation is screened at least as hard as abuse.
 *
 * Screening runs in two places on purpose:
 *
 *   • at compose, where it can explain itself and the author can fix the post;
 *   • at render, over whatever the feed handed back, because a server this
 *     client does not control may hand back anything at all.
 *
 * Doing it only at compose would be a client-side check on data from elsewhere,
 * which is not a check.
 *
 * Everything here is deliberately conservative about *blocking* and liberal
 * about *demoting*. A false block is a user who cannot speak; a false demote is
 * a post a little further down a feed. When it is a close call, the score moves
 * and the post stays.
 */

export type Verdict = 'allow' | 'demote' | 'block';

export interface Screening {
  verdict: Verdict;
  /** Shown to the author when a post is blocked. Empty when it is allowed. */
  reason: string;
  /** 0-100. Lower sorts later. Only meaningful when the verdict is not block. */
  quality: number;
  /** Machine-readable, for the report queue and for tests. */
  codes: string[];
}

/**
 * Slurs and explicit harassment. Kept as fragments matched against a normalised
 * string so that spacing, punctuation and digit substitution do not walk around
 * them. The list is intentionally short and unambiguous: every entry here is a
 * word with no innocent use in a football thread.
 */
const SLURS = [
  'n1gger', 'nigger', 'nigga', 'faggot', 'fagg0t', 'tranny', 'retard',
  'kike', 'spic', 'chink', 'wetback', 'coon', 'raghead', 'towelhead',
];

/** Threats and self-harm direction. Blocked outright. */
const THREATS = [
  'killyourself', 'killurself', 'kysyourself', 'iwillkillyou', 'illkillyou',
  'imgoingtokill', 'hangyourself', 'shootyou', 'iwillfindyou', 'rapeyou',
];

/**
 * Selling picks. The single most common bad post on a betting feed and the one
 * with the clearest downside, so it is blocked rather than demoted.
 */
const TOUT = [
  'dmmeforpicks', 'dmforpicks', 'dmmypicks', 'buymypicks', 'sellingpicks',
  'payforpicks', 'joinmytelegram', 'joinmydiscordforpicks', 'vipgroup',
  'vippicks', 'lockoftheyear', 'guaranteedwin', 'guaranteedlock',
  'cantlose', '100percentlock', 'freemoneypicks', 'venmome', 'cashappme',
];

/** Financial scams that ride along on sports feeds. */
const SCAM = [
  'cryptosignals', 'forexsignals', 'doubleyourmoney', 'investwithme',
  'bitcoingiveaway', 'sendmebtc', 'nftdrop', 'airdropfree',
];

const URL_RE = /https?:\/\/\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|gg|me|ly|link|xyz)\b/gi;
/** Telegram / WhatsApp handles and phone numbers — the tout's contact details. */
const CONTACT_RE = /\b(?:t\.me\/|telegram|whatsapp|\+?\d[\d\s().-]{8,}\d)\b/gi;

/**
 * Fold away the tricks people use to slip a word past a list: case, spacing,
 * punctuation, and the handful of digits that stand in for letters.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a')
    .replace(/[^a-z]/g, '');
}

const hits = (haystack: string, needles: string[]) => needles.filter((n) => haystack.includes(n));

/** Longest run of the same character — "AAAAAAA", "!!!!!!!!". */
function maxRun(text: string): number {
  let best = 1;
  let run = 1;
  for (let i = 1; i < text.length; i += 1) {
    run = text[i] === text[i - 1] ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

export const MAX_POST_LENGTH = 500;

/**
 * Screen one post. Pure, synchronous and cheap enough to run per row on render.
 */
export function screen(text: string): Screening {
  const codes: string[] = [];
  const raw = text ?? '';
  const flat = normalise(raw);
  const trimmed = raw.trim();

  if (!trimmed) return { verdict: 'allow', reason: '', quality: 50, codes };

  if (trimmed.length > MAX_POST_LENGTH) {
    return { verdict: 'block', reason: `Keep it under ${MAX_POST_LENGTH} characters.`, quality: 0, codes: ['too-long'] };
  }

  if (hits(flat, SLURS).length) {
    return {
      verdict: 'block',
      reason: 'That word is not allowed here. Take the argument up with the number, not the person.',
      quality: 0,
      codes: ['slur'],
    };
  }

  if (hits(flat, THREATS).length) {
    return {
      verdict: 'block',
      reason: 'Threats and telling people to hurt themselves are not allowed, ever.',
      quality: 0,
      codes: ['threat'],
    };
  }

  if (hits(flat, TOUT).length) {
    return {
      verdict: 'block',
      reason: 'No selling picks and no guaranteed anything. Post the play and let your record argue for you.',
      quality: 0,
      codes: ['tout'],
    };
  }

  if (hits(flat, SCAM).length) {
    return {
      verdict: 'block',
      reason: 'No investment, crypto or giveaway promotion.',
      quality: 0,
      codes: ['scam'],
    };
  }

  // Nothing below this line blocks. It only moves a post down the feed.
  let quality = 60;

  const links = raw.match(URL_RE) ?? [];
  if (links.length >= 3) { quality -= 35; codes.push('link-spam'); }
  else if (links.length) { quality -= 8; codes.push('link'); }

  if (CONTACT_RE.test(raw)) { quality -= 25; codes.push('contact'); }

  const letters = trimmed.replace(/[^a-zA-Z]/g, '');
  const caps = letters.replace(/[^A-Z]/g, '').length;
  if (letters.length >= 12 && caps / letters.length > 0.7) { quality -= 15; codes.push('shouting'); }

  if (maxRun(trimmed) >= 8) { quality -= 10; codes.push('repetition'); }

  const tags = (raw.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  if (tags >= 6) { quality -= 15; codes.push('tag-stuffing'); }

  // Substance earns its way back up: a post with a real sentence in it reads
  // like a person, and one with a pick attached is the thing the feed is for.
  if (trimmed.length >= 60) quality += 10;
  if (/\d/.test(trimmed)) quality += 5;

  quality = Math.max(0, Math.min(100, quality));
  return { verdict: quality < 30 ? 'demote' : 'allow', reason: '', quality, codes };
}

/** A pick attached to a post is signal, and the sort should say so. */
export const qualityOf = (text: string, hasPick: boolean): number =>
  Math.min(100, screen(text).quality + (hasPick ? 15 : 0));

/**
 * How often one account may post. Not abuse prevention on its own — a
 * determined script goes around a client-side limit — but it stops the ordinary
 * case, which is one over-excited person burying a feed on a Sunday.
 */
export const RATE_WINDOW_MS = 3_600_000;
export const RATE_LIMIT = 20;

export function rateLimited(timestamps: number[], now = Date.now()): boolean {
  return timestamps.filter((t) => now - t < RATE_WINDOW_MS).length >= RATE_LIMIT;
}

export const REPORT_REASONS = [
  { key: 'tout', label: 'Selling picks or guaranteeing wins' },
  { key: 'abuse', label: 'Harassment or hate' },
  { key: 'spam', label: 'Spam or scam' },
  { key: 'impersonation', label: 'Pretending to be someone else' },
  { key: 'minor', label: 'Appears to be under 21' },
  { key: 'other', label: 'Something else' },
] as const;

export type ReportReason = typeof REPORT_REASONS[number]['key'];
