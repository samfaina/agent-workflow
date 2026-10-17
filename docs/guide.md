# agent-workflow guide

This guide takes you from nothing to a finished change in a project of your own. Follow it top to bottom the first time; every command is written out.

The kit sets up one workflow in Claude Code:

```
/grill-with-docs → /to-spec <change> → /to-tickets <change> → /implement <change>#N (once per ticket) → /close-change <change>
```

- **Matt Pocock's skills** run the workflow: the interview, the spec, the tickets, the implementation and the code review.
- **OpenSpec** stores what they produce: each piece of work is a **change** in `openspec/changes/<change>/`, and finished changes merge into the **living spec** in `openspec/specs/`, the description of what your product does today.
- **Addy Osmani's skills** are specialists (security, performance, accessibility...). Claude reaches for them when the work touches their topic; they never drive the workflow.

The words in bold are defined in [`GLOSSARY.md`](../GLOSSARY.md). The reasons behind the design are in [`docs/adr/`](adr/).

## 1. Prerequisites

Install these once per machine. The commands are for PowerShell on Windows; they work the same in a macOS or Linux terminal.

1. **Node.js LTS** (22 or newer) from <https://nodejs.org>. Check it:
   ```powershell
   node --version
   ```
2. **Git** from <https://git-scm.com>. On Windows, keep "Git Bash" selected in the installer: Claude Code runs hooks with it. Check it:
   ```powershell
   git --version
   ```
3. **GitHub CLI** from <https://cli.github.com>, then sign in and let Git use those credentials (needed to push branches and open pull requests):
   ```powershell
   gh --version
   gh auth login
   gh auth setup-git
   ```
4. **OpenSpec CLI**:
   ```powershell
   npm install -g @fission-ai/openspec@latest
   openspec --version
   ```
5. **Claude Code**, signed in. Check it with `claude --version`.

You do not need to install the Skills CLI: the installer runs it with `npx`.

## 2. Install the kit in a new project

1. Create the project folder and a git repository with one commit on `main`:
   ```powershell
   mkdir my-project
   cd my-project
   git init -b main
   echo "# my-project" > README.md
   git add README.md
   git commit -m "chore: initial commit"
   ```
2. Create a branch for the installation, so it reaches `main` through a pull request like everything else:
   ```powershell
   git switch -c chore/install-agent-workflow
   ```
3. Run the installer:
   ```powershell
   npx github:samfaina/agent-workflow init
   ```
   `npx` downloads the kit from GitHub into npm's cache and runs it from there: you need no clone and no GitHub sign-in. The first time, it asks whether to install the package; answer `y`, or put `--yes` after `npx`. To try a branch of the kit before it reaches `main`, add `#<branch>` to the repository: `npx github:samfaina/agent-workflow#<branch> init`.
4. Answer the questions:
   - **Language**: the language Claude talks to you in. The installer saves it as the `language` setting in `.claude/settings.local.json`, your personal settings for this project, which git ignores. It wins over a `language` you may have set for all projects in `~/.claude/settings.json`. Everything written to the repository stays in English.
   - **Check command**: the command that proves the project works, such as `npm test`, `npm run lint && npm test`, `pytest` or `dotnet test`. The quality gate runs it before every commit. Leave it empty if the project has no checks yet; you can set it later in `.claude/agent-workflow.json`.
   - **Optional skills**: one question per skill, with the reason it exists. Say yes only to the topics your project touches. You can run the installer again later to add more.
5. Look at what it created and commit it:
   ```powershell
   git status
   git add -A
   git commit -m "chore: install agent-workflow"
   ```
6. Push the branch and open a pull request, then merge it:
   ```powershell
   git push -u origin chore/install-agent-workflow
   gh pr create --base main --fill
   ```
7. Close Claude Code if it is open and start it again in the project folder (`claude`), so it loads the new skills and hooks. Type `/` and check that `/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement` and `/close-change` appear.

### What the installer creates

| Path | What it is |
| --- | --- |
| `.claude/skills/<name>/` | Matt's and Addy's skills, copied unmodified from upstream, plus the kit's `close-change` |
| `.claude/references/` | Shared checklists that Addy's skills link to |
| `.claude/hooks/agent-workflow/` | The hooks (Node scripts) |
| `.claude/settings.json` | Wires the hooks into Claude Code (merged into your settings if the file exists) |
| `.claude/settings.local.json` | Your conversation language (merged into your local settings if the file exists); added to `.gitignore` |
| `.claude/agent-workflow.json` | Hook configuration: protected branches, push, check command, protected paths |
| `docs/agents/issue-tracker.md` | The **adapter**: how Matt's skills read and write OpenSpec |
| `docs/agents/domain.md` | Where the skills find the glossary, ADRs and living spec |
| `AGENTS.md`, `CLAUDE.md` | Workflow, git rules, language and specialist skills, between `agent-workflow` markers |
| `openspec/` | OpenSpec's folders and `config.yaml` with the kit's rules |
| `skills-lock.json` | Records where each third-party skill came from, for `npx skills update` |

