# agent-workflow guide

This guide takes you from nothing to a finished change in a project of your own. Follow it top to bottom the first time; every command is written out.

The kit sets up one workflow in Claude Code:

<SessionDiagram />

- **Matt Pocock's skills** run the workflow: the interview, the spec, the tickets, the implementation and the code review.
- **OpenSpec** stores what they produce: each piece of work is a **change** in `openspec/changes/<change>/`, and finished changes merge into the **living spec** in `openspec/specs/`, the description of what your product does today.
- **Addy Osmani's skills** are specialists (security, performance, accessibility...). Claude reaches for them when the work touches their topic; they never drive the workflow.

[How it works](./how-it-works.md) explains the model behind these steps, and [What gets installed](./what-gets-installed.md) lists every file, skill and hook the installer adds. The words in bold are defined in [`GLOSSARY.md`](https://github.com/samfaina/agent-workflow/blob/main/GLOSSARY.md). The reasons behind the design are in [`docs/adr/`](https://github.com/samfaina/agent-workflow/tree/main/docs/adr).

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
3. **OpenSpec CLI**:
   ```powershell
   npm install -g @fission-ai/openspec@latest
   openspec --version
   ```
4. **Claude Code**, signed in. Check it with `claude --version`.
5. Optional: **your code host's CLI or MCP server**, signed in, if you want Claude to open pull requests for you. Any code host works: GitHub (`gh`), GitLab (`glab`), Bitbucket, Azure DevOps, Gitea or none at all. Git needs credentials for your remote to push, whichever host it is.

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
2. Create a branch for the installation, so it reaches `main` the same way as everything else:
   ```powershell
   git switch -c chore/install-agent-workflow
   ```
3. Run the installer:
   ```powershell
   npx github:samfaina/agent-workflow init
   ```
   `npx` downloads the kit from GitHub into npm's cache and runs it from there: you need no clone and no GitHub sign-in. The first time, it asks whether to install the package; answer `y`, or put `--yes` after `npx`. To try a branch of the kit before it reaches `main`, add `#<branch>` to the repository: `npx github:samfaina/agent-workflow#<branch> init`.
4. Answer the questions. Each one lists numbered choices with the default marked `›`: type a number, or press Enter to take the default. The "Other…" choices ask for the text on the next line; leave it empty to go back to the list.
   - **Language**: the language Claude talks to you in: English, Spanish or another one. The installer saves it as the `language` setting in `.claude/settings.local.json`, your personal settings for this project, which git ignores. It wins over a `language` you may have set for all projects in `~/.claude/settings.json`. Everything written to the repository stays in English.
   - **Check command**: the command that proves the project works, such as `npm test`, `npm run lint && npm test`, `pytest` or `dotnet test`. The quality gate runs it before every commit. The installer proposes `npm test` when `package.json` has a test script; choose "None" if the project has no checks yet. You can set it later in `.claude/agent-workflow.json`.
   - **Pull requests**: how `/close-change` opens them: GitHub (`gh`), GitLab (`glab`), Bitbucket (Atlassian's MCP server), another MCP server connected to Claude Code, a command of your own, or "None" to open them yourself in your code host. When your remote is on GitHub or GitLab and its CLI is installed, that host is the default. If the CLI is missing or you pick an MCP server, the installer adds how to install or connect it to its next steps. [What gets installed](./what-gets-installed.md#pull-requests) lists the placeholders for your own command.
   - **Branch names**: how the branch of each new change is named: `change/{change}` (the default), `feature/{ref}-{change}` for gitflow with work items, or a pattern of your own using `{change}`, `{ref}` and `{user}`. When it uses `{user}`, the installer also asks for your value. See [Gitflow and work items in branch names](#gitflow-and-work-items-in-branch-names).
   - **Team tracker**: how Claude posts each change's progress to the work items it references. Type `none` (the default), `mcp:<server>` for an MCP server connected to Claude Code, or a command of your own, such as `my-tracker comment {ref} --body-file {messageFile}`. The installer lists the servers in `.mcp.json` as hints, and before accepting anything but `none` it shows what a post will look like. [What gets installed](./what-gets-installed.md#team-tracker) lists the placeholders.
   - **Optional skills**: one list with the reason for each skill. Type the numbers of the topics your project touches, separated by commas, `all`, or press Enter for none. You can run the installer again later to add more.
   - **Status line**: whether Claude Code's status line shows where the change of the current branch stands, such as `add-greeting · 2/4 · next #3`. The default is yes. The installer saves it in `.claude/settings.local.json`, so your team does not get it. If you have a status line of your own in `~/.claude/settings.json`, it asks instead whether to use the kit's in this project only, with no as the default ([Status line](./what-gets-installed.md#status-line)).
5. Look at what it created and commit it:
   ```powershell
   git status
   git add -A
   git commit -m "chore: install agent-workflow"
   ```
6. Push the branch, open a pull request into `main` in your code host and merge it:
   ```powershell
   git push -u origin chore/install-agent-workflow
   ```
   With no remote, merge it locally instead: `git switch main`, then `git merge --no-ff chore/install-agent-workflow`.
7. Close Claude Code if it is open and start it again in the project folder (`claude`), so it loads the new skills and hooks. Type `/` and check that `/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement`, `/close-change`, `/light-change` and `/now-what` appear.

The installer never overwrites an existing file without asking. Run it again at any time: files that already match are left alone.

### Options for automation

```powershell
npx github:samfaina/agent-workflow init --yes --language Spanish --check "npm test" --pull-request none --tracker none --optional none
```

`--yes` accepts every default and keeps every existing file. It leaves out the status line, a personal preference. `--pull-request` takes `none`, `github`, `gitlab`, `bitbucket` (Atlassian's MCP server, named `atlassian`), `mcp:<server>`, or a command in quotes. `--branch` takes a branch pattern in quotes, and `--user` your value for `{user}`. `--tracker` takes `none`, `mcp:<server>`, or a command in quotes. `--optional` takes `all`, `none`, or skill names separated by commas.

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
   - **"... is installed but excluded by the kit"**: remove that skill with `npx skills remove <name>`; [What gets installed](./what-gets-installed.md#skills) says why.
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

The workflow commands only run when you type them; Claude never starts them on its own. When you are not sure which one comes next, type `/now-what`: Claude reads the conversation and the repository and answers with the next command, why, and whether to start a fresh session first. It changes nothing itself. [Example](./example.md) follows one user story through every step, with the files each one leaves behind.

### 4.1 `/grill-with-docs`: decide what to build

Describe the idea after the command, for example `/grill-with-docs add a "remove" command that deletes a to-do by its id`. Claude interviews you in rounds of numbered questions, each with its recommendation. Answer each one ("yes" accepts the recommendation). Along the way it adds terms to `GLOSSARY.md` and records hard-to-reverse decisions in `docs/adr/`. It is finished when Claude says there is nothing left to decide.

### 4.2 `/to-spec <change>`: publish the spec

In the **same session**, so it can use the interview, type `/to-spec remove-todo`. The change name is kebab-case and starts with a verb. Claude:

1. creates the branch `change/remove-todo`;
2. confirms with you the **seams** where tests will go;
3. writes `proposal.md`, the delta specs and `design.md` in `openspec/changes/remove-todo/`;
4. runs `openspec validate remove-todo --strict` until it passes;
5. commits the spec.

Check it yourself with `openspec show remove-todo`.

### 4.3 `/to-tickets <change>`: break it into tickets

In a **fresh session**, type `/to-tickets remove-todo`. Claude proposes a numbered list of tickets: each is a vertical slice you could demo on its own, with the tickets that block it. Adjust the breakdown until it feels right, then approve it. Claude writes them into `tasks.md` (the last ticket is always a manual test for you) and commits.

Claude ends by showing the change's **roadmap**: its tickets, which are done, which comes next with its command, and what blocks the rest. Print it yourself at any time from the project folder:

```bash
npm run workflow:status        # the script the installer added to package.json
node .claude/hooks/agent-workflow/status.mjs   # the same, without package.json
```

```
remove-todo · 2 of 4 tickets done
  ✓ 1. Remove a to-do by id
  ✓ 2. Reject unknown ids
  → 3. Confirm before removing  (next: /implement remove-todo#3)
  · 4. Manual test              (blocked by 3)
```

With several changes in flight it shows each one, the change of the current branch first. Add `--json` for the same snapshot as JSON, for scripts.

If you accepted the status line when installing, Claude Code shows the short form under the prompt while you are on `change/remove-todo`, and it updates after every message:

```
remove-todo · 2/4 · next #3
```

### 4.4 `/implement <change>#N`: build one ticket

In a **fresh session** for every ticket, type `/implement remove-todo#1`, then `#2` and so on: `/to-tickets` shows the roadmap, and each ticket ends by showing it again with the next command. Without a number, `/implement remove-todo` picks the first ticket whose blockers are done. Claude states the ticket's title, builds it test-first, runs `code-review` on its work and shows its `## Standards` and `## Spec` reports, ticks the ticket's boxes, and commits with `Refs: remove-todo#N`. The quality gate runs your check command before the commit.

Repeat until the next ticket is the manual test: Claude lists its few steps and gives them as one block for your shell. You run the block, paste back what it printed, and Claude ticks the boxes whose result matches.

### 4.5 `/close-change <change>`: finish it

In a **fresh session**, type `/close-change remove-todo`. Claude checks every box is ticked, simplifies the change's code (`code-simplification`), audits it for security problems (`security-and-hardening`), verifies it against its requirements and scenarios, and archives it: the delta specs merge into `openspec/specs/`, and the change moves to `openspec/changes/archive/`. It stops and tells you when something must be fixed first.

It finishes by handing the branch over. It writes the pull request's title and body, then follows the first of these that applies:

- **No remote**: it gives you `git switch main` and `git merge --no-ff change/remove-todo` to merge the change yourself.
- **`pullRequest` is `none`**: it gives you `git push -u origin change/remove-todo`. You open the pull request in your code host and paste the title and body.
- **`pullRequest` names a CLI or an MCP server**: it gives you the push command and asks whether to open the pull request. Push with `! git push -u origin change/remove-todo` and say yes; Claude checks the branch reached the remote, opens the pull request and shows its URL.

Review the pull request in your code host and merge it.

### Link a change to your team tracker

When your team plans its work in Jira, Linear, GitHub Issues, Azure Boards or any other tool, link the change to the **work items** it serves. Name each one by its **external reference**, written as your team writes it: `PROJ-123`, `#42`, `AB#987`, `ENG-7` or a URL.

- **From the start**: give the reference to the interview, for example `/grill-with-docs PROJ-123`. Claude reads the work item's title and description through the `tracker` channel, or asks you to paste them when there is none, interviews you from there, and `/to-spec` writes the reference into the change.
- **Later**: ask Claude to link `PROJ-123` to the change, or add it yourself to `openspec/changes/<change>/.openspec.yaml` and commit `docs(<change>): link PROJ-123`.

```yaml
x-external-references:
  - "PROJ-123"
  - "#42"
```

Quote every reference: in YAML an unquoted `#42` is a comment. A change can have several references, and several changes can share one. The kit never creates work items.

From then on:

- every commit of the change carries one `External-Ref: PROJ-123` trailer per reference, after `Refs: remove-todo#N`;
- the roadmap names them in its header: `remove-todo · 2 of 4 tickets done · PROJ-123`;
- `/close-change` ends the pull request title with ` (PROJ-123)` and adds a `Work items: PROJ-123` line to its body.

It never writes `Closes`, `Fixes` or `#close`: when a work item is split across several changes, the first merge would close it. Closing it stays with your team.

The kit needs no credentials: your tracker's own integration with your code host links the work once the branch is pushed. Each one looks in a different place:

| Team tracker | Finds the reference in |
| --- | --- |
| Jira (with Bitbucket, GitHub or GitLab) | the commit messages and the pull request title |
| GitHub Issues, GitLab issues | the commit messages and the pull request body, as a mention that closes nothing |
| Azure Boards | `AB#987` in the commit messages and the pull request body |
| Linear | the pull request title and body |
| A tracker with no integration, or a spreadsheet | nothing: paste the snapshot below |

For a tracker that nothing reaches, print the change's snapshot and paste it into the work item:

```bash
npm run workflow:status -- --report
```

```
Change: remove-todo
Stage: tickets open
Tickets done: 2 of 4
Work items: PROJ-123
```

On a change branch it prints that change; elsewhere, every change in flight, or the one you name with `--report remove-todo`. It holds only the name, the stage, the tickets done and the references: nothing from the spec or the tickets leaves the repository.

### Post progress to the work items

With a `tracker` channel set, Claude posts the change's snapshot to each work item it references, right after the spec, the tickets, each finished ticket and the hand-over: `remove-todo: 2 of 4 tickets done`. It shows each post and does not ask, since choosing the channel was the permission:

```
Posted to PROJ-123: 2 of 4 tickets done
```

The channel is whatever reaches your tracker. One example of each kind:

```json
"tracker": { "via": "mcp", "server": "<the server's name in Claude Code>" }
"tracker": { "via": "cli", "command": "my-tracker comment {ref} --body-file {messageFile}" }
```

When a post fails, Claude says so, gives you the snapshot to paste, and the workflow goes on. A snapshot already posted is not posted again, and the next one covers a missed one. The roadmap shows a work item that is behind, `PROJ-123: 2 updates behind`, and keeps an archived change there until its hand-over is posted. The kit never moves a work item's state; a command of your own may, from `{stage}`. [What gets installed](./what-gets-installed.md#team-tracker) has the details.

### Gitflow and work items in branch names

Every change gets its own branch, `change/<change>` by default. A team on gitflow, or whose code host links work items by the key in the branch name, sets two keys in `.claude/agent-workflow.json` instead:

```json
"protectedBranches": ["develop", "main"],
"branch": "feature/{ref}-{change}"
```

- `protectedBranches` lists the branches that receive work only through a pull request. The first one that exists is the base: changes branch off `develop` and their pull requests go back into it.
- `branch` is the pattern for the name of each new change's branch. `{change}` is the change name, `{ref}` its first external reference as written, and `{user}` your own value. `feature/{ref}-{change}` gives `feature/PROJ-123-remove-todo`, which Jira picks up through Bitbucket.

`agent-workflow.json` is shared, so a per-developer part of the name comes from each clone's git config. With `"branch": "{ref}__{change}--{user}"`, each developer runs once:

```powershell
git config agent-workflow.user SF
```

and their branches look like `PROJ-123__remove-todo--SF`. The installer runs it for you when the pattern uses `{user}`; when the value is missing, Claude asks for it the first time it opens a change.

Claude names the branch once, when `/to-spec` or `/light-change` opens the change, and keeps the name in the change's `.openspec.yaml` as `x-branch`. Linking a work item later, or changing the pattern, renames no branch. When the pattern uses `{ref}` and the change has no external reference, Claude stops and asks you for the reference, or for the branch name itself. A name git rejects, such as one made from a URL, stops it too: give the reference in a shorter form, or the branch name by hand.

### Outside a change

- **Work too small for a spec**: a bug fix, a one-line change or a chore that changes no requirement of the living spec and fits one ticket. Type `/light-change <what to do>`, or give it an external reference: `/light-change PROJ-123`. Claude checks both conditions against `openspec/specs/`, proposes a change name, a two-section proposal and one ticket, and once you approve them, commits them on the change's branch (`change/<change>` by default). Then `/implement <change>` and `/close-change <change>`, each in a fresh session, as for any change. The roadmap marks it `fix-typo (light) · 0 of 1 tickets done`. There is no manual test ticket: a check by hand is one more box of the ticket. When Claude refuses because the work needs a requirement or more than one ticket, start from `/grill-with-docs`. When that turns out midway, Claude stops and leaves a note: run `/to-spec <change>` and `/to-tickets <change>` to promote it, keeping its name, branch and references.
- **A bug**: describe it and say "diagnose this"; `diagnosing-bugs` builds a failing loop before guessing at causes. For a fix worth a spec, run the flow from `/grill-with-docs`.
- **A design question**: ask for a prototype; `prototype` builds a throwaway one.
- **A review of any branch**: `/code-review main`.
