# Experiment log: first real run of the workflow

The automated trial (installer, adapter by hand, hooks, archive) passed in `.sandbox/try-2026-10-17/`. What it could not test are the five user-invoked skills, which only you can start. This plan runs them for real on a fresh copy of the sample project. Record what you see in the **Results** table at the end.

The feature for the trial: a `remove <id>` command for the sample to-do CLI.

## 0. Before you start

In PowerShell:

```powershell
Get-ChildItem $HOME\.claude\skills -ErrorAction SilentlyContinue
```

Check that none of these names appears there: `grill-with-docs`, `grilling`, `domain-modeling`, `to-spec`, `to-tickets`, `implement`, `tdd`, `code-review`, `codebase-design`, `close-change`. A personal skill with the same name wins over the project's copy and would spoil the trial.

## 1. Set up the trial project

```powershell
cd E:\projects\agent-workflow\.sandbox
Copy-Item -Recurse ..\examples\sample-node-cli try-real
cd try-real
git init -b main
git add -A
git commit -m "chore: initial sample project"
git switch -c chore/install-agent-workflow
node E:\projects\agent-workflow\bin\agent-workflow.js init
```

Answer: language `Spanish`, check command `npm test` (the default it offers), and **no** to every optional skill.

```powershell
git add -A
git commit -m "chore: install agent-workflow"
git switch main
git merge --ff-only chore/install-agent-workflow
claude
```

Check:

- [ ] Typing `/` lists `/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement` and `/close-change`. If you also see `/mattpocock-skills:...` entries, that is your global plugin; always use the short names.
- [ ] `/hooks` lists three hooks pointing at `.claude/hooks/agent-workflow/`.
- [ ] Typing `/code-review` shows Matt's description ("Review the changes since a fixed point... two axes"), not Claude Code's built-in one. Press Esc without running it.

## 2. Session 1: `/grill-with-docs` and `/to-spec`

In the session opened above:

```
/grill-with-docs Add a "remove" command to the to-do CLI that deletes a to-do by its id
```

Answer the questions (saying "yes" to a recommendation is fine). Then, in the **same session**:

```
/to-spec remove-todo
```

Check (in a second PowerShell window inside `try-real`):

- [ ] The interview came in numbered rounds with a recommendation per question, in Spanish.
- [ ] `git branch --show-current` prints `change/remove-todo`.
- [ ] Claude asked you to confirm the test seams before writing the spec.
- [ ] `openspec show remove-todo` prints a proposal with **Why**, **What Changes**, **Capabilities**, **Impact** and **Out of Scope**.
- [ ] `openspec/changes/remove-todo/specs/*/spec.md` holds `### Requirement:` blocks with SHALL, each with a success scenario and error scenarios (unknown id, missing id).
- [ ] `openspec/changes/remove-todo/design.md` has **Decisions** and **Testing Decisions**.
- [ ] `openspec validate remove-todo --strict` says the change is valid.
- [ ] `git log --oneline -3` shows `docs(remove-todo): publish spec`.
- [ ] Claude did not mention labels, did not run `gh issue`, and created no `.scratch/` folder.
- [ ] If the interview wrote `GLOSSARY.md` or `docs/adr/`, they are committed on the change branch (`git status` is clean).

## 3. Session 2: `/to-tickets`

Type `/clear`, then:

```
/to-tickets remove-todo
```

Review the proposed breakdown and approve it (or ask for changes first).

Check:

- [ ] The proposal listed each ticket with a title, **Blocked by** and what it delivers, and asked about granularity.
- [ ] `openspec/changes/remove-todo/tasks.md` has one `## N. <title>` group per ticket, each with `Blocked by:`, `What to build:` and `- [ ] N.M` boxes that say how they are verified.
- [ ] Tickets are vertical slices (each includes its own tests), not layers.
- [ ] The last group is the manual test, blocked by every other ticket.
- [ ] `openspec list` shows `remove-todo` with `0/<n> tasks`.
- [ ] `openspec validate remove-todo --strict` passes.
- [ ] `git log --oneline -3` shows `docs(remove-todo): publish tickets`, and `proposal.md`, the specs and `design.md` are unchanged (`git diff HEAD~1 --stat` lists only `tasks.md`).

