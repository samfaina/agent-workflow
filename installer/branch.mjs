// How the branch of a new change is named: the `branch` setting in
// .claude/agent-workflow.json (ADR 0012), one pattern or one per base branch
// (ADR 0013). The agent fills it in once, when the change opens, and keeps the
// result in the change's `x-branch`.
import { BRANCH_PLACEHOLDER, branchPatterns, DEFAULT_CONFIG } from '../hooks/shared.mjs';
import { shellQuote } from '../hooks/status.mjs';

export const DEFAULT_BRANCH = DEFAULT_CONFIG.branch;
export const GITFLOW_BRANCH = 'feature/{ref}-{change}';
// The value each placeholder takes when a pattern is checked; its keys are the placeholders.
const SAMPLE = { change: 'add-greeting', ref: 'PROJ-123', user: 'AB' };
const USER_KEY = 'agent-workflow.user';

const NOTES = [
  'Placeholders:',
  '{change}  the change name, such as add-greeting (required)',
  '{ref}     the first external reference of the change, such as PROJ-123',
  `{user}    your own value, from \`git config ${USER_KEY}\` (never committed)`,
  'Example: {ref}__{change}--{user} gives PROJ-123__add-greeting--AB',
];

// Why `pattern` cannot name branches, or null when it can. Git judges the
// sample name; without git, that check is skipped.
export function branchPatternError(pattern, { projectDir, run }) {
  if (!pattern.includes('{change}')) return `The branch pattern "${pattern}" needs {change}.`;
  const unknown = [...pattern.matchAll(BRANCH_PLACEHOLDER)].map((m) => m[1]).find((name) => !Object.hasOwn(SAMPLE, name));
  if (unknown !== undefined) return `The branch pattern "${pattern}" has an unknown placeholder {${unknown}}: use {change}, {ref} and {user}.`;
  const sample = pattern.replace(BRANCH_PLACEHOLDER, (_, name) => SAMPLE[name]);
  return gitTakesBranchName(sample, { projectDir, run })
    ? null
    : `The branch pattern "${pattern}" gives ${sample}, which git rejects as a branch name.`;
}

// Whether git takes `name` as a branch name; true without git, which cannot judge it.
export function gitTakesBranchName(name, { projectDir, run }) {
  if (run('git --version', { cwd: projectDir, quiet: true }).status !== 0) return true;
  return run(`git check-ref-format --branch ${shellQuote(name)}`, { cwd: projectDir, quiet: true }).status === 0;
}

// The setting from --branch: the pattern when it is valid; throws otherwise.
export function parseBranch(pattern, context) {
  const value = pattern.trim();
  const error = branchPatternError(value, context);
  if (error) throw new Error(error);
  return value;
}

// The patterns from --branch-for, `<base>=<pattern>` each, keyed by base; throws
// when one has no `=` or its pattern is not valid.
export function parseBranchFor(list, context) {
  return Object.fromEntries(list.map((entry) => {
    const at = entry.indexOf('=');
    const base = entry.slice(0, at).trim();
    if (at === -1 || !base) throw new Error(`--branch-for takes <base>=<pattern>, such as main=hotfix/{change}, not "${entry}".`);
    return [base, parseBranch(entry.slice(at + 1), context)];
  }));
}

// Why `setting`, a pattern or an object of patterns keyed by base branch
// (ADR 0013), cannot be the `branch` setting, or null when it can.
export function branchSettingError(setting, protectedBranches, context) {
  if (typeof setting === 'string') return branchPatternError(setting, context);
  if (!setting || typeof setting !== 'object' || Array.isArray(setting)) return 'The branch setting must be a pattern, or an object of patterns keyed by protected branch.';
  const bases = Object.keys(setting);
  if (!bases.length) return 'The branch setting names no base branch: give a pattern for at least one protected branch.';
  const outside = bases.find((base) => !protectedBranches.includes(base));
  if (outside !== undefined) return `The branch setting has a pattern for "${outside}", which is not a protected branch (${protectedBranches.join(', ')}).`;
  for (const pattern of Object.values(setting)) {
    const error = typeof pattern === 'string' ? branchPatternError(pattern, context) : 'Each pattern of the branch setting must be a string.';
    if (error) return error;
  }
  return null;
}

