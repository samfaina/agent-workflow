import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatRoadmap, readStatus } from '../hooks/status.mjs';

const STATUS = fileURLToPath(new URL('../hooks/status.mjs', import.meta.url));

const GREETING = `# Tasks

## 1. Parse the name argument

Blocked by: none

What to build: the CLI reads a name.

- [x] 1.1 \`greet Ana\` reads "Ana"; verified by a CLI test

## 2. Greet the user by name

Blocked by: 1

What to build: the greeting uses the name.

- [x] 2.1 \`greet Ana\` prints "Hello, Ana"; verified by a CLI test
- [x] 2.2 \`greet\` prints "Hello, world"; verified by a CLI test
- Note: wording agreed with the user

## 3. Remember the last name

Blocked by: 2

What to build: the CLI remembers the last name.

- [x] 3.1 the name is saved; verified by a CLI test
- [ ] 3.2 \`greet\` reuses it; verified by a CLI test

## 4. Manual test

Blocked by: 1, 2, 3

What to build: a human checks it.

- [ ] 4.1 Run \`greet Ana\` then \`greet\`: both print "Hello, Ana"
`;

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function write(dir, file, content) {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), content);
}

// A git repository with the kit installed and one commit on main.
function installedProject({ changes = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aw-status-'));
  git(dir, 'init', '--quiet', '--initial-branch=main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  write(dir, '.claude/agent-workflow.json', '{ "protectedBranches": ["main", "master"] }\n');
  write(dir, 'openspec/config.yaml', 'schema: spec-driven\n');
  for (const [change, tasks] of Object.entries(changes)) {
    write(dir, `openspec/changes/${change}/proposal.md`, `# ${change}\n`);
    if (tasks !== null) write(dir, `openspec/changes/${change}/tasks.md`, tasks);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '--quiet', '-m', 'chore: set up');
  return dir;
}

describe('status of one change', () => {
  it('marks done, frontier and blocked tickets, with the blockers still open', () => {
    const status = readStatus(installedProject({ changes: { 'add-greeting': GREETING } }));
    const [change] = status.changes;
    assert.equal(change.name, 'add-greeting');
    assert.equal(change.stage, 'tickets-open');
    assert.deepEqual(change.tickets.map((t) => [t.number, t.title, t.state, t.waitingOn]), [
      [1, 'Parse the name argument', 'done', []],
      [2, 'Greet the user by name', 'done', []],
      [3, 'Remember the last name', 'frontier', []],
      [4, 'Manual test', 'blocked', [3]],
    ]);
    assert.equal(change.frontier, 3);
    assert.equal(change.next, '/implement add-greeting#3');
    assert.deepEqual([change.ticketsDone, change.ticketsTotal, change.criteriaDone, change.criteriaTotal], [2, 4, 4, 6]);
    assert.equal(status.state, 'tickets-open');
    assert.equal(status.next, '/implement add-greeting#3');
  });

  it('treats a legacy group without Blocked by as blocked by the group before it', () => {
    const legacy = '## 1. Setup\n\n- [x] 1.1 a\n\n## 2. Core\n\n- [ ] 2.1 b\n\n## 3. Tests\n\n- [ ] 3.1 c\n';
    const [change] = readStatus(installedProject({ changes: { 'add-legacy': legacy } })).changes;
    assert.deepEqual(change.tickets.map((t) => [t.number, t.state, t.blockedBy, t.waitingOn]), [
      [1, 'done', [], []],
      [2, 'frontier', [1], []],
      [3, 'blocked', [2], [2]],
    ]);
  });

  it('counts indented and unnumbered boxes, as OpenSpec does', () => {
    const tasks = '## 1. A\n\nBlocked by: none\n\n- [x] 1.1 a\n  - [ ] a nested step\n* [x] starred\n\n## 2. B\n\nBlocked by: 1\n\n- [ ] 2.1 b\n';
    const [change] = readStatus(installedProject({ changes: { 'add-steps': tasks } })).changes;
    assert.deepEqual([change.criteriaDone, change.criteriaTotal], [2, 4]);
    assert.deepEqual(change.tickets.map((t) => t.state), ['frontier', 'blocked'], 'an unticked nested step keeps its ticket open');
  });

  it('shows an unblocked ticket after the frontier as ready', () => {
    const tasks = '## 1. A\n\nBlocked by: none\n\n- [ ] 1.1 a\n\n## 2. B\n\nBlocked by: none\n\n- [ ] 2.1 b\n';
    const [change] = readStatus(installedProject({ changes: { 'add-two': tasks } })).changes;
    assert.deepEqual(change.tickets.map((t) => t.state), ['frontier', 'ready']);
  });

  it('asks for tickets when the change has no tasks.md', () => {
    const status = readStatus(installedProject({ changes: { 'add-greeting': null } }));
    assert.equal(status.state, 'no-tickets');
    assert.deepEqual(status.changes[0].tickets, []);
    assert.equal(status.changes[0].frontier, null);
    assert.equal(status.next, '/to-tickets add-greeting');
  });

  it('asks to close a change whose boxes are all ticked', () => {
    const status = readStatus(installedProject({ changes: { 'add-greeting': GREETING.replace(/- \[ \]/g, '- [x]') } }));
    assert.equal(status.state, 'finished');
    assert.equal(status.changes[0].frontier, null);
    assert.deepEqual([status.changes[0].ticketsDone, status.changes[0].ticketsTotal], [4, 4]);
    assert.equal(status.next, '/close-change add-greeting');
  });
});

describe('status of several changes', () => {
  const changes = { 'add-export': null, 'add-greeting': GREETING, 'fix-login': GREETING.replace(/- \[ \]/g, '- [x]') };

  it('lists every active change, in name order, none marked off a change branch', () => {
    const status = readStatus(installedProject({ changes }));
    assert.equal(status.branch, 'main');
    assert.deepEqual(status.changes.map((c) => [c.name, c.stage, c.current]), [
      ['add-export', 'no-tickets', false],
      ['add-greeting', 'tickets-open', false],
      ['fix-login', 'finished', false],
    ]);
    assert.equal(status.state, 'no-tickets', 'the stage of the first change listed');
  });

  it('puts the change of the current branch first, marked', () => {
    const dir = installedProject({ changes });
    git(dir, 'switch', '--quiet', '-c', 'change/fix-login');
    const status = readStatus(dir);
    assert.equal(status.branch, 'change/fix-login');
    assert.deepEqual(status.changes.map((c) => [c.name, c.current]), [
      ['fix-login', true],
      ['add-export', false],
      ['add-greeting', false],
    ]);
    assert.equal(status.next, '/close-change fix-login', 'the next command of the change in hand');
  });
});

describe('states of the repository', () => {
  it('reports a project without the kit as not installed', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'aw-status-'));
    git(dir, 'init', '--quiet');
    const status = readStatus(dir);
    assert.equal(status.state, 'not-installed');
    assert.equal(status.next, 'npx github:samfaina/agent-workflow init');
  });

  it('names the files changed outside a change, GLOSSARY.md and docs/adr/', () => {
    const dir = installedProject({ changes: { 'add-greeting': GREETING } });
    write(dir, 'src/cli.js', 'x\n');
    write(dir, 'openspec/changes/add-greeting/design.md', 'x\n');
    write(dir, 'GLOSSARY.md', 'x\n');
    write(dir, 'docs/adr/0001-x.md', 'x\n');
    const status = readStatus(dir);
    assert.equal(status.state, 'stray-files');
    assert.deepEqual(status.strayFiles, ['src/cli.js']);
    assert.equal(status.next, null, 'committing or stashing is the user\'s call');
    assert.equal(status.changes[0].next, '/implement add-greeting#3', 'the changes are still listed');
  });

  it('reports lost context when only the glossary or an ADR changed and no change exists', () => {
    const dir = installedProject();
    write(dir, 'GLOSSARY.md', 'x\n');
    const status = readStatus(dir);
    assert.equal(status.state, 'context-lost');
    assert.equal(status.next, '/grill-with-docs');
  });

  it('reports nothing in flight on a clean project with no change', () => {
    const status = readStatus(installedProject());
    assert.equal(status.state, 'nothing-in-flight');
    assert.deepEqual(status.changes, []);
    assert.equal(status.next, '/grill-with-docs');
  });

  // A change archived on its branch, which is not merged into main yet.
  function archivedOnBranch() {
    const dir = installedProject();
    git(dir, 'switch', '--quiet', '-c', 'change/add-greeting');
    write(dir, 'openspec/changes/archive/2026-10-01-add-greeting/tasks.md', GREETING.replace(/- \[ \]/g, '- [x]'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '--quiet', '-m', 'docs(add-greeting): archive change');
    git(dir, 'switch', '--quiet', 'main');
    return dir;
  }

  it('asks to hand over an archived branch that is not pushed', () => {
    const status = readStatus(archivedOnBranch());
    assert.equal(status.state, 'hand-over-pending');
    assert.equal(status.base, 'main');
    assert.deepEqual(status.handOvers, [{ change: 'add-greeting', branch: 'change/add-greeting', pushed: false }]);
    assert.equal(status.next, '/close-change add-greeting');
  });

  it('waits for the pull request once the archived branch is pushed', () => {
    const dir = archivedOnBranch();
    const remote = mkdtempSync(path.join(tmpdir(), 'aw-remote-'));
    git(remote, 'init', '--quiet', '--bare');
    git(dir, 'remote', 'add', 'origin', remote);
    git(dir, 'push', '--quiet', 'origin', 'change/add-greeting');
    const status = readStatus(dir);
    assert.equal(status.state, 'hand-over-pending');
    assert.equal(status.remote, 'origin');
    assert.deepEqual(status.handOvers, [{ change: 'add-greeting', branch: 'change/add-greeting', pushed: true }]);
    assert.equal(status.next, null, 'the pull request is merged in the code host');
  });

  it('forgets the hand-over once the branch is merged', () => {
    const dir = archivedOnBranch();
    git(dir, 'merge', '--quiet', '--no-ff', '-m', 'merge', 'change/add-greeting');
    assert.equal(readStatus(dir).state, 'nothing-in-flight');
  });
});

