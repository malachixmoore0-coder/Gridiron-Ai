/**
 * Haptics.
 *
 * One wrapper, three realities:
 *   • Native iOS and Android get real haptics through expo-haptics.
 *   • Android on the web gets the Vibration API, which is a blunter instrument
 *     but better than nothing.
 *   • iOS on the web — which is what a home-screen PWA is — has no haptics API
 *     at all. Nothing here can change that; this degrades to a no-op rather
 *     than pretending.
 *
 * Everything is fire-and-forget: a failed buzz must never interrupt a tap.
 */
import { Platform } from 'react-native';

type Kind = 'select' | 'light' | 'medium' | 'success' | 'warning' | 'error';

/** Web fallback durations, in milliseconds. */
const BUZZ: Record<Kind, number | number[]> = {
  select: 8,
  light: 10,
  medium: 18,
  success: [10, 40, 16],
  warning: [14, 60, 14],
  error: [22, 50, 22],
};

let enabled = true;

/** Settings switch — off means off everywhere, immediately. */
export const setHapticsEnabled = (on: boolean) => { enabled = on; };
export const hapticsEnabled = () => enabled;

/** True where the platform can actually do something. */
export const hapticsSupported = (): boolean => {
  if (Platform.OS !== 'web') return true;
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
};

export function haptic(kind: Kind = 'select'): void {
  if (!enabled) return;
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(BUZZ[kind]);
      return;
    }
    // Required lazily so the web bundle never pulls the native module in.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const H = require('expo-haptics') as typeof import('expo-haptics');
    if (kind === 'success') { H.notificationAsync(H.NotificationFeedbackType.Success); return; }
    if (kind === 'warning') { H.notificationAsync(H.NotificationFeedbackType.Warning); return; }
    if (kind === 'error') { H.notificationAsync(H.NotificationFeedbackType.Error); return; }
    if (kind === 'select') { H.selectionAsync(); return; }
    H.impactAsync(kind === 'medium' ? H.ImpactFeedbackStyle.Medium : H.ImpactFeedbackStyle.Light);
  } catch {
    // No haptics engine, no problem.
  }
}

/** Wrap a handler so it buzzes before it runs. */
export const withHaptic = <T extends unknown[]>(fn: (...args: T) => void, kind: Kind = 'select') =>
  (...args: T) => { haptic(kind); fn(...args); };
