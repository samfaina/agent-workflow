import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { skillsWhere } from '../installer/catalog.mjs';
import { defaultRun, init, KIT_ROOT, STATUS_COMMAND } from '../installer/init.mjs';
import { PassThrough } from 'node:stream';
import { createConsoleIO } from '../installer/io.mjs';
import { detectPullRequestPreset, parsePullRequest, pullRequestFollowUp, pullRequestQuestion } from '../installer/pull-request.mjs';
import { sharedReferenceLinks } from '../installer/references.mjs';
import { parseTracker } from '../installer/tracker.mjs';
import { shellQuote } from '../hooks/status.mjs';

const KIT_HOOKS = JSON.parse(readFileSync(new URL('../templates/.claude/settings.json', import.meta.url), 'utf8')).hooks.PreToolUse;
const STOCK_CONFIG ='schema: spec-driven\n\n# Project context (optional)\n#   context: |\n';

// Simulates the Skills CLI, OpenSpec and git config so the installer runs
// offline; git itself judges branch names and lists branches. `gitUser` is the clone's
// agent-workflow.user, empty when unset.
function fakeTools(projectDir, { gitUser = '' } = {}) {
  const commands = [];
  const run = (command) => {
    commands.push(command);
    if (command.endsWith('--version')) return { status: 0, stdout: '1.14.3' };
    if (command.startsWith('git check-ref-format ')) return defaultRun(command, { cwd: projectDir, quiet: true });
    if (command.startsWith('git for-each-ref ')) return defaultRun(command, { cwd: projectDir, quiet: true });
    if (command === 'git config --get agent-workflow.user') return { status: gitUser ? 0 : 1, stdout: gitUser ? `${gitUser}\n` : '' };
    if (command.startsWith('git config agent-workflow.user ')) return { status: 0, stdout: '' };
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

// Answers every confirmation with `answer` and records the questions, and each one's default.
function quietIO(answer = false) {
  const questions = [];
  const defaults = [];
  const logs = [];
  return {
    questions,
    defaults,
    logs,
    log(message = '') { logs.push(message); },
    warn(message) { questions.push(`WARN ${message}`); },
    async choose({ choices, selected = 0 }) { return choices[selected].value; },
    async chooseMany() { return []; },
    async ask({ fallback = '' }) { return fallback; },
    async confirm(question, fallback = false, detail = '') {
      questions.push(detail ? `${question} ${detail}` : question);
      defaults.push([question, fallback]);
      return answer;
    },
    close() {},
  };
}

// `homeDir` stands in for the user's home, so the real ~/.claude/settings.json is never read.
async function install(projectDir, { answer = false, optional = 'none', pullRequest, branch, protectedBranches, user, tracker, statusLine, homeDir = mkdtempSync(path.join(tmpdir(), 'aw-home-')), initFrom = init } = {}) {
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
    branch,
    protectedBranches,
    user,
    tracker,
    statusLine,
    homeDir,
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

    for (const file of ['.claude/skills/close-change/SKILL.md', '.claude/skills/light-change/SKILL.md', '.claude/skills/now-what/SKILL.md', '.claude/hooks/agent-workflow/git-guard.mjs', '.claude/hooks/agent-workflow/shared.mjs', 'docs/agents/issue-tracker.md', 'docs/agents/domain.md']) {
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
    // The declined status line is offered again (see "installer status line").
    assert.deepEqual(io.questions.filter((q) => !q.startsWith('Reinstall') && !q.startsWith('Show where the change stands')), []);
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
    assert.deepEqual(JSON.parse(read(dir, '.claude/settings.local.json')), {
      language: 'spanish',
      permissions: { allow: ['Bash(ls)'] },
      statusLine: { type: 'command', command: `${STATUS_COMMAND} --statusline` },
    });
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

describe('installer status command', () => {
  function nodeProject(scripts) {
    const dir = newProject();
    writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'demo', scripts }, null, 4)}\n`);
    return dir;
  }

  it('installs the status module with the hooks', async () => {
    const dir = newProject();
    await install(dir);
    assert.ok(existsSync(path.join(dir, '.claude', 'hooks', 'agent-workflow', 'status.mjs')));
  });

  it('adds a workflow:status script to package.json, keeping its other scripts and indentation', async () => {
    const dir = nodeProject({ test: 'node --test' });
    const { io } = await install(dir, { answer: true });
    assert.ok(io.questions.some((q) => q.startsWith('Add a "workflow:status" script to package.json?')));
    assert.equal(read(dir, 'package.json'), `${JSON.stringify({ name: 'demo', scripts: { test: 'node --test', 'workflow:status': STATUS_COMMAND } }, null, 4)}\n`);

    const again = await install(dir, { answer: true });
    assert.ok(!again.io.questions.some((q) => q.includes('workflow:status')), 'not offered once it is there');
  });

  it('leaves package.json alone when the user says no', async () => {
    const dir = nodeProject({ test: 'node --test' });
    const before = read(dir, 'package.json');
    await install(dir, { answer: false });
    assert.equal(read(dir, 'package.json'), before);
  });

  it('asks before replacing a workflow:status script of the project\'s own', async () => {
    const dir = nodeProject({ 'workflow:status': 'echo mine' });
    const { io } = await install(dir, { answer: false });
    assert.ok(io.questions.some((q) => q.startsWith('Replace the "workflow:status" script in package.json?')));
    assert.equal(JSON.parse(read(dir, 'package.json')).scripts['workflow:status'], 'echo mine');
  });

  it('prints a shell alias when the project has no package.json', async () => {
    const dir = newProject();
    const { io } = await install(dir);
    const printed = io.logs.join('\n');
    assert.ok(printed.includes(`alias workflow-status='${STATUS_COMMAND}'`), printed);
    assert.ok(printed.includes(`function workflow-status { ${STATUS_COMMAND} @args }`), printed);
    assert.ok(!existsSync(path.join(dir, 'package.json')));
  });
});

describe('installer status line', () => {
  const STATUS_LINE = { type: 'command', command: `${STATUS_COMMAND} --statusline` };
  const offered = (io) => io.questions.some((q) => q.startsWith('Show where the change stands in Claude Code\'s status line?'));

  it('writes the status line to the local settings, keeping the language', async () => {
    const dir = newProject();
    const { io } = await install(dir, { answer: true });
    assert.ok(offered(io));
    assert.deepEqual(JSON.parse(read(dir, '.claude/settings.local.json')), { language: 'spanish', statusLine: STATUS_LINE });
    assert.equal(JSON.parse(read(dir, '.claude/settings.json')).statusLine, undefined, 'not imposed on the team');
  });

  const mine = { type: 'command', command: 'my-statusline.sh' };
  function withStatusLine(file) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ statusLine: mine }));
  }

  for (const file of ['.claude/settings.json', '.claude/settings.local.json']) {
    it(`is not offered when ${file} already has a status line`, async () => {
      const dir = newProject();
      withStatusLine(path.join(dir, file));
      const { io } = await install(dir, { answer: true });
      assert.deepEqual(io.questions.filter((q) => /status line/.test(q)), []);
      assert.deepEqual(JSON.parse(read(dir, '.claude/settings.local.json')).statusLine, file === '.claude/settings.local.json' ? mine : undefined);
    });
  }

  // The local settings outrank the user's, so the kit's line replaces theirs in this project only.
  const offeredInstead = (io) => io.questions.some((q) => q.startsWith('Use the kit\'s status line in this project instead of yours?'));

  it('offers to replace the user\'s own status line in this project only, defaulting to no', async () => {
    const homeDir = mkdtempSync(path.join(tmpdir(), 'aw-home-'));
    withStatusLine(path.join(homeDir, '.claude', 'settings.json'));
    const declined = newProject();
    const { io } = await install(declined, { answer: false, homeDir });
    assert.ok(offeredInstead(io) && !offered(io));
    assert.equal(io.defaults.find(([q]) => q.startsWith('Use the kit\'s status line'))[1], false);
    assert.equal(JSON.parse(read(declined, '.claude/settings.local.json')).statusLine, undefined);

    const accepted = newProject();
    await install(accepted, { answer: true, homeDir });
    assert.deepEqual(JSON.parse(read(accepted, '.claude/settings.local.json')).statusLine, STATUS_LINE);
    assert.deepEqual(JSON.parse(read(homeDir, '.claude/settings.json')).statusLine, mine, 'the user\'s settings are not touched');
    assert.ok(!offeredInstead((await install(accepted, { answer: true, homeDir })).io), 'not offered once it is there');
  });

  it('asks the first question with yes as the default', async () => {
    const { io } = await install(newProject());
    assert.equal(io.defaults.find(([q]) => q.startsWith('Show where the change stands'))[1], true);
  });

  it('is skipped with --yes', async () => {
    const dir = newProject();
    const { io } = await install(dir, { answer: true, statusLine: false });
    assert.ok(!offered(io));
    assert.equal(JSON.parse(read(dir, '.claude/settings.local.json')).statusLine, undefined);
  });

  it('is offered again on a later run until there is one', async () => {
    const dir = newProject();
    await install(dir, { answer: false });
    assert.equal(JSON.parse(read(dir, '.claude/settings.local.json')).statusLine, undefined, 'declined');
    assert.ok(offered((await install(dir, { answer: true })).io));
    assert.deepEqual(JSON.parse(read(dir, '.claude/settings.local.json')).statusLine, STATUS_LINE);
    assert.ok(!offered((await install(dir, { answer: true })).io));
  });
});

describe('installer pull request setting', () => {
  it('stores the command given with --pull-request', async () => {
    const dir = newProject();
    await install(dir, { pullRequest: 'tea pr create --base {base} --head {branch} --title {title}' });
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')).pullRequest, { via: 'cli', command: 'tea pr create --base {base} --head {branch} --title {title}' });
  });

  it('parses none, presets, mcp:<server> and commands', () => {
    assert.deepEqual(parsePullRequest(''), { via: 'none' });
    assert.match(parsePullRequest('github').command, /^gh pr create /);
    assert.match(parsePullRequest('gitlab').command, /^glab mr create /);
    assert.deepEqual(parsePullRequest('bitbucket'), { via: 'mcp', server: 'atlassian' });
    assert.deepEqual(parsePullRequest(' none '), { via: 'none' });
    assert.deepEqual(parsePullRequest('mcp:gitlab'), { via: 'mcp', server: 'gitlab' });
    assert.deepEqual(parsePullRequest('glab mr create'), { via: 'cli', command: 'glab mr create' });
    assert.throws(() => parsePullRequest('mcp:'), /name of the MCP server/);
  });

  const hostTools = (remote, installed) => (command) => {
    if (command === 'git remote get-url origin') return remote ? { status: 0, stdout: `${remote}\n` } : { status: 2, stdout: '' };
    return { status: installed.some((cli) => command === `${cli} --version`) ? 0 : 1, stdout: '' };
  };

  it('proposes the CLI of the remote\'s code host only when it is installed', () => {
    assert.equal(detectPullRequestPreset('.', hostTools('git@github.com:me/app.git', ['gh'])), 'github');
    assert.equal(detectPullRequestPreset('.', hostTools('https://gitlab.example.com/me/app.git', ['glab'])), 'gitlab');
    assert.equal(detectPullRequestPreset('.', hostTools('git@github.com:me/app.git', [])), '');
    assert.equal(detectPullRequestPreset('.', hostTools('https://bitbucket.org/me/app.git', ['gh', 'glab'])), '');
    assert.equal(detectPullRequestPreset('.', hostTools(null, ['gh'])), '');
  });

  it('defaults the question to the detected host, otherwise to none', () => {
    const selected = (tools) => { const q = pullRequestQuestion('.', tools); return q.choices[q.selected].label; };
    assert.equal(selected(hostTools('git@github.com:me/app.git', ['gh'])), 'GitHub');
    assert.equal(selected(hostTools('git@github.com:me/app.git', [])), 'None');
  });

  it('says what is still missing for the chosen tool', () => {
    const none = hostTools(null, []);
    assert.match(pullRequestFollowUp(parsePullRequest('github'), '.', none).step, /Install gh .*gh auth login/);
    assert.match(pullRequestFollowUp(parsePullRequest('github'), '.', none).warning, /gh is not installed/);
    assert.equal(pullRequestFollowUp(parsePullRequest('github'), '.', hostTools(null, ['gh'])), null);
    assert.match(pullRequestFollowUp(parsePullRequest('bitbucket'), '.', none).step, /`atlassian` MCP server.*support\.atlassian\.com/);
    assert.match(pullRequestFollowUp(parsePullRequest('mcp:gitea'), '.', none).step, /`gitea` MCP server.*claude mcp add/);
    assert.equal(pullRequestFollowUp(parsePullRequest('tea pr create'), '.', none), null);
    assert.equal(pullRequestFollowUp(parsePullRequest('none'), '.', none), null);
  });

  it('adds the answered settings to an existing config without confirming them, and keeps the user\'s values', async () => {
    const dir = newProject();
    const old = { protectedBranches: ['develop'], allowPush: true, checkCommand: 'pnpm test', protectedPaths: ['.env'] };
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'agent-workflow.json'), JSON.stringify(old));
    const { io } = await install(dir, { pullRequest: 'mcp:bitbucket' });
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')), { ...old, pullRequest: { via: 'mcp', server: 'bitbucket' }, tracker: { via: 'none' }, branch: 'change/{change}' });
    assert.ok(!io.questions.some((q) => q.startsWith('Add ')), io.questions.join(' | '));
    assert.ok(io.logs.includes('  updated .claude/agent-workflow.json'), io.logs.join(' | '));
  });

  it('adds the answered check command and the --tracker setting to a config that lacks them without confirming them', async () => {
    const dir = newProject();
    const old = { protectedBranches: ['main'], allowPush: false, pullRequest: { via: 'none' }, protectedPaths: [] };
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'agent-workflow.json'), JSON.stringify(old));
    const { io } = await install(dir, { tracker: 'mcp:jira' });
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')), { ...old, checkCommand: 'npm test', tracker: { via: 'mcp', server: 'jira' }, branch: 'change/{change}' });
    assert.ok(!io.questions.some((q) => q.startsWith('Add ')), io.questions.join(' | '));
  });

  it('confirms the missing settings nobody was asked about, and still adds the answered ones when the user declines', async () => {
    const dir = newProject();
    const old = { allowPush: true, checkCommand: 'pnpm test' };
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'agent-workflow.json'), JSON.stringify(old));
    const { io } = await install(dir, { pullRequest: 'github' });
    assert.ok(io.questions.includes('Add protectedPaths to .claude/agent-workflow.json? Existing settings are kept.'), io.questions.join(' | '));
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')), { ...old, protectedBranches: ['main', 'master'], pullRequest: parsePullRequest('github'), tracker: { via: 'none' }, branch: 'change/{change}' });
    assert.ok(io.logs.includes('  updated .claude/agent-workflow.json'), io.logs.join(' | '));
  });

  it('adds every missing setting when the user accepts, as --yes does', async () => {
    const dir = newProject();
    const old = { allowPush: true, checkCommand: 'pnpm test' };
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'agent-workflow.json'), JSON.stringify(old));
    await install(dir, { answer: true, pullRequest: 'none', tracker: 'mcp:jira' });
    const config = JSON.parse(read(dir, '.claude/agent-workflow.json'));
    assert.deepEqual(Object.keys(config), ['allowPush', 'checkCommand', 'protectedBranches', 'branch', 'pullRequest', 'tracker', 'protectedPaths']);
    assert.equal(config.allowPush, true);
    assert.equal(config.checkCommand, 'pnpm test');
    assert.deepEqual(config.protectedBranches, ['main', 'master']);
    assert.deepEqual(config.tracker, { via: 'mcp', server: 'jira' });
  });

  it('keeps a config whose only missing settings were declined', async () => {
    const dir = newProject();
    const old = { checkCommand: 'npm test', protectedBranches: ['main'], pullRequest: { via: 'none' }, tracker: { via: 'none' }, branch: 'change/{change}' };
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'agent-workflow.json'), JSON.stringify(old));
    const { io } = await install(dir);
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')), old);
    assert.ok(io.logs.includes('  kept .claude/agent-workflow.json'), io.logs.join(' | '));
  });

  it('does not ask again when the config already has the setting', async () => {
    const dir = newProject();
    const config = { protectedBranches: ['main'], allowPush: false, checkCommand: 'npm test', pullRequest: { via: 'mcp', server: 'gitlab' }, tracker: { via: 'none' }, branch: 'feature/{ref}-{change}', protectedPaths: [] };
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'agent-workflow.json'), JSON.stringify(config));
    const asked = [];
    const tools = fakeTools(dir);
    const io = { ...quietIO(), async choose(question) { asked.push(question.title); return question.choices[question.selected ?? 0].value; } };
    await init({ projectDir: dir, io, run: tools.run, fetchText: async () => '', language: 'English', checkCommand: 'npm test', optional: 'none', nextSteps: false });
    assert.ok(!asked.includes('Pull requests'));
    assert.ok(!asked.includes('Branch names'));
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')), config);
  });
});

describe('installer branch setting', () => {
  const writtenBranch = (dir) => JSON.parse(read(dir, '.claude/agent-workflow.json')).branch;

  it('stores the pattern given with --branch', async () => {
    const dir = newProject();
    const { io } = await install(dir, { pullRequest: 'none', branch: 'feature/{ref}-{change}' });
    assert.equal(JSON.parse(read(dir, '.claude/agent-workflow.json')).branch, 'feature/{ref}-{change}');
    assert.ok(!io.questions.some((q) => q.startsWith('Add ')), io.questions.join(' | '));
  });

  it('rejects a --branch without {change}, with an unknown placeholder, or that git rejects, before writing anything', async () => {
    for (const [pattern, reason] of [
      ['feature/{ref}', /needs \{change\}/],
      ['feature/{ticket}-{change}', /unknown placeholder \{ticket\}/],
      ['feature/{ref} {change}', /gives feature\/PROJ-123 add-greeting, which git rejects/],
    ]) {
      const dir = newProject();
      await assert.rejects(install(dir, { pullRequest: 'none', branch: pattern }), reason, pattern);
      assert.ok(!existsSync(path.join(dir, '.claude')), `${pattern}: nothing written`);
    }
  });

  // Answers the branch question with `answers` in turn, and records each question.
  function branchIO(answers, { user = '' } = {}) {
    const io = quietIO();
    const asked = [];
    return {
      ...io,
      asked,
      async choose(question) {
        asked.push(`${question.step} ${question.title}`);
        return question.title === 'Branch names' ? answers.shift() : question.choices[question.selected ?? 0].value;
      },
      async ask(question) { asked.push(question.title); return user; },
    };
  }

  const initWith = (dir, io, { gitUser, ...options } = {}) => {
    const tools = fakeTools(dir, { gitUser });
    return init({
      projectDir: dir, io, run: tools.run, fetchText: async () => '', language: 'English', checkCommand: 'npm test', tracker: 'none', optional: 'none', nextSteps: false, ...options,
    }).then(() => tools.commands);
  };

  it('asks after the pull requests, the default first, and again until the pattern is valid', async () => {
    const dir = newProject();
    const io = branchIO(['feature/{ticket}', 'feature/{ref}-{change}']);
    await initWith(dir, io);
    assert.deepEqual(io.asked.filter((q) => /Pull requests|Branch names$/.test(q)), ['3/5 Pull requests', '4/5 Branch names', '4/5 Branch names']);
    assert.ok(io.questions.some((q) => q.startsWith('WARN The branch pattern "feature/{ticket}" needs {change}')), io.questions.join(' | '));
    assert.equal(writtenBranch(dir).develop, 'feature/{ref}-{change}');
  });

  // Records each question, answering the first branch question with `pattern`
  // and the question of each base in `perBase` with its value, the rest with their default.
  function perBaseIO(pattern, perBase = {}) {
    const io = quietIO();
    const asked = [];
    return {
      ...io,
      asked,
      async choose(question) {
        asked.push(question);
        if (question.title === 'Branch names') return pattern;
        const base = question.title.match(/^Branch names for changes based on (.+)$/)?.[1];
        const answer = base === undefined ? undefined : perBase[base];
        return Array.isArray(answer) ? answer.shift() : answer ?? question.choices[question.selected ?? 0].value;
      },
    };
  }
  const perBaseQuestions = (io) => io.asked.filter((q) => q.title.startsWith('Branch names for'));

  it('asks a pattern for each protected branch after the first, offering hotfix/ for feature/, and writes an object when they differ', async () => {
    const dir = newProject();
    const io = perBaseIO('feature/{ref}__{change}');
    await initWith(dir, io, { pullRequest: 'none', protectedBranches: 'develop,main,release' });
    assert.deepEqual(perBaseQuestions(io).map((q) => `${q.step} ${q.title}`), ['3/3 Branch names for changes based on main', '3/3 Branch names for changes based on release']);
    assert.deepEqual(perBaseQuestions(io)[0].choices.map((c) => c.label), ['hotfix/{ref}__{change}', 'feature/{ref}__{change}', 'Other pattern…']);
    assert.deepEqual(writtenBranch(dir), { develop: 'feature/{ref}__{change}', main: 'hotfix/{ref}__{change}', release: 'hotfix/{ref}__{change}' });
  });

  it('writes a string when every per-base answer matches the first pattern, and asks no more with one protected branch', async () => {
    const same = newProject();
    const io = perBaseIO('{ref}__{change}--{user}');
    await initWith(same, io, { pullRequest: 'none', protectedBranches: 'develop,main', user: 'SF' });
    assert.deepEqual(perBaseQuestions(io)[0].choices.map((c) => c.label), ['{ref}__{change}--{user}', 'Other pattern…']);
    assert.equal(writtenBranch(same), '{ref}__{change}--{user}');
    const matching = newProject();
    await initWith(matching, perBaseIO('feature/{ref}__{change}', { main: 'feature/{ref}__{change}' }), { pullRequest: 'none', protectedBranches: 'develop,main' });
    assert.equal(writtenBranch(matching), 'feature/{ref}__{change}');
    const single = newProject();
    const one = perBaseIO('feature/{ref}__{change}');
    await initWith(single, one, { pullRequest: 'none', protectedBranches: 'main' });
    assert.deepEqual(perBaseQuestions(one), []);
    assert.equal(writtenBranch(single), 'feature/{ref}__{change}');
  });

  it('asks the per-base question again until the pattern is valid', async () => {
    const dir = newProject();
    const io = perBaseIO('feature/{ref}__{change}', { main: ['hotfix/{ref}', 'hotfix/{change}'] });
    await initWith(dir, io, { pullRequest: 'none', protectedBranches: 'develop,main' });
    assert.equal(perBaseQuestions(io).length, 2);
    assert.ok(io.questions.some((q) => q.startsWith('WARN The branch pattern "hotfix/{ref}" needs {change}')), io.questions.join(' | '));
    assert.deepEqual(writtenBranch(dir), { develop: 'feature/{ref}__{change}', main: 'hotfix/{change}' });
  });

  it('asks no per-base question when --branch is given', async () => {
    const dir = newProject();
    const io = perBaseIO('unused');
    await initWith(dir, io, { pullRequest: 'none', branch: 'feature/{ref}__{change}', protectedBranches: 'develop,main' });
    assert.deepEqual(io.asked, []);
    assert.equal(writtenBranch(dir), 'feature/{ref}__{change}');
  });

  it('keeps the branch of an existing config without asking, and asks once when it is missing', async () => {
    const dir = newProject();
    const config = { protectedBranches: ['develop', 'main'], allowPush: false, checkCommand: 'npm test', pullRequest: { via: 'none' }, tracker: { via: 'none' }, protectedPaths: [] };
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'agent-workflow.json'), JSON.stringify(config));
    const first = branchIO(['feature/{ref}-{change}']);
    await initWith(dir, first);
    assert.deepEqual(first.asked, ['3/3 Branch names', '3/3 Branch names for changes based on main']);
    assert.ok(!first.questions.some((q) => q.startsWith('Add ')), first.questions.join(' | '));
    const branch = { develop: 'feature/{ref}-{change}', main: 'hotfix/{ref}-{change}' };
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')), { ...config, branch });
    const again = branchIO([]);
    await initWith(dir, again);
    assert.deepEqual(again.asked, []);
    assert.deepEqual(writtenBranch(dir), branch);
  });

  it('stores a pattern per base branch given with --branch-for, without asking', async () => {
    const dir = newProject();
    const io = branchIO([]);
    await initWith(dir, io, { branch: 'feature/{ref}__{change}', branchFor: ['main=hotfix/{ref}__{change}'], protectedBranches: 'develop,main', pullRequest: 'none' });
    assert.deepEqual(io.asked, []);
    assert.deepEqual(writtenBranch(dir), { develop: 'feature/{ref}__{change}', main: 'hotfix/{ref}__{change}' });
    assert.match(read(dir, '.claude/agent-workflow.json'), /"branch": \{ "develop": "feature\/\{ref\}__\{change\}", "main": "hotfix\/\{ref\}__\{change\}" \},/);
  });

  it('writes a string when every --branch-for matches the other patterns', async () => {
    const dir = newProject();
    await initWith(dir, branchIO([]), { branch: 'change/{change}', branchFor: ['main=change/{change}'], protectedBranches: 'develop,main', pullRequest: 'none' });
    assert.equal(writtenBranch(dir), 'change/{change}');
  });

  it('rejects a branch setting with a base outside the protected branches, with no base, or with a bad pattern, before writing anything', async () => {
    for (const [options, reason] of [
      [{ branchFor: ['release=release/{change}'] }, /pattern for "release", which is not a protected branch \(develop, main\)/],
      [{ branch: {} }, /names no base branch/],
      [{ branch: { develop: 'feature/{change}', staging: 'staging/{change}' } }, /pattern for "staging", which is not a protected branch/],
      [{ branchFor: ['main'] }, /--branch-for takes <base>=<pattern>/],
      [{ branchFor: ['main=hotfix/{ref}'] }, /needs \{change\}/],
    ]) {
      const dir = newProject();
      await assert.rejects(initWith(dir, branchIO([]), { protectedBranches: 'develop,main', pullRequest: 'none', ...options }), reason, JSON.stringify(options));
      assert.ok(!existsSync(path.join(dir, '.claude')), `${JSON.stringify(options)}: nothing written`);
    }
  });

  const setUser = (value) => `git config agent-workflow.user ${shellQuote(value)}`;

  it('sets git config agent-workflow.user from the answer when the pattern uses {user}', async () => {
    const dir = newProject();
    const io = branchIO(['{ref}__{change}--{user}'], { user: 'SF' });
    const commands = await initWith(dir, io);
    assert.ok(io.asked.includes('Your value for {user}'), io.asked.join(' | '));
    assert.ok(commands.includes(setUser('SF')), commands.join(' | '));
  });

  it('sets git config agent-workflow.user from --user without asking', async () => {
    const dir = newProject();
    const io = branchIO([]);
    const commands = await initWith(dir, io, { branch: '{ref}__{change}--{user}', user: 'SF' });
    assert.ok(!io.asked.includes('Your value for {user}'));
    assert.ok(commands.includes(setUser('SF')), commands.join(' | '));
  });

  it('leaves agent-workflow.user alone when it is set, when the answer is empty, or when the pattern has no {user}', async () => {
    const set = branchIO(['{ref}__{change}--{user}'], { user: 'XX' });
    const kept = await initWith(newProject(), set, { gitUser: 'SF' });
    assert.ok(!set.asked.includes('Your value for {user}'));
    assert.ok(!kept.some((c) => c.startsWith('git config agent-workflow.user ')), kept.join(' | '));
    const empty = await initWith(newProject(), branchIO(['{ref}__{change}--{user}']));
    assert.ok(!empty.some((c) => c.startsWith('git config agent-workflow.user ')), empty.join(' | '));
    const none = branchIO(['feature/{ref}-{change}'], { user: 'SF' });
    const unused = await initWith(newProject(), none, { user: 'SF' });
    assert.ok(!none.asked.includes('Your value for {user}'));
    assert.ok(!unused.some((c) => c.startsWith('git config agent-workflow.user ')), unused.join(' | '));
  });
});

describe('installer protected branches', () => {
  it('stores the branches given with --protected-branches without asking', async () => {
    const dir = newProject();
    const { io } = await install(dir, { pullRequest: 'none', protectedBranches: ' develop , main ,' });
    assert.equal(read(dir, '.claude/agent-workflow.json').match(/"protectedBranches": .*/)[0], '"protectedBranches": ["develop", "main"],');
    assert.ok(!io.questions.some((q) => q.startsWith('Add ')), io.questions.join(' | '));
  });

  it('rejects an empty --protected-branches, or a name git rejects, before writing anything', async () => {
    for (const [list, reason] of [
      ['', /at least one/],
      [' , ', /at least one/],
      ['main, bad name', /"bad name", which git rejects/],
    ]) {
      const dir = newProject();
      await assert.rejects(install(dir, { pullRequest: 'none', protectedBranches: list }), reason, list);
      assert.ok(!existsSync(path.join(dir, '.claude')), `${list}: nothing written`);
    }
  });

  // Answers the protected branches question with `answers` in turn, and records each question.
  function protectedIO(answers) {
    const io = quietIO();
    const asked = [];
    return {
      ...io,
      asked,
      async choose(question) {
        asked.push(question);
        const selected = question.choices[question.selected ?? 0].value;
        return question.title === 'Protected branches' && answers.length ? answers.shift() : selected;
      },
    };
  }

  const initWith = (dir, io, options = {}) => init({
    projectDir: dir, io, run: fakeTools(dir).run, fetchText: async () => '', language: 'English', checkCommand: 'npm test', pullRequest: 'none', tracker: 'none', optional: 'none', nextSteps: false, ...options,
  });
  const protectedQuestions = (io) => io.asked.filter((q) => q.title === 'Protected branches');
  const written = (dir) => JSON.parse(read(dir, '.claude/agent-workflow.json')).protectedBranches;

  // A real repository with one commit, and `refs` pointing at it.
  function gitProject(refs) {
    const dir = mkdtempSync(path.join(tmpdir(), 'aw-git-'));
    const git = (...args) => assert.equal(spawnSync('git', args, { cwd: dir }).status, 0, args.join(' '));
    git('init', '-q');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'start');
    for (const ref of refs) git('update-ref', ref, 'HEAD');
    return dir;
  }

  it('asks after the branch names, with main, master first and taken under --yes', async () => {
    const dir = newProject();
    const io = protectedIO([]);
    await initWith(dir, io);
    assert.deepEqual(io.asked.map((q) => `${q.step} ${q.title}`).slice(-3), ['3/4 Branch names', '4/4 Protected branches', '4/4 Branch names for changes based on master']);
    assert.deepEqual(protectedQuestions(io)[0].choices.map((c) => c.label), ['main, master', 'develop, main', 'Other list…']);
    assert.deepEqual(written(dir), ['main', 'master']);
    assert.equal(JSON.parse(read(dir, '.claude/agent-workflow.json')).branch, 'change/{change}', 'one pattern for both, written as a string');
  });

  it('offers develop, main first when the repository has a develop branch, local or remote-tracking', async () => {
    for (const refs of [['refs/heads/develop'], ['refs/remotes/origin/develop']]) {
      const dir = gitProject(refs);
      const io = protectedIO([]);
      await initWith(dir, io, { branch: 'change/{change}' });
      assert.equal(protectedQuestions(io)[0].choices[0].label, 'develop, main', refs[0]);
      assert.deepEqual(written(dir), ['develop', 'main'], refs[0]);
    }
    const other = gitProject(['refs/heads/developer', 'refs/heads/develop/next', 'refs/remotes/origin/feature/develop']);
    const io = protectedIO([]);
    await initWith(other, io, { branch: 'change/{change}' });
    assert.equal(protectedQuestions(io)[0].choices[0].label, 'main, master');
  });

  it('offers develop, main first when the gitflow branch pattern is chosen in the same run', async () => {
    const dir = newProject();
    const io = protectedIO([]);
    await initWith(dir, { ...io, async choose(question) { return question.title === 'Branch names' ? 'feature/{ref}-{change}' : io.choose(question); } });
    assert.equal(protectedQuestions(io)[0].choices[0].label, 'develop, main');
    assert.deepEqual(written(dir), ['develop', 'main']);
  });

  it('asks again until the list is valid', async () => {
    const dir = newProject();
    const io = protectedIO([' , ', 'main, bad name', 'trunk, release ']);
    await initWith(dir, io, { branch: 'change/{change}' });
    assert.equal(protectedQuestions(io).length, 3);
    assert.ok(io.questions.some((q) => q.startsWith('WARN Name at least one protected branch')), io.questions.join(' | '));
    assert.ok(io.questions.some((q) => q.startsWith('WARN The protected branches name "bad name"')), io.questions.join(' | '));
    assert.deepEqual(written(dir), ['trunk', 'release']);
    const gitflow = gitProject(['refs/heads/develop']);
    const again = protectedIO(['', 'develop,main']);
    await initWith(gitflow, again, { branch: 'change/{change}' });
    assert.deepEqual(protectedQuestions(again).map((q) => q.choices[0].label), ['develop, main', 'develop, main']);
  });

  it('keeps the protected branches of an existing config without asking, and asks once when they are missing', async () => {
    const dir = newProject();
    const config = { branch: 'change/{change}', allowPush: false, checkCommand: 'npm test', pullRequest: { via: 'none' }, tracker: { via: 'none' }, protectedPaths: [] };
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'agent-workflow.json'), JSON.stringify(config));
    const first = protectedIO(['develop, main']);
    await initWith(dir, first, { pullRequest: undefined, tracker: undefined });
    assert.deepEqual(first.asked.map((q) => `${q.step} ${q.title}`), ['3/3 Protected branches']);
    assert.ok(!first.questions.some((q) => q.startsWith('Add ')), first.questions.join(' | '));
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')), { ...config, protectedBranches: ['develop', 'main'] });
    const again = protectedIO([]);
    await initWith(dir, again, { pullRequest: undefined, tracker: undefined });
    assert.deepEqual(again.asked, []);
    assert.deepEqual(written(dir), ['develop', 'main']);
  });
});

describe('installer tracker setting', () => {
  it('parses none, mcp:<server> and commands', () => {
    assert.deepEqual(parseTracker(''), { via: 'none' });
    assert.deepEqual(parseTracker(' none '), { via: 'none' });
    assert.deepEqual(parseTracker('mcp:jira'), { via: 'mcp', server: 'jira' });
    assert.deepEqual(parseTracker('mcp: linear '), { via: 'mcp', server: 'linear' });
    assert.deepEqual(parseTracker('my-tracker comment {ref} --body-file {messageFile}'), { via: 'cli', command: 'my-tracker comment {ref} --body-file {messageFile}' });
    assert.throws(() => parseTracker('mcp:'), /name of the MCP server/);
  });

  it('stores the setting given with --tracker', async () => {
    const dir = newProject();
    await install(dir, { pullRequest: 'none', tracker: 'mcp:jira' });
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')).tracker, { via: 'mcp', server: 'jira' });
  });

  // Answers the tracker question with `answers` in turn and each sample with `accept` in turn.
  function trackerIO(answers, accept) {
    const io = quietIO();
    const asked = [];
    return {
      ...io,
      asked,
      async ask(question) { asked.push(question); return answers.shift(); },
      async confirm(question, fallback, detail) {
        io.questions.push(`${question} ${detail}`);
        return question.startsWith('Post progress like this?') ? accept.shift() : false;
      },
    };
  }

  const initWith = (dir, io, options = {}) => init({
    projectDir: dir, io, run: fakeTools(dir).run, fetchText: async () => '', language: 'English', checkCommand: 'npm test', pullRequest: 'none', optional: 'none', nextSteps: false, ...options,
  });

  it('asks with the syntax of a command, the .mcp.json servers as hints, and none by default', async () => {
    const dir = newProject();
    writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { jira: {}, linear: {} } }));
    const io = trackerIO(['none'], []);
    await initWith(dir, io);
    const [question] = io.asked;
    assert.equal(question.title, 'Team tracker');
    assert.equal(question.fallback, 'none');
    assert.ok(question.detail.startsWith('How should the kit post progress to your team tracker? Type "none", "mcp:<server>", or a command using {ref}, {stage}, {message}, {messageFile}'), question.detail);
    assert.ok(question.detail.endsWith('(for example: my-tracker comment {ref} --body-file {messageFile})'), question.detail);
    assert.ok(question.lines.includes('MCP servers in .mcp.json: jira, linear'), question.lines.join(' | '));
    assert.ok(!io.questions.some((q) => q.startsWith('Post progress like this?')), 'none needs no sample');
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')).tracker, { via: 'none' });
  });

  it('shows a sample snapshot before accepting a channel, and asks again when it is refused or invalid', async () => {
    const dir = newProject();
    const command = 'my-tracker comment {ref} --body-file {messageFile}';
    const io = trackerIO(['mcp:', 'mcp:jira', command], [false, true]);
    await initWith(dir, io);
    assert.equal(io.asked.length, 3);
    assert.ok(io.questions.some((q) => q.startsWith('WARN mcp: needs the name of the MCP server')));
    const samples = io.questions.filter((q) => q.startsWith('Post progress like this?'));
    assert.equal(samples.length, 2);
    assert.match(samples[0], /`jira` MCP server/);
    assert.match(samples[0], /add-greeting: 2 of 4 tickets done/);
    assert.match(samples[1], /my-tracker comment .PROJ-123. --body-file /);
    assert.match(samples[1], /add-greeting: 2 of 4 tickets done/);
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')).tracker, { via: 'cli', command });
  });

  it('asks again on a re-run only when the config has no tracker', async () => {
    const dir = newProject();
    const config = { protectedBranches: ['main'], branch: 'change/{change}', allowPush: false, checkCommand: 'npm test', pullRequest: { via: 'none' }, protectedPaths: [] };
    mkdirSync(path.join(dir, '.claude'), { recursive: true });
    writeFileSync(path.join(dir, '.claude', 'agent-workflow.json'), JSON.stringify(config));
    const io = { ...trackerIO(['mcp:jira'], []), async confirm() { return true; } };
    await initWith(dir, io, { pullRequest: undefined });
    assert.deepEqual(io.asked.map((q) => `${q.step} ${q.title}`), ['3/3 Team tracker']);
    assert.deepEqual(JSON.parse(read(dir, '.claude/agent-workflow.json')), { ...config, tracker: { via: 'mcp', server: 'jira' } });
    const again = trackerIO([], []);
    await initWith(dir, again, { pullRequest: undefined });
    assert.equal(again.asked.length, 0);
  });
});

describe('installer questions', () => {
  it('asks the six questions as numbered steps and stores the answers', async () => {
    const dir = newProject();
    const tools = fakeTools(dir);
    const asked = [];
    const io = {
      ...quietIO(),
      async choose(question) { asked.push(`${question.step} ${question.title}`); return question.choices[question.selected ?? 0].value; },
      async ask(question) { asked.push(`${question.step} ${question.title}`); return question.fallback; },
    };
    await init({ projectDir: dir, io, run: tools.run, fetchText: async () => '', optional: 'none', nextSteps: false });
    assert.deepEqual(asked, ['1/6 Language', '2/6 Check command', '3/6 Pull requests', '4/6 Branch names', '5/6 Protected branches', '5/6 Branch names for changes based on master', '6/6 Team tracker']);
    const config = JSON.parse(read(dir, '.claude/agent-workflow.json'));
    assert.equal(config.checkCommand, '', 'with nothing detected, none is the default');
    assert.deepEqual(config.pullRequest, { via: 'none' });
    assert.equal(config.branch, 'change/{change}');
    assert.deepEqual(config.protectedBranches, ['main', 'master']);
    assert.deepEqual(config.tracker, { via: 'none' });
    assert.equal(JSON.parse(read(dir, '.claude/settings.local.json')).language, 'english');
  });

  it('installs the optional skills picked from the list', async () => {
    const dir = newProject();
    const tools = fakeTools(dir);
    const io = { ...quietIO(), async chooseMany({ choices }) { return [choices[0].value]; } };
    await init({ projectDir: dir, io, run: tools.run, fetchText: async () => '', language: 'English', checkCommand: '', pullRequest: 'none', nextSteps: false });
    const first = skillsWhere({ tier: 'optional' })[0].name;
    assert.ok(existsSync(path.join(dir, '.claude', 'skills', first, 'SKILL.md')), first);
  });
});

// Runs `ask` against a console IO fed `answers`, returning its result and output.
async function consoleSession(answers, ask, { env = {}, tty = false } = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  output.isTTY = tty;
  let shown = '';
  output.on('data', (chunk) => { shown += chunk; });
  const io = createConsoleIO({ input, output, env });
  input.end(answers.map((a) => `${a}\n`).join(''));
  const warnings = [];
  const warn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    return { result: await ask(io), shown, warnings };
  } finally {
    console.warn = warn;
    io.close();
  }
}

describe('console prompts', () => {
  const language = {
    step: '1/3',
    title: 'Language',
    detail: 'The language Claude talks to you in.',
    choices: [
      { label: 'English', value: 'English' },
      { label: 'Spanish', value: 'Spanish' },
      { label: 'Other…', input: { label: 'Language' } },
    ],
  };

  it('shows the title, explanation and each choice on its own line', async () => {
    const { result, shown } = await consoleSession([''], (io) => io.choose(language));
    assert.equal(result, 'English', 'Enter takes the default');
    assert.match(shown, /\[1\/3\] Language\n {6}The language Claude talks to you in\.\n/);
    assert.match(shown, /› 1\) English\n {4}2\) Spanish\n {4}3\) Other…\n/);
    assert.match(shown, /Choose \[1\]: /);
  });

  it('repeats the question after an invalid answer', async () => {
    const { result, warnings } = await consoleSession(['7', 'two', '2'], (io) => io.choose(language));
    assert.equal(result, 'Spanish');
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /from 1 to 3/);
  });

  it('reads free text under an "Other…" choice and goes back to the menu when it is empty', async () => {
    assert.equal((await consoleSession(['3', 'Catalan'], (io) => io.choose(language))).result, 'Catalan');
    assert.equal((await consoleSession(['3', '', '2'], (io) => io.choose(language))).result, 'Spanish');
    const server = { title: 'PR', choices: [{ label: 'Bitbucket', input: { label: 'Server', fallback: 'atlassian', value: (n) => `mcp:${n}` } }] };
    assert.equal((await consoleSession(['1', ''], (io) => io.choose(server))).result, 'mcp:atlassian');
  });

  it('reads a free-text answer under its notes, the fallback on Enter or once the input ends', async () => {
    const tracker = { step: '4/4', title: 'Team tracker', detail: 'How should the kit post progress?', lines: ['{ref}  the reference'], fallback: 'none' };
    const { result, shown } = await consoleSession(['mcp:jira'], (io) => io.ask(tracker));
    assert.equal(result, 'mcp:jira');
    assert.match(shown, /\[4\/4\] Team tracker\n {6}How should the kit post progress\?\n\n {4}\{ref\} {2}the reference\n {2}Answer \[none\]: /);
    assert.equal((await consoleSession([''], (io) => io.ask(tracker))).result, 'none');
    assert.equal((await consoleSession([], (io) => io.ask(tracker))).result, 'none');
  });

  it('takes the default once the input ends', async () => {
    assert.equal((await consoleSession([], (io) => io.choose({ ...language, selected: 1 }))).result, 'Spanish');
  });

  it('picks several choices from one list', async () => {
    const choices = ['a', 'b', 'c'].map((v) => ({ label: v, value: v }));
    assert.deepEqual((await consoleSession(['3, 1'], (io) => io.chooseMany({ title: 'Skills', choices }))).result, ['a', 'c']);
    assert.deepEqual((await consoleSession(['all'], (io) => io.chooseMany({ title: 'Skills', choices }))).result, ['a', 'b', 'c']);
    assert.deepEqual((await consoleSession([''], (io) => io.chooseMany({ title: 'Skills', choices }))).result, []);
    assert.deepEqual((await consoleSession(['4', '2'], (io) => io.chooseMany({ title: 'Skills', choices }))).result, ['b']);
  });

  it('asks yes/no questions with the explanation under the title', async () => {
    const { result, shown } = await consoleSession(['maybe', 'y'], (io) => io.confirm('Overwrite CLAUDE.md?', false, 'It already exists.'));
    assert.equal(result, true);
    assert.match(shown, /\? Overwrite CLAUDE\.md\?\n {2}It already exists\.\n {2}\[y\/N\]: /);
    assert.equal((await consoleSession([''], (io) => io.confirm('Delete them?', true))).result, true);
  });

  it('answers every question with its default under --yes', async () => {
    const io = createConsoleIO({ yes: true });
    assert.equal(await io.choose({ ...language, selected: 1 }), 'Spanish');
    assert.deepEqual(await io.chooseMany({ title: 'Skills', choices: language.choices }), []);
    assert.equal(await io.confirm('Overwrite?', false), false);
  });

  it('colours only a terminal, and never with NO_COLOR', async () => {
    const ansi = /\u001b\[[\d;]*m/;
    assert.doesNotMatch((await consoleSession([''], (io) => io.choose(language))).shown, ansi);
    assert.doesNotMatch((await consoleSession([''], (io) => io.choose(language), { tty: true, env: { NO_COLOR: '1' } })).shown, ansi);
    assert.match((await consoleSession([''], (io) => io.choose(language), { tty: true })).shown, ansi);
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
