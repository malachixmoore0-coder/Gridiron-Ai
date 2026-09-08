/**
 * Gridiron AI — "The Vault" design system.
 *
 * The look is a night-shift trading desk, not a broadcast graphic. Three
 * deliberate choices, all of them load-bearing:
 *
 * 1. Near-black ground (#05080C). Peak usage is 6pm-1am on a phone in a dark
 *    room; a dark ground cuts glare and lets a single bright number own the
 *    screen. Everything else is a shade of the ground so nothing competes.
 * 2. Emerald is money. Green reads as gain in every market app a bettor
 *    already uses, and approach-motivation work (Elliot & Maier) ties it to
 *    go-signals. It is reserved for edge, profit and wins — never decoration.
 * 3. Gold is value. Scarcity, trophies, the premium tier. It marks the things
 *    worth paying for and the headline number on a card, nothing else.
 *
 * Ratio is 60/30/10: 60% ground, 30% panel and ink, 10% accent. Red is rationed
 * so the app feels like winning even when the week does not.
 */
import { Platform } from 'react-native';

export const colors = {
  /* ground */
  bg: '#05080C',
  bgAlt: '#080D13',
  bgLift: '#0B121A',
  card: '#0E1620',
  cardAlt: '#131D2A',
  cardHi: '#18243447',
  border: '#1B2836',
  borderHi: '#27394D',
  divider: '#141F2B',

  /* ink */
  ink: '#EEF4F8',
  inkDim: '#93A6B8',
  inkFaint: '#5C6E80',
  inkGhost: '#3A4959',

  /* money */
  green: '#12D992',
  greenDim: '#0EA976',
  greenSoft: 'rgba(18, 217, 146, 0.14)',
  greenGlow: 'rgba(18, 217, 146, 0.30)',

  /* value */
  gold: '#FFC64D',
  goldBright: '#FFD98A',
  goldDim: '#D9A032',
  goldSoft: 'rgba(255, 198, 77, 0.14)',
  goldGlow: 'rgba(255, 198, 77, 0.30)',

  /* sides */
  home: '#12D992',
  homeSoft: 'rgba(18, 217, 146, 0.14)',
  away: '#4DA3FF',
  awaySoft: 'rgba(77, 163, 255, 0.14)',

  /* signal */
  positive: '#12D992',
  negative: '#FF5F6D',
  negativeSoft: 'rgba(255, 95, 109, 0.14)',
  warning: '#FFC64D',
  live: '#FF3B5C',
  liveSoft: 'rgba(255, 59, 92, 0.16)',

  turf: '#0F5F45',
  white: '#FFFFFF',
  overlay: 'rgba(2, 4, 7, 0.82)',
  scrim: 'rgba(2, 4, 7, 0.55)',
};

/** Gradients used by the hero surfaces. Tuples so <LinearGradient> takes them raw. */
export const grad = {
  vault: ['#0B1720', '#071018', '#05080C'] as const,
  money: ['#12D992', '#0EA976'] as const,
  gold: ['#FFD37A', '#FFC64D', '#D9A032'] as const,
  edge: ['rgba(18,217,146,0.22)', 'rgba(18,217,146,0.02)'] as const,
  fade: ['rgba(5,8,12,0)', '#05080C'] as const,
  // What sits over a locked preview. Nearly opaque at both ends, because a
  // teaser you can read is not a teaser.
  veil: ['rgba(5,8,12,0.86)', 'rgba(5,8,12,0.94)', 'rgba(5,8,12,0.86)'] as const,
  tier: ['#132030', '#0B1420'] as const,
  /* Aliases kept so the college screens speak the same token language. */
  night: ['#0B1720', '#071018', '#05080C'] as const,
  lights: ['#FFD37A', '#FFC64D', '#D9A032'] as const,
};

/**
 * Condensed, tabular, tight. Numbers are the product, so they get a font stack
 * that lines digits up in columns and never reflows as a score ticks over.
 */
export const fonts = {
  display: Platform.select({
    web: '"SF Pro Display", "Helvetica Neue", Inter, system-ui, -apple-system, sans-serif',
    default: undefined,
  }),
  mono: Platform.select({
    web: '"SF Mono", "JetBrains Mono", "Roboto Mono", ui-monospace, monospace',
    default: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  }),
};

/** Numeric styles — tabular figures so a ticking number never shifts layout. */
export const numeric = {
  fontFamily: fonts.mono,
  fontVariant: ['tabular-nums'] as ('tabular-nums')[],
};

export const type = {
  hero: { fontSize: 44, fontWeight: '800' as const, letterSpacing: -1.4, fontFamily: fonts.display },
  title: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.6, fontFamily: fonts.display },
  section: { fontSize: 16, fontWeight: '800' as const, letterSpacing: -0.2 },
  body: { fontSize: 14, fontWeight: '600' as const },
  small: { fontSize: 12, fontWeight: '600' as const },
  micro: { fontSize: 10, fontWeight: '800' as const, letterSpacing: 1.1, textTransform: 'uppercase' as const },
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 26, xxl: 32, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/**
 * What a scrolling screen has to leave clear at the bottom.
 *
 * Every screen ended with forty points of padding, which was less than the
 * furniture standing over it: the dock is sixty-four points tall before the
 * home-indicator inset — closer to a hundred with one — and the floating
 * Simulate button clears the dock by fourteen and stands forty tall on top of
 * that. The last rows of every list were unreachable: you could scroll to the
 * end and still be reading through a button.
 *
 *   dock    — a tab screen, under the dock and the floating action
 *   overlay — a pushed screen, under its own back bar
 */
export const clearance = { dock: 156, overlay: 84 };

export const shadow = {
  card: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 6 },
  lift: { shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.55, shadowRadius: 34, elevation: 12 },
  money: { shadowColor: '#12D992', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 22, elevation: 8 },
};

export const sideColor = (side: 'home' | 'away' | 'even') =>
  side === 'home' ? colors.home : side === 'away' ? colors.away : colors.inkFaint;

/** Rating 1-10 → colour band. */
export function ratingColor(v: number): string {
  if (v >= 7.5) return colors.positive;
  if (v >= 5.5) return colors.gold;
  if (v >= 4) return colors.away;
  return colors.negative;
}

/** Edge in points → the colour it earns. Only a real edge gets to be green. */
export function edgeColor(pts: number): string {
  const a = Math.abs(pts);
  if (a >= 3) return colors.green;
  if (a >= 1.5) return colors.gold;
  return colors.inkDim;
}
