---
name: now-what
description: "Tell the user which workflow command comes next, from where the work stands."
disable-model-invocation: true
---

# Now What

Tell the user the one command that comes next. This skill is a **guide**: it diagnoses where the work stands and recommends a command, and the user runs it.

It is **read-only**. Read files and run only commands that report state (`node .claude/hooks/agent-workflow/status.mjs`, `git status`, `git branch`, `openspec list`, `openspec instructions`). Leave every file, branch and commit as it is: no `git switch`, `git fetch` or commit, and no Skill tool call for the recommended skill.

## 1. Read the conversation

Before any command, note what this conversation already holds:

- **Grilling**: `/grill-with-docs` or `grilling` ran here, and no `/to-spec` ran after it.
- **Light work**: the user described work too small for a spec, such as a bug fix, a one-line change or a chore (see state 9).
- **Situation**: the user described something off the workflow, such as a bug, a design question or a long session (see **Map off the workflow**).
- **Earlier work**: anything that happened before `/now-what`.

## 2. Read the repository

Run `node .claude/hooks/agent-workflow/status.mjs --json`. It prints the **progress snapshot** of the project, computed from git and the change files:

- `state`: the first state of step 3 that the repository alone decides, and `next`, its command (`null` when the next step is not a command);
- `changes`: each active change with its `stage`, `light` when it is a light change (no delta specs, one ticket), its `tickets` (each `done`, `frontier`, `ready` or `blocked`, with the blockers it `waitingOn`), its `frontier` ticket, its `next` command, its `branch`, and `current` when that branch is the current branch, which comes first;
- `strayFiles`: uncommitted files outside `openspec/changes/<change>/`, `GLOSSARY.md` and `docs/adr/`;
- `handOvers`: archived changes whose `branch` is not merged into `base`, each `pushed` or not to `remote`.

If `.claude/hooks/agent-workflow/status.mjs` is missing, the kit is missing or older than this skill: the state is **Not installed**.

## 3. Find the state

Walk these states in order and stop at the first that applies. The snapshot's `state` decides every state but 3, which only the conversation shows, and, in state 9, light work or the map for a situation.

1. **Not installed** (`not-installed`). Next: `npx github:samfaina/agent-workflow init`, then restart Claude Code.
2. **Stray files** (`stray-files`). Next: commit or stash the files in `strayFiles`; name them.
3. **Grilled, not published**: the conversation holds a grilling. Next: `/to-spec <change>`, proposing a kebab-case name that starts with a verb, taken from the interview.
4. **Context lost** (`context-lost`): no active change, and the tree is dirty only with `GLOSSARY.md` or `docs/adr/`. Next: `/grill-with-docs` to rebuild the context, then `/to-spec <change>`. Why: `/to-spec` works from the interview, which a fresh session lacks.
5. **No tickets** (`no-tickets`): the change has no `tasks.md`. Next: its `next`, `/to-tickets <change>`.
6. **Tickets open** (`tickets-open`): the change has an unticked box. Next: its `next`, `/implement <change>#N` for its frontier ticket.
7. **Finished** (`finished`): every box of the change is ticked. Next: its `next`, `/close-change <change>`.
8. **Hand-over pending** (`hand-over-pending`): take the first of `handOvers`.
   - Not `pushed`: Next: `/close-change <x>`.
   - `pushed`: the pull request waits in the code host. Next: review and merge it there; once merged, `git switch <base>` and `git pull`.
9. **Nothing in flight** (`nothing-in-flight`). Next: `/grill-with-docs` to start a change. When the conversation describes work that adds, modifies, removes or renames no requirement of the living spec (`openspec/specs/`) and fits one ticket, such as a bug fix, a one-line change or a chore, Next: `/light-change <description or external reference>`, and Why names both conditions. When in doubt about either, recommend `/grill-with-docs`. When the conversation holds another situation, use **Map off the workflow** instead.

**Several active changes** reach states 5 to 7 together: list each change of `changes` with its `stage` and `next`, and mark the one that is `current`. The user picks; this skill does not ask.

## 4. Answer

Answer in the user's language, the `language` setting in `.claude/settings.local.json`, in this format and nothing more:

```
Where you are: change add-greeting, ticket 2 of 4 done
Next: /implement add-greeting#3
Why: ticket 3's blockers (1, 2) are done
Session: start a fresh one first (/clear)
```

- **Where you are**: the state in a few words, with the change and its progress when there is one, marking a light change as `(light)`.
- **Next**: the command, exactly as the user types it.
- **Why**: the fact from step 2 that decided the state.
- **Session**: only when the next command is `/to-tickets`, `/implement` or `/close-change` and the conversation holds earlier work. Each of those starts from a fresh session.

For several active changes, write one `Where you are` / `Next` pair per change and one `Why` for all of them.

## Map off the workflow

Use this map only when the conversation holds a situation, and only after steps 2 and 3: a change in states 2 to 8 comes first. Recommend a skill only when `.claude/skills/<skill>/SKILL.md` exists; optional skills may not be installed. When the right one is missing, say that the installer offers it.

- A bug that resists a quick fix, a crash, or a slowdown → `diagnosing-bugs`
- A design question that only running code can answer → `prototype`
- Reading legwork: docs, API facts, a question for primary sources → `research`
- A review of a branch or of work in progress → `code-review`
- A long session that another session should continue → `handoff`
- Refactoring opportunities in existing code → `improve-codebase-architecture`
- Improving the agent's setup after a session → `retro`
- Editing a skill, `AGENTS.md` or `CLAUDE.md` → `writing-for-agents`
- Work on one topic, such as security, performance or a UI: the specialist `CLAUDE.md` lists for it, under **Specialist skills**.
