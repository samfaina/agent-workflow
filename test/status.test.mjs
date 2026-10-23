import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changeBase, changeBranch, fillCommand, formatRoadmap, parseExternalReferences, readStatus } from '../hooks/status.mjs';

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
function installedProject({ changes = {}, metadata = {}, config = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'aw-status-'));
  git(dir, 'init', '--quiet', '--initial-branch=main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  write(dir, '.claude/agent-workflow.json', `${JSON.stringify({ protectedBranches: ['main', 'master'], ...config })}\n`);
  write(dir, 'openspec/config.yaml', 'schema: spec-driven\n');
  for (const [change, tasks] of Object.entries(changes)) {
    write(dir, `openspec/changes/${change}/proposal.md`, `# ${change}\n`);
    if (tasks !== null) write(dir, `openspec/changes/${change}/tasks.md`, tasks);
  }
  for (const [change, yaml] of Object.entries(metadata)) write(dir, `openspec/changes/${change}/.openspec.yaml`, yaml);
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

describe('external references', () => {
  it('reads the references of each change from its .openspec.yaml, none when the key or the file is missing', () => {
    const status = readStatus(installedProject({
      changes: { 'add-export': null, 'add-greeting': GREETING, 'fix-login': null },
      metadata: {
        'add-greeting': 'schema: spec-driven\ncreated: 2026-10-19\nx-external-references:\n  - PROJ-123\n  - "#42"\n  - \'AB#987\'  # the Azure Boards item\n  - https://linear.app/acme/issue/ENG-7\n',
        'fix-login': 'schema: spec-driven\ncreated: 2026-10-19\n',
      },
    }));
    assert.deepEqual(status.changes.map((c) => [c.name, c.references]), [
      ['add-export', []],
      ['add-greeting', ['PROJ-123', '#42', 'AB#987', 'https://linear.app/acme/issue/ENG-7']],
      ['fix-login', []],
    ]);
  });

  it('reads a flow list and stops at the next top-level key', () => {
    const status = readStatus(installedProject({
      changes: { 'add-flow': null, 'add-block': null },
      metadata: {
        'add-flow': 'x-external-references: [PROJ-1, "#42", "a, b"]\nschema: spec-driven\n',
        'add-block': 'x-external-references:\n- ENG-7\n\nschema: spec-driven\nx-other:\n  - nope\n',
      },
    }));
    assert.deepEqual(status.changes.map((c) => [c.name, c.references]), [['add-block', ['ENG-7']], ['add-flow', ['PROJ-1', '#42', 'a, b']]]);
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

describe('change branches', () => {
  const branchMetadata = (branch) => `schema: spec-driven\ncreated: 2026-10-22\nx-branch: "${branch}"\n`;

  it('marks a change current on the branch named in its x-branch, not on change/<change>', () => {
    const dir = installedProject({ changes: { 'add-greet': GREETING }, metadata: { 'add-greet': branchMetadata('feature/POC-1-add-greet') } });
    git(dir, 'switch', '--quiet', '-c', 'feature/POC-1-add-greet');
    const [change] = readStatus(dir).changes;
    assert.deepEqual([change.branch, change.current], ['feature/POC-1-add-greet', true]);
    git(dir, 'switch', '--quiet', '-c', 'change/add-greet');
    assert.equal(readStatus(dir).changes[0].current, false);
  });

  it('gives each active change its own branch, change/<change> for one made before x-branch', () => {
    const dir = installedProject({
      changes: { 'add-greet': GREETING, 'fix-login': null, 'add-export': null },
      metadata: { 'add-greet': branchMetadata('feature/POC-1-add-greet'), 'fix-login': branchMetadata('bugfix/POC-2-fix-login'), 'add-export': 'schema: spec-driven\ncreated: 2026-10-01\n' },
    });
    git(dir, 'switch', '--quiet', '-c', 'bugfix/POC-2-fix-login');
    assert.deepEqual(readStatus(dir).changes.map((c) => [c.name, c.branch, c.current]), [
      ['fix-login', 'bugfix/POC-2-fix-login', true],
      ['add-export', 'change/add-export', false],
      ['add-greet', 'feature/POC-1-add-greet', false],
    ]);
    git(dir, 'switch', '--quiet', '-c', 'change/add-export');
    assert.deepEqual(readStatus(dir).changes.map((c) => [c.name, c.current]), [
      ['add-export', true],
      ['add-greet', false],
      ['fix-login', false],
    ]);
  });

  it('gives each active change its x-base, the default base for one made before x-base', () => {
    const dir = installedProject({
      config: { protectedBranches: ['develop', 'main'] },
      changes: { 'add-greet': null, 'fix-login': null },
      metadata: { 'fix-login': 'schema: spec-driven\nx-branch: "change/fix-login"\nx-base: "main"\n' },
    });
    git(dir, 'branch', 'develop');
    const status = readStatus(dir);
    assert.equal(status.base, 'develop', 'the snapshot\'s base stays the default base');
    assert.deepEqual(status.changes.map((c) => [c.name, c.base]), [['add-greet', 'develop'], ['fix-login', 'main']]);
  });

  it('shows on the status line the change whose x-branch is the current branch', () => {
    const dir = installedProject({
      changes: { 'add-greet': GREETING, 'add-export': null },
      metadata: { 'add-greet': branchMetadata('feature/POC-1-add-greet') },
    });
    const statusLine = () => spawnSync(process.execPath, [STATUS, '--statusline'], { cwd: dir, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } }).stdout;
    git(dir, 'switch', '--quiet', '-c', 'feature/POC-1-add-greet');
    assert.equal(statusLine(), 'add-greet · 2/4 · next #3\n');
    git(dir, 'switch', '--quiet', '-c', 'change/add-greet');
    assert.equal(statusLine(), '', 'the change lives on its x-branch only');
    git(dir, 'switch', '--quiet', '-c', 'change/add-export');
    assert.equal(statusLine(), 'add-export · no tickets · next /to-tickets\n', 'a change without x-branch lives on change/<change>');
  });

  // A change archived on its branch `branch`, which is not merged into main yet.
  function archivedOn(branch, { config } = {}) {
    const dir = installedProject({ config });
    git(dir, 'switch', '--quiet', '-c', branch);
    write(dir, 'openspec/changes/archive/2026-10-22-add-greet/.openspec.yaml', branchMetadata(branch));
    write(dir, 'openspec/changes/archive/2026-10-22-add-greet/tasks.md', GREETING.replace(/- \[ \]/g, '- [x]'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '--quiet', '-m', 'docs(add-greet): archive change');
    git(dir, 'switch', '--quiet', 'main');
    return dir;
  }

  it('finds the pending hand-over of a change archived on its x-branch', () => {
    const status = readStatus(archivedOn('feature/POC-1-add-greet', { config: { branch: 'feature/{ref}-{change}' } }));
    assert.equal(status.state, 'hand-over-pending');
    assert.deepEqual(status.handOvers, [{ change: 'add-greet', branch: 'feature/POC-1-add-greet', base: 'main', pushed: false }]);
    assert.equal(status.next, '/close-change add-greet');
  });

  it('does not list an unmerged branch of the pattern that holds no archived change of its own', () => {
    const dir = archivedOn('feature/POC-1-add-greet', { config: { branch: 'feature/{ref}-{change}' } });
    git(dir, 'switch', '--quiet', '-c', 'feature/OTRA-9-foo');
    write(dir, 'src/foo.js', 'x\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '--quiet', '-m', 'feat: foo');
    git(dir, 'switch', '--quiet', '-c', 'feature/OTRA-10-bar', 'feature/POC-1-add-greet');
    git(dir, 'commit', '--quiet', '--allow-empty', '-m', 'chore: bar');
    git(dir, 'switch', '--quiet', 'main');
    assert.deepEqual(readStatus(dir).handOvers.map((h) => h.branch), ['feature/POC-1-add-greet'],
      'neither a branch without archive nor one that only carries another branch\'s archive');
  });

  it('works with a pattern that starts with a placeholder', () => {
    const config = { branch: '{ref}__{change}--{user}' };
    const dir = installedProject({ config, changes: { 'add-greet': GREETING }, metadata: { 'add-greet': branchMetadata('POC-1__add-greet--SF') } });
    git(dir, 'switch', '--quiet', '-c', 'POC-1__add-greet--SF');
    assert.equal(readStatus(dir).changes[0].current, true);

    const archived = archivedOn('POC-1__add-greet--SF', { config });
    git(archived, 'switch', '--quiet', '-c', 'unrelated');
    git(archived, 'commit', '--quiet', '--allow-empty', '-m', 'chore: unrelated');
    git(archived, 'switch', '--quiet', 'main');
    assert.deepEqual(readStatus(archived).handOvers, [{ change: 'add-greet', branch: 'POC-1__add-greet--SF', base: 'main', pushed: false }]);
  });

  // A gitflow project, ["develop", "main"], with `fix-login` archived on change/fix-login,
  // cut from main with `x-base: main`, merged into neither.
  function archivedOnMain() {
    const dir = installedProject({ config: { protectedBranches: ['develop', 'main'] } });
    git(dir, 'switch', '--quiet', '-c', 'develop');
    git(dir, 'commit', '--quiet', '--allow-empty', '-m', 'feat: on develop');
    git(dir, 'switch', '--quiet', '-c', 'change/fix-login', 'main');
    write(dir, 'openspec/changes/archive/2026-10-22-fix-login/.openspec.yaml', 'schema: spec-driven\nx-branch: "change/fix-login"\nx-base: "main"\n');
    write(dir, 'openspec/changes/archive/2026-10-22-fix-login/tasks.md', GREETING.replace(/- \[ \]/g, '- [x]'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '--quiet', '-m', 'docs(fix-login): archive change');
    git(dir, 'switch', '--quiet', 'develop');
    return dir;
  }

  it('finds the pending hand-over of a change archived on a branch based on main', () => {
    const status = readStatus(archivedOnMain());
    assert.equal(status.base, 'develop');
    assert.deepEqual(status.handOvers, [{ change: 'fix-login', branch: 'change/fix-login', base: 'main', pushed: false }]);
    assert.equal(status.next, '/close-change fix-login');
  });

  it('finds the pending hand-over under the pattern of any base, and nothing on an unrelated branch of that pattern', () => {
    const config = { protectedBranches: ['develop', 'main'], branch: { develop: 'feature/{ref}__{change}', main: 'hotfix/{ref}__{change}' } };
    const dir = installedProject({ config });
    git(dir, 'switch', '--quiet', '-c', 'develop');
    git(dir, 'commit', '--quiet', '--allow-empty', '-m', 'feat: on develop');
    git(dir, 'switch', '--quiet', '-c', 'hotfix/POC-1__fix-login', 'main');
    write(dir, 'openspec/changes/archive/2026-10-22-fix-login/.openspec.yaml', 'schema: spec-driven\nx-branch: "hotfix/POC-1__fix-login"\nx-base: "main"\n');
    write(dir, 'openspec/changes/archive/2026-10-22-fix-login/tasks.md', GREETING.replace(/- \[ \]/g, '- [x]'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '--quiet', '-m', 'docs(fix-login): archive change');
    git(dir, 'switch', '--quiet', '-c', 'hotfix/OTHER-9-foo', 'main');
    git(dir, 'commit', '--quiet', '--allow-empty', '-m', 'fix: foo');
    git(dir, 'switch', '--quiet', 'develop');
    assert.deepEqual(readStatus(dir).handOvers, [{ change: 'fix-login', branch: 'hotfix/POC-1__fix-login', base: 'main', pushed: false }]);
  });

  it('prints the snapshot of a hand-over based on main with --report', () => {
    const result = spawnSync(process.execPath, [STATUS, '--report'], { cwd: archivedOnMain(), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } });
    assert.equal(result.stdout, 'Change: fix-login\nStage: finished, waits to be handed over\nTickets done: 4 of 4\n', result.stderr);
  });

  it('forgets the hand-over once the branch is merged into its base, though not into the default base', () => {
    const dir = archivedOnMain();
    git(dir, 'switch', '--quiet', 'main');
    git(dir, 'merge', '--quiet', '--no-ff', '-m', 'merge', 'change/fix-login');
    git(dir, 'switch', '--quiet', 'develop');
    const status = readStatus(dir);
    assert.deepEqual(status.handOvers, []);
    assert.equal(status.state, 'nothing-in-flight', 'bringing main into develop is outside the kit');
  });

  it('forgets the hand-over once its base has the archive, as after a squash merge', () => {
    const dir = archivedOnMain();
    git(dir, 'switch', '--quiet', 'main');
    git(dir, 'merge', '--quiet', '--squash', 'change/fix-login');
    git(dir, 'commit', '--quiet', '-m', 'fix(fix-login): squashed');
    git(dir, 'switch', '--quiet', 'develop');
    assert.deepEqual(readStatus(dir).handOvers, []);
  });

  it('does not list a change based on develop and merged into it, though main lacks it', () => {
    const dir = archivedOnMain();
    git(dir, 'switch', '--quiet', 'main');
    git(dir, 'merge', '--quiet', '--no-ff', '-m', 'merge', 'change/fix-login');
    git(dir, 'switch', '--quiet', '-c', 'change/add-greet', 'develop');
    write(dir, 'openspec/changes/archive/2026-10-23-add-greet/.openspec.yaml', 'schema: spec-driven\nx-branch: "change/add-greet"\nx-base: "develop"\n');
    write(dir, 'openspec/changes/archive/2026-10-23-add-greet/tasks.md', GREETING.replace(/- \[ \]/g, '- [x]'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '--quiet', '-m', 'docs(add-greet): archive change');
    git(dir, 'switch', '--quiet', 'develop');
    assert.deepEqual(readStatus(dir).handOvers, [{ change: 'add-greet', branch: 'change/add-greet', base: 'develop', pushed: false }]);
    git(dir, 'merge', '--quiet', '--no-ff', '-m', 'merge', 'change/add-greet');
    assert.deepEqual(readStatus(dir).handOvers, [], 'change/add-greet is not merged into main, which is not its base');
  });

  it('judges a hand-over against <remote>/<base> when the base is not a local branch, and skips it with neither', () => {
    const dir = archivedOnMain();
    const remote = mkdtempSync(path.join(tmpdir(), 'aw-remote-'));
    git(remote, 'init', '--quiet', '--bare');
    git(dir, 'remote', 'add', 'origin', remote);
    git(dir, 'push', '--quiet', 'origin', 'main');
    git(dir, 'branch', '--quiet', '-d', 'main');
    assert.deepEqual(readStatus(dir).handOvers, [{ change: 'fix-login', branch: 'change/fix-login', base: 'main', pushed: false }]);

    git(dir, 'push', '--quiet', 'origin', 'change/fix-login:main');
    git(dir, 'fetch', '--quiet', 'origin');
    assert.deepEqual(readStatus(dir).handOvers, [], 'merged into origin/main');

    git(dir, 'remote', 'remove', 'origin');
    git(dir, 'remote', 'add', 'origin', remote);
    assert.deepEqual(readStatus(dir).handOvers, [], 'no main and no origin/main: skipped, not reported');
  });

  it('still finds the hand-over of a change/<change> branch after the pattern changed', () => {
    const dir = installedProject({ config: { branch: 'feature/{ref}-{change}' } });
    git(dir, 'switch', '--quiet', '-c', 'change/add-greeting');
    write(dir, 'openspec/changes/archive/2026-10-01-add-greeting/tasks.md', GREETING.replace(/- \[ \]/g, '- [x]'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '--quiet', '-m', 'docs(add-greeting): archive change');
    git(dir, 'switch', '--quiet', 'main');
    assert.deepEqual(readStatus(dir).handOvers, [{ change: 'add-greeting', branch: 'change/add-greeting', base: 'main', pushed: false }]);
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
    assert.deepEqual(status.handOvers, [{ change: 'add-greeting', branch: 'change/add-greeting', base: 'main', pushed: false }]);
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
    assert.deepEqual(status.handOvers, [{ change: 'add-greeting', branch: 'change/add-greeting', base: 'main', pushed: true }]);
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

describe('external references, x-branch and x-base in OpenSpec', { skip: !openspecInstalled && 'openspec is not installed' }, () => {
  it('passes validate --strict and survives the archive', () => {
    const dir = installedProject({
      changes: { 'add-greeting': '## 1. Greet\n\nBlocked by: none\n\n- [x] 1.1 greets; verified by a test\n' },
      metadata: { 'add-greeting': 'schema: spec-driven\ncreated: 2026-10-19\nx-branch: "feature/#42-add-greeting"\nx-base: "main"\nx-external-references:\n  - PROJ-1\n  - "#42"\n' },
    });
    write(dir, 'openspec/changes/add-greeting/proposal.md', '## Why\n\nUsers starting the CLI should be greeted so they know it works.\n\n## What Changes\n\n- Print a greeting.\n\n## Capabilities\n\n### New Capabilities\n\n- `greeting`: greets the user.\n\n### Modified Capabilities\n\nNone.\n\n## Impact\n\nThe CLI.\n');
    write(dir, 'openspec/changes/add-greeting/specs/greeting/spec.md', '## ADDED Requirements\n\n### Requirement: Greet the user\n\nThe CLI SHALL print a greeting when it starts.\n\n#### Scenario: Start the CLI\n\n- **WHEN** the user starts the CLI\n- **THEN** it prints "Hello"\n');
    const openspec = (command) => spawnSync(`openspec ${command}`, { cwd: dir, shell: true, encoding: 'utf8' });
    const validated = openspec('validate add-greeting --strict');
    assert.equal(validated.status, 0, validated.stdout + validated.stderr);
    const archived = openspec('archive add-greeting --yes');
    assert.equal(archived.status, 0, archived.stdout + archived.stderr);
    const [folder] = readdirSync(path.join(dir, 'openspec', 'changes', 'archive'));
    const yaml = readFileSync(path.join(dir, 'openspec', 'changes', 'archive', folder, '.openspec.yaml'), 'utf8');
    assert.deepEqual(parseExternalReferences(yaml), ['PROJ-1', '#42']);
    assert.equal(changeBranch('add-greeting', yaml), 'feature/#42-add-greeting');
    assert.equal(changeBase(yaml, 'develop'), 'main');
  });
});

describe('light change in OpenSpec', { skip: !openspecInstalled && 'openspec is not installed' }, () => {
  it('passes validate --strict with no delta specs and archives without touching the living spec', () => {
    const living = '# greeting Specification\n\n## Purpose\n\nGreets the user.\n\n## Requirements\n\n### Requirement: Greet the user\n\nThe CLI SHALL print a greeting when it starts.\n\n#### Scenario: Start the CLI\n\n- **WHEN** the user starts the CLI\n- **THEN** it prints "Hello"\n';
    const dir = installedProject({
      changes: { 'fix-typo': '## 1. Fix the typo in the help\n\nBlocked by: none\n\nWhat to build: the help names the command correctly.\n\n- [x] 1.1 The help says "greet"; verified by a CLI test\n' },
      metadata: { 'fix-typo': 'schema: spec-driven\ncreated: 2026-10-20\nskip_specs: true\nx-external-references:\n  - "#42"\n' },
    });
    write(dir, 'openspec/changes/fix-typo/proposal.md', '## Why\n\nThe help misspells the command, so users type the wrong one.\n\n## What Changes\n\n- Spell the command correctly in the help.\n');
    write(dir, 'openspec/specs/greeting/spec.md', living);
    const openspec = (command) => spawnSync(`openspec ${command}`, { cwd: dir, shell: true, encoding: 'utf8' });
    const validated = openspec('validate fix-typo --strict');
    assert.equal(validated.status, 0, validated.stdout + validated.stderr);
    const archived = openspec('archive fix-typo --yes');
    assert.equal(archived.status, 0, archived.stdout + archived.stderr);
    assert.equal(readFileSync(path.join(dir, 'openspec', 'specs', 'greeting', 'spec.md'), 'utf8'), living);
    assert.deepEqual(readdirSync(path.join(dir, 'openspec', 'specs')), ['greeting']);
    const [folder] = readdirSync(path.join(dir, 'openspec', 'changes', 'archive'));
    assert.match(folder, /^\d{4}-\d{2}-\d{2}-fix-typo$/);
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

  it('names the external references of a change in its header', () => {
    const dir = installedProject({
      changes: { 'add-export': null, 'add-greeting': GREETING },
      metadata: {
        'add-export': 'x-external-references:\n  - ENG-7\n',
        'add-greeting': 'x-external-references:\n  - PROJ-123\n  - "#42"\n',
      },
    });
    git(dir, 'switch', '--quiet', '-c', 'change/add-export');
    const headers = formatRoadmap(readStatus(dir)).split('\n').filter((line) => /^\S/.test(line));
    assert.deepEqual(headers, [
      'add-export · no tickets yet · ENG-7 (current branch)',
      'add-greeting · 2 of 4 tickets done · PROJ-123, #42',
    ]);
  });

  it('marks a light change in its header', () => {
    const dir = installedProject({
      changes: { 'add-greeting': GREETING, 'fix-typo': '## 1. Fix the typo\n\nBlocked by: none\n\n- [ ] 1.1 the help says "greet"; verified by a CLI test\n' },
      metadata: { 'fix-typo': 'schema: spec-driven\ncreated: 2026-10-20\nskip_specs: true\nx-external-references:\n  - "#42"\n' },
    });
    const status = readStatus(dir);
    assert.deepEqual(status.changes.map((c) => [c.name, c.light]), [['add-greeting', false], ['fix-typo', true]]);
    const headers = formatRoadmap(status).split('\n').filter((line) => /^\S/.test(line));
    assert.deepEqual(headers, [
      'add-greeting · 2 of 4 tickets done',
      'fix-typo (light) · 0 of 1 tickets done · #42',
    ]);
  });

  it('names stray files after the roadmaps', () => {
    const dir = installedProject({ changes: { 'add-export': null } });
    write(dir, 'src/cli.js', 'x\n');
    assert.match(formatRoadmap(readStatus(dir)), /^add-export · no tickets yet\n {2}next: \/to-tickets add-export\n\nFiles changed outside a change: src\/cli\.js\. Commit or stash them first\.$/);
  });

  it('reminds to bring the base into the default base once the pull request of a change based elsewhere is merged', () => {
    const view = (handOver) => formatRoadmap({ state: 'hand-over-pending', base: 'develop', changes: [], strayFiles: [], handOvers: [handOver] });
    assert.equal(view({ change: 'fix-login', branch: 'change/fix-login', base: 'main', pushed: true }),
      'change/fix-login waits for its pull request. Once it is merged: git switch main && git pull, then bring main into develop.');
    assert.equal(view({ change: 'add-greet', branch: 'change/add-greet', base: 'develop', pushed: true }),
      'change/add-greet waits for its pull request. Once it is merged: git switch develop && git pull');
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

  it('prints the change of the current branch on one line with --statusline', () => {
    const dir = installedProject({ changes: { 'add-export': null, 'add-greeting': GREETING } });
    git(dir, 'switch', '--quiet', '-c', 'change/add-greeting');
    const result = run(dir, '--statusline');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'add-greeting · 2/4 · next #3\n');
  });

  it('names the next command with --statusline before the tickets and once they are done', () => {
    const dir = installedProject({ changes: { 'add-export': null, 'fix-login': GREETING.replace(/- \[ \]/g, '- [x]') } });
    git(dir, 'switch', '--quiet', '-c', 'change/add-export');
    assert.equal(run(dir, '--statusline').stdout, 'add-export · no tickets · next /to-tickets\n');
    git(dir, 'switch', '--quiet', '-c', 'change/fix-login');
    assert.equal(run(dir, '--statusline').stdout, 'fix-login · 4/4 · next /close-change\n');
  });

  it('reads the project from the session data Claude Code sends the status line', () => {
    const dir = installedProject({ changes: { 'add-greeting': GREETING } });
    git(dir, 'switch', '--quiet', '-c', 'change/add-greeting');
    const elsewhere = mkdtempSync(path.join(tmpdir(), 'aw-elsewhere-'));
    const result = spawnSync(process.execPath, [STATUS, '--statusline'], {
      cwd: elsewhere,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: '' },
      input: JSON.stringify({ cwd: elsewhere, workspace: { current_dir: elsewhere, project_dir: dir } }),
    });
    assert.equal(result.stdout, 'add-greeting · 2/4 · next #3\n', result.stderr);
  });

  it('prints nothing with --statusline off a change branch or once the change is archived', () => {
    const dir = installedProject({ changes: { 'add-greeting': GREETING } });
    assert.deepEqual([run(dir, '--statusline').status, run(dir, '--statusline').stdout], [0, ''], 'on main');
    git(dir, 'switch', '--quiet', '-c', 'change/add-export');
    assert.equal(run(dir, '--statusline').stdout, '', 'a branch whose change does not exist');
    const archived = installedProject();
    git(archived, 'switch', '--quiet', '-c', 'change/add-greeting');
    write(archived, 'openspec/changes/archive/2026-10-01-add-greeting/tasks.md', GREETING);
    assert.equal(run(archived, '--statusline').stdout, '', 'an archived change');
  });

  it('prints the snapshot of the current change to paste into a tracker with --report, nothing from the spec', () => {
    const dir = installedProject({
      changes: { 'add-export': null, 'add-greeting': GREETING },
      metadata: { 'add-greeting': 'x-external-references:\n  - PROJ-123\n  - "#42"\n' },
    });
    git(dir, 'switch', '--quiet', '-c', 'change/add-greeting');
    const result = run(dir, '--report');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Change: add-greeting\nStage: tickets open\nTickets done: 2 of 4\nWork items: PROJ-123, #42\n');
  });

  it('prints every active change with --report off a change branch, or the one named', () => {
    const dir = installedProject({ changes: { 'add-export': null, 'fix-login': GREETING.replace(/- \[ \]/g, '- [x]') } });
    assert.equal(run(dir, '--report').stdout, [
      'Change: add-export',
      'Stage: spec published, no tickets yet',
      'Tickets done: 0 of 0',
      '',
      'Change: fix-login',
      'Stage: every ticket done, ready to close',
      'Tickets done: 4 of 4',
      '',
    ].join('\n'));
    assert.equal(run(dir, '--report', 'fix-login').stdout, 'Change: fix-login\nStage: every ticket done, ready to close\nTickets done: 4 of 4\n');
    const missing = run(dir, '--report', 'add-nothing');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /No active change named add-nothing/);
  });

  it('marks a light change in the snapshot of --report', () => {
    const dir = installedProject({
      changes: { 'fix-typo': '## 1. Fix the typo\n\nBlocked by: none\n\n- [x] 1.1 the help says "greet"; verified by a CLI test\n' },
      metadata: { 'fix-typo': 'schema: spec-driven\nskip_specs: true\n' },
    });
    assert.equal(run(dir, '--report').stdout, 'Change: fix-typo (light)\nStage: every ticket done, ready to close\nTickets done: 1 of 1\n');
  });

  it('says so with --report when no change is in flight', () => {
    const result = run(installedProject(), '--report');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'No change in flight.\n');
  });

  // Archives `change` on `branch`, not merged into main: `yaml` holds the lines its
  // .openspec.yaml adds after `x-branch`.
  function archiveChange(dir, change, branch, { yaml = '', tasks = GREETING.replace(/- \[ \]/g, '- [x]') } = {}) {
    git(dir, 'switch', '--quiet', '-c', branch, 'main');
    write(dir, `openspec/changes/archive/2026-10-22-${change}/.openspec.yaml`, `schema: spec-driven\nx-branch: "${branch}"\n${yaml}`);
    write(dir, `openspec/changes/archive/2026-10-22-${change}/tasks.md`, tasks);
    git(dir, 'add', '-A');
    git(dir, 'commit', '--quiet', '-m', `docs(${change}): archive change`);
    git(dir, 'switch', '--quiet', 'main');
    return dir;
  }

  it('prints the snapshot of a change waiting to be handed over with --report, read from its branch', () => {
    const dir = archiveChange(installedProject(), 'add-greet', 'change/add-greet');
    const result = run(dir, '--report');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Change: add-greet\nStage: finished, waits to be handed over\nTickets done: 4 of 4\n');
  });

  it('prints the change waiting to be handed over with --report on its own branch too, right after /close-change', () => {
    const dir = archiveChange(installedProject(), 'add-greet', 'change/add-greet');
    git(dir, 'switch', '--quiet', 'change/add-greet');
    const result = run(dir, '--report');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Change: add-greet\nStage: finished, waits to be handed over\nTickets done: 4 of 4\n');
  });

  it('prints a change whose branch is pushed as waiting for its pull request with --report', () => {
    const dir = archiveChange(installedProject(), 'add-greet', 'change/add-greet');
    const remote = mkdtempSync(path.join(tmpdir(), 'aw-remote-'));
    git(remote, 'init', '--quiet', '--bare');
    git(dir, 'remote', 'add', 'origin', remote);
    git(dir, 'push', '--quiet', 'origin', 'change/add-greet');
    const result = run(dir, '--report');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Change: add-greet\nStage: finished, waits for its pull request\nTickets done: 4 of 4\n');
  });

  it('prints every change waiting to be handed over with --report, light or with work items', () => {
    const dir = archiveChange(installedProject(), 'add-greet', 'change/add-greet', { yaml: 'x-external-references:\n  - POC-1\n' });
    archiveChange(dir, 'fix-typo', 'change/fix-typo', {
      yaml: 'skip_specs: true\n',
      tasks: '## 1. Fix the typo\n\nBlocked by: none\n\n- [x] 1.1 the help says "greet"; verified by a CLI test\n',
    });
    assert.equal(run(dir, '--report').stdout, [
      'Change: add-greet',
      'Stage: finished, waits to be handed over',
      'Tickets done: 4 of 4',
      'Work items: POC-1',
      '',
      'Change: fix-typo (light)',
      'Stage: finished, waits to be handed over',
      'Tickets done: 1 of 1',
      '',
    ].join('\n'));
    const archived = run(dir, '--report', 'add-greet');
    assert.equal(archived.status, 1);
    assert.equal(archived.stderr, 'No active change named add-greet.\n');
  });

  it('rejects an unknown option', () => {
    const result = run(installedProject(), '--nope');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage/);
  });
});

describe('projection', () => {
  const run = (dir, ...args) => spawnSync(process.execPath, [STATUS, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } });
  const REFERENCES = { 'add-greeting': 'x-external-references:\n  - "PROJ-123"\n  - "#42"\n' };

  // A tracker command that appends `{ref} {stage} {message}` to posted.txt, or fails when told to.
  function trackerProject({ changes = { 'add-greeting': null }, fail = false } = {}) {
    const scripts = mkdtempSync(path.join(tmpdir(), 'aw-tracker-'));
    const log = path.join(scripts, 'posted.txt');
    writeFileSync(path.join(scripts, 'post.mjs'), fail
      ? "console.error('401 Unauthorized: token expired'); process.exit(1);\n"
      : `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, \`\${process.argv.slice(2).join(' ')}\\n\`);\n`);
    const command = `node "${path.join(scripts, 'post.mjs')}" {ref} {stage} {message}`;
    const dir = installedProject({ changes, metadata: REFERENCES, config: { tracker: { via: 'cli', command } } });
    git(dir, 'switch', '--quiet', '-c', 'change/add-greeting');
    const posted = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
    return { dir, posted };
  }

  it('runs the command once per reference with the message of the stage, and shows each post', () => {
    const { dir, posted } = trackerProject();
    const result = run(dir, '--project', 'spec-published', 'add-greeting');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Posted to PROJ-123: spec published\nPosted to #42: spec published\n');
    assert.equal(posted(), 'PROJ-123 spec-published add-greeting: spec published\n#42 spec-published add-greeting: spec published\n');
  });
  const TWO_TICKETS = (done) => [
    '# Tasks', '', '## 1. Greet', '', 'Blocked by: none', '', '- [' + (done >= 1 ? 'x' : ' ') + '] 1.1 greets; verified by a test', '',
    '## 2. Manual test', '', 'Blocked by: 1', '', '- [' + (done >= 2 ? 'x' : ' ') + '] 2.1 run it by hand', '',
  ].join('\n');

  it('posts each transition once, the manual test included, and never repeats a snapshot', () => {
    const { dir, posted } = trackerProject();
    const transition = (stage, ...args) => {
      const result = run(dir, '--project', stage, 'add-greeting', ...args);
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    transition('spec-published');
    assert.equal(transition('spec-published'), '', 'the same snapshot again');
    write(dir, 'openspec/changes/add-greeting/tasks.md', TWO_TICKETS(0));
    assert.equal(transition('tickets-published'), 'Posted to PROJ-123: 0 of 2 tickets done\nPosted to #42: 0 of 2 tickets done\n');
    write(dir, 'openspec/changes/add-greeting/tasks.md', TWO_TICKETS(1));
    transition('ticket-done');
    write(dir, 'openspec/changes/add-greeting/tasks.md', TWO_TICKETS(2));
    transition('ticket-done');
    assert.equal(transition('ticket-done'), '');
    const lines = posted().split('\n').filter((l) => l.startsWith('PROJ-123 '));
    assert.deepEqual(lines, [
      'PROJ-123 spec-published add-greeting: spec published',
      'PROJ-123 tickets-published add-greeting: 0 of 2 tickets done',
      'PROJ-123 ticket-done add-greeting: 1 of 2 tickets done',
      'PROJ-123 ticket-done add-greeting: 2 of 2 tickets done',
    ]);
  });

  it('posts the hand-over of an archived change: the pull request, a local merge, or ready for review', () => {
    const { dir, posted } = trackerProject({ changes: {} });
    write(dir, 'openspec/changes/archive/2026-10-19-add-greeting/tasks.md', TWO_TICKETS(2));
    write(dir, 'openspec/changes/archive/2026-10-19-add-greeting/.openspec.yaml', REFERENCES['add-greeting']);
    assert.equal(run(dir, '--project', 'change-closed', 'add-greeting').stdout, 'Posted to PROJ-123: finished, merged locally\nPosted to #42: finished, merged locally\n');
    git(dir, 'remote', 'add', 'origin', 'https://example.com/app.git');
    assert.equal(run(dir, '--project', 'change-closed', 'add-greeting').stdout.split('\n')[0], 'Posted to PROJ-123: finished, ready for review');
    assert.equal(run(dir, '--project', 'change-closed', 'add-greeting', '--url', 'https://example.com/app/pull/7').stdout.split('\n')[0],
      'Posted to PROJ-123: finished, pull request https://example.com/app/pull/7');
    assert.ok(posted().includes('PROJ-123 change-closed add-greeting: finished, pull request https://example.com/app/pull/7\n'), posted());
  });

  it('does not stop on a failing command: it says so per work item and prints the text to paste', () => {
    const { dir } = trackerProject({ fail: true });
    const result = run(dir, '--project', 'spec-published', 'add-greeting');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, [
      'Could not post to PROJ-123 (exit code 1: 401 Unauthorized: token expired).',
      'Could not post to #42 (exit code 1: 401 Unauthorized: token expired).',
      'Paste this into them instead:',
      'Change: add-greeting',
      'Stage: spec published, no tickets yet',
      'Tickets done: 0 of 0',
      'Work items: PROJ-123, #42',
      '',
    ].join('\n'));
    assert.match(run(dir, '--project', 'spec-published', 'add-greeting').stdout, /^Could not post to PROJ-123/, 'a missed snapshot is not recorded');
  });

  it('marks a light change in the text to paste when a post fails', () => {
    const { dir } = trackerProject({ changes: { 'add-greeting': TWO_TICKETS(0).split('## 2.')[0] }, fail: true });
    write(dir, 'openspec/changes/add-greeting/.openspec.yaml', `schema: spec-driven\nskip_specs: true\n${REFERENCES['add-greeting']}`);
    const result = run(dir, '--project', 'tickets-published', 'add-greeting');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\nChange: add-greeting \(light\)\nStage: tickets open\nTickets done: 0 of 1\n/);
  });

  it('asks the agent to post through the MCP server and records each post it reports', () => {
    const dir = installedProject({ changes: { 'add-greeting': null }, metadata: REFERENCES, config: { tracker: { via: 'mcp', server: 'jira' } } });
    const plan = run(dir, '--project', 'spec-published', 'add-greeting');
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(plan.stdout, [
      'Post to PROJ-123, #42 with the `jira` MCP server: add-greeting: spec published',
      'After each post, run: node .claude/hooks/agent-workflow/status.mjs --project spec-published add-greeting --posted "<reference>"',
      'If a post fails, paste this into the work item instead:',
      'Change: add-greeting',
      'Stage: spec published, no tickets yet',
      'Tickets done: 0 of 0',
      'Work items: PROJ-123, #42',
      '',
    ].join('\n'));
    assert.equal(run(dir, '--project', 'spec-published', 'add-greeting', '--posted', '#42').stdout, 'Posted to #42: spec published\n');
    assert.match(run(dir, '--project', 'spec-published', 'add-greeting').stdout, /^Post to PROJ-123 with/);
    const unknown = run(dir, '--project', 'spec-published', 'add-greeting', '--posted', 'PROJ-9');
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /PROJ-9 is not an external reference of add-greeting/);
  });

  it('posts nothing without a tracker or without references', () => {
    const none = installedProject({ changes: { 'add-greeting': null }, metadata: REFERENCES });
    assert.deepEqual([run(none, '--project', 'spec-published', 'add-greeting').status, run(none, '--project', 'spec-published', 'add-greeting').stdout], [0, '']);
    const { dir, posted } = trackerProject({ changes: { 'add-export': null, 'add-greeting': null } });
    assert.equal(run(dir, '--project', 'spec-published', 'add-export').stdout, '');
    assert.equal(posted(), '');
  });

  it('keeps the ledger in git\'s common directory, shared by worktrees and never committed', () => {
    const { dir, posted } = trackerProject();
    run(dir, '--project', 'spec-published', 'add-greeting');
    assert.ok(existsSync(path.join(dir, '.git', 'agent-workflow', 'tracker.json')));
    assert.equal(git(dir, 'status', '--porcelain'), '');
    git(dir, 'switch', '--quiet', 'main');
    const worktree = path.join(mkdtempSync(path.join(tmpdir(), 'aw-worktree-')), 'wt');
    git(dir, 'worktree', 'add', '--quiet', worktree, 'change/add-greeting');
    assert.equal(run(worktree, '--project', 'spec-published', 'add-greeting').stdout, '');
    assert.equal(posted().split('\n').filter(Boolean).length, 2);
  });

  it('rejects an unknown stage or a missing change', () => {
    const dir = installedProject();
    assert.match(run(dir, '--project', 'spec-done', 'add-greeting').stderr, /Usage/);
    assert.match(run(dir, '--project', 'spec-published').stderr, /Usage/);
    const missing = run(dir, '--project', 'spec-published', 'add-nothing');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /No change named add-nothing/);
  });

  it('shows in the developer view how many updates each work item is behind', () => {
    const { dir } = trackerProject({ changes: { 'add-greeting': TWO_TICKETS(1) } });
    run(dir, '--project', 'spec-published', 'add-greeting');
    run(dir, '--project', 'spec-published', 'add-greeting', '--posted', '#42');
    const status = readStatus(dir);
    assert.deepEqual(status.changes[0].behind, { 'PROJ-123': 2, '#42': 2 });
    assert.ok(formatRoadmap(status).endsWith('\n  PROJ-123: 2 updates behind\n  #42: 2 updates behind'), formatRoadmap(status));
    run(dir, '--project', 'ticket-done', 'add-greeting');
    assert.deepEqual(readStatus(dir).changes[0].behind, {});
    assert.ok(!formatRoadmap(readStatus(dir)).includes('behind'));
  });

  it('says a work item linked after the last post was never posted, not how many updates it missed', () => {
    const { dir } = trackerProject({ changes: { 'add-greeting': TWO_TICKETS(1) } });
    run(dir, '--project', 'ticket-done', 'add-greeting');
    write(dir, 'openspec/changes/add-greeting/.openspec.yaml', `${REFERENCES['add-greeting']}  - "PROJ-200"\n`);
    const status = readStatus(dir);
    assert.deepEqual(status.changes[0].behind, { 'PROJ-200': null });
    assert.ok(formatRoadmap(status).endsWith('\n  PROJ-200: not posted yet'), formatRoadmap(status));
  });

  it('shows an archived change whose hand-over was not posted, with the command to post it', () => {
    const { dir } = trackerProject({ changes: { 'add-greeting': TWO_TICKETS(2) } });
    run(dir, '--project', 'ticket-done', 'add-greeting');
    mkdirSync(path.join(dir, 'openspec/changes/archive'), { recursive: true });
    renameSync(path.join(dir, 'openspec/changes/add-greeting'), path.join(dir, 'openspec/changes/archive/2026-10-19-add-greeting'));
    const status = readStatus(dir);
    assert.deepEqual(status.archivedBehind, [{ name: 'add-greeting', behind: { 'PROJ-123': 1, '#42': 1 } }]);
    assert.ok(formatRoadmap(status).startsWith([
      'add-greeting · archived',
      '  PROJ-123: 1 update behind',
      '  #42: 1 update behind',
      '  next: node .claude/hooks/agent-workflow/status.mjs --project change-closed add-greeting [--url <pull request>]',
    ].join('\n')), formatRoadmap(status));
    run(dir, '--project', 'change-closed', 'add-greeting');
    assert.deepEqual(readStatus(dir).archivedBehind, []);
    assert.ok(!formatRoadmap(readStatus(dir)).includes('archived'));
  });

  it('says nothing about updates behind without a tracker', () => {
    const dir = installedProject({ changes: { 'add-greeting': TWO_TICKETS(1) }, metadata: REFERENCES });
    assert.deepEqual(readStatus(dir).changes[0].behind, {});
  });
  it('quotes every placeholder for the shell, so a reference cannot run anything', () => {
    const values = { ref: "it's; rm -rf ~", stage: 'ticket-done', message: 'say "hi" & $(exit)', done: 2 };
    assert.equal(fillCommand('t comment {ref} --stage {stage} --body {message} {done}/{total} {unknown}', values, 'linux'),
      "t comment 'it'\\''s; rm -rf ~' --stage 'ticket-done' --body 'say \"hi\" & $(exit)' '2'/'' {unknown}");
    assert.equal(fillCommand('t comment {ref} --body {message}', values, 'win32'),
      't comment "it\'s; rm -rf ~" --body "say ""hi"" & $(exit)"');
  });
});
