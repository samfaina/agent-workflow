# Example

This page follows one user story from the backlog to a pull request. For each stage it shows what you type, what Claude does, and what is left in the repository. The [guide](./guide.md#_4-the-daily-flow) explains each command in full.

The excerpts come from a real run of the kit on the sample project, shortened and translated: the run spoke Spanish. The last step shows what `/close-change` prints today; the run took place before the pull request hand-over was added.

## Context

**The project** is [`examples/sample-node-cli`](https://github.com/samfaina/agent-workflow/tree/main/examples/sample-node-cli), a to-do CLI with two commands, `add <title>` and `list`. The kit is already installed on `main` (see [the guide](./guide.md#_2-install-the-kit-in-a-new-project)), with `npm test` as the check command and `pullRequest` left at `none`.

**The user story** comes from the team's backlog. It does not matter where the backlog lives (Jira, GitLab issues, a spreadsheet): the workflow starts from its text.

> As a user, I want to remove a to-do by its id, so that my list only shows what is still pending.
>
> - Removing a to-do says which one was removed.
> - The other to-dos keep their ids.
> - A wrong or unknown id is reported as an error and changes nothing.

**What it became**:

<StoryDiagram />

## At a glance

| Stage | Session | You type | Left in the repository |
| --- | --- | --- | --- |
| Interview | new | `/grill-with-docs` + the story | `GLOSSARY.md` |
| Spec | same | `/to-spec remove-todo` | `proposal.md`, delta spec, `design.md` |
| Tickets | new | `/to-tickets remove-todo` | `tasks.md`, four tickets |
| Implement | new, per ticket | `/implement remove-todo#N` | code, tests, one commit per ticket |
| Close | new | `/close-change remove-todo` | the living spec, the pull request text |

Everything from the spec on happens on the branch `change/remove-todo`.

## 1. Interview

**You type**

```
/grill-with-docs As a user, I want to remove a to-do by its id, so
that my list only shows what is still pending.
- Removing a to-do says which one was removed.
- The other to-dos keep their ids.
- A wrong or unknown id is reported as an error and changes nothing.
```

**Claude does**

- Reads the code: `src/cli.js` has `add` and `list`, and a new id is the highest id plus one.
- Asks ten numbered questions, each with a recommendation, then one more that branched from an answer.
- Writes the terms you settle into `GLOSSARY.md`. No ADR: nothing decided is hard to reverse.

**Result**: three of the eleven questions, and one glossary entry.

```
Q2 - What "remove" means: does removing a to-do delete it for good,
     with no trash, no undo and no "are you sure?"?
     ➡️ Yes: permanent and immediate, like add.

Q6 - The remaining ids do not change: with 1, 2, 3, after remove 2
     the list shows 1. and 3. with a gap. Are ids stable, never
     renumbered?
     ➡️ Yes: renumbering would break any id the user has written down.

Q11 - Odd forms of a number: what about 02 or +2? Accept only digits
      with no leading zero, so both get the invalid-id error?
      ➡️ Yes: reject 02 and +2.
```

```md
**Id**:
The positive whole number that identifies a to-do. It never changes
while the to-do exists, and the remaining to-dos keep theirs when one
is removed.
_Avoid_: Number, index, position
```

**From the story**: each acceptance criterion became one or more decisions. "The other to-dos keep their ids" became Q6, and "a wrong id is an error" became Q4 and Q11.

**Next**: `/to-spec remove-todo`, in the same session.

## 2. Spec

**You type**: `/to-spec remove-todo`

**Claude does**

- Creates the branch `change/remove-todo`.
- Proposes where the tests go, one seam: running the CLI as a child process. You confirm it.
- Writes `proposal.md`, the delta spec `specs/todo-removal/spec.md` and `design.md`, and runs `openspec validate remove-todo --strict` until it passes.
- Commits the glossary and the spec.

**Result**: one of the five requirements, with one of its scenarios.

```md
### Requirement: Remaining to-dos keep their ids
Removing a to-do SHALL NOT change the id of any other to-do. The list
SHALL show the remaining to-dos in their original order with their
original ids, leaving a gap where the removed id was.

#### Scenario: Removing a to-do from the middle
- **WHEN** the list holds to-dos with ids 1, 2 and 3, and the user
  runs `todo remove 2`
- **THEN** `todo list` shows the to-dos with ids 1 and 3, in that
  order
```

**From the story**: the story became five requirements with twelve scenarios. What the interview ruled out (undo, a confirmation prompt, removing several at once) went to the proposal's **Out of Scope**.

**Next**: `/to-tickets remove-todo`, in a fresh session (`/clear`).

## 3. Tickets

**You type**: `/to-tickets remove-todo`

**Claude does**

- Proposes four tickets, each a vertical slice with its blockers, and asks you about the breakdown.
- After you approve it, writes `tasks.md` and commits.
- Lists the next commands, one per ticket.

**Result**: the four tickets, and the first one in full (shortened).

```
1. Remove a to-do by its id             Blocked by: none
2. Reject invalid arguments to remove   Blocked by: 1
3. Unknown-command message and README   Blocked by: none
4. Manual test                          Blocked by: 1, 2, 3
```

```md
## 1. Remove a to-do by its id

Blocked by: none

What to build: `todo remove <id>` takes the to-do with that id off
the list for good, done or not, prints `Removed <id>. <title>` and
exits with code 0.

- [ ] 1.1 With `1. Buy milk` and `2. Call Ana` on the list,
      `todo remove 2` prints `Removed 2. Call Ana` ...; verified by a
      test at the CLI seam
- [ ] 1.4 With ids 1, 2 and 3 on the list, `todo remove 2` leaves
      ids 1 and 3 ...; verified by a test at the CLI seam
```

**From the story**: every checkbox is an acceptance criterion that can be checked, and says how it is checked. `openspec list` now shows `0/17 tasks`.

**Next**: `/implement remove-todo#1`, in a fresh session.

## 4. Implement

### A build ticket

**You type**: `/implement remove-todo#1`, then `#2` and `#3`, each in a fresh session.

**Claude does**

- States `Ticket remove-todo#1: Remove a to-do by its id`.
- Builds it test-first at the CLI seam: a failing test, then the code that makes it pass, one criterion at a time.
- Runs `code-review` on its work and shows the `## Standards` and `## Spec` reports. In ticket 1, Spec found that one test did not check `list`, and Claude fixed it before committing.
- Ticks the ticket's boxes and commits. The quality gate runs `npm test` first.

**Result**: one commit per ticket, with the trailer that links it to its ticket.

```
b08c474 feat: remove a to-do by its id

Add `todo remove <id>`, which takes the to-do with that id off the
list, done or not, and prints `Removed <id>. <title>`. ...

Refs: remove-todo#1
```

**Next**: Claude ends by naming the next ticket, `/implement remove-todo#2`.

### The manual test ticket

**You type**: `/implement remove-todo#4`

**Claude does**

- Checks each expected result against the spec and against the state the earlier steps leave.
- Lists the five steps and gives them as one PowerShell block that starts from a fresh to-do file.
- Asks you to run the block and paste its output, then compares it with each expected result and ticks the matching boxes. No tdd and no code-review: the ticket changes only `tasks.md`.

**Result**: the steps you ran.

```md
- [x] 4.2 Run `todo remove 2`: it prints `Removed 2. Call Ana`, and
      `todo list` shows `[ ] 1. Buy milk` and `[ ] 3. Water plants`,
      with the gap at id 2
- [x] 4.3 Run `todo remove 2` again: it prints `No to-do with id 2.`
      with exit code 1
- [x] 4.4 Run `todo remove 03`: it prints `A to-do id must be a
      positive whole number.`
- [x] 4.5 Run `todo foo` and read the README: ... read clearly to a
      person
```

**From the story**: here a person checks the story's criteria by hand, plus what only a person can judge, such as the wording of the messages.

**Next**: `/close-change remove-todo`, in a fresh session.

## 5. Close

**You type**: `/close-change remove-todo`

**Claude does**

- Checks that the branch is clean, every box is ticked and the change is valid.
- Simplifies the change's code. Nothing was worth changing.
- Audits it for security: no critical or high findings, three low ones left open in the report.
- Verifies it against every requirement and scenario, then archives it. The delta spec becomes `openspec/specs/todo-removal/spec.md`.
- Hands the branch over.

**Result**: the verification table, then the hand-over.

| Dimension | Result |
| --- | --- |
| Completeness | 17/17 boxes ticked, 5/5 requirements implemented |
| Correctness | 12/12 scenarios covered by a test |
| Coherence | every decision in `design.md` followed |

With `pullRequest` at `none`, Claude gives you the push command and the text for the pull request:

```
git push -u origin change/remove-todo
```

```
feat(remove-todo): remove a to-do by its id
```

```md
Adds `todo remove <id>`. The remaining to-dos keep their ids; a missing,
invalid or unknown id is an error that leaves the to-do file untouched.

Living spec: new capability `todo-removal` (5 requirements).
Verification: completeness, correctness and coherence pass.
Security: three low findings left open (very large ids, a malformed
to-do file, a non-atomic write that predates this change).
```

You open a pull request from `change/remove-todo` into `main` in your code host, paste the title and body, review it and merge it.

**From the story**: the story is now part of the living spec, which the next change starts from.

### Other hand-overs

- **With a pull request tool**: when `pullRequest` names a CLI (`gh`, `glab`, `twg`…) or an MCP server, Claude asks whether to open the pull request once you have pushed. Push with `! git push -u origin change/remove-todo` and say yes: Claude checks the branch reached the remote, opens the pull request and shows its URL.
- **Without a remote**: Claude gives you the commands to merge it yourself:

  ```
  git switch main
  git merge --no-ff change/remove-todo -m "feat(remove-todo): remove a to-do by its id"
  ```