// The setting for `patterns`, keyed by base branch: their one pattern when they
// all match, the object otherwise.
export function branchSetting(patterns) {
  const distinct = new Set(Object.values(patterns));
  return distinct.size === 1 ? [...distinct][0] : patterns;
}

// The setting from --branch and --branch-for: `branch` stands for the first
// protected branch, unless --branch-for names it too. Throws when it is not valid.
export function branchFromFlags(branch, branchFor, protectedBranches, context) {
  const setting = typeof branch === 'object' && branch !== null
    ? { ...branch, ...branchFor }
    : { [protectedBranches[0]]: branch ?? DEFAULT_BRANCH, ...branchFor };
  const error = branchSettingError(setting, protectedBranches, context);
  if (error) throw new Error(error);
  return branchSetting(setting);
}

// A question for a branch pattern, asked again until the answer is valid.
async function askPattern({ io, projectDir, run, ...question }) {
  for (;;) {
    const answer = (await io.choose(question)).trim();
    const error = branchPatternError(answer, { projectDir, run });
    if (!error) return answer;
    io.warn(error);
  }
}

const OTHER_PATTERN = { label: 'Other pattern…', input: { label: 'Pattern', lines: NOTES } };

// The installer's question, asked again until the pattern is valid.
export function askBranch({ io, projectDir, run, step }) {
  return askPattern({
    io,
    projectDir,
    run,
    step,
    title: 'Branch names',
    detail: 'How the branch of each new change is named. Each change keeps the name it got, so changing this later renames no branch.',
    choices: [
      { label: DEFAULT_BRANCH, note: 'default', value: DEFAULT_BRANCH },
      { label: GITFLOW_BRANCH, note: 'gitflow + work item', value: GITFLOW_BRANCH },
      OTHER_PATTERN,
    ],
  });
}

// The pattern offered for changes based on a protected branch after the first:
// `pattern`, the first branch's, with a leading feature/ turned into hotfix/.
const otherBasePattern = (pattern) => pattern.replace(/^feature\//, 'hotfix/');

// The installer's question for each protected branch after the first, asked
// with more than one. `pattern` is the first branch's; the answer is the setting.
export async function askBranchPerBase(pattern, protectedBranches, { io, projectDir, run, step }) {
  const [first, ...others] = protectedBranches;
  const patterns = { [first]: pattern };
  const offered = otherBasePattern(pattern);
  for (const base of others) {
    patterns[base] = await askPattern({
      io,
      projectDir,
      run,
      step,
      title: `Branch names for changes based on ${base}`,
      detail: `How the branch of a change cut from ${base} is named, when you name ${base} as its base. Changes cut from ${first} use ${pattern}.`,
      choices: [
        { label: offered, note: 'default', value: offered },
        ...(offered === pattern ? [] : [{ label: pattern, note: `same as ${first}`, value: pattern }]),
        OTHER_PATTERN,
      ],
    });
  }
  return branchSetting(patterns);
}

// A setting with {user} in a pattern needs the developer's own value, kept in
// their clone's git config. `user` (from --user) sets it; otherwise the developer is asked
// when it is not set yet. An empty answer leaves it for the agent to ask.
export async function setBranchUser(setting, { io, projectDir, run, user }) {
  const pattern = branchPatterns(setting).find((p) => p.includes('{user}'));
  if (pattern === undefined) return;
  let value = user?.trim();
  if (!value) {
    if (run(`git config --get ${USER_KEY}`, { cwd: projectDir, quiet: true }).stdout?.trim()) return;
    value = (await io.ask({
      title: 'Your value for {user}',
      detail: `The branch pattern ${pattern} uses {user}. It is stored with \`git config ${USER_KEY}\`, in your clone only. Leave it empty and Claude asks for it when it opens a change.`,
      fallback: '',
    })).trim();
    if (!value) return;
  }
  if (run(`git config ${USER_KEY} ${shellQuote(value)}`, { cwd: projectDir, quiet: true }).status === 0) io.log(`  set git config ${USER_KEY} to ${value}`);
  else io.warn(`Could not run \`git config ${USER_KEY} ${value}\`. Run it yourself in this repository.`);
}
