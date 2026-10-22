# Issue tracker: OpenSpec

Specs and tickets for this repo live as **OpenSpec changes** under `openspec/changes/<change>/`. Use the `openspec` CLI. This file is the only place that says how the engineering skills read and write them.

## Vocabulary

When a skill says... | ...in this repo it means
--- | ---
issue tracker | `openspec/changes/`
spec, PRD, parent issue | a **change**: `proposal.md`, `specs/**/spec.md` and `design.md` in the change folder. A **light change** has only `proposal.md` (see **Light changes**)
ticket, issue, sub-issue | one numbered group `## N. <title>` in the change's `tasks.md` (see **Ticket format**)
issue number, ticket reference | `<change>` or `<change>#N`, for example `add-greeting#2`
blocking link, blocked by | the ticket's `Blocked by:` line
close the ticket, mark it done | tick every checkbox of the ticket
comment on the ticket | a `- Note:` bullet under the ticket's checkboxes
triage label (`ready-for-agent`, `needs-triage`...) | nothing: this tracker has no labels, so skip every label step
external reference (`PROJ-123`, `#42`, `AB#987`, `ENG-7`, a URL) | the identifier of a **work item** in the **team tracker** (Jira, Linear, GitHub Issues, a spreadsheet...). It is not a ticket reference, and that tracker is not this one: specs and tickets still live in OpenSpec. See **External references**

## Branch

Every change lives on its own **change branch**, created from a protected branch (`protectedBranches` in `.claude/agent-workflow.json`, by default `main` and `master`). The change's branch is the first of:

- the top-level `x-branch` of `openspec/changes/<change>/.openspec.yaml`, written when the change opened;
- `change/<change>`, for an existing change without `x-branch`;
- for a new change, the name made from the `branch` pattern in `.claude/agent-workflow.json` (`change/{change}` when the key is missing): `{change}` is the change name, `{ref}` the first external reference of the change, as written, and `{user}` what `git config agent-workflow.user` prints.

Never invent a value for a placeholder:

- The pattern uses `{ref}` and the change has no external reference: stop and offer two ways on. Either the user gives the reference, which becomes the change's first external reference (see **External references**) and fills `{ref}`; or the user gives the branch name for this change by hand, checked like any other name below and then used as is.
- The pattern uses `{user}` and `git config agent-workflow.user` prints nothing: ask the user for their value, run `git config agent-workflow.user <value>`, and go on. The value stays in their clone and is never committed.

Check a new name with `git check-ref-format --branch <name>`. When it fails (a URL as reference, a reference with spaces), say so and stop: never change the name to make it pass. Git is the only judge: `feature/#42-add-greet` is valid.

A change's branch is named once. A reference linked later, or a new `branch` pattern, never renames it, and nothing reads a change back out of a branch name.

Before writing any file of a change:

1. Run `git branch --show-current`. If it prints the change's branch, you are done.
2. Run `git status --porcelain`. If it lists files that are not part of this change (anything outside `openspec/changes/<change>/`, `GLOSSARY.md` and `docs/adr/`), stop and ask the user to commit or stash them first.
3. If the change's branch exists, run `git switch <branch>`. Otherwise switch to the first protected branch that exists and run `git switch -c <branch>`; uncommitted change files come along.

Pushing is the user's job, unless `allowPush` is `true`. Only `/close-change` opens a pull request, with the tool named in `pullRequest` and after the user says yes.

## External references

A change can be linked to the work items it serves in the team tracker. Their **external references** live in one place only, the top-level list `x-external-references` of `openspec/changes/<change>/.openspec.yaml`:

```yaml
schema: spec-driven
created: 2026-10-19
x-branch: "change/add-greeting"
x-external-references:
  - "PROJ-123"
  - "#42"
```

- Write each reference exactly as the user gave it, in double quotes: an unquoted `#42` is a YAML comment. Keep the `x-` prefix: `openspec validate --strict` rejects any other unknown key.
- A change has zero or more references, and several changes may share one. A change without any leaves the key out.
- They travel in every commit of the change (see **Commit trailers**) and in its pull request, so the team tracker can link the work through its own integration with the code host.
- Never create a work item, and never write a closing keyword (`Closes`, `Fixes`, `#close`) in a commit or a pull request: a work item split across several changes would close at the first merge.
- **Linking later**: get onto the change branch, add the reference to the list, and commit `docs(<change>): link <reference>` with its trailers. The branch keeps its name, even when its pattern uses `{ref}`.
- `node .claude/hooks/agent-workflow/status.mjs --json` lists them under each change's `references`.
- **Starting from a work item**: when the user gives an external reference before the change exists, read the work item's title and description through the channel in `tracker` (see **Projection**): with `mcp`, the server's tool that reads a work item; with `cli`, the same tool's command that shows one, when its `--help` lists it. With `none`, or when reading fails, ask the user to paste them. Read only; never edit the work item.

