/**
 * Which leagues can honestly carry a 70% tier.
 *
 *   npm run conviction            # every league
 *   npm run conviction -- mlb
 *
 * Two numbers per league, and the second is the one that counts. The first is the
 * tier chosen on the whole graded record, which is what would be shipped. The
 * second picks the threshold on the first half of the season and reports how it
 * did on the second, which never had a vote. Where those two disagree, believe
 * the second.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GENERIC_LEAGUES } from '../src/sports/types';
import { bestAvailable, computeConviction, gradedOnly, picksToCertify, validateForward } from '../pipeline/multi/conviction';
import type { SportPredictionsFile } from '../src/sports/feed';

const DIR = path.resolve(__dirname, '../data/live/sports');
const TARGET = Number(process.env.CONVICTION_TARGET ?? 0.7);

let any = false;
const want = process.argv.slice(2).map((s) => s.toLowerCase());
console.log(`\nTarget: a ${(100 * TARGET).toFixed(0)}% hit rate whose 95% interval clears it.\n`);
console.log('league   graded   tier                                   held up on later games');
console.log('-'.repeat(88));
for (const l of GENERIC_LEAGUES) {
  if (want.length && !want.includes(l.key)) continue;
  const file = path.join(DIR, l.slug, 'predictions.json');
  if (!fs.existsSync(file)) continue;
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as SportPredictionsFile;
  const c = computeConviction(data.records ?? [], TARGET, new Date().toISOString());
  if (!c.graded) continue;
  any = true;
  const tier = c.threshold == null
    ? c.note
    : `${c.threshold}%+  ->  ${c.wins}-${c.picks - c.wins}  ${c.hitRate}% (floor ${c.floor}%)  ${c.coverage}% of slate`;
  const v = validateForward(data.records ?? [], TARGET);
  const held = v.chosen == null
    ? 'not enough history to split'
    : v.testPicks < 10
      ? `${v.chosen}%+ chosen, only ${v.testPicks} later games to judge on`
      : `${v.chosen}%+ -> ${v.testWins}-${v.testPicks - v.testWins}  ${v.testRate}%`;
  console.log(`${l.short.padEnd(8)} ${String(c.graded).padStart(5)}   ${tier.padEnd(38)} ${held}`);

  // What is actually on offer, and what it would take to stand behind it.
  if (c.threshold == null) {
    const b = bestAvailable(gradedOnly(data.records ?? []), 20);
    if (b) {
      const need = picksToCertify(b.rate / 100, TARGET);
      const cover = Math.round((100 * b.picks) / c.graded);
      console.log(`         best on offer: ${b.threshold}%+  ${b.wins}-${b.picks - b.wins}  ${b.rate}%  [floor ${b.floor}%]  ${cover}% of slate`
        + (need ? `  — proving it beats ${(100 * TARGET).toFixed(0)}% needs ~${need} picks at that level (have ${b.picks})` : '  — below target, nothing to prove'));
    }
  }
}
if (!any) console.log('Nothing graded yet.');
console.log('\nCoverage is not a flaw to hide. A tier that hits 73% on three games in ten is');
console.log('an honest product; the same tier sold as "our picks hit 73%" is not.');
