---
name: close-change
description: "Close a finished OpenSpec change: simplify, harden, verify against its specs, and archive it into the living spec."
disable-model-invocation: true
---

# Close Change

Close one finished **change**: simplify its code, harden it, verify it against its spec, and archive it so its delta specs merge into the living spec. `code-review` already ran on every ticket during `/implement`; this skill looks at the change as a whole instead.

Read `docs/agents/issue-tracker.md` first: it defines changes, tickets, branches and commit trailers.

## Process

### 1. Check the change is ready

The argument is the change name. Without one, run `openspec list`; with exactly one active change take it, otherwise ask which one.

Every check below must hold. When one fails, report which and stop:

- `git branch --show-current` prints `change/<change>`.
- `git status --porcelain` prints nothing.
- `openspec instructions apply --change <change> --json` reports `progress.remaining` as 0. Otherwise list the unticked boxes and tell the user to run `/implement <change>`; the manual test ticket counts.
- `openspec validate <change> --strict` says the change is valid.

### 2. Pin the diff

Find the base: the first branch of `protectedBranches` in `.claude/agent-workflow.json` that exists locally, then `git merge-base HEAD <that branch>`. The change's diff is `git diff <base>...HEAD`; its files are `git diff --name-only <base>...HEAD`. The **code files** are those outside `openspec/`, `docs/` and `.claude/`. With no code files, skip to step 5.

### 3. Simplify

Call the Skill tool with `code-simplification`, scoped to the code files. Behaviour stays exactly as the specs describe it. Run `checkCommand` from `.claude/agent-workflow.json`; when it passes, commit `refactor(<change>): simplify` with the trailer `Refs: <change>`. When nothing is worth simplifying, say so and move on.

### 4. Harden

Call the Skill tool with `security-and-hardening` to audit the code files, starting from the trust boundaries the change introduces or touches. For each finding, record its severity and the `file:line` it points at.

- Fix every critical and high finding in the change's own code, run `checkCommand`, and commit `fix(<change>): <what was hardened>` with the trailer `Refs: <change>`.
- When a fix would change behaviour the specs describe, ask the user before applying it.
- Medium and low findings go to the report.

### 5. Verify

Run `openspec instructions apply --change <change> --json` again and read every file in `contextFiles`. Check the change along three dimensions, citing `file:line` evidence for each item:

- **Completeness**: every box in `tasks.md` is ticked; every ADDED or MODIFIED requirement has an implementation; every REMOVED requirement's behaviour (read its body in `openspec/specs/<capability>/spec.md`) is gone from the code.
- **Correctness**: every scenario under an ADDED or MODIFIED requirement is handled by the code and covered by a test whose name or assertions match its WHEN and THEN.
- **Coherence**: every decision in `design.md` is followed, and new code matches the project's existing patterns.

Grade each issue: **CRITICAL** (a missing requirement, a removed behaviour still present, an unticked box), **WARNING** (an uncovered scenario, a design decision not followed), **SUGGESTION** (a pattern inconsistency). Show the report as a table with one row per dimension, followed by the issues grouped by grade.

- Any CRITICAL issue: stop here and tell the user what to fix.
- Any WARNING: ask the user whether to archive anyway.

### 6. Archive

Run `openspec archive <change> --yes`. Then run `openspec validate --specs --strict` to check the living spec. Commit `docs(<change>): archive change` with the trailer `Refs: <change>`.

### 7. Report

Summarise in a few lines: the simplification and hardening commits, the security findings left open, the verification table, and the capabilities the living spec gained or changed. Finish with the commands for the user to run:

```
git push -u origin change/<change>
gh pr create --base <base branch> --fill
```
