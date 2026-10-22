// The automated checks of docs/experiment-log.md, one function per step.
// Each returns a list of { status: 'ok' | 'fail' | 'skip', label, detail }.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { skillsWhere } from '../../installer/catalog.mjs';
import { sharedReferenceLinks } from '../../installer/references.mjs';
import { branchOf, frontier, isDone, parseTickets } from '../../hooks/status.mjs';
import { allRuns, latestRun, loadedFromProject } from './transcript.mjs';

const HOOKS = ['git-guard', 'protected-paths', 'quality-gate'];

// The command that continues a change: the next ticket, or the close once every ticket is done.
export function nextCommand(change, tickets) {
  const next = frontier(tickets);
  return next ? `/implement ${change}#${next.number}` : `/close-change ${change}`;
}

// A numbered list followed by a question, in whatever language the conversation is in.
export const asksAfterList = (text) => /^\s*(\*\*)?1\.\s[\s\S]*\?/m.test(text);

// The code-review report, under its two literal headings.
export const hasReviewHeadings = (text) => /^## Standards\b/m.test(text) && /^## Spec\b/m.test(text);

const WORKFLOW_SKILLS = ['grill-with-docs', 'grilling', 'domain-modeling', 'to-spec', 'to-tickets', 'implement', 'tdd', 'code-review', 'codebase-design', 'light-change', 'close-change'];

class Report {
  constructor() {
    this.items = [];
  }
  check(label, passed, detail = '') {
    this.items.push({ status: passed ? 'ok' : 'fail', label, detail: passed ? '' : detail });
  }
  skip(label, detail) {
    this.items.push({ status: 'skip', label, detail });
  }
}

function sh(command, cwd) {
  const result = spawnSync(command, { cwd, shell: true, encoding: 'utf8' });
  return { status: result.status ?? 1, out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

const git = (args, cwd) => sh(`git ${args}`, cwd).out;
const read = (dir, file) => readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');

function baseBranch(dir) {
  let branches = ['main', 'master'];
  try {
    branches = JSON.parse(read(dir, '.claude/agent-workflow.json')).protectedBranches ?? branches;
  } catch {
    // Defaults.
  }
  return branches.find((b) => sh(`git rev-parse --verify --quiet ${b}`, dir).status === 0) ?? 'main';
}

function commits(dir, range) {
  const raw = git(`log --format=%H%x1f%s%x1f%(trailers:key=Refs,valueonly,separator=%x2c)%x1e ${range}`, dir);
  return raw.split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [hash, subject, refs] = r.split('\x1f');
    return { hash, subject, refs: (refs ?? '').split(',').map((s) => s.trim()).filter(Boolean) };
  });
}

function cleanTree(report, dir) {
  const status = git('status --porcelain', dir);
  report.check('working tree is clean', status === '', `uncommitted files:\n${status}`);
}

function onChangeBranch(report, dir, change) {
  const branch = git('branch --show-current', dir);
  const expected = branchOf(dir, change);
  report.check(`on branch ${expected}`, branch === expected, `current branch is ${branch || '(none)'}`);
}

function strictValid(report, dir, change) {
  const result = sh(`openspec validate ${change} --strict`, dir);
  report.check(`openspec validate ${change} --strict passes`, result.status === 0, result.out);
}

function noScratch(report, dir) {
  report.check('no .scratch/ folder (the local-markdown tracker was not used)', !existsSync(path.join(dir, '.scratch')), '.scratch/ exists');
}

// Checks that need the session transcript; skipped when it cannot be found.
function withRun(report, dir, command, args, label, fn) {
  const run = latestRun(dir, command, { args });
  if (!run) {
    report.skip(label, `no transcript of /${command} found for this folder`);
    return;
  }
  fn(run);
}

function noGitHubIssues(report, run, label) {
  const commands = run.commands.join('\n');
  report.check(`${label}: no gh issue or gh label commands`, !/\bgh (issue|label)\b/.test(commands), commands.match(/.*\bgh (issue|label)\b.*/)?.[0] ?? '');
}

