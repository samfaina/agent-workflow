---
name: close-change
description: "Close a finished OpenSpec change: simplify, harden, verify against its specs, archive it into the living spec, and hand its branch over."
disable-model-invocation: true
---

# Close Change

Close one finished **change**: simplify its code, harden it, verify it against its spec, archive it so its delta specs merge into the living spec, and hand its branch over as a pull request or a local merge. `code-review` already ran on every ticket during `/implement`; this skill looks at the change as a whole instead.

Read `docs/agents/issue-tracker.md` first: it defines changes, tickets, branches, external references and commit trailers.

## Process

### 1. Check the change is ready

The argument is the change name. Without one, run `openspec list`; with exactly one active change take it. With no active change, run `node .claude/hooks/agent-workflow/status.mjs --json` and take the change of the `handOvers` entry whose `branch` is what `git branch --show-current` prints. Otherwise ask which one.

A change is **archived** when `openspec list` does not show it and `openspec/changes/archive/<date>-<change>/` exists: OpenSpec prefixes the folder with the date of the archive. An earlier run of this skill archived it, but its hand-over did not finish.

Every check below must hold. When one fails, report which and stop:

- `git branch --show-current` prints the **change's branch**: the `x-branch` of its `.openspec.yaml` (in the archive folder for an archived change), or `change/<change>` when it has none (see **Branch** in the adapter). Every `<branch>` below is this branch.
- `git status --porcelain` prints nothing.
- `openspec instructions apply --change <change> --json` reports `progress.remaining` as 0. Otherwise list the unticked boxes and tell the user to run `/implement <change>#N` for the first ticket that has one; the manual test ticket counts. Skip this check for an archived change. Its `missingPrerequisites` may list `design` for a light change; that blocks nothing.
- `openspec validate <change> --strict` says the change is valid. Skip this check for an archived change.

An archived change passed the last two checks before its archive: when the first two hold, skip steps 2 to 7 and resume at step 8.

Read the change's **external references**: the list `x-external-references` in `openspec/changes/<change>/.openspec.yaml`, or in `openspec/changes/archive/<date>-<change>/.openspec.yaml` for an archived change. A change may have none. Every commit this skill makes ends with the trailer `Refs: <change>` followed by one `External-Ref: <reference>` per reference, as **Commit trailers** in the adapter shows.

### 2. Pin the diff

Find the **base branch**: the `x-base` of the change's `.openspec.yaml` (in the archive folder for an archived change), or, when it has none, the first branch of `protectedBranches` in `.claude/agent-workflow.json` that exists locally (see **Branch** in the adapter). In the diff below, `<base>` is the local branch, or `<remote>/<base branch>` when it is not a local branch; everywhere else, the base branch is its bare name, such as `main`. The change's diff is `git diff <base>...HEAD`; its files are `git diff --name-only <base>...HEAD`. The **code files** are those outside `openspec/`, `docs/` and `.claude/`. With no code files, skip to step 5.

### 3. Simplify

Call the Skill tool with `code-simplification`, scoped to the code files. Behaviour stays exactly as the specs describe it. Run `checkCommand` from `.claude/agent-workflow.json`; when it passes, commit `refactor(<change>): simplify` with the trailers of step 1. When nothing is worth simplifying, say so and move on.

### 4. Harden

Call the Skill tool with `security-and-hardening` to audit the code files, starting from the trust boundaries the change introduces or touches. For each finding, record its severity and the `file:line` it points at.

- Fix every critical and high finding in the change's own code, run `checkCommand`, and commit `fix(<change>): <what was hardened>` with the trailers of step 1.
- When a fix would change behaviour the specs describe, ask the user before applying it.
- Medium and low findings go to the report.

### 5. Verify

Run `openspec instructions apply --change <change> --json` again and read every file in `contextFiles`. Check the change along three dimensions, citing `file:line` evidence for each item:

- **Completeness**: every box in `tasks.md` is ticked; every ADDED or MODIFIED requirement has an implementation; every REMOVED requirement's behaviour (read its body in `openspec/specs/<capability>/spec.md`) is gone from the code.
- **Correctness**: every scenario under an ADDED or MODIFIED requirement is handled by the code and covered by a test whose name or assertions match its WHEN and THEN.
- **Coherence**: every decision in `design.md` is followed, and new code matches the project's existing patterns.

A **light change** (`skip_specs: true` in its `.openspec.yaml`) has no delta specs and no `design.md`, so check only two dimensions:

- **Completeness**: every box of its ticket is ticked.
- **Correctness**: the living spec's scenarios still pass. Run `checkCommand`, which must pass; with none, run the project's tests. For each capability in `openspec/specs/` whose code the change touches, every scenario is still covered by a passing test whose name or assertions match its WHEN and THEN.

