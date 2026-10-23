// How the branch of a new change is named: the `branch` setting in
// .claude/agent-workflow.json (ADR 0012). The agent fills it in once, when the
// change opens, and keeps the result in the change's `x-branch`.
import { BRANCH_PLACEHOLDER, DEFAULT_CONFIG } from '../hooks/shared.mjs';
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

// The installer's question, asked again until the pattern is valid.
export async function askBranch({ io, projectDir, run, step }) {
  for (;;) {
    const answer = await io.choose({
      step,
      title: 'Branch names',
      detail: 'How the branch of each new change is named. Each change keeps the name it got, so changing this later renames no branch.',
      choices: [
        { label: DEFAULT_BRANCH, note: 'default', value: DEFAULT_BRANCH },
        { label: GITFLOW_BRANCH, note: 'gitflow + work item', value: GITFLOW_BRANCH },
        { label: 'Other pattern…', input: { label: 'Pattern', lines: NOTES } },
      ],
    });
    const error = branchPatternError(answer.trim(), { projectDir, run });
    if (!error) return answer.trim();
    io.warn(error);
  }
}

// A pattern with {user} needs the developer's own value, kept in their clone's
// git config. `user` (from --user) sets it; otherwise the developer is asked
// when it is not set yet. An empty answer leaves it for the agent to ask.
export async function setBranchUser(pattern, { io, projectDir, run, user }) {
  if (!pattern.includes('{user}')) return;
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