function noTriageLabels(report, dir, change) {
  const folder = path.join(dir, 'openspec', 'changes', change);
  const files = readdirSync(folder, { recursive: true }).map(String).filter((f) => f.endsWith('.md'));
  const labelled = files.filter((f) => /ready-for-agent|ready-for-human|needs-triage|needs-info|^Status:/m.test(readFileSync(path.join(folder, f), 'utf8')));
  report.check('no triage labels or Status: lines in the change', labelled.length === 0, `found in: ${labelled.join(', ')}`);
}

function guardrailMessages(report, run, label) {
  for (const hook of HOOKS) {
    if (run.toolResults.includes(`agent-workflow ${hook}`)) report.check(`${label}: ${hook} hook fired and Claude saw its message`, true);
  }
}

export function checkSetup(dir) {
  const report = new Report();
  report.check('is a git repository', existsSync(path.join(dir, '.git')), 'run git init');
  const base = baseBranch(dir);
  cleanTree(report, dir);
  report.check(`${base} has the installation commit`, commits(dir, base).some((c) => /install agent-workflow/.test(c.subject)), 'no "install agent-workflow" commit');

  const installed = existsSync(path.join(dir, '.claude', 'skills')) ? readdirSync(path.join(dir, '.claude', 'skills')) : [];
  const missing = [...skillsWhere({ tier: 'core' }).map((s) => s.name), 'light-change', 'close-change'].filter((n) => !installed.includes(n));
  report.check('every core skill, light-change and close-change are installed', missing.length === 0, `missing: ${missing.join(', ')}`);
  const excluded = skillsWhere({ tier: 'excluded' }).map((s) => s.name).filter((n) => installed.includes(n));
  report.check('no excluded skill is installed', excluded.length === 0, excluded.join(', '));
  const opsx = installed.filter((n) => n.startsWith('openspec-'));
  report.check('no OpenSpec /opsx commands or skills', opsx.length === 0 && !existsSync(path.join(dir, '.claude', 'commands', 'opsx')), opsx.join(', ') || '.claude/commands/opsx exists');

  let hooks = [];
  try {
    hooks = JSON.parse(read(dir, '.claude/settings.json')).hooks?.PreToolUse?.flatMap((g) => g.hooks.map((h) => (h.args ?? []).join(' '))) ?? [];
  } catch {
    // Reported below.
  }
  const wired = ['git-guard', 'quality-gate', 'protected-paths'].filter((h) => hooks.some((a) => a.includes(`agent-workflow/${h}.mjs`)));
  report.check('the three hooks are wired in .claude/settings.json', wired.length === 3, `wired: ${wired.join(', ') || 'none'}`);
  report.check('the three hook scripts exist', ['git-guard', 'quality-gate', 'protected-paths', 'shared'].every((h) => existsSync(path.join(dir, '.claude', 'hooks', 'agent-workflow', `${h}.mjs`))), 'missing hook scripts');

  const links = sharedReferenceLinks(installed.map((n) => path.join(dir, '.claude', 'skills', n)), path.join(dir, '.claude', 'references'));
  const broken = links.filter((l) => !existsSync(l.target));
  report.check(`all ${links.length} ../../references/ links resolve`, broken.length === 0, broken.map((l) => `${path.relative(dir, l.file)} -> ${l.link}`).join('\n'));

  let language = '';
  try {
    language = JSON.parse(read(dir, '.claude/settings.local.json')).language ?? '';
  } catch {
    // Reported below.
  }
  report.check(`.claude/settings.local.json sets the conversation language${language ? ` (${language})` : ''}`, Boolean(language), 'no "language" in .claude/settings.local.json');
  report.check('.claude/settings.local.json is ignored by git', sh('git check-ignore -q .claude/settings.local.json', dir).status === 0, 'add it to .gitignore');

  const personal = path.join(homedir(), '.claude', 'skills');
  const shadowing = existsSync(personal) ? readdirSync(personal).filter((n) => WORKFLOW_SKILLS.includes(n)) : [];
  report.check('no personal skill in ~/.claude/skills shadows a workflow skill', shadowing.length === 0, `rename or remove: ${shadowing.join(', ')}`);
  return report.items;
}

