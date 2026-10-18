import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { skillsWhere } from '../installer/catalog.mjs';
import { init, KIT_ROOT } from '../installer/init.mjs';
import { detectPullRequestCommand, parsePullRequest } from '../installer/pull-request.mjs';
import { sharedReferenceLinks } from '../installer/references.mjs';

const KIT_HOOKS = JSON.parse(readFileSync(new URL('../templates/.claude/settings.json', import.meta.url), 'utf8')).hooks.PreToolUse;
const STOCK_CONFIG ='schema: spec-driven\n\n# Project context (optional)\n#   context: |\n';

// Simulates the Skills CLI and OpenSpec so the installer runs offline.
function fakeTools(projectDir) {
  const commands = [];
  const run = (command) => {
    commands.push(command);
    if (command.endsWith('--version')) return { status: 0, stdout: '1.14.3' };
    if (command.includes(' init --tools none')) {
      mkdirSync(path.join(projectDir, 'openspec', 'specs'), { recursive: true });
      writeFileSync(path.join(projectDir, 'openspec', 'config.yaml'), STOCK_CONFIG);
      return { status: 0 };
    }
    const add = command.match(/skills@latest add \S+ --skill (.+?) -a claude-code/);
    if (add) {
      for (const name of add[1].split(' ')) {
        const dir = path.join(projectDir, '.claude', 'skills', name);
        mkdirSync(path.join(dir, 'references'), { recursive: true });
        let body = `---\nname: ${name}\n---\n`;
        if (name === 'security-and-hardening') {
          body += 'See [checklist](../../references/security-checklist.md).\n';
          writeFileSync(path.join(dir, 'references', 'hardening-patterns.md'), '[c](../../../references/security-checklist.md)\n');
        }
        if (name === 'performance-optimization') body += 'See ../../references/performance-checklist.md\n';
        writeFileSync(path.join(dir, 'SKILL.md'), body);
      }
      return { status: 0 };
    }
    return { status: 1 };
  };
  return { run, commands };
}

// Answers every confirmation with `answer` and records the questions.
function quietIO(answer = false) {
  const questions = [];
  return {
    questions,
    log() {},
    warn(message) { questions.push(`WARN ${message}`); },
    async ask(_question, fallback) { return fallback; },
    async confirm(question) { questions.push(question); return answer; },
    close() {},
  };
}

async function install(projectDir, { answer = false, optional = 'none', pullRequest, initFrom = init } = {}) {
  const tools = fakeTools(projectDir);
  const io = quietIO(answer);
  await initFrom({
    projectDir,
    io,
    run: tools.run,
    fetchText: async (url) => `# ${path.basename(url)}\n`,
    language: 'Spanish',
    checkCommand: 'npm test',
    pullRequest,
    optional,
  });
  return { ...tools, io };
}

function newProject() {
  const dir = mkdtempSync(path.join(tmpdir(), 'aw-install-'));
  mkdirSync(path.join(dir, '.git'));
  return dir;
}

const read = (dir, file) => readFileSync(path.join(dir, file), 'utf8');

describe('installer in a new project', () => {
  it('installs the core skills, kit files and shared checklists', async () => {
    const dir = newProject();
    const { commands } = await install(dir);

    for (const skill of skillsWhere({ tier: 'core' })) {
      assert.ok(existsSync(path.join(dir, '.claude', 'skills', skill.name, 'SKILL.md')), skill.name);
    }
    assert.ok(commands.some((c) => c.startsWith('openspec init --tools none')));
    assert.ok(!commands.some((c) => /performance-optimization/.test(c)), 'optional skills stay out');

    for (const file of ['.claude/skills/close-change/SKILL.md', '.claude/skills/now-what/SKILL.md', '.claude/hooks/agent-workflow/git-guard.mjs', '.claude/hooks/agent-workflow/shared.mjs', 'docs/agents/issue-tracker.md', 'docs/agents/domain.md']) {
      assert.ok(existsSync(path.join(dir, file)), file);
    }
    assert.equal(JSON.parse(read(dir, '.claude/agent-workflow.json')).checkCommand, 'npm test');
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')).pullRequest, { via: 'none' });
    assert.equal(JSON.parse(read(dir, '.claude/settings.json')).hooks.PreToolUse.length, 2);
    assert.match(read(dir, 'openspec/config.yaml'), /Ticket format/);
    assert.match(read(dir, 'AGENTS.md'), /^<!-- agent-workflow:start -->/);
    assert.equal(JSON.parse(read(dir, '.claude/settings.local.json')).language, 'spanish');
    assert.match(read(dir, '.gitignore'), /^\.claude\/settings\.local\.json$/m);
    assert.match(read(dir, 'CLAUDE.md'), /Write everything that goes into the repository in English/);
    assert.match(read(dir, 'CLAUDE.md'), /`security-and-hardening`: handling untrusted input/);
    assert.doesNotMatch(read(dir, 'CLAUDE.md'), /performance-optimization/);
  });

  it('leaves every shared checklist link resolvable', async () => {
    const dir = newProject();
    await install(dir, { optional: ['performance-optimization'] });
    const skillDirs = skillsWhere({ source: 'addy' }).map((s) => path.join(dir, '.claude', 'skills', s.name));
    const links = sharedReferenceLinks(skillDirs, path.join(dir, '.claude', 'references'));
    assert.ok(links.length >= 3);
    for (const { link, target } of links) assert.ok(existsSync(target), `${link} -> ${target}`);
    assert.match(read(dir, 'CLAUDE.md'), /`performance-optimization`/);
  });

  it('changes nothing when run a second time', async () => {
    const dir = newProject();
    await install(dir);
    const before = ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', '.claude/settings.local.json', '.gitignore', 'openspec/config.yaml'].map((f) => read(dir, f));
    const { io, commands } = await install(dir);
    const after = ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', '.claude/settings.local.json', '.gitignore', 'openspec/config.yaml'].map((f) => read(dir, f));
    assert.deepEqual(after, before);
    assert.deepEqual(io.questions.filter((q) => !q.startsWith('Already installed')), []);
    assert.ok(!commands.some((c) => c.includes('skills@latest add')), 'nothing to reinstall');
  });
});

