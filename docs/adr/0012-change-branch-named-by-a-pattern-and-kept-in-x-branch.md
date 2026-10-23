# A change branch is named from a pattern and kept in `x-branch`

Every change lived on `change/<change>`, hard-coded in the adapter, `AGENTS.md`, the kit's skills, the status module, `git-guard` and the experiment checks. Teams on gitflow, or whose code host links work items by the key in the branch name (Jira with Bitbucket: `feature/POC-1-add-greet`), had to rename branches by hand. The name is now a pattern, `branch` in `.claude/agent-workflow.json`, `change/{change}` by default: `{change}` is the change name, `{ref}` its first external reference as written, and `{user}` the developer's own value from `git config agent-workflow.user`, which stays in each clone because `agent-workflow.json` is shared by the team. When the change opens, the agent fills the pattern in once and writes the result as the top-level `x-branch` of the change's `.openspec.yaml`, in the commit that publishes it. Everything that needs a change's branch reads `x-branch`, or `change/<change>` for a change made before it.

## Considered Options

- **Rebuilding the change from the branch name** (as `^change\/(.+)$` did): rejected. A pattern such as `{ref}__{change}--{user}` cannot be parsed back reliably, a reference linked later would change the result, and a new pattern would orphan every open change.
- **Rebuilding the branch from the pattern each time it is needed**: rejected for the same reasons: the inputs change after the branch exists.
- **Sanitising a name git rejects** (a URL as reference, a reference with spaces): rejected. The agent says so and stops; `git check-ref-format --branch` is the only judge, and it accepts `feature/#42-add-greet`.
- **Deriving `{user}` from `git config user.name`**: left out. Teams use short codes the name does not give.

## Consequences

- OpenSpec 1.14.3 accepts `x-branch` in `validate --strict`, as it accepts `x-external-references`, and `openspec archive` keeps it, so an archived change still names its branch.
- The agent never invents a placeholder's value. A pattern with `{ref}` and a change without a reference stops until the user gives the reference or the branch name by hand; a pattern with `{user}` and nothing in `git config agent-workflow.user` asks for it and stores it there.
- The status module finds a pending hand-over without parsing names: among all unmerged branches, whatever their name, since a branch named by hand need not start with the pattern's fixed part, it reads only the `.openspec.yaml` of the archives the base lacks, and matches their `x-branch` exactly.
- A branch is named once: linking a reference later, or changing the pattern, renames nothing.
- ADR 0009 rejected the reference in the branch name as the *store* of external references, and that still holds: references live in `x-external-references`. A branch name that carries one is now only a naming convention. ADR 0009's claim that `#` is not valid in a branch name was wrong; it is.