export function checkSpec(dir, change) {
  const report = new Report();
  const folder = `openspec/changes/${change}`;
  onChangeBranch(report, dir, change);
  cleanTree(report, dir);
  report.check(`${folder}/ exists`, existsSync(path.join(dir, folder)), 'the change folder is missing');
  if (!existsSync(path.join(dir, folder))) return report.items;

  const proposal = existsSync(path.join(dir, folder, 'proposal.md')) ? read(dir, path.join(folder, 'proposal.md')) : '';
  const sections = ['Why', 'What Changes', 'Capabilities', 'Impact', 'Out of Scope'].filter((s) => !new RegExp(`^## ${s}\\b`, 'm').test(proposal));
  report.check('proposal.md has Why, What Changes, Capabilities, Impact and Out of Scope', sections.length === 0, `missing: ${sections.join(', ')}`);

  const specsDir = path.join(dir, folder, 'specs');
  const specFiles = existsSync(specsDir) ? readdirSync(specsDir, { recursive: true }).filter((f) => String(f).endsWith('spec.md')) : [];
  report.check('at least one delta spec', specFiles.length > 0, 'no specs/**/spec.md');
  const requirements = specFiles.flatMap((f) => read(specsDir, String(f)).split(/^### Requirement: /m).slice(1));
  const weak = requirements.filter((r) => !/\b(SHALL|MUST)\b/.test(r.split(/^#### /m)[0]));
  report.check(`every requirement (${requirements.length}) uses SHALL or MUST`, weak.length === 0, weak.map((r) => r.split('\n')[0]).join(', '));
  const scenarioCounts = requirements.map((r) => (r.match(/^#### Scenario: /gm) ?? []).length);
  report.check('error or edge scenarios exist besides the success ones', scenarioCounts.some((n) => n >= 2) || scenarioCounts.length >= 2, 'every requirement has a single scenario');

  const design = existsSync(path.join(dir, folder, 'design.md')) ? read(dir, path.join(folder, 'design.md')) : '';
  report.check('design.md has Decisions and Testing Decisions', /^## Decisions/m.test(design) && /^## Testing Decisions/m.test(design), 'missing design.md or one of the sections');
  strictValid(report, dir, change);
  report.check(`a "docs(${change}): publish spec" commit exists`, commits(dir, `${baseBranch(dir)}..HEAD`).some((c) => c.subject === `docs(${change}): publish spec`), 'no such commit on the change branch');
  noScratch(report, dir);
  noTriageLabels(report, dir, change);

  withRun(report, dir, 'grill-with-docs', undefined, 'grill-with-docs transcript', (run) => {
    report.check('grill-with-docs: called grilling and domain-modeling', run.skills.includes('grilling') && run.skills.includes('domain-modeling'), `skills called: ${run.skills.join(', ') || 'none'}`);
    report.check('grill-with-docs: ran from the project copy', loadedFromProject(run, 'grill-with-docs', dir), `loaded from: ${run.skillDirs[0] ?? 'unknown'}`);
  });
  withRun(report, dir, 'to-spec', change, 'to-spec transcript', (run) => {
    report.check('to-spec: ran from the project copy', loadedFromProject(run, 'to-spec', dir), `loaded from: ${run.skillDirs[0] ?? 'unknown'}`);
    report.check('to-spec: asked you to confirm the test seams', run.questions > 0 || /seam/i.test(run.assistantText), 'no question about seams found');
    noGitHubIssues(report, run, 'to-spec');
  });
  return report.items;
}

export function checkTickets(dir, change) {
  const report = new Report();
  const file = `openspec/changes/${change}/tasks.md`;
  onChangeBranch(report, dir, change);
  cleanTree(report, dir);
  report.check(`${file} exists`, existsSync(path.join(dir, file)), 'tasks.md is missing');
  if (!existsSync(path.join(dir, file))) return report.items;

  const tickets = parseTickets(read(dir, file));
  report.check(`tickets are numbered 1..${tickets.length}`, tickets.length > 0 && tickets.every((t, i) => t.number === i + 1), tickets.map((t) => t.number).join(', '));
  const noBlocked = tickets.filter((t) => t.blockedBy === null).map((t) => t.number);
  report.check('every ticket has a "Blocked by:" line', noBlocked.length === 0, `missing in: ${noBlocked.join(', ')}`);
  const noWhat = tickets.filter((t) => !t.whatToBuild).map((t) => t.number);
  report.check('every ticket has a "What to build:" line', noWhat.length === 0, `missing in: ${noWhat.join(', ')}`);
  const badBoxes = tickets.filter((t) => t.boxes.length === 0 || t.boxes.some((b) => b.group !== t.number)).map((t) => t.number);
  report.check('every ticket has "- [ ] N.M" boxes numbered after it', badBoxes.length === 0, `wrong in: ${badBoxes.join(', ')}`);
  const forward = tickets.filter((t) => (t.blockedBy ?? []).some((n) => n >= t.number)).map((t) => t.number);
  report.check('tickets are in dependency order (blockers come first)', forward.length === 0, `blocked by a later ticket: ${forward.join(', ')}`);
  const last = tickets.at(-1);
  const others = tickets.slice(0, -1).map((t) => t.number);
  report.check('the last ticket is the manual test', last && /manual/i.test(last.title), `last ticket: ${last?.title}`);
  report.check('the manual test is blocked by every other ticket', last && others.every((n) => (last.blockedBy ?? []).includes(n)), `Blocked by: ${(last?.blockedBy ?? []).join(', ')}`);

  const listed = JSON.parse(sh('openspec list --json', dir).out || '{"changes":[]}').changes?.find((c) => c.name === change);
  const boxes = tickets.reduce((n, t) => n + t.boxes.length, 0);
  report.check(`openspec list counts the ${boxes} boxes`, listed?.totalTasks === boxes, `openspec list says ${listed?.totalTasks ?? 'nothing'}`);
  strictValid(report, dir, change);

  const publish = commits(dir, `${baseBranch(dir)}..HEAD`).find((c) => c.subject === `docs(${change}): publish tickets`);
  report.check(`a "docs(${change}): publish tickets" commit exists`, Boolean(publish), 'no such commit on the change branch');
  if (publish) {
    const touched = git(`show --name-only --format= ${publish.hash}`, dir).split('\n').filter(Boolean);
    report.check('publishing tickets changed only tasks.md', touched.every((f) => f.endsWith(`${change}/tasks.md`)), `also changed: ${touched.filter((f) => !f.endsWith('tasks.md')).join(', ')}`);
  }
  noScratch(report, dir);
  noTriageLabels(report, dir, change);
  withRun(report, dir, 'to-tickets', change, 'to-tickets transcript', (run) => {
    report.check('to-tickets: ran from the project copy', loadedFromProject(run, 'to-tickets', dir), `loaded from: ${run.skillDirs[0] ?? 'unknown'}`);
    report.check('to-tickets: showed the breakdown and asked you to approve it', run.questions > 0 || asksAfterList(run.assistantText), 'no numbered breakdown followed by a question found');
    noGitHubIssues(report, run, 'to-tickets');
  });
  return report.items;
}

export function checkImplement(dir, change) {
  const report = new Report();
  const file = path.join('openspec', 'changes', change, 'tasks.md');
  onChangeBranch(report, dir, change);
  cleanTree(report, dir);
  const tickets = existsSync(path.join(dir, file)) ? parseTickets(read(dir, file)) : [];
  const ticketCommits = commits(dir, `${baseBranch(dir)}..HEAD`).filter((c) => c.refs.some((r) => r.startsWith(`${change}#`)));
  const latest = ticketCommits[0];
  if (!latest) {
    report.skip(`a commit carries "Refs: ${change}#N"`, `no ticket implemented yet: run ${nextCommand(change, tickets)} first`);
    return report.items;
  }
  report.check(`a commit carries "Refs: ${change}#N"`, true);
  const number = Number(latest.refs.find((r) => r.startsWith(`${change}#`)).split('#')[1]);
  const ticket = tickets.find((t) => t.number === number);
  report.check(`latest ticket commit is Conventional Commits (${latest.subject})`, /^(feat|fix|refactor|test|docs|chore|perf|style|build|ci)(\([^)]+\))?!?: .+/.test(latest.subject), latest.subject);
  report.check(`ticket ${change}#${number} has every box ticked`, ticket && isDone(ticket), ticket ? ticket.boxes.filter((b) => !b.done).map((b) => `${b.group}.${b.item}`).join(', ') : 'ticket not found');
  const touched = git(`show --name-only --format= ${latest.hash}`, dir);
  report.check('tasks.md is in the same commit as the work', touched.includes(`${change}/tasks.md`), 'tasks.md not in the commit');
  const blockers = ticket?.blockedBy ?? [];
  report.check(`ticket ${number} was unblocked`, blockers.every((n) => isDone(tickets.find((t) => t.number === n) ?? { boxes: [] })), `blockers not done: ${blockers.join(', ')}`);
  const next = frontier(tickets);
  report.check(`next: ${nextCommand(change, tickets)}${next ? ` (${next.title})` : ', every ticket is done'}`, true);
  if (next && /manual/i.test(next.title)) {
    const results = allRuns(dir, 'implement', { args: change }).map((r) => r.toolResults).join('\n');
    for (const hook of HOOKS) {
      report.check(`before the manual test: the ${hook} hook has fired`, results.includes(`agent-workflow ${hook}`), 'not yet: send the guardrail prompts of the plan, section 5, before the manual test');
    }
  }

  let checkCommand = '';
  try {
    checkCommand = JSON.parse(read(dir, '.claude/agent-workflow.json')).checkCommand ?? '';
  } catch {
    // No config.
  }
  if (checkCommand) {
    const result = sh(checkCommand, dir);
    report.check(`"${checkCommand}" passes`, result.status === 0, result.out.split('\n').slice(-15).join('\n'));
  }

  withRun(report, dir, 'implement', change, 'implement transcript', (run) => {
    report.check('implement: ran from the project copy', loadedFromProject(run, 'implement', dir), `loaded from: ${run.skillDirs[0] ?? 'unknown'}`);
    report.check('implement: stated "Ticket <change>#N: <title>"', new RegExp(`Ticket ${change}#\\d+`).test(run.assistantText), 'no "Ticket ..." line found');
    const manual = /manual/i.test(tickets.find((t) => run.assistantText.includes(`${change}#${t.number}`))?.title ?? '');
    if (manual) {
      report.check('implement (manual test): asked you for the results', run.questions > 0 || /\?/.test(run.assistantText), 'no question found');
    } else {
      report.check('implement: called tdd', run.skills.includes('tdd'), `skills called: ${run.skills.join(', ') || 'none'}`);
      report.check('implement: called code-review', run.skills.includes('code-review'), `skills called: ${run.skills.join(', ') || 'none'}`);
      report.check("implement: code-review was Matt's project copy", loadedFromProject(run, 'code-review', dir), `loaded from: ${run.skillDirs.filter((d) => /code-review/.test(d)).join(', ') || 'not loaded'}`);
      report.check('implement: review reported under "## Standards" and "## Spec"', hasReviewHeadings(run.assistantText), 'no "## Standards" and "## Spec" headings found');
    }
    report.check('implement: never ran git push', !run.commands.some((c) => /\bgit\b.*\bpush\b/.test(c)) || run.toolResults.includes('agent-workflow git-guard'), 'a git push ran');
    guardrailMessages(report, run, 'implement');
  });
  return report.items;
}

// close-change run on a change with open boxes must stop at its first step.
function checkEarlyStop(report, dir, change, open, tickets) {
  report.check(`${open} boxes are still open, so close-change should stop at step 1`, true);
  report.check(`the run is not finished: next is ${nextCommand(change, tickets)}`, true);
  const subjects = commits(dir, `${baseBranch(dir)}..HEAD`).map((c) => c.subject);
  const closing = subjects.filter((s) => s.startsWith(`refactor(${change}): simplify`) || s.startsWith(`docs(${change}): archive`));
  report.check('close-change made no simplification or archive commit', closing.length === 0, closing.join(', '));
  withRun(report, dir, 'close-change', change, 'close-change transcript', (run) => {
    report.check('close-change: ran from the project copy', loadedFromProject(run, 'close-change', dir), `loaded from: ${run.skillDirs[0] ?? 'unknown'}`);
    report.check('close-change: stopped before simplifying or hardening', !run.skills.includes('code-simplification') && !run.skills.includes('security-and-hardening'), `skills called: ${run.skills.join(', ')}`);
    report.check('close-change: did not archive', !run.commands.some((c) => c.includes('openspec archive')), 'openspec archive ran');
    report.check('close-change: pointed you to /implement', run.assistantText.includes(`/implement ${change}`), `no mention of /implement ${change}`);
  });
}

export function checkClose(dir, change) {
  const report = new Report();
  onChangeBranch(report, dir, change);
  cleanTree(report, dir);
  const tasks = path.join(dir, 'openspec', 'changes', change, 'tasks.md');
  const tickets = existsSync(tasks) ? parseTickets(read(dir, `openspec/changes/${change}/tasks.md`)) : [];
  const open = tickets.flatMap((t) => t.boxes).filter((b) => !b.done).length;
  if (open) {
    checkEarlyStop(report, dir, change, open, tickets);
    return report.items;
  }
  report.check(`openspec/changes/${change}/ is gone`, !existsSync(path.join(dir, 'openspec', 'changes', change)), 'the change was not archived');
  const archive = path.join(dir, 'openspec', 'changes', 'archive');
  const archived = existsSync(archive) && readdirSync(archive).some((d) => d.endsWith(`-${change}`));
  report.check(`openspec/changes/archive/<date>-${change}/ exists`, archived, 'no archived folder');
  const specs = sh('openspec validate --specs --strict', dir);
  report.check('openspec validate --specs --strict passes', specs.status === 0, specs.out);

  const base = baseBranch(dir);
  const subjects = commits(dir, `${base}..HEAD`).map((c) => c.subject);
  report.check(`a "docs(${change}): archive change" commit exists`, subjects.includes(`docs(${change}): archive change`), 'no archive commit');
  const skillsChanged = git(`diff --name-only ${base}...HEAD -- .claude/skills .claude/references`, dir);
  report.check('no installed skill or checklist changed on the change branch', skillsChanged === '', skillsChanged);

  withRun(report, dir, 'close-change', change, 'close-change transcript', (run) => {
    report.check('close-change: ran from the project copy', loadedFromProject(run, 'close-change', dir), `loaded from: ${run.skillDirs[0] ?? 'unknown'}`);
    report.check('close-change: called code-simplification', run.skills.includes('code-simplification'), `skills called: ${run.skills.join(', ') || 'none'}`);
    report.check('close-change: called security-and-hardening', run.skills.includes('security-and-hardening'), `skills called: ${run.skills.join(', ') || 'none'}`);
    report.check('close-change: did not run code-review again', !run.skills.includes('code-review'), 'code-review was called');
    report.check('close-change: showed a verification report', /Completeness/.test(run.assistantText) && /Correctness/.test(run.assistantText) && /Coherence/.test(run.assistantText), 'no Completeness / Correctness / Coherence table');
    report.check('close-change: ran openspec archive', run.commands.some((c) => c.includes(`openspec archive ${change}`)), 'no openspec archive command');
    report.check('close-change: ended with the local merge commands (the trial has no remote)', run.assistantText.includes(`git merge --no-ff ${branchOf(dir, change)}`), 'merge command missing');
    guardrailMessages(report, run, 'close-change');
  });
  return report.items;
}
