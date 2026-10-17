#!/usr/bin/env node
// Automates the checks of docs/experiment-log.md.
//
//   node scripts/experiment.mjs setup [dir]            create a trial project with the kit installed
//   node <kit>/scripts/experiment.mjs check <step> [change]   run inside the trial project after a step
//
// Steps: setup, spec, tickets, implement, close. Results are printed and appended
// to .sandbox/results/run-N.md in the kit, where N comes from the trial folder .sandbox/run-N.
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { KIT_ROOT } from '../installer/init.mjs';
import { checkClose, checkImplement, checkSetup, checkSpec, checkTickets } from './experiment/checks.mjs';
import { resultsName, setupTrial } from './experiment/setup.mjs';

const STEPS = { setup: checkSetup, spec: checkSpec, tickets: checkTickets, implement: checkImplement, close: checkClose };
const MARK = { ok: '[ok]  ', fail: '[FAIL]', skip: '[skip]' };
// Forward slashes: `!` in Claude Code runs commands in Git Bash, which drops backslashes.
const CHECKER = path.join(KIT_ROOT, 'scripts', 'experiment.mjs').replace(/\\/g, '/');

function usage() {
  console.log(`Usage:
  node scripts/experiment.mjs setup [dir]
  node <kit>/scripts/experiment.mjs check <${Object.keys(STEPS).join('|')}> [change]

Run "check" from inside the trial project, for example in Claude Code:
  ! node ${CHECKER} check spec remove-todo`);
}

function record(dir, step, change, items) {
  const resultsDir = path.join(KIT_ROOT, '.sandbox', 'results');
  mkdirSync(resultsDir, { recursive: true });
  const file = path.join(resultsDir, `${resultsName(dir)}.md`);
  const lines = items.map((i) => `- ${MARK[i.status].trim()} ${i.label}${i.detail ? `: ${i.detail.split('\n')[0]}` : ''}`);
  appendFileSync(file, `\n## ${step}${change ? ` ${change}` : ''} (${path.basename(dir)}, ${new Date().toISOString()})\n\n${lines.join('\n')}\n`);
  return file;
}

const [command, ...rest] = process.argv.slice(2);

if (command === 'setup') {
  try {
    const dir = await setupTrial(rest[0] ? { dir: path.resolve(rest[0]) } : {});
    console.log(`\nTrial project ready: ${dir}\nNext:\n  cd "${dir}"\n  claude\nThen in Claude Code:\n  ! node "${CHECKER}" check setup`);
  } catch (error) {
    console.error(`experiment setup: ${error.message}`);
    process.exitCode = 1;
  }
} else if (command === 'check' && STEPS[rest[0]]) {
  const [step, change] = rest;
  if (step !== 'setup' && !change) {
    console.error(`The ${step} check needs the change name, for example: check ${step} remove-todo`);
    process.exitCode = 1;
  } else {
    const dir = process.cwd();
    const items = STEPS[step](dir, change);
    for (const item of items) {
      console.log(`${MARK[item.status]} ${item.label}`);
      if (item.detail) console.log(item.detail.split('\n').map((l) => `         ${l}`).join('\n'));
    }
    const failed = items.filter((i) => i.status === 'fail').length;
    const skipped = items.filter((i) => i.status === 'skip').length;
    console.log(`\n${items.length - failed - skipped} ok, ${failed} failed, ${skipped} skipped. Saved to ${record(dir, step, change, items)}`);
    process.exitCode = failed ? 1 : 0;
  }
} else {
  usage();
  if (command) process.exitCode = 1;
}
