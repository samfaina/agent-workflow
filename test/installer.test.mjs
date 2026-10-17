import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { skillsWhere } from '../installer/catalog.mjs';
import { init } from '../installer/init.mjs';
import { sharedReferenceLinks } from '../installer/references.mjs';

const STOCK_CONFIG = 'schema: spec-driven\n\n# Project context (optional)\n#   context: |\n';

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

async function install(projectDir, { answer = false, optional = 'none' } = {}) {
  const tools = fakeTools(projectDir);
  const io = quietIO(answer);
  await init({
    projectDir,
    io,
    run: tools.run,
    fetchText: async (url) => `# ${path.basename(url)}\n`,
    language: 'Spanish',
    checkCommand: 'npm test',
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

    for (const file of ['.claude/skills/close-change/SKILL.md', '.claude/hooks/agent-workflow/git-guard.mjs', '.claude/hooks/agent-workflow/shared.mjs', 'docs/agents/issue-tracker.md', 'docs/agents/domain.md']) {
      assert.ok(existsSync(path.join(dir, file)), file);
    }
    assert.equal(JSON.parse(read(dir, '.claude/agent-workflow.json')).checkCommand, 'npm test');
    assert.equal(JSON.parse(read(dir, '.claude/settings.json')).hooks.PreToolUse.length, 2);
    assert.match(read(dir, 'openspec/config.yaml'), /Ticket format/);
    assert.match(read(dir, 'AGENTS.md'), /^<!-- agent-workflow:start -->/);
    assert.match(read(dir, 'CLAUDE.md'), /Talk to the user in Spanish/);
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
    const before = ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', 'openspec/config.yaml'].map((f) => read(dir, f));
    const { io, commands } = await install(dir);
    const after = ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', 'openspec/config.yaml'].map((f) => read(dir, f));
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
    for (const [file, content] of Object.entries(files)) assert.equal(read(dir, file), content, file);
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
    assert.equal(commands.filter((c) => c.includes('agent-workflow')).length, 3);
    assert.match(read(dir, 'docs/agents/issue-tracker.md'), /Issue tracker: OpenSpec/);
    assert.ok(!existsSync(path.join(dir, '.claude', 'commands', 'opsx')));
  });
});
