// `agent-workflow init`: installs the kit into the project in `projectDir`.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILLS, SOURCES, skillsWhere, specialistLines } from './catalog.mjs';
import { addPackageScript, ensureGitignored, mergeSettings, settingsHave, writeBlockSafely, writeFileSafely, writeLanguageSetting, writeLocalSetting } from './files.mjs';
import { mergeWorkflowConfig, parsePullRequest, pullRequestFollowUp, pullRequestQuestion, readWorkflowConfig } from './pull-request.mjs';
import { fetchText as defaultFetchText, installReferences } from './references.mjs';
import { askTracker, parseTracker } from './tracker.mjs';

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = path.join(KIT_ROOT, 'templates');
const OPENSPEC_MARKER = 'Managed by agent-workflow';
export const STATUS_COMMAND = 'node .claude/hooks/agent-workflow/status.mjs';

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
  tracker,
  statusLine,
  homeDir = homedir(),
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
  // A project that already chose how pull requests are opened, or how progress
  // reaches its team tracker, is not asked again.
  const workflowConfigFile = path.join(claudeDir, 'agent-workflow.json');
  const existingConfig = readWorkflowConfig(workflowConfigFile) ?? {};
  const askPullRequest = pullRequest === undefined && !('pullRequest' in existingConfig);
  const askTrackerQuestion = tracker === undefined && !('tracker' in existingConfig);
  const steps = 2 + askPullRequest + askTrackerQuestion;
  language ??= await io.choose({
    step: `1/${steps}`,
    title: 'Language',
    detail: 'The language Claude talks to you in. Everything written to the repository stays in English.',
    choices: [
      { label: 'English', value: 'English' },
      { label: 'Spanish', value: 'Spanish' },
      { label: 'Other…', input: { label: 'Language' } },
    ],
  });
  const detectedCheck = detectCheckCommand(projectDir);
  checkCommand ??= await io.choose({
    step: `2/${steps}`,
    title: 'Check command',
    detail: 'The quality gate runs it before every commit: tests, lint, typecheck. You can change it later in .claude/agent-workflow.json.',
    choices: [
      ...(detectedCheck ? [{ label: detectedCheck, note: 'detected in package.json', value: detectedCheck }] : []),
      { label: 'Other command…', input: { label: 'Command' } },
      { label: 'None', note: 'no checks yet', value: '' },
    ],
    selected: detectedCheck ? 0 : 1,
  });
  if (askPullRequest) pullRequest = await io.choose({ step: `3/${steps}`, ...pullRequestQuestion(projectDir, run) });
  const pullRequestSetting = parsePullRequest(pullRequest ?? 'none');
  const followUp = pullRequest === undefined ? null : pullRequestFollowUp(pullRequestSetting, projectDir, run);
  if (followUp?.warning) io.warn(followUp.warning);
  const trackerSetting = askTrackerQuestion
    ? await askTracker({ io, projectDir, step: `${steps}/${steps}` })
    : parseTracker(tracker ?? 'none');

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
  const offered = skillsWhere({ tier: 'optional' });
  optional ??= await io.chooseMany({
    title: 'Optional skills',
    detail: 'Pick the topics your project touches: numbers separated by commas, "all", or Enter for none. You can run the installer again later to add more.',
    choices: offered.map((s) => ({ label: s.name, note: SOURCES[s.source].author, detail: s.reason, value: s.name })),
  });
  const accepted = offered.filter((s) => optional === 'all' || (Array.isArray(optional) && optional.includes(s.name)));
  const wanted = [...skillsWhere({ tier: 'core' }), ...accepted];
  const already = wanted.filter((s) => present.includes(s.name));
  let reinstall = false;
  if (already.length) {
    reinstall = await io.confirm('Reinstall the skills that are already installed?', false,
      `${already.map((s) => s.name).join(', ')}. Reinstalling copies them again from upstream and overwrites them.`);
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

  // 5. The kit's own skills and hooks
  io.log('\nKit files');
  for (const skill of readdirSync(path.join(KIT_ROOT, 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const dir = path.join(KIT_ROOT, 'skills', skill.name);
    for (const file of readdirSync(dir)) {
      await writeFileSafely(path.join(claudeDir, 'skills', skill.name, file), readFileSync(path.join(dir, file), 'utf8'), ctx);
    }
  }
  for (const file of readdirSync(path.join(KIT_ROOT, 'hooks'))) {
    await writeFileSafely(path.join(claudeDir, 'hooks', 'agent-workflow', file), readFileSync(path.join(KIT_ROOT, 'hooks', file), 'utf8'), ctx);
  }
  await offerStatusCommand(ctx);
  await mergeSettings(path.join(claudeDir, 'settings.json'), JSON.parse(template('.claude/settings.json')), ctx);
  await writeLanguageSetting(path.join(claudeDir, 'settings.local.json'), language, ctx);
  if (statusLine !== false) await offerStatusLine({ ...ctx, homeDir });
  ensureGitignored(projectDir, '.claude/settings.local.json', ctx);
  // A setting object on one line, as the template's other values are.
  const inline = (setting) => JSON.stringify(setting, null, 1).replace(/\n\s*/g, ' ');
  const workflowConfig = template('.claude/agent-workflow.json')
    .replace('"{{CHECK_COMMAND}}"', JSON.stringify(checkCommand))
    .replace('"{{PULL_REQUEST}}"', inline(pullRequestSetting))
    .replace('"{{TRACKER}}"', inline(trackerSetting));
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

  if (nextSteps) {
    const todo = [
      'Review the changes with `git status` and commit them on a branch.',
      ...(followUp?.step ? [followUp.step] : []),
      'Restart Claude Code in this folder so it loads the new skills and hooks.',
      'Start your first change with /grill-with-docs.',
    ];
    io.log(`\nDone. Next steps:\n${todo.map((line, i) => `  ${i + 1}. ${line}`).join('\n')}`);
  }
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
    const replace = freshOpenSpec || (await io.confirm('Replace openspec/config.yaml with the kit\'s config?', true, 'It holds only OpenSpec\'s example comments.'));
    if (!replace) return;
    writeFileSync(file, kit);
    io.log('  replaced openspec/config.yaml');
    return;
  }
  await writeFileSafely(file, kit, { io, projectDir });
}

// The status command prints the roadmap of each change: a package.json script
// when the project has one, otherwise an alias the user creates.
async function offerStatusCommand({ io, projectDir }) {
  const pkg = path.join(projectDir, 'package.json');
  if (existsSync(pkg)) {
    await addPackageScript(pkg, 'workflow:status', STATUS_COMMAND, { io, projectDir });
    return;
  }
  io.log(`  To see where each change stands, run \`${STATUS_COMMAND}\`, or create an alias for it:`);
  io.log(`    bash, zsh:   alias workflow-status='${STATUS_COMMAND}'`);
  io.log(`    PowerShell:  function workflow-status { ${STATUS_COMMAND} @args }`);
}

// Claude Code's status line shows the change of the current branch. It is a
// personal preference, so it goes to the local settings, and it is offered only
// while the project's settings have no status line. The local settings outrank
// the user's, so a status line of the user's own is replaced in this project
// only, and only when they say so.
async function offerStatusLine({ io, projectDir, homeDir }) {
  const local = path.join(projectDir, '.claude', 'settings.local.json');
  if ([path.join(projectDir, '.claude', 'settings.json'), local].some((file) => settingsHave(file, 'statusLine'))) return;
  const command = `${STATUS_COMMAND} --statusline`;
  const example = 'On a change branch it shows a line like "add-greeting · 2/4 · next #3".';
  const agreed = settingsHave(path.join(homeDir, '.claude', 'settings.json'), 'statusLine')
    ? await io.confirm('Use the kit\'s status line in this project instead of yours?', false,
      `~/.claude/settings.json has a status line of your own; the other projects keep it. ${example}`)
    : await io.confirm('Show where the change stands in Claude Code\'s status line?', true,
      `${example} It runs \`${command}\` and goes to .claude/settings.local.json, so only you see it.`);
  if (agreed) writeLocalSetting(local, 'statusLine', { type: 'command', command }, { io, projectDir });
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
  if (await io.confirm('Delete them?', false, 'Your changes and specs in openspec/ are not touched.')) {
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
