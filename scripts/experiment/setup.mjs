// Creates a trial project from examples/sample-node-cli with the kit installed
// and committed on main, exactly as section 1 of docs/experiment-log.md does by hand.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { KIT_ROOT, init } from '../../installer/init.mjs';
import { createConsoleIO } from '../../installer/io.mjs';

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${result.stderr}`);
}

export function nextTrialDir(date = new Date().toISOString().slice(0, 10)) {
  const base = path.join(KIT_ROOT, '.sandbox', `try-${date}`);
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base}-${n}`;
  return dir;
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
