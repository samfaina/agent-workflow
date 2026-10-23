// The branches the hooks keep Claude from committing and pushing to: the
// `protectedBranches` setting in .claude/agent-workflow.json. The first one that
// exists locally is also the base of each change.
import { DEFAULT_CONFIG } from '../hooks/shared.mjs';
import { GITFLOW_BRANCH, gitTakesBranchName } from './branch.mjs';

export const DEFAULT_PROTECTED_BRANCHES = DEFAULT_CONFIG.protectedBranches;
const GITFLOW_PROTECTED_BRANCHES = ['develop', 'main'];

// The setting from a list of names separated by commas; throws when it names
// no branch, or a branch git rejects.
export function parseProtectedBranches(list, context) {
  const names = list.split(',').map((name) => name.trim()).filter(Boolean);
  if (!names.length) throw new Error('Name at least one protected branch, such as main.');
  const rejected = names.find((name) => !gitTakesBranchName(name, context));
  if (rejected !== undefined) throw new Error(`The protected branches name "${rejected}", which git rejects as a branch name.`);
  return names;
}

// Whether the repository has a develop branch, local or remote-tracking. git
// also lists refs under refs/heads/develop/, which are not develop itself.
function hasDevelopBranch({ projectDir, run }) {
  const found = run('git for-each-ref refs/heads/develop "refs/remotes/*/develop"', { cwd: projectDir, quiet: true });
  return found.status === 0 && /\trefs\/(heads|remotes\/[^/]+)\/develop$/m.test(found.stdout ?? '');
}

// The installer's question, asked again until the list is valid. develop, main
// comes first when the project looks like gitflow: it has a develop branch, or
// its change branches follow the gitflow pattern.
export async function askProtectedBranches({ io, projectDir, run, step, branchPattern }) {
  const gitflow = branchPattern === GITFLOW_BRANCH || hasDevelopBranch({ projectDir, run });
  const choice = (names, note) => ({ label: names.join(', '), note, value: names.join(',') });
  const usual = choice(DEFAULT_PROTECTED_BRANCHES, gitflow ? undefined : 'default');
  const develop = choice(GITFLOW_PROTECTED_BRANCHES, gitflow ? 'gitflow, default' : 'gitflow');
  for (;;) {
    const answer = await io.choose({
      step,
      title: 'Protected branches',
      detail: 'Claude never commits or pushes to these branches. Each change starts from the first of them that is a local branch.',
      choices: [
        ...(gitflow ? [develop, usual] : [usual, develop]),
        { label: 'Other list…', input: { label: 'Branches, separated by commas' } },
      ],
    });
    try {
      return parseProtectedBranches(answer, { projectDir, run });
    } catch (error) {
      io.warn(error.message);
    }
  }
}
