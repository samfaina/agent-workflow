# What gets installed

The installer puts two kinds of things into your project. The **kit**'s own pieces come from this repository: the adapter, the `light-change`, `close-change` and `now-what` skills, the hooks, and the templates for `AGENTS.md`, `CLAUDE.md` and OpenSpec's configuration. The skills come from the two **sources**, Matt Pocock's and Addy Osmani's collections, copied unmodified from upstream. OpenSpec itself is a command-line tool you install once per machine (see [the guide](./guide.md)).

## Files in your project

| Path | What it is |
| --- | --- |
| `.claude/skills/<name>/` | Matt's and Addy's skills, copied unmodified from upstream, plus the kit's `light-change`, `close-change` and `now-what` |
| `.claude/references/` | Shared checklists that Addy's skills link to |
| `.claude/hooks/agent-workflow/` | The hooks and the status module (Node scripts) |
| `.claude/settings.json` | Wires the hooks into Claude Code (merged into your settings if the file exists) |
| `.claude/settings.local.json` | Your conversation language and, if you accept it, the status line (see [Status line](#status-line)), merged into your local settings if the file exists; added to `.gitignore` |
| `.claude/agent-workflow.json` | Workflow configuration: protected branches, how change branches are named, push, check command, how pull requests are opened, how progress reaches the team tracker, protected paths |
| `docs/agents/issue-tracker.md` | The **adapter**: how Matt's skills read and write OpenSpec |
| `docs/agents/domain.md` | Where the skills find the glossary, ADRs and living spec |
| `AGENTS.md`, `CLAUDE.md` | Workflow, git rules, language and specialist skills, between `agent-workflow` markers |
| `openspec/` | OpenSpec's folders and `config.yaml` with the kit's rules |
| `package.json` | A `workflow:status` script that prints where each change stands, if you accept it (see [Status command](#status-command)) |
| `skills-lock.json` | Records where each third-party skill came from, for `npx skills update` |

The installer never overwrites an existing file without asking. Run it again at any time: files that already match are left alone.

## Skills

**Core** skills are always installed. **Optional** skills are offered one by one. **Excluded** skills are never installed, mostly because they would trigger on their own and compete with the workflow skills. The kit never installs Addy's plugin, slash commands, agents or hooks, and it never modifies a third-party skill.

<!-- skills-table:start -->
| Skill | Author | Tier | Why |
| --- | --- | --- | --- |
| `grill-with-docs` | Matt Pocock | core | First step of the workflow: interviews you about a plan and records terms and decisions as it goes. |
| `grilling` | Matt Pocock | core | The interview loop that grill-with-docs calls. |
| `domain-modeling` | Matt Pocock | core | Keeps GLOSSARY.md and the ADRs up to date; grill-with-docs calls it. |
| `to-spec` | Matt Pocock | core | Turns the interview into an OpenSpec change through the adapter. |
| `to-tickets` | Matt Pocock | core | Breaks a change into vertical-slice tickets in tasks.md. |
| `implement` | Matt Pocock | core | Builds one ticket per session with tdd and finishes with code-review. |
| `tdd` | Matt Pocock | core | Test-first loop at agreed seams; implement calls it. |
| `code-review` | Matt Pocock | core | Reviews each ticket against the coding standards and the spec; implement calls it. |
| `codebase-design` | Matt Pocock | core | Shared vocabulary for module interfaces and seams that tdd relies on. |
| `diagnosing-bugs` | Matt Pocock | core | Disciplined loop for hard bugs, the gap left by excluding Addy's debugging skill. |
| `prototype` | Matt Pocock | core | Throwaway prototypes that answer a design question before it reaches the spec. |
| `research` | Matt Pocock | optional | Background research against primary sources, saved as a Markdown file. |
| `pr` | Matt Pocock | optional | Writes the pull request body when /close-change hands a change over. |
| `improve-codebase-architecture` | Matt Pocock | optional | Finds refactoring opportunities in an existing codebase. |
| `handoff` | Matt Pocock | optional | Compacts a long session into a document a fresh session can pick up. |
| `writing-for-agents` | Matt Pocock | optional | Guidance for editing skills, AGENTS.md and CLAUDE.md. |
| `retro` | Matt Pocock | optional | Suggests improvements to the agent's environment after a session. |
| `setup-matt-pocock-skills` | Matt Pocock | excluded | The kit writes its configuration; running it would replace the OpenSpec adapter. |
| `triage` | Matt Pocock | excluded | Moves issues through triage labels, which OpenSpec does not have. |
| `wayfinder` | Matt Pocock | excluded | Needs a map of tickets on a real issue tracker, which the adapter does not provide. |
| `implement-spec` | Matt Pocock | excluded | Builds a whole spec with parallel agents on an integration branch, against one ticket per session. |
| `ask-matt` | Matt Pocock | excluded | Routes to flows the kit replaces, such as triage and wayfinder. The kit's /now-what replaces it. |
| `grill-me` | Matt Pocock | excluded | Same interview as grilling, without the docs grill-with-docs keeps. |
| `git-guardrails-claude-code` | Matt Pocock | excluded | A bash hook that the kit's cross-platform git-guard hook replaces. |
| `setup-pre-commit` | Matt Pocock | excluded | Husky pre-commit setup for JavaScript only; the kit's quality gate covers any stack. |
| `teach` | Matt Pocock | excluded | Outside the development workflow; install it by hand if you want it. |
| `to-questionnaire` | Matt Pocock | excluded | Outside the development workflow; install it by hand if you want it. |
| `wait-what` | Matt Pocock | excluded | Outside the development workflow; install it by hand if you want it. |
| `wizard` | Matt Pocock | excluded | Generates bash scripts, which do not run in a plain Windows PowerShell setup. |
| `code-simplification` | Addy Osmani | core | close-change uses it to simplify the whole change before archiving. |
| `security-and-hardening` | Addy Osmani | core | close-change uses it to audit the whole change before archiving. |
| `performance-optimization` | Addy Osmani | optional | Performance work, which no workflow skill covers. |
| `frontend-ui-engineering` | Addy Osmani | optional | Accessible, responsive UI work, which no workflow skill covers. |
| `api-and-interface-design` | Addy Osmani | optional | Public API and contract design, beyond codebase-design's module vocabulary. |
| `browser-testing-with-devtools` | Addy Osmani | optional | Checks behaviour in a real browser; needs the Chrome DevTools MCP server. |
| `observability-and-instrumentation` | Addy Osmani | optional | Logging, metrics and tracing, which no workflow skill covers. |
| `ci-cd-and-automation` | Addy Osmani | optional | CI/CD pipelines, which no workflow skill covers. |
| `shipping-and-launch` | Addy Osmani | optional | Pre-launch checklists and rollout plans, which no workflow skill covers. |
| `deprecation-and-migration` | Addy Osmani | optional | Removing systems and migrating users or data safely. |
| `source-driven-development` | Addy Osmani | optional | Checks framework usage against official documentation. |
| `interview-me` | Addy Osmani | excluded | Overlaps grill-with-docs. |
| `idea-refine` | Addy Osmani | excluded | Overlaps grill-with-docs and ships a bash script. |
| `spec-driven-development` | Addy Osmani | excluded | Overlaps to-spec and OpenSpec. |
| `planning-and-task-breakdown` | Addy Osmani | excluded | Overlaps to-tickets. |
| `incremental-implementation` | Addy Osmani | excluded | Overlaps implement. |
| `test-driven-development` | Addy Osmani | excluded | Overlaps tdd. |
| `debugging-and-error-recovery` | Addy Osmani | excluded | Overlaps diagnosing-bugs. |
| `code-review-and-quality` | Addy Osmani | excluded | Overlaps code-review. |
| `documentation-and-adrs` | Addy Osmani | excluded | Overlaps domain-modeling, which keeps the ADRs. |
| `git-workflow-and-versioning` | Addy Osmani | excluded | Its git rules compete with the kit's branch rules and git-guard hook. |
| `context-engineering` | Addy Osmani | excluded | Rewrites AGENTS.md and CLAUDE.md, which the kit's templates own. |
| `using-agent-skills` | Addy Osmani | excluded | Meta-skill that routes work into Addy's own workflow. |
| `constraint-driven-development` | Addy Osmani | excluded | Sets up its own quality gate and relies on Addy's /build, /review and /ship commands. |
| `doubt-driven-development` | Addy Osmani | excluded | Triggers on every non-trivial decision and overlaps grilling and code-review. |
<!-- skills-table:end -->

The kit's own skills are always installed: `light-change` opens a change with no delta specs and one ticket for work too small for a spec, `close-change` chains simplification, security, verification and archive, and `now-what` reads where the work stands and tells you the next command, without running it. All three run only when you type them.

The installer lists each Addy skill it installs in `CLAUDE.md`, with the kind of work it is for, so Claude knows when to reach for it.

To add an optional skill later, run the installer again and say yes to it. To update the third-party skills from upstream, run `npx skills update` and then the installer again, which refreshes the shared checklists.

## Hooks

Three hooks run before Claude's tools. They are configured in `.claude/agent-workflow.json`:

```json
{
  "protectedBranches": ["main", "master"],
  "branch": "change/{change}",
  "allowPush": false,
  "checkCommand": "npm test",
  "pullRequest": { "via": "none" },
  "tracker": { "via": "none" },
  "protectedPaths": [".env", ".env.*", ".claude/settings.json", "openspec/specs/**", "..."]
}
```

| Hook | Runs on | Blocks |
| --- | --- | --- |
| `git-guard` | Bash and PowerShell commands | `git push` (unless `allowPush` is `true`, and even then force pushes and pushes to protected branches), commits, merges and rebases on a protected branch, `reset --hard`, `clean -f`, `branch -D`, `checkout -- <paths>`, `restore` (except `--staged`), `switch --discard-changes`, `stash drop`/`clear`, history rewriting, `--no-verify` |
| `quality-gate` | Bash and PowerShell commands that contain `git commit` | the commit, when `checkCommand` fails; Claude sees the last lines of its output |
| `protected-paths` | File edits by Claude, and Bash and PowerShell commands | edits to any path matching `protectedPaths` (`**` crosses folders; a pattern without `/` matches a file name anywhere), and commands that write, move or delete such a path: redirections (`>`, `>>`), `tee`, `cp`, `mv`, `rm`, `touch`, `sed -i`, `Set-Content`, `Add-Content`, `Out-File`, `New-Item`, `Remove-Item`, `Copy-Item`, `Move-Item` |

`protectedBranches` comes from the installer's **Protected branches** question, asked after **Branch names**: `main, master`, `develop, main`, or names of your own separated by commas. `develop, main` comes first, and is what `--yes` takes, when the repository has a `develop` branch (`refs/heads/develop` or `refs/remotes/*/develop`) or the branch pattern is `feature/{ref}-{change}`; otherwise `main, master` does. `--protected-branches develop,main` answers it. The installer rejects an empty list and any name `git check-ref-format --branch` rejects. Running it again keeps the `protectedBranches` already in the file. Each change is cut from one protected branch, its base, kept in its `.openspec.yaml` as `x-base`: the first protected branch that is a local branch, unless you name another one when the change opens.

`.claude/agent-workflow.json` is itself protected, so Claude cannot loosen its own guardrails: edit it yourself. The living spec (`openspec/specs/`) is protected because only `openspec archive`, run by `/close-change`, should change it.

The hooks read the commands Claude runs and the files it edits through its edit tools. They are a guardrail against mistakes, not a security boundary: a write from inside a program (a `node -e` or `python -c` one-liner, or a script Claude writes) can still reach a protected file. `AGENTS.md` tells Claude to report a blocked action to you instead of working around it.

## Status command

`.claude/hooks/agent-workflow/status.mjs` computes the **progress snapshot** of the project: each active change's stage, its tickets (done, frontier or blocked, with their blockers), its frontier ticket and the next command. It reads git and the change files itself, never the `openspec` command, so it is fast and works on a machine without OpenSpec.

| Command | Prints |
| --- | --- |
| `node .claude/hooks/agent-workflow/status.mjs` | The roadmap of each active change, the one on the current branch first, a light change marked `(light)` |
| `node .claude/hooks/agent-workflow/status.mjs --json` | The same snapshot as JSON, for scripts |
| `node .claude/hooks/agent-workflow/status.mjs --statusline` | One line for the change of the current branch, for Claude Code's status line; nothing off a change branch |
| `node .claude/hooks/agent-workflow/status.mjs --report [<change>]` | The snapshot of a change as text to paste into a work item |
| `node .claude/hooks/agent-workflow/status.mjs --project <stage> <change>` | Posts the snapshot to the change's work items through `tracker`; Claude runs it after each transition (see [Team tracker](#team-tracker)) |

`/to-tickets` and `/implement` end by pasting its roadmap, and `/now-what` reads its `--json` output. When the project has a `package.json`, the installer offers to add the script `"workflow:status": "node .claude/hooks/agent-workflow/status.mjs"`, so `npm run workflow:status` prints the roadmap; running the installer again offers it again if it is missing. Without `package.json`, the installer prints an alias to create instead:

```bash
alias workflow-status='node .claude/hooks/agent-workflow/status.mjs'                # bash, zsh
function workflow-status { node .claude/hooks/agent-workflow/status.mjs @args }     # PowerShell
```

### Status line

The installer offers to show the change of the current branch in Claude Code's status line. It adds this to `.claude/settings.local.json`, because a status line is a personal preference and the team does not get it:

```json
"statusLine": { "type": "command", "command": "node .claude/hooks/agent-workflow/status.mjs --statusline" }
```

| On a change's branch | The status line shows |
| --- | --- |
| Tickets still open | `add-greeting · 2/4 · next #3`: tickets done, tickets in all, the frontier ticket |
| No `tasks.md` yet | `add-greeting · no tickets · next /to-tickets` |
| Every box ticked | `add-greeting · 4/4 · next /close-change` |

Off a change branch, or once the change is archived, it prints nothing and the status line stays blank. It finds the active change whose branch (see [Change branches](#change-branches)) is the current one, reading only each active change's `.openspec.yaml` and that change's `tasks.md`, since Claude Code runs it after every message.

| Where a `statusLine` already exists | The installer |
| --- | --- |
| Nowhere | Asks whether to show it; the default is yes |
| Only in `~/.claude/settings.json` | Asks whether to use the kit's in this project instead of yours; the default is no. `.claude/settings.local.json` outranks your user settings, so your other projects keep yours |
| `.claude/settings.json` or `.claude/settings.local.json` | Does not ask |

`--yes` leaves it out, and running the installer again asks again while the project has none.

## Change branches

The `branch` setting in `.claude/agent-workflow.json` names the branch of each new change. It is a pattern with three placeholders:

| Placeholder | Filled with |
| --- | --- |
| `{change}` | The change name, such as `add-greeting`. Required |
| `{ref}` | The change's first external reference, as written, such as `PROJ-123` |
| `{user}` | Your own value, from `git config agent-workflow.user` |

The default, `change/{change}`, gives `change/add-greeting`. `feature/{ref}-{change}` gives `feature/PROJ-123-add-greeting`, which Jira links to its work item through Bitbucket. `{ref}__{change}--{user}` gives `PROJ-123__add-greeting--AB`.

`agent-workflow.json` is shared by the team, so `{user}` comes from each developer's clone: `git config agent-workflow.user AB` sets it there, and it is never committed. The installer sets it when the pattern uses `{user}`, from your answer or `--user <value>`; with `--yes` and no `--user`, Claude asks for it the first time it opens a change.

Claude fills the pattern in once, when the change opens, and writes the result in the change's `.openspec.yaml` as `x-branch`, next to its base, `x-base`, and `x-external-references`:

```yaml
x-branch: "feature/PROJ-123-add-greeting"
x-base: "develop"
```

Everything that needs the change's branch reads `x-branch`: the skills, the status module, `/close-change` and the pull request. A change made before this setting has no `x-branch` and lives on `change/<change>`. In the same way, `x-base` names the branch the change is cut from and handed over into; a change without it uses the first protected branch that exists. A branch keeps its name: changing the pattern, or linking a work item later, renames nothing. Claude never invents a value: with `{ref}` and no external reference, it asks you for the reference or for the branch name; a name git rejects (`git check-ref-format --branch`) stops it, and it never rewrites the name to make it pass.

A team whose changes branch off more than one protected branch can give each base its own pattern: `branch` then takes an object keyed by base branch.

```json
"protectedBranches": ["develop", "main"],
"branch": { "develop": "feature/{ref}__{change}", "main": "hotfix/{ref}__{change}" }
```

A change based on `main` with the reference `POC-1` gets `hotfix/POC-1__fix-login`; one based on `develop` gets `feature/POC-1__add-greet`. A base without an entry takes the entry of the first protected branch that has one. Every key must be one of `protectedBranches`, and the object needs at least one; Claude stops when it meets an object that breaks either rule. The status module looks for pending hand-overs under the fixed part of every pattern, and the `git-guard` message shows the pattern of the default base.

The installer asks after **Pull requests**: `change/{change}`, `feature/{ref}-{change}` (gitflow with work items), or a pattern of your own; `--branch "<pattern>"` answers it. It rejects a pattern without `{change}`, with any other placeholder, or whose sample name git rejects. When **Protected branches** lists more than one branch, it then asks **Branch names for changes based on `<branch>`** for each one after the first, offering the first pattern with a leading `feature/` turned into `hotfix/`, else the same pattern. It writes an object only when the patterns differ, a string otherwise. Without a question, `--branch-for <base>=<pattern>`, repeated for each base, gives the pattern of another protected branch next to `--branch`, and the installer rejects a base outside the protected branches; with `--branch` or `--branch-for`, it asks no branch question. `--yes` writes `change/{change}` as a string. Running it again keeps the `branch` already in the file.

## Pull requests

The `pullRequest` setting in `.claude/agent-workflow.json` tells `/close-change` how to hand a finished change over. The kit knows no code host: it works the same with GitHub, GitLab, Bitbucket, Azure DevOps, Gitea or a repository with no remote.

| Value | What `/close-change` does |
| --- | --- |
| `{ "via": "none" }` (default) | Writes the pull request's title and body, gives you the `git push` command, and leaves opening the pull request to you, in your code host's web page. |
| `{ "via": "cli", "command": "..." }` | After you push the branch, asks whether to open the pull request, and on yes runs `command` with its placeholders filled in. |
| `{ "via": "mcp", "server": "..." }` | The same, through the tool of that MCP server that creates pull requests (or merge requests). The server must be connected to Claude Code. |

The command can use five placeholders, quoted for the shell when they are filled in: `{base}` (the change's base branch), `{branch}` (the change's branch), `{title}`, `{body}` (the body as text) and `{bodyFile}` (the path of a temporary file holding the body). For example:

```json
"pullRequest": { "via": "cli", "command": "gh pr create --base {base} --head {branch} --title {title} --body-file {bodyFile}" }
"pullRequest": { "via": "cli", "command": "glab mr create --target-branch {base} --source-branch {branch} --title {title} --description {body} --yes" }
"pullRequest": { "via": "mcp", "server": "atlassian" }
```

The installer asks for this setting with a list: GitHub (the `gh` command above), GitLab (the `glab` command), Bitbucket (Atlassian's MCP server, asking for its name with `atlassian` as the default), another MCP server, your own command, or none. When `origin` points to github.com and `gh` is installed, or to a GitLab host and `glab` is installed, that host is the default; otherwise the default is none. The installer never installs a CLI or connects an MCP server: when the chosen CLI is missing, or you pick an MCP server, its next steps say how. Pass the answer with `--pull-request` instead: `none`, `github`, `gitlab`, `bitbucket`, `mcp:<server>` or your own command. In a project that already has the kit, running the installer again adds the setting and keeps the rest of the file.

With a remote and any value, the push stays yours unless `allowPush` is `true`. In a project with no remote, `/close-change` ignores the setting and gives you the commands to merge the branch locally. Unless your Claude Code permissions already allow them, Claude Code also asks before Claude runs the command or calls the MCP tool.

When the hand-over does not finish, run `/close-change <change>` again to finish it: see [Troubleshooting](./troubleshooting.md#close-change-archived-the-change-but-the-pull-request-was-never-opened).

## Team tracker

The `tracker` setting in `.claude/agent-workflow.json` tells Claude how to post a change's **progress snapshot** to the work items it references. It posts in one direction only: it never reads a work item's state back, never moves it and never creates one. The kit knows no tracker, so the project brings the channel.

| Value | What Claude does |
| --- | --- |
| `{ "via": "none" }` (default, and what a missing setting means) | Posts nothing. `--report` prints the snapshot to paste by hand. |
| `{ "via": "mcp", "server": "..." }` | Posts the snapshot as a comment on each work item through the tool of that MCP server. The server must be connected to Claude Code. |
| `{ "via": "cli", "command": "..." }` | Runs `command` once per work item, with its placeholders filled in, from the project folder: in `cmd.exe` on Windows, `sh` elsewhere. It must not ask for input, and it is stopped after 60 seconds. `cmd.exe` expands a `%NAME%` even inside quotes; the kit's messages hold no `%`, but if your references or pull request URLs may, pass `{messageFile}` rather than `{message}` and keep `{ref}` and `{url}` out of the command. |

The command can use eight placeholders, each quoted for the shell when it is filled in: `{ref}` (the external reference), `{change}`, `{stage}`, `{done}` and `{total}` (the tickets done and in all), `{url}` (the pull request, on `change-closed`), `{message}` (the snapshot as text) and `{messageFile}` (the path of a temporary file holding it). For example:

```json
"tracker": { "via": "none" }
"tracker": { "via": "mcp", "server": "<the server's name in Claude Code>" }
"tracker": { "via": "cli", "command": "my-tracker comment {ref} --body-file {messageFile}" }
```

Claude posts right after the commit of four transitions. The status module writes the text, never Claude, and it holds only state: nothing from the spec or the tickets leaves the repository.

| `{stage}` | When | Message |
| --- | --- | --- |
| `spec-published` | `/to-spec` published the change | `add-greeting: spec published` |
| `tickets-published` | `/to-tickets` published the tickets, or `/light-change` opened a light change, which skips `spec-published` | `add-greeting: 0 of 4 tickets done` |
| `ticket-done` | `/implement` finished a ticket, the manual test included | `add-greeting: 2 of 4 tickets done` |
| `change-closed` | `/close-change` handed the branch over | `add-greeting: finished, pull request <url>`, `finished, merged locally` without a remote, or `finished, ready for review` |

A command that wants to move the work item's state can do so itself from `{stage}`; the kit never does.

- **Authorization**: choosing a `tracker` other than `none` is the authorization. Claude shows each post (`Posted to PROJ-123: 2 of 4 tickets done`) and does not ask before it. `allowPush` does not apply, because nothing is pushed.
- **Failures**: a failed post never stops the workflow. Claude says so in one line, gives you the snapshot to paste, and goes on.
- **Duplicates**: a ledger, `agent-workflow/tracker.json` in git's common directory (`git rev-parse --git-common-dir`), keeps the last snapshot posted per change and work item. Every worktree of the clone shares it, and it is never committed. A snapshot equal to the last one is not posted again. A missed one needs no retry, because the next one carries the whole state; only a missed `change-closed` has no next one. Another clone starts with an empty ledger and may repeat a comment.
- **Lag**: while a work item has missed snapshots, the roadmap says so under the change, for example `PROJ-123: 2 updates behind`. A work item linked after the last post says `not posted yet`: one post catches it up. An archived change whose hand-over was not posted stays in the roadmap, marked `archived`, with the command that posts it.

The installer asks one question, with `none` as the default: type `none`, `mcp:<server>` or a command. It lists the servers in the project's `.mcp.json` as hints and recognises no tracker CLI. Before accepting anything other than `none`, it shows what one post will look like and asks you to confirm. Pass the answer with `--tracker` instead. In a project that already has the kit, running the installer again asks only while `tracker` is missing.

When a change starts from a work item and a channel is set, Claude reads the work item's title and description through it; otherwise it asks you to paste them.
