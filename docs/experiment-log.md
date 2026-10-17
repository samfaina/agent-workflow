# Experiment log: a real run of the workflow

The automated trial (installer, adapter by hand, hooks, archive) passed in `.sandbox/try-2026-10-17/`. What it could not test are the five user-invoked skills, which only you can start. This plan runs them for real on a fresh copy of the sample project. Follow it from the top for every run; the plan itself holds no results.

## Runs

Each run has its own file in [`docs/experiments/`](experiments/): [run 1](experiments/run-1.md) is done, and the file to fill in is the highest-numbered `run-N.md`. If that file already has results, create the next one first (copy `run-2.md` with its **Results** table emptied, and list under **Must cover** what the previous run left untested), because `setup` takes the run number from the highest file.

You stay in **one Claude Code window**. After each step, a checker reads the project, OpenSpec and the session transcript, and prints `[ok]`, `[FAIL]` or `[skip]` for every check. Run it from Claude Code with the `!` prefix, which runs a shell command without leaving the session:

```
! node E:/projects/agent-workflow/scripts/experiment.mjs check <step> <change>
```

Keep the forward slashes: `!` runs the command in Git Bash, which drops backslashes. Every check is also appended to `E:\projects\agent-workflow\.sandbox\results\run-N.md` (the run of the trial folder `.sandbox\run-N`), so the results can be copied into the **Results** table of `docs/experiments/run-N.md`. `[skip]` means the transcript could not be read (its format is internal to Claude Code); do that check by eye, and note the by-eye checks in the run's file too.

The feature for the trial: a `remove <id>` command for the sample to-do CLI, change name `remove-todo`.

## 1. Set up the trial project

Skip this section if you already have a trial project with the kit committed on `main`.

In PowerShell:

```powershell
cd E:\projects\agent-workflow
node scripts\experiment.mjs setup
```

It copies the sample project to `.sandbox\run-N` (N from the highest `docs\experiments\run-N.md`; a second trial of the same run goes to `run-N-2`), creates the git repository, installs the kit (language Spanish, written to `.claude/settings.local.json`; check command `npm test`; no optional skills), commits it and merges it into `main`. Then go to the folder it prints and start Claude Code:

```powershell
cd E:\projects\agent-workflow\.sandbox\run-N
claude
```

In Claude Code:

```
! node E:/projects/agent-workflow/scripts/experiment.mjs check setup
```

By eye:

- [ ] Typing `/` lists `/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement` and `/close-change`. Entries prefixed `/mattpocock-skills:` come from your global plugin; always use the short names.

## 2. Session 1: `/grill-with-docs` and `/to-spec`

```
/grill-with-docs Add a "remove" command to the to-do CLI that deletes a to-do by its id
```

Answer the questions ("yes" to a recommendation is fine). Then, in the **same session**:

```
/to-spec remove-todo
```

Confirm the test seams when it asks. When it finishes:

```
! node E:/projects/agent-workflow/scripts/experiment.mjs check spec remove-todo
```

By eye:

- [ ] The interview came in numbered rounds, with a recommendation per question, in Spanish.

## 3. Session 2: `/to-tickets`

```
/clear
/to-tickets remove-todo
```

Review the proposed breakdown and approve it (or ask for changes first). When it finishes:

```
! node E:/projects/agent-workflow/scripts/experiment.mjs check tickets remove-todo
```

By eye:

- [ ] Each ticket is a vertical slice you could demo on its own, not a layer such as "tests" or "setup".

## 4. Sessions 3 and on: `/implement`, one per ticket

For each ticket, including the manual test at the end:

```
/clear
/implement remove-todo
```

Confirm the seams when it asks. For the manual test ticket, Claude lists steps: run each in a PowerShell window and report the result. When it finishes:

```
! node E:/projects/agent-workflow/scripts/experiment.mjs check implement remove-todo
```

The last line of the check names the next frontier ticket; when it says every ticket is done, go to step 5.

Once, during one of these sessions, try the guardrails by asking Claude, one at a time:

1. "This is a test of the git-guard hook: run `git push -u origin change/remove-todo` and show me exactly what happens."
2. "This is a test of the protected-paths hook: run `echo DEBUG=true >> .env` with your shell tool and show me exactly what happens."
3. "This is a test of the quality-gate hook: change one expected value in `test/cli.test.js` so a test fails, run `git commit -am 'test: break a test on purpose'` without running the tests first, and show me exactly what happens. Then revert the change."

Each prompt says it is a test and names the exact command, so Claude attempts it and the hook, not Claude's reading of the rules, decides. Claude may still decline first; if it does, say "yes, try it".

The next `check implement` reports each hook that fired (`git-guard`, `protected-paths`, `quality-gate`). Check by eye that Claude fixed the test before committing.

## 5. Last session: `/close-change`

```
/clear
/close-change remove-todo
```

It ends with `git push` and `gh pr create` commands: the trial project has no remote, so do not run them. Then:

```
! node E:/projects/agent-workflow/scripts/experiment.mjs check close remove-todo
```

By eye:

- [ ] The security findings it listed (if any) make sense for the code.

## What the checker covers

| Step | Checked automatically |
| --- | --- |
| setup | git repository, installation commit on `main`, clean tree, every core skill and `close-change` installed, no excluded or `/opsx` skills, hooks wired and present, every `../../references/` link resolves, conversation language set in `.claude/settings.local.json` and git-ignored, no personal skill shadowing a workflow skill |
| spec | branch `change/<change>`, clean tree, proposal sections, SHALL/MUST requirements with error scenarios, design sections, `--strict` validation, the publish commit, no `.scratch/`, no labels; from the transcript: grilling and domain-modeling called, project copies used, seams asked, no `gh issue` |
| tickets | ticket format (numbering, `Blocked by:`, `What to build:`, `N.M` boxes, dependency order, manual test last and blocked by all), `openspec list` count, `--strict` validation, publish commit touching only `tasks.md`; from the transcript: breakdown approved, no `gh issue` |
| implement | `Refs: <change>#N` commit in Conventional Commits with `tasks.md`, the ticket's boxes ticked, it was unblocked, check command passes, next frontier; from the transcript: "Ticket ..." line, tdd and **Matt's** code-review called from the project copy, Standards and Spec sections, no `git push`, hooks that fired |
| close | with boxes still open: a correct stop at step 1 (no simplification, hardening, archive or closing commit; points to `/implement`). Otherwise: change archived, living spec valid, archive commit, no skill or checklist changed; from the transcript: code-simplification and security-and-hardening called, code-review not called, verification table, `openspec archive`, push and PR commands at the end |

When a check fails, note which document the skill should have followed (`docs/agents/issue-tracker.md`, `AGENTS.md`, `CLAUDE.md`, `openspec/config.yaml`) and what it did instead: the fix goes into that document in the kit, never into a third-party skill.
