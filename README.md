# agent-workflow

A kit that sets up a spec-first workflow for Claude Code in any project:

```
/grill-with-docs → /to-spec <change> → /to-tickets <change> → /implement <change>#N → /close-change <change>
```

[Matt Pocock's skills](https://github.com/mattpocock/skills) run the workflow, [OpenSpec](https://github.com/Fission-AI/OpenSpec) stores specs and tickets, and selected [Addy Osmani skills](https://github.com/addyosmani/agent-skills) act as specialists. The kit adds an adapter, a `close-change` skill, git and quality-gate hooks, templates and an installer.

```powershell
npx github:samfaina/agent-workflow init
```

- [docs/guide.md](docs/guide.md): install, daily flow, every skill and why, troubleshooting.
- [docs/experiment-log.md](docs/experiment-log.md): the plan for a real run of the workflow; each run's results are in [docs/experiments/](docs/experiments/).
- [docs/adr/](docs/adr/) and [GLOSSARY.md](GLOSSARY.md): decisions and vocabulary.

Development: `npm test` runs the hook and installer tests. After editing `installer/skills.json`, run `node scripts/sync-guide.mjs`.