The installer never overwrites an existing file without asking. Run it again at any time: files that already match are left alone.

### Options for automation

```powershell
npx github:samfaina/agent-workflow init --yes --language Spanish --check "npm test" --optional none
```

`--yes` accepts every default and keeps every existing file. `--optional` takes `all`, `none`, or skill names separated by commas.

## 3. Install the kit in an existing project

1. Commit or stash your work, and create a branch:
   ```powershell
   git status
   git switch -c chore/install-agent-workflow
   ```
2. Run the installer as in section 2, step 3. When a file already exists it asks before touching it:
   - `AGENTS.md` and `CLAUDE.md`: it **appends** its section between `<!-- agent-workflow:start -->` and `<!-- agent-workflow:end -->` and leaves the rest of your text alone.
   - `.claude/settings.json`: it **adds** its three hooks and keeps your permissions and hooks.
   - `docs/agents/issue-tracker.md`: if you set up Matt's skills before with another tracker (GitHub, local files), saying yes replaces it with the OpenSpec adapter. Say yes: the workflow needs it.
   - Skills you already have: it asks whether to reinstall them from upstream. Say no to keep your copies.
3. Read the warnings at the end:
   - **"CLAUDE.md has its own ## Agent skills section"**: delete that section from `CLAUDE.md`. The kit's version lives in `AGENTS.md`, and two sections pointing at different trackers confuse the skills.
   - **"... is installed but excluded by the kit"**: remove that skill with `npx skills remove <name>`; the table in section 5 says why.
   - **"openspec/config.yaml already has its own context or rules"**: copy the `context` and `rules` printed in the warning into your `config.yaml` by hand, merged with yours.
4. Review, commit, push and open the pull request as in section 2, steps 5 and 6, then restart Claude Code.

### Migrating a project that used /opsx:propose and /opsx:apply

1. Finish what is in flight the old way, or decide to carry it over. List the changes:
   ```powershell
   openspec list
   ```
   Archive the ones that are finished:
   ```powershell
   openspec archive <change> --yes
   ```
2. Run the installer. It finds OpenSpec's commands and skills (`.claude/commands/opsx/`, `.claude/skills/openspec-*`) and asks to delete them. Say yes: they compete with `/to-spec` and `/implement`. Your changes and specs in `openspec/` are not touched.
3. Merge the kit's `context` and `rules` into your `openspec/config.yaml` if the installer asked you to (see step 3 above).
4. Changes still in flight keep working with `/implement <change>`. Their task groups have no `Blocked by:` line, so the adapter treats each group as blocked by the one before it, and the boxes count as acceptance criteria. For a large change, consider running `/to-tickets <change>` in a fresh session to rewrite its `tasks.md` as vertical tickets.
5. From now on, start new work with `/grill-with-docs` instead of `/opsx:explore` or `/opsx:propose`, and build it with `/implement` instead of `/opsx:apply`.
6. Do not run `openspec init --tools claude` again: it reinstalls the `/opsx` files. `openspec update` is safe.

## 4. The daily flow

Each step below is one command you type in Claude Code. Start a **fresh session** (`/clear`, or a new `claude`) where the step says so: a clean context makes the agent follow the documents instead of the conversation.

The five workflow commands only run when you type them; Claude never starts them on its own.

### 4.1 `/grill-with-docs`: decide what to build

Describe the idea after the command, for example `/grill-with-docs add a "done" command to mark to-dos as finished`. Claude interviews you in rounds of numbered questions, each with its recommendation. Answer each one ("yes" accepts the recommendation). Along the way it adds terms to `GLOSSARY.md` and records hard-to-reverse decisions in `docs/adr/`. It is finished when Claude says there is nothing left to decide.

### 4.2 `/to-spec <change>`: publish the spec

In the **same session**, so it can use the interview, type `/to-spec add-done-command`. The change name is kebab-case and starts with a verb. Claude:

