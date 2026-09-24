/**
 * What the graded ledger actually says.
 *
 *   npm run ledger          # every league with graded games
 *   npm run ledger -- mlb   # one of them
 *
 * The Record screen shows a user their hit rate with an interval around it.
 * This is the version for whoever is deciding what to change about the model,
 * and it asks the questions a hit rate cannot answer: is the projection biased,
 * in which direction, by how much — and, the one that decides everything, is
 * the market making the same error? A model that misses a total by a run looks
 * broken until you notice the closing line missed it by a run and a half, at
 * which point the period was strange and the model was fine. Fitting the model
 * to that period would make it worse.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GENERIC_LEAGUES } from '../src/sports/types';
import type { SportPredictionsFile, SportPredictionRecord } from '../src/sports/feed';

const DIR = path.resolve(__dirname, '../data/live/sports');

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
/** |t| for "is this mean different from zero". Above 2 is worth a second look. */
const tStat = (a: number[]) => (a.length < 2 ? 0 : Math.abs(mean(a)) / (sd(a) / Math.sqrt(a.length)));

function wilson(k: number, n: number, z = 1.96): [number, number] | null {
  if (!n) return null;
  const p = k / n, z2 = z * z, den = 1 + z2 / n;
  const c = p + z2 / (2 * n);
  const s = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return [(c - s) / den, (c + s) / den];
}
const rate = (k: number, n: number) => {
  const ci = wilson(k, n);
  return n ? `${((100 * k) / n).toFixed(1)}% [${(100 * ci![0]).toFixed(0)}–${(100 * ci![1]).toFixed(0)}]` : '—';
};

/** American odds to the probability they imply, vig and all. */
export const impliedProb = (m: number) => (m < 0 ? -m / (100 - m) : 100 / (m + 100));

/**
 * The market's honest win probability for the home side, with the hold removed.
 * Both prices are needed: one alone carries the whole vig and reads several
 * points too confident.
 */
export function marketHomeProb(home: number | null | undefined, away: number | null | undefined, draw?: number | null): number | null {
  if (home == null || away == null) return null;
  const h = impliedProb(home), a = impliedProb(away);
  const d = draw != null ? impliedProb(draw) : 0;
  const sum = h + a + d;
  return sum > 0 ? h / sum : null;
}

/** The days a subset covers, so a sample crowded into one week is visible. */
function span(rows: { kickoff: string }[]): string {
  const d = [...new Set(rows.map((r) => r.kickoff.slice(0, 10)))].sort();
  return d.length ? `${d[0]} to ${d[d.length - 1]}, ${d.length} day${d.length === 1 ? '' : 's'}` : '—';
}