describe('installer in an existing project', () => {
  function existingProject() {
    const dir = newProject();
    const files = {
      'CLAUDE.md': '# My project\n\nUse pnpm.\n',
      '.claude/settings.json': JSON.stringify({ permissions: { allow: ['Bash(pnpm test)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node mine.js' }] }] } }),
      'docs/agents/issue-tracker.md': '# Issue tracker: GitHub\n',
      '.claude/skills/tdd/SKILL.md': '---\nname: tdd\n---\nmy local copy\n',
      '.claude/commands/opsx/propose.md': 'opsx\n',
      'openspec/config.yaml': 'schema: spec-driven\ncontext: |\n  Our own context\n',
      '.claude/settings.local.json': JSON.stringify({ language: 'english', permissions: { allow: ['Bash(ls)'] } }),
      '.gitignore': 'node_modules/\n',
    };
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), content);
    }
    return { dir, files };
  }

  it('keeps every existing file when the user says no', async () => {
    const { dir, files } = existingProject();
    const { io, commands } = await install(dir, { answer: false });
    for (const [file, content] of Object.entries(files)) {
      if (file !== '.gitignore') assert.equal(read(dir, file), content, file);
    }
    assert.equal(read(dir, '.gitignore'), 'node_modules/\n.claude/settings.local.json\n', 'only appends the ignore line');
    assert.ok(io.questions.some((q) => q.includes('sets the language to "english"')));
    assert.ok(!commands.some((c) => c.startsWith('openspec init')), 'existing openspec/ is kept');
    assert.ok(!commands.some((c) => / tdd( |$)/.test(c)), 'existing skill is not reinstalled');
    assert.ok(io.questions.some((q) => q.startsWith('WARN openspec/config.yaml already has its own')));
    assert.ok(io.questions.some((q) => q.includes('commands/opsx')));
  });

  it('merges into existing files when the user says yes', async () => {
    const { dir } = existingProject();
    await install(dir, { answer: true });
    const claude = read(dir, 'CLAUDE.md');
    assert.match(claude, /^# My project\n\nUse pnpm\./);
    assert.match(claude, /<!-- agent-workflow:start -->\n@AGENTS\.md/);
    const settings = JSON.parse(read(dir, '.claude/settings.json'));
    assert.deepEqual(settings.permissions, { allow: ['Bash(pnpm test)'] });
    const commands = settings.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => [h.command, ...(h.args ?? [])].join(' ')));
    assert.ok(commands.includes('node mine.js'));
    assert.equal(commands.filter((c) => c.includes('agent-workflow')).length, KIT_HOOKS.flatMap((g) => g.hooks).length);
    assert.match(read(dir, 'docs/agents/issue-tracker.md'), /Issue tracker: OpenSpec/);
    assert.ok(!existsSync(path.join(dir, '.claude', 'commands', 'opsx')));
    assert.deepEqual(JSON.parse(read(dir, '.claude/settings.local.json')), { language: 'spanish', permissions: { allow: ['Bash(ls)'] } });
  });

  it('adds hooks missing from a matcher group even when another group has the same script', async () => {
    const dir = newProject();
    const old = { hooks: { PreToolUse: [
      { matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-workflow/git-guard.mjs'] }] },
      { matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-workflow/protected-paths.mjs'] }] },
    ] } };
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify(old));
    await install(dir, { answer: true });
    const groups = JSON.parse(read(dir, '.claude/settings.json')).hooks.PreToolUse;
    const scripts = (list, matcher) => list.filter((g) => g.matcher === matcher).flatMap((g) => g.hooks.map((h) => path.basename(h.args[0]))).sort();
    assert.equal(groups.length, KIT_HOOKS.length, 'no duplicate groups');
    for (const { matcher } of KIT_HOOKS) assert.deepEqual(scripts(groups, matcher), scripts(KIT_HOOKS, matcher), matcher);
  });
});

