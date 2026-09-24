/**
 * Does the build still tell a dead feed from a quiet one?
 *
 *   npm run test:feed
 *
 * This is the regression that matters most in the pipeline and the one no
 * amount of typechecking catches: for nine days every league returned nothing,
 * every workflow went green, and the app served a stale board. The failure was
 * not in any calculation — it was that two different facts collapsed into one
 * empty array and the build picked the reassuring interpretation.
 *
 * So the three cases are pinned here against a fake scoreboard: the feed
 * refusing, the feed answering with no games, and the feed answering with some.
 */
import { loadRange, ScoreboardUnavailable } from '../pipeline/multi/espn';

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures += 1;
};

const realFetch = globalThis.fetch;
const stub = (mode: 'dead' | 'empty' | 'games') => {
  globalThis.fetch = (async () => {
    if (mode === 'dead') return { ok: false, status: 503, json: async () => ({}) } as Response;
    const events = mode === 'games'
      ? [{ id: '1', date: '2026-09-20T23:05Z', competitions: [{ date: '2026-09-20T23:05Z', status: { type: { state: 'pre', completed: false } },
          venue: { fullName: 'Park', address: { city: 'Town' } },
          competitors: [{ homeAway: 'home', team: { id: '10', abbreviation: 'HOM' } }, { homeAway: 'away', team: { id: '20', abbreviation: 'AWY' } }] }] }]
      : [];
    return { ok: true, status: 200, json: async () => ({ events }) } as Response;
  }) as typeof fetch;
};

const from = new Date('2026-09-18T00:00:00Z');
const to = new Date('2026-09-24T00:00:00Z');

(async () => {
  stub('dead');
  const dead = await loadRange('baseball/mlb', from, to);
  check(dead.failed > 0, 'a refusing feed is reported as failed, not as no games');
  check(dead.events.length === 0, 'a refusing feed yields no events');

  stub('empty');
  const quiet = await loadRange('baseball/mlb', from, to);
  check(quiet.failed === 0, 'a feed that answers with no games is NOT reported as failed');
  check(quiet.events.length === 0, 'a quiet day yields no events');

  stub('games');
  const live = await loadRange('baseball/mlb', from, to);
  check(live.failed === 0 && live.events.length === 1, 'a normal day yields its games and no failures');

  // The distinction the nine days turned on.
  check(dead.failed !== quiet.failed, 'a dead feed and a quiet day are now distinguishable');

  globalThis.fetch = realFetch;
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll feed checks passed.');
  if (failures) process.exitCode = 1;
})();