function report(slug: string, short: string): boolean {
  const file = path.join(DIR, slug, 'predictions.json');
  if (!fs.existsSync(file)) return false;
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as SportPredictionsFile;
  const g = (data.records ?? []).filter((r): r is SportPredictionRecord & { result: NonNullable<SportPredictionRecord['result']> } => !!r.result);
  if (!g.length) return false;

  const n = g.length;
  const days = new Set(g.map((r) => r.kickoff.slice(0, 10)));
  console.log(`\n${'='.repeat(64)}\n${short} — ${n} graded across ${days.size} day${days.size === 1 ? '' : 's'}   (written ${(data.generatedAt ?? '?').slice(0, 10)})\n${'='.repeat(64)}`);

  const su = g.filter((r) => r.result.suCorrect).length;
  const atsW = g.filter((r) => r.result.ats === 'win').length, atsL = g.filter((r) => r.result.ats === 'loss').length;
  const ouW = g.filter((r) => r.result.ou === 'win').length, ouL = g.filter((r) => r.result.ou === 'loss').length;
  console.log(`  straight up  ${su}-${n - su}  ${rate(su, n)}`);
  console.log(`  vs spread    ${atsW}-${atsL}  ${rate(atsW, atsW + atsL)}`);
  console.log(`  over/under   ${ouW}-${ouL}  ${rate(ouW, ouW + ouL)}`);
  console.log(`  Brier        ${mean(g.map((r) => r.result.brier)).toFixed(4)}   (0.25 = a coin)`);

  // Bias. A mean error far from zero is the model leaning one way every night.
  const se = g.map((r) => r.result.spreadError), te = g.map((r) => r.result.totalError);
  const flag = (t: number) => (t > 2 ? '  <-- worth a look' : '');
  console.log(`\n  over all ${n} graded games:`);
  console.log(`  margin  bias ${mean(se).toFixed(2).padStart(6)}  MAE ${mean(se.map(Math.abs)).toFixed(2)}  |t| ${tStat(se).toFixed(2)}${flag(tStat(se))}`);
  console.log(`  total   bias ${mean(te).toFixed(2).padStart(6)}  MAE ${mean(te.map(Math.abs)).toFixed(2)}  |t| ${tStat(te).toFixed(2)}${flag(tStat(te))}`);

  /*
   * The control. Any bias the closing line shares is the period, not us —
   * chasing it would fit the model to a fortnight of weather and blowouts.
   */
  const wt = g.filter((r) => r.marketTotal != null);
  if (wt.length > 10) {
    const actual = mean(wt.map((r) => r.result.homeScore + r.result.awayScore));
    const market = mean(wt.map((r) => r.marketTotal as number));
    const model = mean(wt.map((r) => r.projectedHome + r.projectedAway));
    /*
     * Say which games these are. Only some carry a closing line, and that
     * subset is not the whole ledger — on the first run of this the
     * market-priced games averaged 9.47 runs against 8.79 across everything
     * graded, so the same model read as 0.9 runs low here and 0.2 low above.
     * Two numbers from two populations printed side by side invite exactly the
     * wrong conclusion, which is the conclusion this tool exists to prevent.
     */
    console.log(`\n  totals over the ${wt.length} game${wt.length === 1 ? '' : 's'} with a closing line (of ${n} graded)`);
    console.log(`           those games: ${span(wt)}   |   all graded: ${span(g)}`);
    console.log(`           actual ${actual.toFixed(2)} · market ${market.toFixed(2)} (${(market - actual).toFixed(2)}) · model ${model.toFixed(2)} (${(model - actual).toFixed(2)})`);
    const mMae = mean(wt.map((r) => Math.abs((r.marketTotal as number) - (r.result.homeScore + r.result.awayScore))));
    const oMae = mean(wt.map((r) => Math.abs(r.projectedHome + r.projectedAway - (r.result.homeScore + r.result.awayScore))));
    console.log(`           MAE market ${mMae.toFixed(2)} vs model ${oMae.toFixed(2)}  →  ${oMae < mMae ? 'model closer' : 'market closer'}`);
    if (Math.sign(market - actual) === Math.sign(model - actual) && Math.abs(market - actual) >= Math.abs(model - actual)) {
      console.log('           the market missed the same way, by at least as much — this is the period, not the model');
    }
  }

  /*
   * Margins, but only where the spread is a forecast. Baseball and hockey sell
   * one fixed line -- every game is -1.5 or +1.5 -- so scoring the model
   * against it measures nothing but how often a home team wins by two, and the
   * model "beats" it every time by simply not guessing 1.5 every night. What
   * the market actually expected is in the moneyline, below.
   */
  const wl = g.filter((r) => r.marketHomeSpread != null);
  const fixedLine = new Set(wl.map((r) => Math.abs(r.marketHomeSpread as number))).size === 1;
  if (wl.length > 10 && !fixedLine) {
    const mMae = mean(wl.map((r) => Math.abs(-(r.marketHomeSpread as number) - (r.result.homeScore - r.result.awayScore))));
    const oMae = mean(wl.map((r) => Math.abs(-r.spread - (r.result.homeScore - r.result.awayScore))));
    console.log(`  margins  MAE market ${mMae.toFixed(2)} vs model ${oMae.toFixed(2)}  →  ${oMae < mMae ? 'model closer' : 'market closer'}`);
  } else if (wl.length > 10) {
    console.log(`  margins  no comparison: this league's spread is a fixed ±${Math.abs(wl[0].marketHomeSpread as number)} line, not a forecast`);
  }

  /*
   * The comparison that counts. Brier against the market's own de-vigged
   * probability, on the same games, is the only one of these that says whether
   * the model knows something the price does not.
   */
  const wm = g
    .map((r) => ({ r, p: marketHomeProb(r.marketHomeMoneyline, r.marketAwayMoneyline, r.marketDrawMoneyline) }))
    .filter((x): x is { r: typeof g[number]; p: number } => x.p != null);
  if (wm.length > 10) {
    const won = (r: typeof g[number]) => (r.result.homeScore > r.result.awayScore ? 1 : r.result.homeScore < r.result.awayScore ? 0 : 0.5);
    const mBrier = mean(wm.map((x) => (x.p - won(x.r)) ** 2));
    const oBrier = mean(wm.map((x) => (x.r.homeWinPct / 100 - won(x.r)) ** 2));
    const gap = oBrier - mBrier;
    console.log(`\n  win probability over the ${wm.length} game${wm.length === 1 ? '' : 's'} with both moneylines  (${span(wm.map((x) => x.r))})`);
    console.log(`           Brier market ${mBrier.toFixed(4)} vs model ${oBrier.toFixed(4)}  →  ${gap < 0 ? 'model sharper' : 'market sharper'} by ${Math.abs(gap).toFixed(4)}`);
    const agree = mean(wm.map((x) => Math.abs(x.r.homeWinPct / 100 - x.p)));
    console.log(`           the model sits ${(100 * agree).toFixed(1)} points from the price on an average game`);
  } else if (g.some((r) => r.marketTotal != null)) {
    console.log('\n  win probability  no moneylines stored on these games — the market cannot be scored yet');
  }

  // Calibration. Does a number the model says mean what it says?
  console.log('\n  when the model said        it happened');
  for (const [lo, hi] of [[50, 55], [55, 60], [60, 65], [65, 70], [70, 80], [80, 101]] as const) {
    const b = g.filter((r) => { const f = Math.max(r.homeWinPct, r.awayWinPct); return f >= lo && f < hi; });
    if (b.length < 5) continue;
    const w = b.filter((r) => r.result.suCorrect).length;
    const said = mean(b.map((r) => Math.max(r.homeWinPct, r.awayWinPct)));
    const got = (100 * w) / b.length;
    console.log(`  ${`${lo}–${hi}%`.padEnd(9)} n=${String(b.length).padStart(4)}  said ${said.toFixed(1)}%   got ${got.toFixed(1)}%   ${(got - said >= 0 ? '+' : '') + (got - said).toFixed(1)}`);
  }

  // The honest caveat, every time, sized to the sample.
  const verdict = n >= 600 ? 'enough to separate a real edge from luck'
    : n >= 100 ? 'enough to spot something badly broken, not enough to prove something good'
    : 'far too few to judge anything — read the intervals, not the headline';
  console.log(`\n  ${n} games: ${verdict}.`);
  return true;
}

/** Guarded so the odds helpers above can be imported by the engine checks. */
if (require.main === module) {
  const want = process.argv.slice(2).map((s) => s.toLowerCase());
  let any = false;
  for (const l of GENERIC_LEAGUES) {
    if (want.length && !want.includes(l.key)) continue;
    if (report(l.slug, l.short)) any = true;
  }
  if (!any) console.log('Nothing graded yet' + (want.length ? ` for ${want.join(', ')}` : '') + '.');
}
