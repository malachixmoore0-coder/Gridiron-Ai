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

export function report(name: string): Report {
  const lines: string[] = [`# ${name} — ${new Date().toISOString()}`, ''];
  return {
    log: (line = '') => { lines.push(line); console.log(line); },
    flush: () => {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(path.join(DIR, `${name}.txt`), `${lines.join('\n')}\n`);
    },
  };
}
