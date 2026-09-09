/**
 * The starting pitcher.
 *
 * Baseball is the one sport in the feed where a single player, named hours
 * before first pitch, moves the number more than anything the team ratings
 * know. Two clubs of identical Elo can be a run apart on tonight's arms alone,
 * and a market moves twenty to forty cents on a late scratch. A projection that
 * ignores the probables is not neutral about them — it is confidently wrong in
 * a direction everyone else has already priced.
 *
 * What this does *not* claim is just as important, because ERA is a bad
 * estimate of a pitcher wearing the mask of a good one:
 *
 *   • **It is heavily regressed.** A season of ERA is roughly half signal. The
 *     rest is sequencing, bullpen inheritance and the balls that happened to
 *     find gloves. Taking the observed number at face value would swing totals
 *     by more than the truth supports.
 *   • **It is halved again for the defence behind him.** ERA already contains
 *     the fielding of the team he pitches for, and that team's fielding is
 *     already inside its `defence` rating. Using the whole deviation would
 *     count the same glove twice.
 *   • **It only governs the innings he actually throws.** A modern starter goes
 *     five or six of nine; the bullpen pitches the rest and is average by
 *     construction here, because nothing in the feed grades one.
 *   • **It is capped.** A spot starter with an 8.10 ERA in four appearances is
 *     mostly noise, and no single arm is allowed to rewrite a game.
 */

/** Share of a team's innings the listed starter is expected to throw. */
const STARTER_SHARE = 0.58;

/**
 * How much of a pitcher's ERA deviation survives regression.
 *
 * Half for the noise in a season of ERA, and half again because the fielding
 * behind him is already counted in his team's defence rating. The product is
 * deliberately conservative: being a little too timid about the probables costs
 * far less than inventing an edge that is really the shortstop's.
 */
const SIGNAL = 0.5 * 0.5;

/** No arm may move a side's scoring by more than this, either way. */
const CAP = 0.18;

/** A sane league ERA to fall back on when the sample cannot supply one. */
const FALLBACK_LEAGUE_ERA = 4.1;

export interface ProbableArm {
  id: string;
  name: string;
  /** Season ERA as published, before any of the treatment above. */
  era: number | null;
}

/**
 * The league's mean starter ERA, from the arms actually listed.
 *
 * Computed from the same population the factors are measured against, so a
 * high-offence season does not read as every pitcher being bad.
 */
export function leagueEraOf(arms: Iterable<ProbableArm>): number {
  const eras = [...arms].map((a) => a.era).filter((e): e is number => e != null && e > 0 && e < 12);
  if (eras.length < 10) return FALLBACK_LEAGUE_ERA;
  return eras.reduce((s, e) => s + e, 0) / eras.length;
}

/**
 * A pitcher's factor: what he does to the runs the *other* side scores.
 *
 * 1 is a league-average arm. Below 1 suppresses scoring. Absent ERA returns
 * exactly 1, which makes an unknown pitcher a no-op rather than a guess.
 */
export function pitcherFactor(arm: ProbableArm | null | undefined, leagueEra: number): number {
  if (!arm || arm.era == null || !(arm.era > 0) || arm.era >= 12) return 1;
  const league = leagueEra > 0 ? leagueEra : FALLBACK_LEAGUE_ERA;
  const deviation = arm.era / league - 1;
  const moved = deviation * STARTER_SHARE * SIGNAL;
  return 1 + Math.max(-CAP, Math.min(CAP, moved));
}

/** How the matchup reads on a card: "Skubal (2.14) vs Gilbert (3.60)". */
export const probableLine = (arm: ProbableArm | null | undefined): string | null =>
  arm ? (arm.era != null ? `${arm.name} (${arm.era.toFixed(2)})` : arm.name) : null;

/**
 * Season ERA for every pitcher, read off the rosters the last build wrote.
 *
 * The roster stage runs after the projections in this build, so asking it for
 * an ERA mid-flight would mean either reordering the whole pipeline or fetching
 * the same numbers twice. Neither is worth it: a pitcher's season ERA moves by
 * hundredths between runs, and yesterday's file is as good an estimate as
 * today's fetch. On the very first build for a league the directory is empty,
 * the index is empty, every factor comes back 1, and the projections are
 * exactly what they were before — which is the correct way for this to fail.
 */
export function loadEraIndex(rosterDir: string, fs: typeof import('node:fs'), path: typeof import('node:path')): Map<string, number> {
  const out = new Map<string, number>();
  let files: string[];
  try { files = fs.readdirSync(rosterDir).filter((f) => f.endsWith('.json')); }
  catch { return out; }

  for (const f of files) {
    let parsed: unknown;
    try { parsed = JSON.parse(fs.readFileSync(path.join(rosterDir, f), 'utf8')); }
    catch { continue; }
    const players = (parsed as { players?: unknown[] })?.players;
    for (const raw of Array.isArray(players) ? players : []) {
      const pl = raw as { id?: unknown; stats?: { label?: string; value?: string }[] };
      if (pl?.id == null || !Array.isArray(pl.stats)) continue;
      const era = pl.stats.find((s) => /^ERA$/i.test(String(s?.label ?? '')));
      const v = Number(era?.value);
      if (Number.isFinite(v) && v > 0 && v < 12) out.set(String(pl.id), v);
    }
  }
  return out;
}