Grade each issue: **CRITICAL** (a missing requirement, a removed behaviour still present, an unticked box, a light change's failing tests), **WARNING** (an uncovered scenario, a design decision not followed), **SUGGESTION** (a pattern inconsistency). Show the report as a table with one row per dimension, followed by the issues grouped by grade.

- Any CRITICAL issue: stop here and tell the user what to fix.
- Any WARNING: ask the user whether to archive anyway.

### 6. Archive

Run `openspec archive <change> --yes`; a light change's archive leaves the living spec as it is. Then run `openspec validate --specs --strict` to check the living spec. Commit `docs(<change>): archive change` with the trailers of step 1.

### 7. Report

Summarise in a few lines: the simplification and hardening commits, the security findings left open, the verification table, and the capabilities the living spec gained or changed (none for a light change).

### 8. Hand the branch over

Write the pull request for `<branch>` into the base branch of step 2:

- **Title**: one Conventional Commits line for the whole change, `<type>(<change>): <what it does>`, taken from `proposal.md`. When the change has external references, the title ends in ` (<references>)`, separated by commas: `feat(add-greeting): greet the user by name (PROJ-123, #42)`.
- **Body**: when `.claude/skills/pr/SKILL.md` exists, call the Skill tool with `pr` to write it. Otherwise write a short body: what the change does and why (from `proposal.md`), the capabilities the living spec gained or changed, the verification table, and the security findings left open.
- **Work items**: when the change has external references, the body has the line `Work items: <references>`, separated by commas, whether `pr` writes the body or you do.
- **No closing keywords**: neither the title nor the body says `Closes`, `Fixes` or `#close`, even when `pr` writes them; remove them. A work item split across several changes would close at the first merge, and closing it is the team's call.

When resuming an archived change, find the base branch as step 2 does, from the archived `.openspec.yaml`. Read `proposal.md` and `.openspec.yaml` from `openspec/changes/archive/<date>-<change>/`; the capabilities are the folder names under its `specs/`. The verification table and the security findings belong to the earlier run, so the body leaves them out, whether `pr` writes it or you do.

There is one pull request, or one local merge, into the base branch. When the base branch is not the default base (the first protected branch that exists locally), every case below ends its message, before it stops, by telling the user to bring `<base branch>` into the default base once the pull request is merged, or once they merged locally. Never make that merge yourself.

Read `pullRequest` from `.claude/agent-workflow.json`; when it is missing, it is `{ "via": "none" }`. Run `git remote`: the remote is `origin` when it is listed, otherwise the first one listed. Then follow the first case that applies:

- **No remote.** Give the user the commands to merge the change themselves, and stop:

  ```
  git switch <base branch>
  git merge --no-ff <branch> -m "<title>"
  ```

- **`via` is `none`.** Give the user `git push -u <remote> <branch>`, tell them to open a pull request from `<branch>` into `<base branch>` in their code host, and show the title and the body, each in its own code block, ready to paste. Stop.

- **`via` is `cli` or `mcp`.** When `allowPush` is `true`, run `git push -u <remote> <branch>` yourself. Otherwise give the user that command. Then ask "Once the branch is pushed, shall I open the pull request with `<command's first word, or the MCP server>`?" and stop. When the user says yes:

  1. Run `git ls-remote --heads <remote> <branch>`. When it prints nothing, the branch is not pushed yet: ask the user to push it and stop.
  2. Open the pull request:
     - `cli`: take `command` and replace `{base}`, `{branch}`, `{title}` and `{body}` with the base branch, `<branch>`, the title and the body, each quoted for the shell you run it in. For `{bodyFile}`, write the body to a temporary file outside the repository and use its path. Run the command.
     - `mcp`: use the tool of the MCP server named in `server` that creates a pull request (or merge request), with `<branch>` as the source, the base branch as the target, and the title and body. When that server or such a tool is not available, say so.
  3. Show the pull request's URL. When opening it failed, show the error and fall back to the `none` case: give the title and body for the user to open it by hand.

### 9. Project the hand-over

Once the hand-over of step 8 is done (the merge commands given, the title and body given, or the pull request opened), project `change-closed` as **Projection** in the adapter says: run `node .claude/hooks/agent-workflow/status.mjs --project change-closed <change>`, adding `--url <the pull request's URL>` when step 8 opened one. The status module writes the text: `finished, pull request <url>`, `finished, merged locally` without a remote, or `finished, ready for review` otherwise. When the case of step 8 stopped to wait for the user, project once it resumes and finishes. A failed post never undoes or holds up the hand-over.
