---
name: light-change
description: "Open a light change for work too small for a spec: a change with no delta specs and a single ticket, ready for /implement."
disable-model-invocation: true
---

# Light Change

Open one **light change**: an OpenSpec change with no delta specs and a single ticket, for a bug fix, a one-line change or a chore that leaves the living spec untouched. It replaces the interview, the spec and the tickets with one opening; `/implement <change>` and `/close-change <change>` take it from there like any other change.

Read `docs/agents/issue-tracker.md` first: it defines changes, tickets, branches, external references and commit trailers.

## Process

### 1. Read the work

The argument is a description of the work, an external reference (`PROJ-123`, `#42`, a URL), or both. With an external reference, read the work item as **Starting from a work item** in the adapter says, and keep the reference. With neither, ask the user what the work is.

Ask only what you need to write the ticket, one question at a time.

### 2. Check the work qualifies

Run `openspec list --specs`, then read in full each capability the work touches with `openspec show <capability> --type spec`. The work qualifies only when both conditions hold:

- **No requirement changes**: the work adds, modifies, removes or renames no requirement of the living spec. A fix that makes the code do what a requirement already says qualifies; new behaviour a user would notice, or a scenario whose WHEN or THEN would change, does not.
- **One ticket**: the work fits one ticket, a vertical slice built in one session.

When either fails, refuse: say which condition fails and why, and tell the user to start with `/grill-with-docs`, passing the external reference when there is one. Write nothing.

### 3. Draft the change

- **Name**: kebab-case, starting with a verb (`fix-login-timeout`, `bump-node-version`). When `openspec list` already shows that name, pick another. A change that exists is never made light.
- **Proposal**: **Why**, one or two sentences on the problem, and **What Changes**, a short bullet list.
- **Ticket**: one group in the **Ticket format** of the adapter, numbered 1, `Blocked by: none`. A check only a person can make, such as the wording of a message, is one more acceptance criterion, ending in `verified by hand: <what to look at>`. There is no manual test ticket.

Show the name, the proposal and the ticket, and ask the user to approve them or say what to change. Revise until they approve.

### 4. Publish

Follow **When a skill says "publish a light change"** in the adapter. It cuts the change's branch (see **Branch** in the adapter), writes the files, validates them, commits once, projects and pastes the roadmap.

End by telling the user to build the ticket with `/implement <change>` in a fresh session, then close it with `/close-change <change>`.
