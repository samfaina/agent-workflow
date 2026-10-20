---
pageClass: troubleshooting
---

# Troubleshooting

Find the symptom you see. Each entry says why it happens and what to do.

## Installing

The installer, its downloads, and how to undo it.

### The installer cannot download a checklist

It prints the URL; download the file by hand into `.claude/references/`.

### `npx github:samfaina/agent-workflow` fails with `npm error could not determine executable to run`

The version of the kit that npx downloaded has no `bin` entry in its `package.json`, so you named a branch or commit from before the kit could run with npx. Run it from `main`, without `#<branch>`.

### A link to `../../references/<file>.md` in a skill is broken

Run the installer again; it downloads the shared checklists for every Addy skill installed.

### I want to undo the installation

It is all in files: delete the `agent-workflow` blocks from `AGENTS.md` and `CLAUDE.md`, the `hooks` entries pointing at `.claude/hooks/agent-workflow/` from `.claude/settings.json`, and the folders and files listed in [What gets installed](./what-gets-installed.md#files-in-your-project). `git` shows exactly what the installation added.

## Commands and skills

A command is missing, appears twice, or behaves differently from the guide.

### A workflow command does not appear when I type `/`

Restart Claude Code in the project folder. Check that `.claude/skills/<name>/SKILL.md` exists; if not, run the installer again.

### I see each Matt skill twice, such as `/to-spec` and `/mattpocock-skills:to-spec`

You also have Matt's plugin installed globally. Use the short names: they are the project's copies, configured by the adapter. Plugin skills always carry the `plugin:` prefix, so the two never collide.

### A skill behaves differently from this guide

A skill with the same name in `~/.claude/skills/` (your personal skills) wins over the project's copy. Rename or remove the personal one.

### `/code-review` runs a different review

Claude Code has a built-in `/code-review`; a project skill with the same name replaces it (the built-in stays available as `/review`). If you see the built-in, check that `.claude/skills/code-review/` exists.

### Claude answers in the wrong language

Check that `.claude/settings.local.json` holds `"language": "<your language>"` and restart Claude Code. Without it, a `language` in `~/.claude/settings.json` applies to every project, and it outranks what `CLAUDE.md` says. Run the installer again to set it, or add the line yourself.

## Hooks

A guardrail stopped Claude, or never runs.

### Claude says "agent-workflow git-guard: ... is a protected branch"

You are on `main`. The change branch is created by `/to-spec`; for work outside a change, create a branch yourself: `git switch -c <type>/<name>`.

### Claude says "agent-workflow quality-gate: ... failed"

The check command failed, so the commit was stopped. Claude sees the output and should fix the cause. Run the command yourself to see the full output. To change the command, edit `checkCommand` in `.claude/agent-workflow.json`.

### The hooks never fire

Check that `.claude/settings.json` has the `hooks` section (run the installer again to add it), that `node --version` works in a new terminal, and on Windows that Git for Windows is installed. Run `/hooks` in Claude Code to see the hooks it loaded.

## The workflow

A stage stops, or picks the wrong ticket.

### `openspec validate <change> --strict` fails

Read the message: the usual causes are a scenario written with three `#` instead of four, a requirement without a scenario, a requirement longer than 500 characters, or a missing `## Purpose` in a new capability. Ask Claude to fix it following `openspec instructions specs --change <change>`.

### `openspec validate --strict` fails on an unrecognized key in `.openspec.yaml`

OpenSpec accepts extra keys only with the `x-` prefix; any other unknown key fails the strict validation. The external references go under `x-external-references`, not `external-references` or `references`.

### My team tracker does not show the change

Your tracker's integration with your code host does the linking, not the kit. Check, in order:

- the reference in `.openspec.yaml` is written exactly as the tracker shows it, case included, and in quotes: an unquoted `#42` is a YAML comment, so the change has no reference. `npm run workflow:status` names the references in each change's header;
- the commits carry the trailer: `git log --format=%B change/<change>` shows `External-Ref:` lines. Commits made before you linked the work item have none, but the pull request title and body still name it;
- the branch is pushed: an integration sees only what reaches the code host;
- the integration is set up between your tracker and your code host, and looks where the kit writes the reference: [the guide](./guide.md#link-a-change-to-your-team-tracker) lists where each tracker looks.

With no integration, paste the output of `npm run workflow:status -- --report` into the work item, or set a `tracker` channel so Claude posts it ([What gets installed](./what-gets-installed.md#team-tracker)).

### Claude says "Could not post to PROJ-123"

The post to the team tracker failed; the workflow went on, and Claude gave you the snapshot to paste. The reason in parentheses says why:

- **The tracker is down, or the network is**: nothing to fix. The next transition posts the whole state again, so paste the snapshot only if the team needs it now.
- **Expired or missing credentials** (`401`, `403`, `unauthorized`): sign in again with your tool. For an MCP server, run `/mcp` in Claude Code and reconnect it. For a command, run it by hand once, for example `my-tracker comment PROJ-123 --body-file note.txt`, and follow what it asks.
- **`exit code 127`, or "not recognized"**: the command in `tracker` is not installed or not on your PATH.
- **`timed out after 60 s`**: the command waited for input or for the network. A command must run without asking anything.
- **"tracker ... is not none, mcp:<server> or a command"**: fix `tracker` in `.claude/agent-workflow.json` by hand. Running the installer again does not change a `tracker` that is already there.

To post the current state once the cause is fixed, ask Claude to project the last transition again, or run `node .claude/hooks/agent-workflow/status.mjs --project <stage> <change>` yourself.

### The roadmap says "PROJ-123: 2 updates behind"

That work item missed the last two snapshots, usually because the posts failed or the transitions ran in another clone. The next transition catches it up. To catch up now, run `node .claude/hooks/agent-workflow/status.mjs --project <stage> <change>` with the stage the change is at.

`not posted yet` means the work item was linked after the last post; it is not behind on anything one post does not fix.

Under a change marked `archived`, the hand-over post failed, and no transition follows to catch it up. Run the `next:` command the roadmap shows, with `--url <pull request>` when one was opened.

### `/implement` picks the wrong ticket

Name it: `/implement <change>#N`. Check the `Blocked by:` lines in `tasks.md`: a ticket starts only when every box of its blockers is ticked.

### `/close-change` stops at "progress.remaining"

Some box in `tasks.md` is unticked, often the manual test. Run the `/implement <change>#N` it names to finish that ticket.

### `/close-change` archived the change but the pull request was never opened

The hand-over did not finish: the branch was never pushed, or opening the pull request failed. Run `/close-change <change>` again on `change/<change>` with a clean tree. It sees the change is archived, checks only the branch and the clean tree, and goes straight to the hand-over.
