/**
 * Who is actually in a league.
 *
 * ESPN's team list is not reliably right about that. It returned a Premier
 * League containing Coventry, Hull and Ipswich -- none of whom play in it -- and
 * no Burnley, West Ham or Wolves. Because a fixture was kept only when both of
 * its sides were on that list, every game those three clubs played was silently
 * discarded: fifty-three of them. The same fault hit five other competitions,
 * two or three clubs each, an entire season of their matches missing, and the
 * only visible symptom was a thinner board than there should have been.
 *
 * A fixture list is the better authority on membership. A club that turns up in
 * seventeen league games is in the league, whatever the roster call says.
 *
 * An unfilled bracket slot is the one thing that must not be adopted. A playoff
 * fixture whose side is still "TBD" is a real game with nobody in it yet;
 * inventing a club by that name would put a fake team in the ratings, on the
 * standings and on the board. Those are reported separately, because a fixture
 * waiting on a bracket is exactly what somebody looking for the playoffs wants
 * to see.
 */
import type { EspnEvent, EspnSide, EspnTeamRow } from './espn';

export interface Reconciled {
  /** Clubs the fixtures know and the team list left out. */
  adopted: EspnTeamRow[];
  /** Clubs on the team list that play nobody all season. */
  ghosts: EspnTeamRow[];
  /** Fixtures with a slot still to be filled. */
  pending: { date: string; label: string }[];
}

const fromSide = (t: EspnSide): EspnTeamRow => ({
  id: t.id,
  abbr: t.abbr,
  name: t.name,
  short: t.short,
  group: '',
  colors: t.colors,
  logoUrl: t.logoUrl,
  record: null,
  rank: null,
});

/**
 * `ghostsAfter` guards the other half of this: a league whose season has not
 * started has every team in no fixture at all, and calling them all phantoms
 * would empty the board. Only worth asking once there are fixtures to judge by.
 */
export function reconcileMembers(teams: EspnTeamRow[], events: EspnEvent[], ghostsAfter = 40): Reconciled {
  const known = new Set(teams.map((t) => t.id));
  const adopted = new Map<string, EspnTeamRow>();
  const pending: { date: string; label: string }[] = [];

  for (const e of events) {
    for (const side of [e.home, e.away]) {
      if (side.placeholder || !side.id) continue;
      if (known.has(side.id) || adopted.has(side.id)) continue;
      adopted.set(side.id, fromSide(side));
    }
    if (e.home.placeholder || e.away.placeholder) {
      pending.push({ date: e.date.slice(0, 10), label: `${e.away.name} @ ${e.home.name}` });
    }
  }

  const seen = new Set(events.flatMap((e) => [e.home.id, e.away.id]));
  const ghosts = events.length > ghostsAfter ? teams.filter((t) => !seen.has(t.id)) : [];

  return { adopted: [...adopted.values()], ghosts, pending };
}
