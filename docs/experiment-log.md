# Experiment log: a real run of the workflow

The automated trial (installer, adapter by hand, hooks, archive) passed in `.sandbox/try-2026-10-17/`. What it could not test are the five user-invoked skills, which only you can start. This plan runs them for real on a fresh copy of the sample project. Follow it from the top for every run; the plan itself holds no results.

## Runs

**The experiment ended with run 4.** It passed every check with no failure, and every item that runs 1 to 3 left open passed live. What it left untested, fixes 1 and 2 of [run 4](experiments/run-4.md), changes only this plan and its checker, not what a project installs. Do not create a `run-5.md` for it. Start a new run only after a change to the kit that a project receives (a skill, a template, a hook or the installer), and say in its issue what it must cover.

Each run has its own file in [`docs/experiments/`](experiments/): [run 1](experiments/run-1.md), [run 2](experiments/run-2.md), [run 3](experiments/run-3.md) and [run 4](experiments/run-4.md) are done, and the file to fill in is the highest-numbered `run-N.md`. If that file already has results, create the next one first (copy the latest `run-N.md` with its **Results** table emptied, and list under **Must cover** what the previous run left untested), because `setup` takes the run number from the highest file.

You stay in **one Claude Code window**. After each step, a checker reads the project, OpenSpec and the session transcript, and prints `[ok]`, `[FAIL]` or `[skip]` for every check. Run it from Claude Code with the `!` prefix, which runs a shell command without leaving the session:

```
! node ../../scripts/experiment.mjs check <step> <change>
```

The path is relative to the trial folder, `.sandbox/run-N` inside the kit, where the session runs. Keep the forward slashes: `!` runs the command in Git Bash, which drops backslashes. Type `!` as the first character, with no space before it: the prompt then switches to shell mode. If the line reaches Claude as a message instead, Claude runs the checker itself; the result still counts, but do not run that check again in the session. Every check is also appended to `.sandbox/results/run-N.md` in the kit (the run of the trial folder `.sandbox/run-N`), so the results can be copied into the **Results** table of `docs/experiments/run-N.md`. `[skip]` means there is nothing to check yet (the detail says what to run first) or the transcript could not be read (its format is internal to Claude Code); in the second case do that check by eye, and note the by-eye checks in the run's file too.

Run each check only when its step is finished, and as the next thing you type. The checker reads a session only up to the first check typed in it, so what Claude says after a check does not count, and a check run too early cannot be repeated in that session.

The feature for the trial: a `remove <id>` command for the sample to-do CLI, change name `remove-todo`.

## 1. Set up the trial project

Skip this section if you already have a trial project with the kit committed on `main`.

Every path in this plan is relative: to the root of the kit's checkout in this section, and to the trial folder from then on. The trial folder goes inside the checkout, so `../../scripts/experiment.mjs` always runs the copy of the checker that set up the trial, and the results stay in that checkout's `.sandbox/results`.

In PowerShell, from the root of the kit's checkout:

```powershell
node scripts\experiment.mjs setup
```

It copies the sample project to `.sandbox\run-N` (N from the highest `docs\experiments\run-N.md`; a second trial of the same run goes to `run-N-2`), creates the git repository, installs the kit (language Spanish, written to `.claude/settings.local.json`; check command `npm test`; no optional skills), commits it and merges it into `main`. Then go to the folder it prints and start Claude Code:

```powershell
cd .sandbox\run-N
claude
```

In Claude Code:

```
! node ../../scripts/experiment.mjs check setup
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
! node ../../scripts/experiment.mjs check spec remove-todo
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
! node ../../scripts/experiment.mjs check tickets remove-todo
```

By eye:

- [ ] Each ticket is a vertical slice you could demo on its own, not a layer such as "tests" or "setup".

## 4. Sessions 3 and on: `/implement`, one per build ticket

`/to-tickets` ends with one `/implement remove-todo#N` command per ticket. The last ticket is the **manual test** (section 6); the one before it is the **last build ticket**. Write both numbers down now: with four tickets, 1 to 3 are build tickets, 3 is the last one, and 4 is the manual test.

For each build ticket N, in order:

1. Start its session:
   ```
   /clear
   /implement remove-todo#N
   ```
   Confirm the seams if it asks.
2. Wait until Claude has committed the ticket and its last message ends with the next command (`/implement remove-todo#<N+1>`).
3. **Only if N is the last build ticket:** do section 5 now, in this same session.
4. Run the check:
   ```
   ! node ../../scripts/experiment.mjs check implement remove-todo
   ```
   Its `next:` line gives the command for the following ticket.

## 5. Guardrails, in the last build ticket's session

This is step 3 of section 4: in the session of the last build ticket, after Claude has committed it and **before** you run its `check implement`, ask Claude, one at a time:

