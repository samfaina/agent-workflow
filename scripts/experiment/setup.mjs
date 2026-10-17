// Creates a trial project from examples/sample-node-cli with the kit installed
// and committed on main, exactly as section 1 of docs/experiment-log.md does by hand.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { KIT_ROOT, init } from '../../installer/init.mjs';
import { createConsoleIO } from '../../installer/io.mjs';

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${result.stderr}`);
}

// The run being prepared: the highest N among docs/experiments/run-N.md.
export function currentRun(root = KIT_ROOT) {
  const dir = path.join(root, 'docs', 'experiments');
  const numbers = existsSync(dir)
    ? readdirSync(dir).map((f) => /^run-(\d+)\.md$/.exec(f)?.[1]).filter(Boolean).map(Number)
    : [];
  return numbers.length ? Math.max(...numbers) : 1;
}

// A second trial of the same run goes to run-N-2, run-N-3...
export function nextTrialDir(run = currentRun(), root = KIT_ROOT) {
  const base = path.join(root, '.sandbox', `run-${run}`);
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base}-${n}`;
  return dir;
}

// Name of the results file for a trial folder: run-N for every trial of run N.
export function resultsName(dir) {
  const name = path.basename(dir);
  return /^run-\d+/.exec(name)?.[0] ?? name;
}

export async function setupTrial({ dir = nextTrialDir(), language = 'Spanish', checkCommand = 'npm test' } = {}) {
  if (existsSync(dir)) throw new Error(`${dir} already exists. Pick another folder.`);
  cpSync(path.join(KIT_ROOT, 'examples', 'sample-node-cli'), dir, { recursive: true });
  git(['init', '-q', '-b', 'main'], dir);
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', 'chore: initial sample project'], dir);
  git(['switch', '-q', '-c', 'chore/install-agent-workflow'], dir);

  const io = createConsoleIO({ yes: true });
  try {
    await init({ projectDir: dir, io, language, checkCommand, optional: 'none', nextSteps: false });
  } finally {
    io.close();
  }

  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', 'chore: install agent-workflow'], dir);
  git(['switch', '-q', 'main'], dir);
  git(['merge', '-q', '--ff-only', 'chore/install-agent-workflow'], dir);
  return dir;
}
