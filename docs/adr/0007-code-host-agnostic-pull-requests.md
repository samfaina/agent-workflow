# Pull requests through a configured tool, not a code host the kit knows

`/close-change` hands a finished change over without assuming a code host. The `pullRequest` setting in `.claude/agent-workflow.json` says how: `none` (the default: Claude writes the title and body, and the user opens the pull request), a shell command with placeholders (`{base}`, `{branch}`, `{title}`, `{body}`, `{bodyFile}`), or an MCP server whose pull request tool Claude calls. In a project with no remote, it gives the commands for a local merge instead. Target projects live on GitHub, GitLab, Bitbucket, Azure DevOps or no host at all, and each host offers a CLI, an MCP server or nothing an agent can drive. Writing `gh` into the skill tied every project to GitHub. Knowing every host's CLI would mean the kit chasing each one's flags. A command template lets the project bring its own tool, and the MCP option covers hosts that have no CLI.

## Consequences

- The installer offers three presets: `gh` and `glab`, which it can also recognise from the remote to propose as the default, and Atlassian's MCP server for Bitbucket. Every other tool is typed by the user. The installer never installs a CLI or connects an MCP server: when one is missing it only says how in its next steps, so the kit does not track any host's install or connection details.
- The push stays the user's job unless `allowPush` is `true`. With a tool configured, `/close-change` asks before opening the pull request and checks with `git ls-remote` that the branch reached the remote.
- No hook guards the pull request command: the explicit question and Claude Code's permission prompt cover it, and a hook per host's CLI would bring back the coupling this decision removes.
- A missing `pullRequest` means `none`, so projects installed before this setting keep working; running the installer again adds it and keeps the rest of the file.
