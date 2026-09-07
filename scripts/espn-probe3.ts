/**
 * Can we reach a school's own roster page?
 *
 * ESPN has no photograph for a college baseball player anywhere — not on the
 * team roster and not on the athlete's own record; a run over twelve hundred of
 * them found exactly zero. The remaining source is the school's athletics site,
 * which needs its domain, so this asks what ESPN actually knows about a team
 * beyond its own pages.
 */
import process from 'node:process';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const CORE = 'https://sports.core.api.espn.com/v2/sports';

async function json(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

const peek = (label: string, v: unknown, n = 900) =>
  console.log(`  ${label}:`, String(JSON.stringify(v)).slice(0, n));

async function main() {
  const path = process.argv[2] ?? 'baseball/college-baseball';
  const list = await json(`${SITE}/${path}/teams?limit=5`);
  const teams = (list?.sports?.[0]?.leagues?.[0]?.teams ?? []).slice(0, 3);

  for (const wrap of teams) {
    const t = wrap?.team;
    console.log(`\n=== ${t?.displayName} (${t?.id})`);
    const detail = await json(`${SITE}/${path}/teams/${t?.id}`);
    const team = detail?.team ?? t;
    peek('links', (team?.links ?? []).map((l: any) => ({ rel: l?.rel, href: l?.href, text: l?.text })), 1100);
    peek('keys', Object.keys(team ?? {}));

    const [sport, league] = path.split('/');
    const core = await json(`${CORE}/${sport}/leagues/${league}/teams/${t?.id}`);
    peek('core keys', Object.keys(core ?? {}));
    peek('core links', (core?.links ?? []).map((l: any) => ({ rel: l?.rel, href: l?.href })), 700);

    // And one athlete, in full, to see every field ESPN holds on them.
    const roster = await json(`${SITE}/${path}/teams/${t?.id}/roster`);
    const raw: any[] = [];
    for (const e of roster?.athletes ?? []) { if (Array.isArray(e?.items)) raw.push(...e.items); else raw.push(e); }
    const a = raw[0];
    if (a) {
      peek('athlete keys', Object.keys(a));
      peek('athlete links', (a?.links ?? []).map((l: any) => l?.href), 500);
      const full = await json(`${CORE}/${sport}/leagues/${league}/athletes/${a.id}`);
      peek('core athlete keys', Object.keys(full ?? {}));
      peek('core athlete headshot', full?.headshot ?? null, 200);
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
