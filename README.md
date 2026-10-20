# agent-workflow

A kit that sets up a spec-first workflow for Claude Code in any project:

```
/grill-with-docs → /to-spec <change> → /to-tickets <change> → /implement <change>#N → /close-change <change>
```

Work too small for a spec, a bug fix or a chore, takes a shorter path: `/light-change <description> → /implement <change> → /close-change <change>`.

[Matt Pocock's skills](https://github.com/mattpocock/skills) run the workflow, [OpenSpec](https://github.com/Fission-AI/OpenSpec) stores specs and tickets, and selected [Addy Osmani skills](https://github.com/addyosmani/agent-skills) act as specialists. The kit adds an adapter, `light-change` and `close-change` skills, a `now-what` skill that tells you the next command, git and quality-gate hooks, templates and an installer.

```powershell
npx github:samfaina/agent-workflow init
```

**Documentation: <https://samfaina.github.io/agent-workflow/>**

The same pages, readable on GitHub:

- [docs/how-it-works.md](docs/how-it-works.md): the workflow stage by stage, where things live, and why.
- [docs/what-gets-installed.md](docs/what-gets-installed.md): every file, skill and hook the installer adds.
- [docs/guide.md](docs/guide.md): install and daily flow.
- [docs/troubleshooting.md](docs/troubleshooting.md).

For maintainers:

- [docs/experiment-log.md](docs/experiment-log.md): the plan for a real run of the workflow; each run's results are in [docs/experiments/](docs/experiments/).
- [docs/adr/](docs/adr/) and [GLOSSARY.md](GLOSSARY.md): decisions and vocabulary.

Development: `npm test` runs the hook and installer tests. After editing `installer/skills.json`, run `node scripts/sync-skills-table.mjs`. For the docs site, run `npm install` once, then `npm run docs:dev` to preview it; GitHub Actions publishes it on every push to `main`.
