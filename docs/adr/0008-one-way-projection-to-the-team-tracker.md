# Progress is projected one way onto the team tracker, by the agent

Teams plan and follow their work in a team tracker the kit cannot know: Jira, Linear, GitHub, GitLab or Azure issues, Notion, a spreadsheet, an internal tool with or without an API. OpenSpec stays the source of truth (ADR 0004), so the kit only posts a change's progress snapshot to the work items it references and never reads their state back. Visibility comes in three layers that add up. The external references travel in commits and in the pull request, so any tracker ↔ code host integration links the work by itself (ADR 0009). A `tracker` setting, shaped like `pullRequest` (ADR 0007), lets the agent post snapshots through an MCP server or a command the project brings. The same snapshot is printed ready to paste for trackers that no channel reaches.

## Considered Options

- **Two-way sync, or detecting drift**: rejected, because both need each tracker's states and fields, and the work item belongs to the team. Edits made by hand in the tracker are ignored.
- **A git `post-commit` hook**: rejected, because it cannot use MCP servers, cannot tell the agent it failed, and fires on human commits too.
- **A Claude Code hook**: rejected, because it ties visibility to one harness.
- **Moving tracker states through a stage → state map**: deferred. Transitions fail in tracker-specific ways, and in many teams the PM owns them. A command receives `{stage}` and may move the state itself.
- **Copying tickets into the tracker as sub-items**: rejected. The change is the unit the team sees; tickets stay in `tasks.md`.

## Consequences

- The agent projects right after the commit of four transitions, following the adapter and `close-change`: `spec-published`, `tickets-published`, `ticket-done` (the manual test included) and `change-closed`. The status module (ADR 0010) writes the text, never the agent. The text holds only state: the change name, the stage, the tickets done out of the total and, on close, the pull request URL. No spec or ticket content leaves the repository; a command that wants more builds it itself.
- A change references zero or more work items, and several changes may share one. The link is kept only on the change's side. The kit never creates work items. A change may start from one: the agent reads its content through the channel when it can, or the user pastes it.
- Projection never blocks the workflow. When posting fails, the agent says so in one line, prints the snapshot to paste and goes on. A local ledger, `agent-workflow/tracker.json` in git's common directory and outside version control, keeps the last snapshot posted per change and reference. A snapshot equal to the last one is not posted again. A missed snapshot needs no retry queue, because the next one carries the whole state. Another clone starts with an empty ledger and may repeat a comment.
- Choosing a `tracker` other than `none` in the installer is the authorization. Each post is shown, not asked. `allowPush` does not apply, because nothing is pushed.
- `tracker` is `{ "via": "none" }` (the default, and what a missing setting means), `{ "via": "mcp", "server": "<name>" }`, or `{ "via": "cli", "command": "..." }` with `{ref}`, `{change}`, `{stage}`, `{done}`, `{total}`, `{url}`, `{message}` and `{messageFile}`, run once per reference.
- The installer recognises no tracker, not even GitHub Issues. It asks one question that shows a generic example of the command's syntax, lists the MCP servers in `.mcp.json` as hints, and shows a sample snapshot before accepting anything other than `none`.
- Work too small for a spec stays outside the workflow; its developer writes the external reference into the commit or pull request by hand.