// Shell out so `openspec.cmd` resolves on Windows.
const openspecInstalled = spawnSync('openspec --version', { shell: true, stdio: 'ignore' }).status === 0;

describe('counts against OpenSpec', { skip: !openspecInstalled && 'openspec is not installed' }, () => {
  it('counts the same done and total criteria as openspec list --json', () => {
    const changes = {
      'add-greeting': GREETING,
      'add-legacy': '## 1. Setup\n\n- [x] 1.1 a\n- [x] 1.2 b\n\n## 2. Core\n\n- [ ] 2.1 c\n',
      'fix-login': GREETING.replace(/- \[ \]/g, '- [x]'),
      'add-export': null,
      'add-steps': '## 1. A\n\nBlocked by: none\n\n- [x] 1.1 a\n  - [ ] nested\n* [x] starred\n- [X] 1.2 upper\n',
    };
    const dir = installedProject({ changes });
    const listed = JSON.parse(spawnSync('openspec list --json', { cwd: dir, shell: true, encoding: 'utf8' }).stdout).changes;
    const counts = (list) => Object.fromEntries(list.map((c) => [c.name, c]));
    const ours = counts(readStatus(dir).changes);
    const theirs = counts(listed);
    assert.deepEqual(Object.keys(ours).sort(), Object.keys(theirs).sort());
    for (const name of Object.keys(changes)) {
      assert.deepEqual([ours[name].criteriaDone, ours[name].criteriaTotal], [theirs[name].completedTasks, theirs[name].totalTasks], name);
    }
  });
});