1. "This is a test of the git-guard hook: run `git push -u origin change/remove-todo` and show me exactly what happens."
2. "This is a test of the protected-paths hook: run `echo DEBUG=true >> .env` with your shell tool and show me exactly what happens."
3. "This is a test of the quality-gate hook: change one expected value in `test/cli.test.js` so a test fails, run `git commit -am 'test: break a test on purpose'` without running the tests first, and show me exactly what happens. Then revert the change."

Each prompt says it is a test and names the exact command, so Claude attempts it and the hook, not Claude's reading of the rules, decides. Claude may still decline first; if it does, say "yes, try it".

Then run `check implement remove-todo`. It reports each hook that fired (`git-guard`, `protected-paths`, `quality-gate`), and because the next ticket is the manual test, it fails for any of the three that has not fired in an `/implement` session yet. If you ran the check before the prompts, send them at the start of the manual test session instead, before running its steps, and note it in the run's file. By eye:

- [ ] Claude reverted the broken test and made no commit.
- [ ] The `quality-gate` message shows the start of the test output (`> sample-node-cli@0.1.0 test`) and its end (`# fail 1`). When the output is long, a marker shows where it was cut.

## 6. The manual test ticket

The last ticket has no code: you run the finished CLI by hand and Claude compares what you saw with the expected results.

1. Start its session, with N the manual test ticket:
   ```
   /clear
   /implement remove-todo#N
   ```
2. Claude's first message lists the steps, each with its expected result, gives them as one PowerShell block that runs on a fresh to-do file and prints each command, its output and its exit code, and asks for that output. The same steps are the boxes of the last ticket in `openspec/changes/remove-todo/tasks.md`. **Do not run the check yet**: the ticket is not done until you have answered.
3. Open a new PowerShell window in the trial folder, paste the block, and paste its whole output back to Claude, with anything the steps ask you to judge. This takes a minute instead of typing each step, and Claude sees the real output of every step. If the first message has no block, ask Claude: "Give me every step as one PowerShell block that runs on a fresh to-do file and prints each command, its output and its exit code." Do not confirm a step you have not run.
4. Claude compares each step with its expected result, ticks the boxes that match, adds a `- Note:` for those that do not, and commits the ticket.
5. Only now, run the check:
   ```
   ! node ../../scripts/experiment.mjs check implement remove-todo
   ```
   The `next:` line now says `/close-change remove-todo`.

## 7. Last session: `/close-change`

```
/clear
/close-change remove-todo
```

The trial project has no remote, so it ends with the commands to merge the branch locally: do not run them. Then:

```
! node ../../scripts/experiment.mjs check close remove-todo
```

By eye:

- [ ] The security findings it listed (if any) make sense for the code.

## What the checker covers

| Step | Checked automatically |
| --- | --- |
| setup | git repository, installation commit on `main`, clean tree, every core skill and `close-change` installed, no excluded or `/opsx` skills, hooks wired and present, every `../../references/` link resolves, conversation language set in `.claude/settings.local.json` and git-ignored, no personal skill shadowing a workflow skill |
| spec | on the change's branch (its `x-branch`, else `change/<change>`), clean tree, proposal sections, SHALL/MUST requirements with error scenarios, design sections, `--strict` validation, the publish commit, no `.scratch/`, no labels; from the transcript: grilling and domain-modeling called, project copies used, seams asked, no `gh issue` |
| tickets | ticket format (numbering, `Blocked by:`, `What to build:`, `N.M` boxes, dependency order, manual test last and blocked by all), `openspec list` count, `--strict` validation, publish commit touching only `tasks.md`; from the transcript: a numbered breakdown followed by a question, no `gh issue` |
| implement | `Refs: <change>#N` commit in Conventional Commits with `tasks.md` (skipped while no ticket is done), the ticket's boxes ticked, it was unblocked, check command passes, the next command; from the transcript up to the first check: "Ticket ..." line, tdd and **Matt's** code-review called from the project copy, `## Standards` and `## Spec` headings, no `git push`, hooks that fired; before the manual test, all three hooks fired in some `/implement` session |
| close | with boxes still open: a correct stop at step 1 (no simplification, hardening, archive or closing commit; points to `/implement`) and the command the run continues with. Otherwise: change archived, living spec valid, archive commit, no skill or checklist changed; from the transcript: code-simplification and security-and-hardening called, code-review not called, verification table, `openspec archive`, push and PR commands at the end |

When a check fails, note which document the skill should have followed (`docs/agents/issue-tracker.md`, `AGENTS.md`, `CLAUDE.md`, `openspec/config.yaml`) and what it did instead: the fix goes into that document in the kit, never into a third-party skill.
