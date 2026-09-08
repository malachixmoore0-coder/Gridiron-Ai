/**
 * A probe's findings, written somewhere they can actually be read.
 *
 * These scripts only run in CI, because CI is the only place that can reach
 * ESPN or a school's website — and a CI log is a poor way to read a long
 * answer: the tail is all you get, and half of it is git cleanup. So a probe
 * also writes its output to a file under data/live/probe, which the workflow
 * commits like any other dataset. The whole report then arrives with a pull.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(__dirname, '../../data/live/probe');

export interface Report {
  log: (line?: string) => void;
  flush: () => void;
}

/**
 * How long a probe may run before it is made to hand in what it has.
 *
 * These scripts talk to a few dozen strangers' servers and one of them will
 * eventually accept a connection and go quiet in a way no per-request timeout
 * catches. Better a partial report than a runner held until it is killed.
 */
const DEADLINE_MS = Number(process.env.PROBE_DEADLINE_MS ?? 15 * 60_000);

export function report(name: string): Report {
  const lines: string[] = [`# ${name} — ${new Date().toISOString()}`, ''];
  const write = () => {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, `${name}.txt`), `${lines.join('\n')}\n`);
  };
  const bomb = setTimeout(() => {
    lines.push('', `-- gave up after ${Math.round(DEADLINE_MS / 60_000)} minutes --`);
    console.error(`${name}: deadline reached, writing what we have`);
    write();
    process.exit(3);
  }, DEADLINE_MS);

  return {
    log: (line = '') => { lines.push(line); console.log(line); },
    flush: () => { clearTimeout(bomb); write(); },
  };
}
