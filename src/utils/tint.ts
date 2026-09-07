/**
 * A team colour laid over the app's ground.
 *
 * Team pages are supposed to feel like that team's page without becoming
 * unreadable, so the colour is mixed toward the Vault background rather than
 * used at full strength. Three screens wanted this and had their own copy;
 * this is the one they share.
 */
import { colors } from '@/theme';

/** Base ground, in the same order as the theme's bg. */
const GROUND: [number, number, number] = [11, 23, 32];

export function tintOver(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return colors.card;
  const n = parseInt(m[1], 16);
  const mix = (c: number, base: number) => Math.round(c * amount + base * (1 - amount));
  return `rgb(${mix((n >> 16) & 255, GROUND[0])}, ${mix((n >> 8) & 255, GROUND[1])}, ${mix(n & 255, GROUND[2])})`;
}