1. creates the branch `change/add-done-command`;
2. confirms with you the **seams** where tests will go;
3. writes `proposal.md`, the delta specs and `design.md` in `openspec/changes/add-done-command/`;
4. runs `openspec validate add-done-command --strict` until it passes;
5. commits the spec.

Check it yourself with `openspec show add-done-command`.

### 4.3 `/to-tickets <change>`: break it into tickets

In a **fresh session**, type `/to-tickets add-done-command`. Claude proposes a numbered list of tickets: each is a vertical slice you could demo on its own, with the tickets that block it. Adjust the breakdown until it feels right, then approve it. Claude writes them into `tasks.md` (the last ticket is always a manual test for you) and commits.

Check progress at any time with `openspec list` (it shows ticked boxes out of total, such as `0/7 tasks`). `openspec status --change <change>` shows which planning documents exist, not the tickets.

### 4.4 `/implement <change>#N`: build one ticket

In a **fresh session** for every ticket, type `/implement add-done-command#1`, then `#2` and so on: `/to-tickets` lists the commands, and each ticket ends by naming the next one. Without a number, `/implement add-done-command` picks the first ticket whose blockers are done. Claude states the ticket's title, builds it test-first, runs `code-review` on its work and shows its `## Standards` and `## Spec` reports, ticks the ticket's boxes, and commits with `Refs: add-done-command#N`. The quality gate runs your check command before the commit.

Repeat until the next ticket is the manual test: Claude lists its steps, you run them by hand and tell Claude what you saw at each one, and Claude ticks the boxes whose result matches.

### 4.5 `/close-change <change>`: finish it

In a **fresh session**, type `/close-change add-done-command`. Claude checks every box is ticked, simplifies the change's code (`code-simplification`), audits it for security problems (`security-and-hardening`), verifies it against its requirements and scenarios, and archives it: the delta specs merge into `openspec/specs/`, and the change moves to `openspec/changes/archive/`. It stops and tells you when something must be fixed first.

It finishes with the commands for you to publish the branch:

```powershell
git push -u origin change/add-done-command
gh pr create --base main --fill
```

Review the pull request on GitHub and merge it.

### Outside a change

- **A bug**: describe it and say "diagnose this"; `diagnosing-bugs` builds a failing loop before guessing at causes. For a fix worth a spec, run the flow from `/grill-with-docs`.
- **A design question**: ask for a prototype; `prototype` builds a throwaway one.
- **A review of any branch**: `/code-review main`.

## 5. Skills: what is included and why

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
| `pr` | Matt Pocock | optional | Shapes pull request bodies; useful once a change is closed. |
| `improve-codebase-architecture` | Matt Pocock | optional | Finds refactoring opportunities in an existing codebase. |
| `handoff` | Matt Pocock | optional | Compacts a long session into a document a fresh session can pick up. |
| `writing-for-agents` | Matt Pocock | optional | Guidance for editing skills, AGENTS.md and CLAUDE.md. |
| `retro` | Matt Pocock | optional | Suggests improvements to the agent's environment after a session. |
| `setup-matt-pocock-skills` | Matt Pocock | excluded | The kit writes its configuration; running it would replace the OpenSpec adapter. |
| `triage` | Matt Pocock | excluded | Moves issues through triage labels, which OpenSpec does not have. |
| `wayfinder` | Matt Pocock | excluded | Needs a map of tickets on a real issue tracker, which the adapter does not provide. |
| `implement-spec` | Matt Pocock | excluded | Builds a whole spec with parallel agents on an integration branch, against one ticket per session. |
| `ask-matt` | Matt Pocock | excluded | Routes to flows the kit replaces, such as triage and wayfinder. |
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

The kit's own skill, `close-change`, is always installed: it chains simplification, security, verification and archive.

To add an optional skill later, run the installer again and say yes to it. To update the third-party skills from upstream, run `npx skills update` and then the installer again, which refreshes the shared checklists.

## 6. Hooks and their configuration

Three hooks run before Claude's tools. They are configured in `.claude/agent-workflow.json`:

```json
{
  "protectedBranches": ["main", "master"],
  "allowPush": false,
  "checkCommand": "npm test",
  "protectedPaths": [".env", ".env.*", ".claude/settings.json", "openspec/specs/**", "..."]
}
```