## 4. Sessions 3 and on: `/implement`, one per ticket

For each ticket before the manual test, type `/clear`, then:

```
/implement remove-todo
```

Check, every time:

- [ ] Claude starts with `Ticket remove-todo#N: <title>`, and N is the first ticket whose blockers are done.
- [ ] It confirms the seams and writes a failing test before the code (`tdd`).
- [ ] At the end it runs **Matt's** `code-review`: the report has `## Standards` and `## Spec` sections, and the Spec section quotes `openspec/changes/remove-todo/`.
- [ ] The ticket's boxes are ticked in `tasks.md` and `openspec list` shows the new count.
- [ ] `git log -1` shows a Conventional Commits message ending with `Refs: remove-todo#N`, with `tasks.md` in the same commit (`git show --stat HEAD`).

Once, during one of these sessions, also try the guardrails:

- [ ] Ask Claude: "push this branch to origin". The answer quotes `agent-workflow git-guard: git push is disabled`.
- [ ] Ask Claude: "add a line to openspec/specs" (any spec file, if one exists, or `.env`). The answer quotes `agent-workflow protected-paths`.
- [ ] Break a test on purpose (ask Claude to change an expected value in `test/cli.test.js` and commit). The commit is stopped with `agent-workflow quality-gate`, and Claude fixes it before committing.

When the next ticket is the manual test, type `/clear` and run `/implement remove-todo` once more:

- [ ] Claude lists the manual steps and waits. Run each in your PowerShell window and report the result.
- [ ] Only the boxes you confirmed get ticked; `openspec list` shows all tasks done.

## 5. Last session: `/close-change`

Type `/clear`, then:

```
/close-change remove-todo
```

Check:

- [ ] It checks the branch, a clean working tree, all boxes ticked and `--strict` validation before doing anything else.
- [ ] It runs `code-simplification` on the code files and commits `refactor(remove-todo): simplify` (or says nothing needed simplifying).
- [ ] It runs `security-and-hardening` and lists findings with severity and `file:line` (or none).
- [ ] It does **not** run `code-review` again.
- [ ] It shows a verification table (Completeness, Correctness, Coherence) with evidence.
- [ ] It runs `openspec archive remove-todo --yes` and commits `docs(remove-todo): archive change`.
- [ ] It ends with the `git push` and `gh pr create` commands. The trial project has no remote, so do not run them.

Then, in PowerShell:

```powershell
git log --oneline main..HEAD
openspec list
openspec list --specs
openspec validate --specs --strict
```

- [ ] `openspec list` shows no active changes; `openspec list --specs` shows the capability the change created or modified.
- [ ] `openspec validate --specs --strict` passes.
- [ ] `git status` is clean, and nothing in `.claude/skills/` changed during the trial (`git log --oneline -- .claude/skills` shows only the installation commit).

## Results

| Step | Result (ok / failed / partly) | Notes: what happened instead, exact messages |
| --- | --- | --- |
| 1. Set up | partly | The commit and merge after the installer were not run, so the session started on `chore/install-agent-workflow` with the kit uncommitted. The commands sit in a second block after the "Answer:" paragraph and are easy to miss: merge them into one block. |
| 2. grill-with-docs + to-spec | in progress | Before writing the change, `/to-spec` stopped and asked which branch to use: "Estás en chore/install-agent-workflow con todo el kit sin commitear... El cambio debería ir en change/remove-todo". Nothing was written before asking (correct). Gap in `docs/agents/issue-tracker.md`, **Branch**: it only covers being on a protected branch. Fix: when the current branch is not `change/<change>`, switch to it, creating it from the protected branch, and stop if the working tree has uncommitted files that do not belong to the change. |
| 3. to-tickets | | |
| 4. implement (per ticket) | | |
| 4. guardrails | | |
| 4. manual test ticket | | |
| 5. close-change | | |

When a check fails, note which document the skill should have followed (`docs/agents/issue-tracker.md`, `AGENTS.md`, `CLAUDE.md`, `openspec/config.yaml`) and what it did instead: the fix goes into that document in the kit, never into a third-party skill.
