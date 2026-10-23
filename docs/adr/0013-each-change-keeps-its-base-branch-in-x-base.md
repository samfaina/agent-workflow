# Each change keeps its base branch in `x-base`

The base branch was global: the first branch of `protectedBranches` that exists. Every change was cut from it and handed over into it. Gitflow also cuts hotfixes from `main` and merges them into `main` and `develop`, so with `["develop", "main"]` a hotfix opened through the kit was cut from `develop` and its pull request targeted `develop`. Now every change has its own base branch, one of the protected branches, chosen once when the change opens: the first protected branch that exists, unless the user names another one. The agent writes it as the top-level `x-base` of the change's `.openspec.yaml`, in the commit that publishes the change, for every change. Everything that needs a change's base reads `x-base`, or the first protected branch that exists for a change made before it. A hotfix is a change whose base is `main`; the kit never uses the word.

## Considered Options

- **A hotfix kind** (`x-kind: hotfix`) from which the kit derives the base and the back-merge: rejected. It ties the kit to gitflow, and the glossary keeps "hotfix" out of the kit's language. A base per change also covers a team on `main` and `staging`.
- **Deriving the base from a second branch pattern** (`hotfix/...` means `main`): rejected for the reason ADR 0012 gives. Nothing reads a change back out of a branch name.
- **Asking for the base on every change** when more than one protected branch exists: rejected. It adds a question to every feature to cover the rare case.
- **Two hand-overs** for a change that must reach two branches: rejected. It doubles the close cycle and gives a change several targets in the status module. Bringing `main` into `develop` is a gitflow step, and many code hosts already automate it.
- **Writing `x-base` only when it differs from the default**: rejected. Editing `protectedBranches` would then move the base of a change already open.
- **A `backMerge` setting** naming where each base goes next: rejected. The default base, the first protected branch that exists, is enough to say where a change on another base still has to go.
- **A base outside `protectedBranches`**, such as another change's branch (stacked changes): left out.
- **Release branches**: left out of the kit. A `release/*` branch stabilises a version; it is not a unit of planned work with tickets. Teams cut, merge and back-merge them by hand.

## Consequences

- One pull request per change, into its base. When the base is not the default base, `/close-change`, `now-what` and the developer view remind the user to bring the base into the default base once the pull request is merged. The kit never makes that merge.
- The user names another base when the change opens. A branch outside `protectedBranches` stops the agent. A base that exists only on the remote is created by `git switch`; a base that exists nowhere stops the agent.
- A change's base is fixed, like its branch. Moving an open change to another base is a rebase and an edit of `x-base`, both by hand.
- The status module looks for pending hand-overs among the branches not merged into any existing protected branch, and judges each one against its own `x-base`: the local branch, else `<remote>/<base>`, else the hand-over is skipped. A change merged into `main` but not yet into `develop` is no longer pending; what remains is the back-merge, outside the kit. Changes and hand-overs in the snapshot carry their `base`; the snapshot's own `base` stays the default base.
- `branch` in `.claude/agent-workflow.json` takes a string, as before, or an object keyed by base, such as `{"develop": "feature/{ref}__{change}", "main": "hotfix/{ref}__{change}"}`. Its keys must be protected branches, and there is at least one. A base without an entry uses the entry of the first protected branch that has one. Pending hand-overs are looked for among all unmerged branches, whatever the values, and `git-guard` shows the pattern of the default base.
- The installer asks for a branch pattern for each protected branch after the first, offering the first pattern with `feature/` turned into `hotfix/`, and writes an object only when the patterns differ. Without a question: `--branch-for <base>=<pattern>`, repeatable.
- `x-base` relies on OpenSpec accepting `x-` keys in `validate --strict` and keeping them on `archive`, as ADR 0012 found for `x-branch`.