## Projection

After the commit of four transitions, the change's progress snapshot goes to the work items it references, one way only. The `tracker` setting in `.claude/agent-workflow.json` names the channel: `{ "via": "none" }` (also what a missing setting means), `{ "via": "mcp", "server": "<name>" }` or `{ "via": "cli", "command": "..." }`. Choosing a channel at install time is the authorization: show each post, do not ask before it. `allowPush` does not apply.

Stage | Right after the commit of
--- | ---
`spec-published` | the spec (**publish to the issue tracker**)
`tickets-published` | the tickets (**publish the tickets**), or the opening of a light change (**publish a light change**), which skips `spec-published`
`ticket-done` | the ticket whose last box it ticks, the manual test ticket included
`change-closed` | the hand-over in `/close-change`

To project, run `node .claude/hooks/agent-workflow/status.mjs --project <stage> <change>`. It writes the text, never you, and keeps a ledger of what each work item has received, so a snapshot already posted is not posted again. It prints nothing when there is nothing to post (no channel, no references, or nothing new). Otherwise:

- `Posted to <reference>: <snapshot>`: show the line as it is.
- `Could not post to <reference> (<reason>).`: say so in one line, show the text after `Paste this into...` in a code block for the user to paste, and go on with the workflow. Never retry: the next snapshot carries the whole state.
- `Post to <references> with the <server> MCP server: <message>` (`mcp`): post `<message>` as a comment on each of those work items with that server's tool. After each post that succeeds, run the command the output gives, with the reference in place of `<reference>`, and show the line it prints. When the server or tool is not available, or a post fails, say so in one line and show the text after `If a post fails...` in a code block. Go on either way.

Projection never blocks the workflow, never moves a work item's state and never creates a work item.

## Commit trailers

Every commit this document defines ends with its trailers, in one block on the last lines of the message: first the `Refs:` trailer when the step names one, then one `External-Ref: <reference>` per external reference of the change, in the order of the list. With no external references, there are no `External-Ref:` lines.

```
feat(add-greeting): greet the user by name

Refs: add-greeting#2
External-Ref: PROJ-123
External-Ref: #42
```

## When a skill says "publish to the issue tracker" (a spec)

Used by `/to-spec`.

1. Pick the change name: kebab-case, starting with a verb (`add-greeting`, `fix-login-timeout`). If `openspec list` already shows that name, ask the user for another one, unless it is a light change being promoted (see **Light changes**).
2. Get onto the change branch (see **Branch**), then run `openspec new change <change>`. Write the branch's name, in double quotes, as the top-level `x-branch` of the change's `.openspec.yaml`, whatever the pattern, the default included. When the interview named external references, write them there too (see **External references**). When it named none, do not ask for any, unless the pattern needs `{ref}` (see **Branch**). To promote a light change, skip `openspec new change` instead: remove `skip_specs: true` from its `.openspec.yaml` and keep its `x-branch` and external references.
3. For each artifact in this order, `proposal`, `specs`, `design`: run `openspec instructions <artifact> --change <change>`, read the files it lists, and write the file at its output path following its instruction, template, `<project_context>` and `<rules>`. A promoted light change's `proposal.md` is rewritten this way too. Always write `design.md`, however little the change does: only a light change has none.
4. Map the spec template sections onto the artifacts:

   Spec template section | Goes to
   --- | ---
   Problem Statement | `proposal.md`, **Why**
   Solution | `proposal.md`, **What Changes**
   Out of Scope | `proposal.md`, **Out of Scope**
   User Stories | requirements in `specs/<capability>/spec.md` (see below)
   Implementation Decisions | `design.md`, **Decisions**
   Testing Decisions, including the agreed seams | `design.md`, **Testing Decisions**
   Further Notes | `design.md`, **Open Questions**, or **Risks / Trade-offs**

   User stories become requirements:
   - Group the stories into capabilities as the proposal instruction describes, one `spec.md` per capability.
   - Each requirement is `### Requirement: <name>` with one behaviour stated with SHALL or MUST, in at most 500 characters.
   - Each requirement has one success scenario plus one scenario for every error or edge case the stories mention, each `#### Scenario: <name>` with **WHEN** and **THEN** bullets.
   - Every user story is covered by at least one requirement. Several stories may share one requirement.
5. Run `openspec validate <change> --strict` and fix every error and warning until it prints that the change is valid.
6. Commit the change folder: `docs(<change>): publish spec`, with its trailers (see **Commit trailers**).
7. Project `spec-published` (see **Projection**).
8. Tell the user the change name and that the next step is `/to-tickets <change>`.

