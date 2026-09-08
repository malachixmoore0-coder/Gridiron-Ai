/**
 * Put the forecast back into a simulation.
 *
 * Weather is a real term in the model, not a decoration: the Environment node
 * moves the projected total by up to four points and swings the margin toward
 * whichever side is less pass-dependent. The published predictions use it, and
 * so does the Slate.
 *
 * Every other launch point did not. `weather: 'auto'` was passed as a literal
 * from the Edge Board, the game screens and the Record rows, and 'auto' means
 * "no answer" to the engine, which then falls back to clear skies — or a dome
 * if the stadium has a roof. So the number on the Edge Board came from a
 * prediction computed *with* the snow, and tapping Simulate on that same row
 * re-ran it *without*, quietly handing back a total four points higher than the
 * one that put the game on the board.
 *
 * Resolving it here means it happens once, at the single funnel every
 * simulation already goes through, instead of at eight call sites that have to
 * remember. An explicit choice — a user picking "Wind" on the matchup screen —
 * is left exactly as it is: 'auto' is the only value that means "look it up".
 */
import type { LeagueView } from '@/league/types';

interface HasContext {
  awayId: string;
  homeId: string;
  ctx: unknown;
}

/** Fill in `ctx.weather` from the game's forecast when it was left on 'auto'. */
export function withForecast<T extends HasContext>(req: T, view: LeagueView | null | undefined): T {
  const ctx = req.ctx as { weather?: unknown } | null;
  if (!ctx || ctx.weather !== 'auto' || !view) return req;

  const game = view.games.find((g) => g.awayId === req.awayId && g.homeId === req.homeId);
  const hint = game?.weatherHint;
  // A dome is already the engine's own fallback for a roofed stadium, so there
  // is nothing to override; null means the feed had no forecast for this game.
  if (!hint || hint === 'dome') return req;

  return { ...req, ctx: { ...ctx, weather: hint } };
}
