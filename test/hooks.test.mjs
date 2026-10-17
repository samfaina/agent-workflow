import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, checkCommand, protectedPattern } from '../hooks/shared.mjs';

const HOOKS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'hooks');

function verdict(command, { branch = 'change/demo', config = {} } = {}) {
  return checkCommand(command, {
    config: { ...DEFAULT_CONFIG, ...config },
    cwd: process.cwd(),
    getBranch: () => branch,
  });
}

describe('git-guard command matrix', () => {
  const allowed = [
    'git status',
    'git diff main...HEAD',
    'git log --oneline main..HEAD',
    'git add -A',
    'git commit -m "feat: add greeting"',
    'git commit -am "fix: typo"',
    'git commit -m "docs: explain why git push is blocked"',
    'git switch -c change/add-greeting',
    'git checkout -b change/add-greeting',
    'git checkout change/add-greeting',
    'git branch -d old-branch',
    'git restore --staged README.md',
    'git stash',
    'git stash pop',
    'git clean -n',
    'git reset HEAD~1',
    'git reset --soft HEAD~1',
    'git pull --ff-only',
    'git fetch origin',
    'git -C sub status',
    'echo "git push" > notes.txt',
    'npm test && git commit -m "test: cover edge case"',
    'git.exe status',
    '& git commit -m "feat: x"',
  ];
  for (const command of allowed) {
    it(`allows: ${command}`, () => assert.equal(verdict(command).blocked, false, verdict(command).reason));
  }

  const blocked = [
    'git push',
    'git push origin change/demo',
    'git push -u origin change/demo',
    'git reset --hard',
    'git reset --hard origin/main',
    'git clean -fd',
    'git clean -xdf',
    'git clean --force',
    'git branch -D feature',
    'git branch --delete --force feature',
    'git branch -f main HEAD',
    'git checkout -- .',
    'git checkout .',
    'git checkout -f main',
    'git restore src/app.js',
    'git restore .',
    'git switch --discard-changes main',
    'git switch -f main',
    'git stash drop',
    'git stash clear',
    'git reflog expire --expire=now --all',
    'git filter-branch --tree-filter "rm secret" HEAD',
    'git update-ref -d refs/heads/feature',
    'git commit --no-verify -m "feat: x"',
    'git commit -n -m "feat: x"',
    'npm test; git push',
    'npm test && git reset --hard',
    'cd sub && git push',
    'bash -c "git push origin main"',
    'pwsh -Command "git reset --hard"',
    'powershell.exe -NoProfile -Command "git push"',
    'cmd /c "git push"',
    'Invoke-Expression "git push"',
    '/usr/bin/git push',
    '& "C:\\Program Files\\Git\\cmd\\git.exe" push',
    'git -C other push',
    'git -c core.editor=true push',
    'sudo git push',
    'GIT_TRACE=1 git push',
    'git status; git push --force',
  ];
  for (const command of blocked) {
    it(`blocks: ${command}`, () => assert.equal(verdict(command).blocked, true));
  }

  it('blocks commits on a protected branch', () => {
    assert.equal(verdict('git commit -m "feat: x"', { branch: 'main' }).blocked, true);
    assert.equal(verdict('git merge feature', { branch: 'master' }).blocked, true);
    assert.equal(verdict('git cherry-pick abc123', { branch: 'main' }).blocked, true);
  });

  it('allows a commit after switching away from a protected branch in the same command', () => {
    assert.equal(verdict('git switch -c change/x && git commit -m "feat: x"', { branch: 'main' }).blocked, false);
    assert.equal(verdict('git checkout -b change/x; git commit -m "feat: x"', { branch: 'main' }).blocked, false);
  });

  it('blocks a commit after switching onto a protected branch in the same command', () => {
    assert.equal(verdict('git switch main && git commit -m "feat: x"').blocked, true);
  });

  it('honours custom protected branches', () => {
    const config = { protectedBranches: ['develop'] };
    assert.equal(verdict('git commit -m x', { branch: 'develop', config }).blocked, true);
    assert.equal(verdict('git commit -m x', { branch: 'main', config }).blocked, false);
  });

  describe('with allowPush', () => {
    const config = { allowPush: true };
    it('allows pushing the change branch', () => {
      assert.equal(verdict('git push -u origin change/demo', { config }).blocked, false);
    });
    for (const command of ['git push --force', 'git push -f origin change/demo', 'git push --force-with-lease', 'git push origin +change/demo', 'git push origin HEAD:main', 'git push origin main', 'git push --no-verify origin change/demo']) {
      it(`still blocks: ${command}`, () => assert.equal(verdict(command, { config }).blocked, true));
    }
    it('blocks a bare push from a protected branch', () => {
      assert.equal(verdict('git push', { branch: 'main', config }).blocked, true);
    });
  });
});