## When a skill says "publish the tickets"

Used by `/to-tickets`, after the user approves the breakdown.

1. Get onto the change branch (see **Branch**).
2. Run `openspec instructions tasks --change <change>`, read the files it lists, and write `tasks.md` at its output path. Write one group per approved ticket, in the **Ticket format** below, numbered from 1 in dependency order (blockers first, prefactoring first). Its last group is always the **manual test ticket**. For a promoted light change, keep its ticket as ticket 1, with its ticked boxes and its notes (see **Light changes**).
3. Leave `proposal.md`, the specs and `design.md` as they are: publishing tickets never edits the spec.
4. Run `openspec validate <change> --strict` until it passes, then `openspec list` and check that the change shows the expected number of tasks.
5. Commit: `docs(<change>): publish tickets`, with its trailers (see **Commit trailers**).
6. Project `tickets-published` (see **Projection**).
7. Run `node .claude/hooks/agent-workflow/status.mjs` and paste its output verbatim in a code block: the roadmap of the change, with the command for its first ticket. Never write the roadmap yourself. Then tell the user to build each ticket with `/implement <change>#N`, each in a fresh session, and that `/implement <change>` without a number takes the frontier ticket.

## Light changes

A **light change** is a change with no delta specs and a single ticket, for work that adds, modifies, removes or renames no requirement of the living spec. `/light-change` opens it; `/implement <change>` and `/close-change <change>` take it from there like any other change.

- Its `.openspec.yaml` declares `skip_specs: true`, so `openspec validate --strict` accepts zero deltas. It fails when any file exists under `specs/`.
- `proposal.md` holds only **Why** and **What Changes**. There is no `design.md`: `openspec status` shows it as pending, which blocks nothing.
- `tasks.md` holds one ticket and no manual test ticket. A check by hand is one more acceptance criterion of that ticket, ending in `verified by hand: <what to look at>`.
- `node .claude/hooks/agent-workflow/status.mjs` marks it `(light)`, and its `--json` sets the change's `light` to `true`.
- **Promotion**: when the work turns out to need a requirement change or a second ticket (see **While working on a ticket**), the change is promoted in place, keeping its name, its branch (`x-branch`) and its external references. `/to-spec <change>` removes `skip_specs` and writes the full spec (see **publish to the issue tracker**, steps 1 to 3). `/to-tickets <change>` then rewrites `tasks.md`, keeping the finished work and adding the manual test ticket. A change is never made light again.

## When a skill says "publish a light change"

Used by `/light-change`, after the user approves the change name, the proposal and the ticket.

1. Get onto the change branch (see **Branch**), then run `openspec new change <change>`.
2. Add `skip_specs: true` to the change's `.openspec.yaml`, then the branch's name as `x-branch`, in double quotes (see **Branch**), then its external references when it has any (see **External references**).
3. Write `proposal.md` with the approved text under `## Why` and `## What Changes`.
4. Write `tasks.md` with the approved ticket as its only group, in the **Ticket format** below. Write nothing under `specs/` and no `design.md`.
5. Run `openspec validate <change> --strict` until it prints that the change is valid, then `openspec list` and check that the change shows the ticket's number of boxes.
6. Commit the change folder, the one commit of the opening: `docs(<change>): open light change`, with its trailers (see **Commit trailers**).
7. Project `tickets-published` (see **Projection**).
8. Run `node .claude/hooks/agent-workflow/status.mjs` and paste its output verbatim in a code block: the roadmap of the change, with the command for its ticket. Never write the roadmap yourself.

## Ticket format

```markdown
## 2. Greet the user by name

Blocked by: 1

What to build: the end-to-end behaviour this ticket makes work, from the user's perspective, in one to three sentences.

- [ ] 2.1 Starting the app with a name prints "Hello, <name>"; verified by a test at the CLI seam
- [ ] 2.2 Starting the app without a name prints "Hello, world"; verified by a test at the CLI seam
```

- A ticket is a vertical slice: a narrow path through every layer it touches, demoable or verifiable on its own, sized for one session.
- `Blocked by:` lists ticket numbers (`Blocked by: 1, 3`) or says `Blocked by: none`. A group with no `Blocked by:` line, written before this repo used tickets, is blocked by the group before it.
- Checkboxes `- [ ] N.M` hold the acceptance criteria and nothing else; each one says how it is verified. OpenSpec counts these boxes as the change's progress.
- Each ticket includes the tests and docs its own work needs.
- No file paths or code snippets, as the skills already ask.
- The **manual test ticket** is the last group of every change but a light one, `Blocked by:` every other ticket. Its checkboxes are steps a human performs by hand and the result they should see. Keep it to about five steps: the main path, one failure, and what only a person can judge, such as the docs or the wording of a message. Behaviour the automated tests already cover stays with them. The steps run in order on one fresh setup, so each expected result must follow from the state the earlier steps leave: work out ids, counts and lists from that state, not from the examples in other tickets. A step that needs a different starting state says so.