| Hook | Runs on | Blocks |
| --- | --- | --- |
| `git-guard` | Bash and PowerShell commands | `git push` (unless `allowPush` is `true`, and even then force pushes and pushes to protected branches), commits, merges and rebases on a protected branch, `reset --hard`, `clean -f`, `branch -D`, `checkout -- <paths>`, `restore` (except `--staged`), `switch --discard-changes`, `stash drop`/`clear`, history rewriting, `--no-verify` |
| `quality-gate` | Bash and PowerShell commands that contain `git commit` | the commit, when `checkCommand` fails; Claude sees the last lines of its output |
| `protected-paths` | File edits by Claude, and Bash and PowerShell commands | edits to any path matching `protectedPaths` (`**` crosses folders; a pattern without `/` matches a file name anywhere), and commands that write, move or delete such a path: redirections (`>`, `>>`), `tee`, `cp`, `mv`, `rm`, `touch`, `sed -i`, `Set-Content`, `Add-Content`, `Out-File`, `New-Item`, `Remove-Item`, `Copy-Item`, `Move-Item` |

`.claude/agent-workflow.json` is itself protected, so Claude cannot loosen its own guardrails: edit it yourself. The living spec (`openspec/specs/`) is protected because only `openspec archive`, run by `/close-change`, should change it.

The hooks read the commands Claude runs and the files it edits through its edit tools. They are a guardrail against mistakes, not a security boundary: a write from inside a program (a `node -e` or `python -c` one-liner, or a script Claude writes) can still reach a protected file. `AGENTS.md` tells Claude to report a blocked action to you instead of working around it.

## 7. Troubleshooting

**A workflow command does not appear when I type `/`.** Restart Claude Code in the project folder. Check that `.claude/skills/<name>/SKILL.md` exists; if not, run the installer again.

**I see each Matt skill twice, such as `/to-spec` and `/mattpocock-skills:to-spec`.** You also have Matt's plugin installed globally. Use the short names: they are the project's copies, configured by the adapter. Plugin skills always carry the `plugin:` prefix, so the two never collide.

**Claude answers in the wrong language.** Check that `.claude/settings.local.json` holds `"language": "<your language>"` and restart Claude Code. Without it, a `language` in `~/.claude/settings.json` applies to every project, and it outranks what `CLAUDE.md` says. Run the installer again to set it, or add the line yourself.

**A skill behaves differently from this guide.** A skill with the same name in `~/.claude/skills/` (your personal skills) wins over the project's copy. Rename or remove the personal one.

**`/code-review` runs a different review.** Claude Code has a built-in `/code-review`; a project skill with the same name replaces it (the built-in stays available as `/review`). If you see the built-in, check that `.claude/skills/code-review/` exists.

**Claude says "agent-workflow git-guard: ... is a protected branch".** You are on `main`. The change branch is created by `/to-spec`; for work outside a change, create a branch yourself: `git switch -c <type>/<name>`.

**Claude says "agent-workflow quality-gate: ... failed".** The check command failed, so the commit was stopped. Claude sees the output and should fix the cause. Run the command yourself to see the full output. To change the command, edit `checkCommand` in `.claude/agent-workflow.json`.

**The hooks never fire.** Check that `.claude/settings.json` has the `hooks` section (run the installer again to add it), that `node --version` works in a new terminal, and on Windows that Git for Windows is installed. Run `/hooks` in Claude Code to see the hooks it loaded.

**`openspec validate <change> --strict` fails.** Read the message: the usual causes are a scenario written with three `#` instead of four, a requirement without a scenario, a requirement longer than 500 characters, or a missing `## Purpose` in a new capability. Ask Claude to fix it following `openspec instructions specs --change <change>`.

**`/implement` picks the wrong ticket.** Name it: `/implement <change>#N`. Check the `Blocked by:` lines in `tasks.md`: a ticket starts only when every box of its blockers is ticked.

**`/close-change` stops at "progress.remaining".** Some box in `tasks.md` is unticked, often the manual test. Run the `/implement <change>#N` it names to finish that ticket.

**A link to `../../references/<file>.md` in a skill is broken.** Run the installer again; it downloads the shared checklists for every Addy skill installed.

**The installer cannot download a checklist.** It prints the URL; download the file by hand into `.claude/references/`.

**`npx github:samfaina/agent-workflow` fails with `npm error could not determine executable to run`.** The version of the kit that npx downloaded has no `bin` entry in its `package.json`, so you named a branch or commit from before the kit could run with npx. Run it from `main`, without `#<branch>`.

**I want to undo the installation.** It is all in files: delete the `agent-workflow` blocks from `AGENTS.md` and `CLAUDE.md`, the `hooks` entries pointing at `.claude/hooks/agent-workflow/` from `.claude/settings.json`, and the folders and files listed in "What the installer creates". `git` shows exactly what the installation added.