describe('protected-paths matching', () => {
  const projectDir = path.resolve('/work/app');
  const match = (file, cwd = projectDir, config = DEFAULT_CONFIG) => protectedPattern(file, { projectDir, cwd, config });

  for (const file of ['.env', '.env.local', 'packages/api/.env', '.claude/settings.json', '.claude/agent-workflow.json', '.claude/hooks/agent-workflow/git-guard.mjs', '.claude/skills/to-spec/SKILL.md', '.claude/references/security-checklist.md', 'openspec/specs/greeting/spec.md']) {
    it(`protects ${file}`, () => assert.notEqual(match(file), null));
  }
  for (const file of ['src/index.js', 'openspec/changes/add-greeting/tasks.md', 'openspec/config.yaml', 'docs/agents/issue-tracker.md', 'environment.md', '.envrc.example.md', '.claude/commands/x.md']) {
    it(`allows ${file}`, () => assert.equal(match(file), null));
  }

  it('resolves absolute paths and paths relative to the cwd', () => {
    assert.notEqual(match(path.join(projectDir, 'openspec', 'specs', 'a', 'spec.md')), null);
    assert.notEqual(match('spec.md', path.join(projectDir, 'openspec', 'specs', 'a')), null);
    assert.equal(match('index.js', path.join(projectDir, 'src')), null);
  });

  it('ignores files outside the project', () => {
    assert.equal(match(path.resolve('/elsewhere/.env')), null);
  });

  it('uses the configured patterns', () => {
    const config = { ...DEFAULT_CONFIG, protectedPaths: ['migrations/**'] };
    assert.notEqual(match('migrations/001.sql', projectDir, config), null);
    assert.equal(match('.env', projectDir, config), null);
  });
});

describe('hook scripts end to end', () => {
  function makeRepo({ checkCommand = '', branch = 'change/demo' } = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), 'aw-hooks-'));
    execFileSync('git', ['init', '-q', '-b', branch], { cwd: dir });
    mkdirSync(path.join(dir, '.claude'));
    writeFileSync(path.join(dir, '.claude', 'agent-workflow.json'), JSON.stringify({ checkCommand }));
    return dir;
  }

  function run(script, dir, toolInput) {
    return spawnSync(process.execPath, [path.join(HOOKS, script)], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: dir, tool_input: toolInput }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      encoding: 'utf8',
    });
  }

  it('git-guard exits 2 with a reason for a blocked command', () => {
    const result = run('git-guard.mjs', makeRepo(), { command: 'git push' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /git push is disabled/);
  });

  it('git-guard exits 0 for an allowed command', () => {
    assert.equal(run('git-guard.mjs', makeRepo(), { command: 'git status' }).status, 0);
  });

  it('git-guard reads the real branch of the repository', () => {
    const result = run('git-guard.mjs', makeRepo({ branch: 'main' }), { command: 'git commit -m x' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /protected branch/);
  });

  it('quality-gate blocks a commit when the check command fails', () => {
    const dir = makeRepo({ checkCommand: 'node -e "console.log(\'2 tests failed\'); process.exit(1)"' });
    const result = run('quality-gate.mjs', dir, { command: 'git commit -m "feat: x"' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /2 tests failed/);
  });

  it('quality-gate lets a commit through when the check command passes', () => {
    const dir = makeRepo({ checkCommand: 'node -e "process.exit(0)"' });
    assert.equal(run('quality-gate.mjs', dir, { command: 'git commit -m "feat: x"' }).status, 0);
  });

  it('quality-gate skips commands that are not commits', () => {
    const dir = makeRepo({ checkCommand: 'node -e "process.exit(1)"' });
    assert.equal(run('quality-gate.mjs', dir, { command: 'git status' }).status, 0);
  });

  it('protected-paths blocks an edit to the living spec', () => {
    const dir = makeRepo();
    const result = run('protected-paths.mjs', dir, { file_path: path.join(dir, 'openspec', 'specs', 'a', 'spec.md') });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /openspec\/specs\/\*\*/);
  });

  it('protected-paths allows an edit to a change artifact', () => {
    const dir = makeRepo();
    assert.equal(run('protected-paths.mjs', dir, { file_path: path.join(dir, 'openspec', 'changes', 'x', 'tasks.md') }).status, 0);
  });
});
