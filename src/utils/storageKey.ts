/**
 * Renaming a storage key without emptying anybody's pockets.
 *
 * Every persisted key was prefixed `gridiron-ai.` — the trial that is running,
 * the streak somebody has kept, the tier they paid for, their settings. Change
 * the prefix and every one of those reads comes back null on the next launch,
 * and the app cheerfully greets a paying user as brand new. That is a data
 * loss, not a rename.
 *
 * So the new key is read first and the old one is read only if the new one is
 * empty, at which point the value is copied across and the old key removed. The
 * copy happens once per key per device and then never again. Nothing is deleted
 * before the write succeeds, so a crash mid-migration leaves the old value
 * exactly where it was rather than losing it between the two.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** The prefix everything was stored under before the app was renamed. */
const LEGACY_PREFIX = 'gridiron-ai.';
/** And the one it uses now. */
const PREFIX = 'simtoad.';

/**
 * The current key for a name, e.g. `key('prefs.v1')` → `simtoad.prefs.v1`.
 * The college side had its own prefix, which is preserved as a suffixed name.
 */
export const key = (name: string) => `${PREFIX}${name}`;

/**
 * Read a key, adopting whatever the old name held if this is the first launch
 * since the rename. Returns null only when neither name has anything.
 */
export async function getMigrated(name: string): Promise<string | null> {
  const current = key(name);
  const existing = await AsyncStorage.getItem(current);
  if (existing != null) return existing;

  const legacy = `${LEGACY_PREFIX}${name}`;
  const carried = await AsyncStorage.getItem(legacy);
  if (carried == null) return null;

  // Write before removing: a failure here costs a migration, not the data.
  try {
    await AsyncStorage.setItem(current, carried);
    await AsyncStorage.removeItem(legacy);
  } catch {
    // Storage refused. The value is still under the old name and the next
    // launch will try again, which is the right outcome.
  }
  return carried;
}
