# One status module, copied into the project, reads the change files directly

The progress snapshot of a change (its stage, tickets, frontier ticket, next command and external references) is computed by one dependency-free Node module, copied into the target project at `.claude/hooks/agent-workflow/status.mjs`. Every surface reads it:

- the roadmap at the end of `/to-tickets` and `/implement`;
- `now-what`, for the states that depend only on the repository;
- a terminal command, which prints the developer's view by default, `--report` for the text to paste into a tracker, and `--json`;
- the optional Claude Code status line;
- the projection (ADR 0008).

The module reads the branch with git, and reads `tasks.md` and `.openspec.yaml` itself in the format of ADR 0004, instead of calling the `openspec` CLI. The status line runs often, and every `openspec` call starts a Node process. Someone who only looks at the state may not have `openspec` on their PATH. OpenSpec's JSON also lacks the `x-` keys.

## Considered Options

- **Calling `openspec list --json` and `openspec instructions apply --json`**: rejected for the reasons above. Tests compare the module's counts with `openspec list --json` instead, to catch format drift.
- **Running the command with `npx github:samfaina/agent-workflow status`**: rejected, because it needs the network and is slow. The kit is not published on npm, so `npx agent-workflow status` does not resolve.
- **Each skill writing its own roadmap from `tasks.md`**: rejected. The text would drift from one session to the next, and the projection must post a text the agent did not write.

## Consequences

- The installer offers a `workflow:status` script in `package.json` when there is one; otherwise it prints an alias to create.
- The installer offers the status line only when no `statusLine` exists in the user's or the project's settings. It writes the status line to `.claude/settings.local.json`, defaults to yes when it asks, and skips it with `--yes`.
- `now-what` still reads the conversation itself, for a grilling or a situation off the workflow.
