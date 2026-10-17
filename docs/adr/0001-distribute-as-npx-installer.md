# Distribute the kit as an installer run with npx, not as a plugin

The kit ships as a dependency-free Node installer in this repository, run inside any project with `npx github:samfaina/agent-workflow init`. A Claude Code plugin cannot write per-project files (the adapter, `openspec/config.yaml`, hook settings), and it would have to bundle copies of third-party skills that then drift from upstream. A template repository only helps new projects, while the kit must also install into existing ones.

## Considered Options

- **Claude Code plugin**: rejected for the reasons above; plugin skills are also namespaced (`plugin:skill`), so the slash commands would not match the names the third-party skills call each other by.
- **Template repository**: rejected because it cannot be applied to an existing project.
- **Both**: rejected as two install paths to keep in sync for no gain.