## When a skill says "fetch the relevant ticket"

Used by `/implement`, `/to-tickets` and `/code-review`.

1. Parse the reference. `<change>#N` names ticket N. `<change>` alone means the **frontier ticket**: the first group, in order, whose blockers have every box ticked and which still has an unticked box. With no reference and several changes in `openspec list`, ask which one.
2. Run `openspec instructions apply --change <change> --json` and read every file in `contextFiles`: the ticket's group in `tasks.md`, plus the proposal, specs and design it belongs to.
3. If ticket N was named and one of its blockers still has an unticked box, stop: name the blocker and the command for it, `/implement <change>#<blocker>`.
4. State `Ticket <change>#N: <title>` before starting.
5. If every box of every ticket is ticked, the change is finished: tell the user to run `/close-change <change>`.

If the ticket is the manual test ticket:

1. Before listing the steps, check each expected result against the spec and against the state the steps before it leave. When one cannot happen, say so, add a `- Note:` to the ticket with the result that should happen, and use that one.
2. List the steps with their expected results, then give them as one block the user pastes into their shell (PowerShell on Windows, bash elsewhere). The block starts from a fresh setup, runs every step in order, and prints each command, its output and its exit code, plus whatever a step asks the user to look at, such as a doc. End the message with a direct question asking for the block's output. Do not offer a list of steps to tick.
3. Compare the output with each expected result. Tick only the boxes whose result matches; for the others, add a `- Note:` with what was seen.
4. The ticket changes only `tasks.md`: skip tdd and code-review, which the build tickets and `/close-change` already cover, and commit the ticked boxes with the trailers of **Commit trailers**, `Refs: <change>#N` first. When every box is ticked, project `ticket-done` (see **Projection**).

If the change is light (`skip_specs: true` in its `.openspec.yaml`):

1. `contextFiles` holds only the proposal and the ticket: together they are its spec. Also read in full each capability of the living spec the ticket touches (`openspec show <capability> --type spec`): the work leaves every requirement as it is.
2. Build and verify every other box first. Then check each box `verified by hand` as steps 2 and 3 of the manual test ticket say, and tick it in the commit that ends the ticket.

## While working on a ticket

Used by `/implement`.

- Work on the change branch (see **Branch**).
- Tick a box (`- [x] N.M`) as soon as its criterion is met and verified. The ticket is done when all its boxes are ticked.
- Commit with a Conventional Commits message and the trailers of **Commit trailers**: `Refs: <change>#N`, then the `External-Ref:` lines. The ticked `tasks.md` goes in the same commit as the code.
- Right after the commit that ticks the ticket's last box, project `ticket-done` (see **Projection**).
- When the work shows the spec is wrong or incomplete, leave the spec as it is: add a `- Note:` bullet to the ticket and tell the user.
- In a light change, when the work turns out to add, modify, remove or rename a requirement of the living spec, or to need a second ticket, stop before building that part: add a `- Note:` to the ticket saying what needs it, commit `tasks.md` with the trailers of **Commit trailers**, and tell the user to promote the change with `/to-spec <change>`, then `/to-tickets <change>` (see **Light changes**).
- In the final message of a build ticket, show the code-review reports under the headings `## Standards` and `## Spec`, written exactly so in every conversation language, as their own sections and not folded into the ticket summary.
- End the final message with the roadmap: after the commit, run `node .claude/hooks/agent-workflow/status.mjs` and paste its output verbatim in a code block. It names the next command, `/implement <change>#N` for the next frontier ticket or `/close-change <change>` when every box of every ticket is ticked. Never write the roadmap yourself.

## When a skill says "comment on the ticket"

Add a plain bullet `- Note: <text>` under the ticket's checkboxes. Prototype branches, findings and decisions made during the ticket go here.

## Finding the spec behind a diff

Used by `/code-review`. Read the `Refs: <change>#N` trailers in `git log <fixed-point>..HEAD`. The spec is `openspec/changes/<change>/` (proposal, specs, design) and ticket N in its `tasks.md`. An archived change sits in `openspec/changes/archive/<date>-<change>/`.

## Archive and the living spec

`openspec/specs/` is the living spec. Only `/close-change` changes it, by running `openspec archive`. Every other skill reads it and leaves it as it is. Archiving a light change leaves it as it is too.
