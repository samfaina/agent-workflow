# How it works

agent-workflow sets up one way of building software with Claude Code. You describe what you want, Claude interviews you until the plan is clear, and the plan becomes a spec, then a list of tickets, then code, one ticket at a time. Every step leaves a document in the repository, and the next step reads that document instead of relying on what was said in the chat.

This page explains the model. To install the kit and run your first change, follow [the guide](./guide.md). Words in **bold** are defined in [Key terms](#key-terms) at the bottom.

## The workflow at a glance

A piece of work is a **change**. It goes through five stages, and each stage starts with one command you type. Claude never starts a stage on its own.

<StageDiagram />

The stages run in this order every time. When the last one finishes, the change is **archived**: its requirements merge into the **living spec**, the description of what your product does today, and the next change starts from there.

## Stage by stage

| Stage | You type | Session | What it leaves behind |
| --- | --- | --- | --- |
| Interview | `/grill-with-docs <idea>` | new | new terms in `GLOSSARY.md`, decisions in `docs/adr/` |
| Spec | `/to-spec <change>` | same as the interview | the branch `change/<change>`, with `proposal.md`, delta specs and `design.md` |
| Tickets | `/to-tickets <change>` | new | `tasks.md` with numbered tickets |
| Implement | `/implement <change>#N` | new, for every ticket | code and tests, ticked boxes, a commit with `Refs: <change>#N` |
| Close | `/close-change <change>` | new | simplification and security fixes, the archived change, an updated living spec |

### Interview

`/grill-with-docs` asks you questions in rounds, each with a recommended answer, until nothing is left to decide. Saying "yes" accepts the recommendation. While it asks, it writes down what the conversation settles: a word with a precise meaning goes into `GLOSSARY.md`, and a decision that would be hard to reverse becomes an ADR in `docs/adr/`. The interview itself is not saved anywhere else, which is why the next stage runs in the same session.

### Spec

`/to-spec <change>` turns the interview into an OpenSpec change. It creates the branch `change/<change>`, agrees with you on the **seams** where tests will go, and writes three kinds of file: `proposal.md` (why and what, plus what is out of scope), one **delta spec** per capability (requirements with scenarios written as WHEN and THEN), and `design.md` (decisions and the test seams). It runs `openspec validate --strict` until the change is valid, then commits.

### Tickets

`/to-tickets <change>` reads the spec and proposes **tickets**. Each ticket is a vertical slice: a piece of behaviour that goes through every layer it needs and can be demoed or checked on its own. You adjust the list until it feels right. Each ticket names its **blockers** and lists its **acceptance criteria** as checkboxes. The last ticket is always a **manual test**, a few steps you run by hand once everything else is built.

### Implement

`/implement <change>#N` builds one ticket. Claude writes a failing test at an agreed seam, makes it pass, and repeats until the ticket's criteria are met. Then it runs `code-review` on its own work, which reports on two things: whether the code follows your standards, and whether it does what the spec asked. It ticks the ticket's boxes and commits. Before the commit goes through, the **quality gate** runs your check command.

Without a number, `/implement <change>` picks the first ticket whose blockers are done. When the manual test comes up, Claude gives you the steps as one block to paste into your shell, and ticks the boxes whose output matches.

### Close

`/close-change <change>` looks at the change as a whole. It checks that every box is ticked, simplifies the change's code, audits it for security problems, and verifies it against every requirement and scenario of the spec. If something is missing it stops and tells you what. Otherwise it archives the change and gives you the commands to push the branch and open a pull request. You review and merge it on GitHub.

## Where things live

Everything the workflow produces is a file in your repository:

```
openspec/
├── config.yaml                rules the kit adds to every artifact
├── changes/
│   ├── add-done-command/      a change in progress
│   │   ├── proposal.md        why, what, and what is out of scope
│   │   ├── specs/             delta specs, one folder per capability
│   │   ├── design.md          decisions and test seams
│   │   └── tasks.md           the tickets
│   └── archive/               finished changes
└── specs/                     the living spec
GLOSSARY.md                    the project's vocabulary
docs/adr/                      decisions that are hard to reverse
```

A change lives in `openspec/changes/<change>/` while you work on it. Archiving moves the folder to `openspec/changes/archive/` and merges its delta specs into `openspec/specs/`. Only `/close-change` does that: the living spec is a **protected path**, so Claude cannot edit it by hand.

To see where a change stands, run `openspec list`. It shows ticked boxes against the total, such as `3/7 tasks`.

## Why a fresh session per stage

A long conversation drifts. Claude remembers what you said three hours ago, half-remembers what it tried and abandoned, and starts to act on the conversation instead of the plan. Starting each stage in a fresh session (`/clear`, or a new `claude`) removes that history, so the only plan Claude has is the one written down in the documents.

Running a fresh session per stage also keeps each one small. A ticket is sized to fit in one session, and its context is the spec, `tasks.md` and the code, nothing else.

There is one exception. `/to-spec` runs in the same session as the interview, because the interview's answers are exactly what it needs and they are not saved anywhere else.

## Three sources, fixed roles

The kit doesn't write its own workflow skills. It combines three collections that already exist and gives each one role:

| Source | Role | What it does here |
| --- | --- | --- |
| [Matt Pocock's skills](https://github.com/mattpocock/skills) | runs the workflow | the interview, the spec, the tickets, test-first implementation, code review |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | stores the output | changes, delta specs, tickets, the living spec, validation and archiving |
| [Addy Osmani's skills](https://github.com/addyosmani/agent-skills) | specialists | security, performance, accessibility and other topics, used when the work touches them |

Matt's skills expect to talk to an issue tracker such as GitHub Issues. The kit installs an **adapter**, `docs/agents/issue-tracker.md`, that tells them their tracker is OpenSpec: a "ticket" is a numbered group in `tasks.md`, "closing a ticket" means ticking its boxes, and so on. The sources are joined only through documents like this one. The kit never edits a third-party skill, so you can update every skill from upstream with `npx skills update`.

The kit also leaves some skills out on purpose. Most skills trigger on their own when Claude thinks they fit, so two skills that cover the same ground compete without telling you. Addy's planning skill, for example, would fight `/to-tickets` over how to break up work. [What gets installed](./what-gets-installed.md#skills) lists every skill the kit installs, offers or excludes, with the reason.

The kit adds one workflow skill of its own, `close-change`. It chains Addy's simplification and security skills, a verification against the spec, and OpenSpec's archive.

## Guardrails

Three hooks run before Claude's tools and stop actions you would not want an agent to take on its own:

- `git-guard` blocks pushes, commits on `main`, and destructive git commands such as `reset --hard` or history rewrites.
- `quality-gate` runs your check command before every commit and blocks the commit when it fails.
- `protected-paths` blocks edits to files such as `.env`, the living spec and the hooks' own configuration.

Claude cannot loosen them: their configuration file is itself protected, so changing what is allowed is your decision. They catch mistakes. They are not a security boundary, and [What gets installed](./what-gets-installed.md#hooks) explains where they stop.

## Key terms

| Term | Meaning |
| --- | --- |
| **Workflow** | The fixed sequence of stages a change goes through: interview, spec, tickets, implementation (one ticket per session) and close. |
| **Change** | One unit of planned work, from spec to archive, stored as a folder of OpenSpec files and named in kebab-case, such as `add-done-command`. |
| **Spec** | The planning files of a change: proposal, delta specs and design. |
| **Delta spec** | The requirements a change adds, modifies, removes or renames, written against the living spec. |
| **Living spec** | What the product does today, made by merging the delta specs of every archived change. |
| **Ticket** | A vertical slice of a change that can be built in one session and demoed or checked on its own. |
| **Acceptance criterion** | One checkable statement a ticket must satisfy, together with how it is checked. |
| **Blocker** | A ticket that must be done before another can start. |
| **Manual test** | The last ticket of every change, in which you try the finished behaviour by hand. |
| **Seam** | A place in the code where a test can observe behaviour, agreed during `/to-spec`. |
| **Archive** | Retiring a finished change and merging its delta specs into the living spec. |
| **Adapter** | The document that tells Matt's skills to read and write OpenSpec as if it were their issue tracker. |
| **Quality gate** | Your project's check command, which must pass before Claude may commit. |
| **Protected path** | A file or folder Claude may never edit directly. |

The full vocabulary of the kit is in [`GLOSSARY.md`](https://github.com/samfaina/agent-workflow/blob/main/GLOSSARY.md), and the reasons behind its design are in [`docs/adr/`](https://github.com/samfaina/agent-workflow/tree/main/docs/adr).