describe('developer view', () => {
  it('prints the roadmap of a change, the frontier ticket with its command', () => {
    assert.equal(formatRoadmap(readStatus(installedProject({ changes: { 'add-greeting': GREETING } }))), [
      'add-greeting · 2 of 4 tickets done',
      '  ✓ 1. Parse the name argument',
      '  ✓ 2. Greet the user by name',
      '  → 3. Remember the last name   (next: /implement add-greeting#3)',
      '  · 4. Manual test              (blocked by 3)',
    ].join('\n'));
  });

  it('prints every change, the current one first and marked, with the next command of the others', () => {
    const dir = installedProject({ changes: { 'add-export': null, 'fix-login': '## 1. Fix it\n\nBlocked by: none\n\n- [x] 1.1 done\n' } });
    git(dir, 'switch', '--quiet', '-c', 'change/fix-login');
    assert.equal(formatRoadmap(readStatus(dir)), [
      'fix-login · 1 of 1 tickets done (current branch)',
      '  ✓ 1. Fix it',
      '  next: /close-change fix-login',
      '',
      'add-export · no tickets yet',
      '  next: /to-tickets add-export',
    ].join('\n'));
  });

  it('names stray files after the roadmaps', () => {
    const dir = installedProject({ changes: { 'add-export': null } });
    write(dir, 'src/cli.js', 'x\n');
    assert.match(formatRoadmap(readStatus(dir)), /^add-export · no tickets yet\n {2}next: \/to-tickets add-export\n\nFiles changed outside a change: src\/cli\.js\. Commit or stash them first\.$/);
  });

  it('says what comes next when no change is in flight', () => {
    assert.equal(formatRoadmap(readStatus(installedProject())), 'No change in flight. Next: /grill-with-docs');
  });
});

describe('status command', () => {
  const run = (dir, ...args) => spawnSync(process.execPath, [STATUS, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } });

  it('prints the developer view', () => {
    const dir = installedProject({ changes: { 'add-greeting': GREETING } });
    const result = run(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${formatRoadmap(readStatus(dir))}\n`);
    assert.match(result.stdout, /→ 3\. Remember the last name/);
  });

  it('prints the snapshot as JSON with --json, from a subfolder too', () => {
    const dir = installedProject({ changes: { 'add-greeting': GREETING } });
    mkdirSync(path.join(dir, 'src'));
    const result = run(path.join(dir, 'src'), '--json');
    assert.equal(result.status, 0, result.stderr);
    const snapshot = JSON.parse(result.stdout);
    assert.equal(snapshot.state, 'tickets-open');
    assert.equal(snapshot.changes[0].frontier, 3);
    assert.equal(snapshot.changes[0].next, '/implement add-greeting#3');
    assert.equal(snapshot.changes[0].tickets[3].state, 'blocked');
  });

  it('rejects an unknown option', () => {
    const result = run(installedProject(), '--nope');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage/);
  });
});