describe('installer pull request setting', () => {
  it('stores the command given with --pull-request', async () => {
    const dir = newProject();
    await install(dir, { pullRequest: 'tea pr create --base {base} --head {branch} --title {title}' });
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')).pullRequest, { via: 'cli', command: 'tea pr create --base {base} --head {branch} --title {title}' });
  });

  it('parses none, mcp:<server> and commands', () => {
    assert.deepEqual(parsePullRequest(''), { via: 'none' });
    assert.deepEqual(parsePullRequest(' none '), { via: 'none' });
    assert.deepEqual(parsePullRequest('mcp:gitlab'), { via: 'mcp', server: 'gitlab' });
    assert.deepEqual(parsePullRequest('glab mr create'), { via: 'cli', command: 'glab mr create' });
    assert.throws(() => parsePullRequest('mcp:'), /name of the MCP server/);
  });

  it('proposes the CLI of the remote\'s code host only when it is installed', () => {
    const tools = (remote, installed) => (command) => {
      if (command === 'git remote get-url origin') return remote ? { status: 0, stdout: `${remote}\n` } : { status: 2, stdout: '' };
      return { status: installed.some((cli) => command === `${cli} --version`) ? 0 : 1, stdout: '' };
    };
    assert.match(detectPullRequestCommand('.', tools('git@github.com:me/app.git', ['gh'])), /^gh pr create --base \{base\} --head \{branch\}/);
    assert.match(detectPullRequestCommand('.', tools('https://gitlab.example.com/me/app.git', ['glab'])), /^glab mr create /);
    assert.equal(detectPullRequestCommand('.', tools('git@github.com:me/app.git', [])), '');
    assert.equal(detectPullRequestCommand('.', tools('https://bitbucket.org/me/app.git', ['gh', 'glab'])), '');
    assert.equal(detectPullRequestCommand('.', tools(null, ['gh'])), '');
  });

  it('adds the setting to an existing config and keeps the user\'s values', async () => {
    const dir = newProject();
    const old = { protectedBranches: ['develop'], allowPush: true, checkCommand: 'pnpm test', protectedPaths: ['.env'] };
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'agent-workflow.json'), JSON.stringify(old));
    const { io } = await install(dir, { answer: true, pullRequest: 'mcp:bitbucket' });
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')), { ...old, pullRequest: { via: 'mcp', server: 'bitbucket' } });
    assert.ok(io.questions.some((q) => q.startsWith('Add pullRequest to .claude/agent-workflow.json?')));
  });

  it('does not ask again when the config already has the setting', async () => {
    const dir = newProject();
    const config = { protectedBranches: ['main'], allowPush: false, checkCommand: 'npm test', pullRequest: { via: 'mcp', server: 'gitlab' }, protectedPaths: [] };
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'agent-workflow.json'), JSON.stringify(config));
    const asked = [];
    const tools = fakeTools(dir);
    const io = { ...quietIO(), async ask(question, fallback) { asked.push(question); return fallback; } };
    await init({ projectDir: dir, io, run: tools.run, fetchText: async () => '', language: 'English', checkCommand: 'npm test', optional: 'none', nextSteps: false });
    assert.ok(!asked.some((q) => q.includes('pull requests')));
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')), config);
  });
});

// `npx github:...` runs the kit from the packed package, not from a clone.
describe('installer from the published package', () => {
  const pack = spawnSync('npm pack --dry-run --json', { cwd: KIT_ROOT, shell: true, encoding: 'utf8' });
  const packed = JSON.parse(pack.stdout)[0].files.map((f) => f.path);

  it('exposes the CLI as the package binary', () => {
    const { name, bin } = JSON.parse(read(KIT_ROOT, 'package.json'));
    assert.equal(bin?.[name], 'bin/agent-workflow.js', 'npx runs the binary named after the package');
    assert.ok(packed.includes(bin[name]));
  });

  it('installs the kit from the packed files alone', async () => {
    const kit = mkdtempSync(path.join(tmpdir(), 'aw-package-'));
    for (const file of packed) cpSync(path.join(KIT_ROOT, file), path.join(kit, file));
    const packedInit = (await import(pathToFileURL(path.join(kit, 'installer', 'init.mjs')))).init;
    const dir = newProject();
    await install(dir, { initFrom: packedInit });
    for (const file of ['.claude/skills/close-change/SKILL.md', '.claude/hooks/agent-workflow/shared.mjs', 'openspec/config.yaml', 'AGENTS.md']) {
      assert.ok(existsSync(path.join(dir, file)), file);
    }
  });
});
