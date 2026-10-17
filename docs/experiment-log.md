# Experiment log: first real run of the workflow

The automated trial (installer, adapter by hand, hooks, archive) passed in `.sandbox/try-2026-10-17/`. What it could not test are the five user-invoked skills, which only you can start. This plan runs them for real on a fresh copy of the sample project.

You stay in **one Claude Code window**. After each step, a checker reads the project, OpenSpec and the session transcript, and prints `[ok]`, `[FAIL]` or `[skip]` for every check. Run it from Claude Code with the `!` prefix, which runs a shell command without leaving the session:

```
! node E:\projects\agent-workflow\scripts\experiment.mjs check <step> <change>
```

Each run is also saved to `E:\projects\agent-workflow\.sandbox\results\<trial folder>.md`, so the results can be copied into the **Results** table at the end. `[skip]` means the transcript could not be read (its format is internal to Claude Code); do that check by eye.

The feature for the trial: a `remove <id>` command for the sample to-do CLI, change name `remove-todo`.

## 1. Set up the trial project

Skip this section if you already have a trial project with the kit committed on `main`.

In PowerShell:

```powershell
cd E:\projects\agent-workflow
node scripts\experiment.mjs setup
```

It copies the sample project to `.sandbox\try-<date>`, creates the git repository, installs the kit (language Spanish, check command `npm test`, no optional skills), commits it and merges it into `main`. Then go to the folder it prints and start Claude Code:

```powershell
cd E:\projects\agent-workflow\.sandbox\try-<date>
claude
```

In Claude Code:

```
! node E:\projects\agent-workflow\scripts\experiment.mjs check setup
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
! node E:\projects\agent-workflow\scripts\experiment.mjs check spec remove-todo
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
! node E:\projects\agent-workflow\scripts\experiment.mjs check tickets remove-todo
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
! node E:\projects\agent-workflow\scripts\experiment.mjs check implement remove-todo
```

The last line of the check names the next frontier ticket; when it says every ticket is done, go to step 5.

Once, during one of these sessions, try the guardrails by asking Claude, one at a time:

1. "push this branch to origin"
2. "add a line to .env"
3. "change an expected value in test/cli.test.js so a test fails, and commit it"

The next `check implement` reports each hook that fired (`git-guard`, `protected-paths`, `quality-gate`). Check by eye that Claude fixed the test before committing.

## 5. Last session: `/close-change`

```
/clear
/close-change remove-todo
```

It ends with `git push` and `gh pr create` commands: the trial project has no remote, so do not run them. Then:

```
! node E:\projects\agent-workflow\scripts\experiment.mjs check close remove-todo
```

By eye:

- [ ] The security findings it listed (if any) make sense for the code.

## What the checker covers

| Step | Checked automatically |
| --- | --- |
| setup | git repository, installation commit on `main`, clean tree, every core skill and `close-change` installed, no excluded or `/opsx` skills, hooks wired and present, every `../../references/` link resolves, no personal skill shadowing a workflow skill |
| spec | branch `change/<change>`, clean tree, proposal sections, SHALL/MUST requirements with error scenarios, design sections, `--strict` validation, the publish commit, no `.scratch/`, no labels; from the transcript: grilling and domain-modeling called, project copies used, seams asked, no `gh issue` |
| tickets | ticket format (numbering, `Blocked by:`, `What to build:`, `N.M` boxes, dependency order, manual test last and blocked by all), `openspec list` count, `--strict` validation, publish commit touching only `tasks.md`; from the transcript: breakdown approved, no `gh issue` |
| implement | `Refs: <change>#N` commit in Conventional Commits with `tasks.md`, the ticket's boxes ticked, it was unblocked, check command passes, next frontier; from the transcript: "Ticket ..." line, tdd and **Matt's** code-review called from the project copy, Standards and Spec sections, no `git push`, hooks that fired |
| close | change archived, living spec valid, archive commit, no skill or checklist changed; from the transcript: code-simplification and security-and-hardening called, code-review not called, verification table, `openspec archive`, push and PR commands at the end |

## Results

| Step | Result (ok / failed / partly) | Notes: what happened instead, exact messages |
| --- | --- | --- |
| 1. Set up | partly | The commit and merge after the installer were not run, so the session started on `chore/install-agent-workflow` with the kit uncommitted. The commands sat in a second block after the "Answer:" paragraph and were easy to miss. Replaced by `node scripts/experiment.mjs setup`. Checker afterwards: 10 ok. |
| 2. grill-with-docs + to-spec | partly | Before writing the change, `/to-spec` stopped and asked which branch to use: "Estás en chore/install-agent-workflow con todo el kit sin commitear... El cambio debería ir en change/remove-todo". Nothing was written before asking (correct). Gap in `docs/agents/issue-tracker.md`, **Branch**: it only covers being on a protected branch. Fix: when the current branch is not `change/<change>`, switch to it, creating it from the protected branch, and stop if the working tree has uncommitted files that do not belong to the change. After the branch was sorted out, checker: 17 ok. |
| 3. to-tickets | in progress | After `/clear`, the breakdown and the three approval questions came in English ("Here's my proposed breakdown for `remove-todo`..."), although `CLAUDE.md` says "Talk to the user in Spanish". Session 1 stayed in Spanish because the user typed Spanish; here the only user input was the command, and everything else in context (skill, adapter, spec, code) is English. The Language line is short and sits after the whole of `AGENTS.md`. Fix in `templates/CLAUDE.md`: put `## Language` first, before `@AGENTS.md`, and name the cases: "Every message you write to the user is in {{LANGUAGE}}, including questions, proposals, ticket breakdowns, review reports and summaries that skills ask you to produce, even when the skill, the docs and the artifacts are in English." Workaround during the trial: answer in Spanish and ask Claude to keep to Spanish. |
| 4. implement (per ticket) | | |
| 4. guardrails | | |
| 4. manual test ticket | | |
| 5. close-change | | |

When a check fails, note which document the skill should have followed (`docs/agents/issue-tracker.md`, `AGENTS.md`, `CLAUDE.md`, `openspec/config.yaml`) and what it did instead: the fix goes into that document in the kit, never into a third-party skill.
