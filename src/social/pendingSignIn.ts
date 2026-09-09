/**
 * Who we just emailed, remembered across leaving the app.
 *
 * Signing in by code has a gap in the middle: the app sends a mail, the person
 * leaves to go and read it, and comes back. Everything typed before they left
 * is gone — including the address — and the code box, which only makes sense
 * next to an address to check the code against, has nothing to attach itself to.
 * So they return holding a valid code and find nowhere to put it, and the link
 * is the only way in after all.
 *
 * One string, kept until the sign-in completes. It is the address they typed
 * themselves a moment ago, on their own device, which is the same thing the
 * browser's autofill would hold; it is cleared the instant it stops being
 * needed, and it is never anything but an address.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { key } from '@/utils/storageKey';

const KEY = key('signin.pending.v1');

/** How long a half-finished sign-in stays interesting. Supabase links last an hour. */
const TTL_MS = 60 * 60 * 1000;

interface Pending { email: string; at: number }

export async function rememberPending(email: string): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify({ email, at: Date.now() } satisfies Pending)); }
  catch { /* a sign-in that cannot be resumed is still a sign-in */ }
}

/** The address a code is outstanding for, or null. Expired entries clean themselves up. */
export async function readPending(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Pending>;
    if (!p?.email || typeof p.at !== 'number') return null;
    if (Date.now() - p.at > TTL_MS) { await clearPending(); return null; }
    return p.email;
  } catch { return null; }
}

export async function clearPending(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch { /* nothing to do */ }
}
