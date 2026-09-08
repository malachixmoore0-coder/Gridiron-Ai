/**
 * The front page's cross-sport board.
 *
 * The Floor used to open on one league's single best play, which is a strange
 * first impression for an app that carries eighteen of them: a Tuesday in
 * September has baseball, two football codes and half of Europe playing, and
 * showing only whichever league you happened to leave selected hides all of it.
 *
 * So the opening screen is one pick per sport, ranked by conviction — and what
 * you can see of it is what you pay for. That gate is the product: a free
 * account gets one real, complete pick a day, which is the only honest way to
 * prove the model is worth paying for; a subscriber gets the rest.
 */
import { buildEdges, type EdgeRow } from '@/utils/edge';
import { LEAGUES, inSeason, type LeagueMeta, type SportId } from '@/sports/types';
import type { LeagueView } from '@/league/types';
import type { LiveGame } from '@/data/liveTypes';

export interface CrossPick {
  league: string;
  /** 'NFL', 'MLB', 'Premier League' — what the row is labelled with. */
  short: string;
  sport: SportId;
  accent: string;
  row: EdgeRow;
  awayAbbr: string;
  homeAbbr: string;
  /** The side and the number: "IND +3.5", or "ARS ML" where there is no line. */
  pick: string;
}

/**
 * One league per sport, chosen by the calendar.
 *
 * The registry is in flagship order, so the first in-season league of each sport
 * is the one people mean: the NFL rather than college in the autumn, the WNBA
 * rather than the NBA in September, the Premier League rather than Ligue 1.
 */
export function boardLeagues(at = new Date()): LeagueMeta[] {
  const out: LeagueMeta[] = [];
  for (const l of LEAGUES) {
    if (l.kind === 'field') continue;
    if (!inSeason(l, at)) continue;
    if (out.some((x) => x.sport === l.sport)) continue;
    out.push(l);
  }
  return out;
}

/** The side the model likes, written the way a bettor would say it. */
function pickLabel(row: EdgeRow, awayAbbr: string, homeAbbr: string): string {
  const side = row.spreadSide === 'home' ? homeAbbr : awayAbbr;
  if (row.edgeUnit === 'pct') return `${side} ML`;
  const line = row.game.homeSpread;
  if (line == null) return `${side} ML`;
  const num = row.spreadSide === 'home' ? line : -line;
  return `${side} ${num > 0 ? `+${num}` : num}`;
}

/**
 * The best open play in each of the given leagues, best first.
 *
 * A league still loading contributes nothing rather than a placeholder — the
 * board fills in as the feeds land, which is what a progressive front page
 * should do — and a league with nothing worth playing contributes nothing
 * either, because a board padded with the least bad option is a lie.
 */
export function crossSportBoard(views: LeagueView[]): CrossPick[] {
  const out: CrossPick[] = [];
  for (const view of views) {
    if (view.field || !view.games.length) continue;
    const meta = LEAGUES.find((l) => l.key === view.id);
    if (!meta) continue;

    // The league's own current slate, not its whole season: a board that ranged
    // over every fixture would advertise a game ten days out and disagree with
    // the same league's Edge Board two inches further down the page. One
    // league, one opinion.
    const open = view.weekGames.filter((g) => g.status === 'scheduled' && Date.parse(g.kickoff) > Date.now());
    const rows = buildEdges(open as unknown as LiveGame[], view.records, view.abbrOf)
      .filter((r) => !r.played && !r.live);
    const best = rows[0];
    if (!best) continue;

    const awayAbbr = view.abbrOf(best.game.awayId);
    const homeAbbr = view.abbrOf(best.game.homeId);
    out.push({
      league: view.id,
      short: view.short,
      sport: meta.sport,
      accent: meta.accent,
      row: best,
      awayAbbr,
      homeAbbr,
      pick: pickLabel(best, awayAbbr, homeAbbr),
    });
  }
  return out.sort((a, b) => b.row.conviction - a.row.conviction);
}

/**
 * Which pick a free account sees in full.
 *
 * One a day, the same one all day, a different sport tomorrow — so the free
 * tier is a real thing somebody can use rather than a teaser, and so it is
 * worth opening the app on a Tuesday. It is never the top of the board: the
 * single highest-conviction play of the day is what Starter is for, and giving
 * it away would make that rung worthless.
 */
export function freePickIndex(count: number, at = new Date()): number {
  if (count <= 1) return 0;
  const day = Math.floor(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) / 86_400_000);
  return 1 + (day % (count - 1));
}
