// `agent-workflow init`: installs the kit into the project in `projectDir`.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILLS, SOURCES, skillsWhere, specialistLines } from './catalog.mjs';
import { ensureGitignored, mergeSettings, writeBlockSafely, writeFileSafely, writeLanguageSetting } from './files.mjs';
import { detectPullRequestCommand, mergeWorkflowConfig, parsePullRequest, PULL_REQUEST_QUESTION, readWorkflowConfig } from './pull-request.mjs';
import { fetchText as defaultFetchText, installReferences } from './references.mjs';

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = path.join(KIT_ROOT, 'templates');
const OPENSPEC_MARKER = 'Managed by agent-workflow';

// Runs a command through the shell so `npx` resolves on Windows too.
export function defaultRun(command, { cwd, quiet = false } = {}) {
  const result = spawnSync(command, { cwd, shell: true, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
  return { status: result.status ?? 1, stdout: result.stdout ?? '' };
}

const template = (relative) => readFileSync(path.join(TEMPLATES, relative), 'utf8');

function detectCheckCommand(projectDir) {
  try {
    const pkg = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
    if (pkg.scripts?.test && !/no test specified/.test(pkg.scripts.test)) return 'npm test';
  } catch {
    // Not a Node project: the user types the command.
  }
  return '';
}

function installedSkills(projectDir) {
  const dir = path.join(projectDir, '.claude', 'skills');
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
}

export async function init({
  projectDir,
  io,
  run = defaultRun,
  fetchText = defaultFetchText,
  language,
  checkCommand,
  pullRequest,
  optional,
  nextSteps = true,
}) {
  const ctx = { io, projectDir };
  const claudeDir = path.join(projectDir, '.claude');
  io.log(`Installing agent-workflow into ${projectDir}\n`);

  // 1. Questions
  if (!existsSync(path.join(projectDir, '.git'))) {
    io.warn('This folder is not a git repository. The hooks expect one: run `git init` first.');
  }
  language ??= await io.ask('Which language should Claude talk to you in?', 'English');
  checkCommand ??= await io.ask('Which command checks the project (tests, lint, typecheck)? Leave empty for none.', detectCheckCommand(projectDir));
  // A project that already chose how pull requests are opened is not asked again.
  const workflowConfigFile = path.join(claudeDir, 'agent-workflow.json');
  if (pullRequest === undefined && !('pullRequest' in (readWorkflowConfig(workflowConfigFile) ?? {}))) {
    pullRequest = await io.ask(PULL_REQUEST_QUESTION, detectPullRequestCommand(projectDir, run) || 'none');
  }
  const pullRequestSetting = parsePullRequest(pullRequest ?? 'none');

  // 2. OpenSpec
  io.log('\nOpenSpec');
  const openspec = run('openspec --version', { cwd: projectDir, quiet: true }).status === 0 ? 'openspec' : 'npx -y @fission-ai/openspec@latest';
  const freshOpenSpec = !existsSync(path.join(projectDir, 'openspec'));
  if (freshOpenSpec) {
    if (run(`${openspec} init --tools none --no-animation .`, { cwd: projectDir }).status !== 0) {
      throw new Error('openspec init failed. Install OpenSpec with `npm install -g @fission-ai/openspec` and run the installer again.');
    }
  } else {
    io.log('  openspec/ already exists, keeping it');
  }
  await installOpenSpecConfig({ ...ctx, freshOpenSpec });
  await offerOpsxRemoval(ctx);

  // 3. Third-party skills
  io.log('\nSkills');
  const present = installedSkills(projectDir);
  const wanted = [...skillsWhere({ tier: 'core' })];
  for (const skill of skillsWhere({ tier: 'optional' })) {
    const accept = optional === 'all' || (Array.isArray(optional) && optional.includes(skill.name)) ||
      (optional === undefined && (await io.confirm(`Install ${skill.name} (${SOURCES[skill.source].author})? ${skill.reason}`, false)));
    if (accept) wanted.push(skill);
  }
  const already = wanted.filter((s) => present.includes(s.name));
  let reinstall = false;
  if (already.length) {
    reinstall = await io.confirm(`Already installed: ${already.map((s) => s.name).join(', ')}. Reinstall them from upstream (overwrites them)?`, false);
  }
  for (const source of Object.keys(SOURCES)) {
    const names = wanted.filter((s) => s.source === source && (reinstall || !present.includes(s.name))).map((s) => s.name);
    if (!names.length) continue;
    const command = `npx -y skills@latest add ${SOURCES[source].repo} --skill ${names.join(' ')} -a claude-code --copy -y`;
    io.log(`  ${command}`);
    if (run(command, { cwd: projectDir }).status !== 0) throw new Error(`Installing skills from ${SOURCES[source].repo} failed.`);
  }
  const excludedPresent = skillsWhere({ tier: 'excluded' }).filter((s) => installedSkills(projectDir).includes(s.name));
  for (const skill of excludedPresent) {
    io.warn(`${skill.name} is installed but excluded by the kit: ${skill.reason} Remove it with \`npx skills remove ${skill.name}\`.`);
  }

  // 4. Shared checklists for Addy's skills
  io.log('\nShared checklists');
  const addySkillDirs = skillsWhere({ source: 'addy' }).map((s) => path.join(claudeDir, 'skills', s.name));
  await installReferences({
    skillDirs: addySkillDirs,
    referencesDir: path.join(claudeDir, 'references'),
    baseUrl: SOURCES.addy.referencesUrl,
    fetchText,
    ...ctx,
  });

  // 5. The kit's own skill and hooks
  io.log('\nKit files');
  for (const file of readdirSync(path.join(KIT_ROOT, 'skills', 'close-change'))) {
    await writeFileSafely(path.join(claudeDir, 'skills', 'close-change', file), readFileSync(path.join(KIT_ROOT, 'skills', 'close-change', file), 'utf8'), ctx);
  }
  for (const file of readdirSync(path.join(KIT_ROOT, 'hooks'))) {
    await writeFileSafely(path.join(claudeDir, 'hooks', 'agent-workflow', file), readFileSync(path.join(KIT_ROOT, 'hooks', file), 'utf8'), ctx);
  }
  await mergeSettings(path.join(claudeDir, 'settings.json'), JSON.parse(template('.claude/settings.json')), ctx);
  await writeLanguageSetting(path.join(claudeDir, 'settings.local.json'), language, ctx);
  ensureGitignored(projectDir, '.claude/settings.local.json', ctx);
  const workflowConfig = template('.claude/agent-workflow.json')
    .replace('"{{CHECK_COMMAND}}"', JSON.stringify(checkCommand))
    .replace('"{{PULL_REQUEST}}"', JSON.stringify(pullRequestSetting, null, 1).replace(/\n\s*/g, ' '));
  if (existsSync(workflowConfigFile)) await mergeWorkflowConfig(workflowConfigFile, JSON.parse(workflowConfig), ctx);
  else await writeFileSafely(workflowConfigFile, workflowConfig, ctx);

  // 6. Documents the skills read
  for (const doc of ['docs/agents/issue-tracker.md', 'docs/agents/domain.md']) {
    await writeFileSafely(path.join(projectDir, doc), template(doc), ctx);
  }
  await writeBlockSafely(path.join(projectDir, 'AGENTS.md'), template('AGENTS.md'), ctx);
  const claude = template('CLAUDE.md').replace('{{SPECIALISTS}}', specialistLines(installedSkills(projectDir)));
  await writeBlockSafely(path.join(projectDir, 'CLAUDE.md'), claude, ctx);
  warnAboutOldAgentSkillsBlock(ctx);

  if (nextSteps) io.log(`
Done. Next steps:
  1. Review the changes with \`git status\` and commit them on a branch.
  2. Restart Claude Code in this folder so it loads the new skills and hooks.
  3. Start your first change with /grill-with-docs.`);
  return { skills: installedSkills(projectDir), catalog: SKILLS.length };
}

// Replaces the stock openspec/config.yaml with the kit's; a config that already
// carries the project's own context or rules is left for the user to merge.
async function installOpenSpecConfig({ io, projectDir, freshOpenSpec }) {
  const file = path.join(projectDir, 'openspec', 'config.yaml');
  const kit = template('openspec/config.yaml');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const hasSettings = /^(context|rules|operations):/m.test(current);
  if (hasSettings && !current.includes(OPENSPEC_MARKER)) {
    io.warn(`openspec/config.yaml already has its own context or rules, so it was kept. Merge these settings into it by hand:\n${kit.split('\n').filter((l) => !l.startsWith('#') && !l.startsWith('schema')).join('\n')}`);
    return;
  }
  // OpenSpec's stock config holds only example comments: replace it without asking
  // when this run created it, and with "yes" as the default answer otherwise.
  if (current && !hasSettings) {
    const replace = freshOpenSpec || (await io.confirm('openspec/config.yaml holds only OpenSpec\'s example comments. Replace it with the kit\'s config?', true));
    if (!replace) return;
    writeFileSync(file, kit);
    io.log('  replaced openspec/config.yaml');
    return;
  }
  await writeFileSafely(file, kit, { io, projectDir });
}

// OpenSpec's /opsx:* commands and skills compete with the workflow skills.
async function offerOpsxRemoval({ io, projectDir }) {
  const claudeDir = path.join(projectDir, '.claude');
  const found = [];
  const commands = path.join(claudeDir, 'commands', 'opsx');
  if (existsSync(commands)) found.push(commands);
  for (const name of installedSkills(projectDir).filter((n) => n.startsWith('openspec-'))) {
    found.push(path.join(claudeDir, 'skills', name));
  }
  if (!found.length) return;
  const shown = found.map((f) => path.relative(projectDir, f).replace(/\\/g, '/'));
  io.warn(`OpenSpec's own commands and skills are installed: ${shown.join(', ')}. They compete with /to-spec and /implement.`);
  if (await io.confirm('Delete them? Your changes and specs in openspec/ are not touched.', false)) {
    for (const dir of found) rmSync(dir, { recursive: true, force: true });
    io.log(`  deleted ${shown.join(', ')}`);
  }
}

function warnAboutOldAgentSkillsBlock({ io, projectDir }) {
  const file = path.join(projectDir, 'CLAUDE.md');
  const text = readFileSync(file, 'utf8');
  const outside = text.replace(/<!-- agent-workflow:start -->[\s\S]*<!-- agent-workflow:end -->/, '');
  if (/^## Agent skills/m.test(outside)) {
    io.warn('CLAUDE.md has its own "## Agent skills" section, probably from /setup-matt-pocock-skills. The kit\'s version now lives in AGENTS.md: delete the old section so the skills read one tracker.');
  }
}
