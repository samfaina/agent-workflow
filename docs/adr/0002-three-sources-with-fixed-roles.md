# Three sources with fixed roles, joined by documents only

Matt Pocock's skills drive the workflow (`/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement` → `/close-change`), OpenSpec is the storage for specs and tickets, and Addy Osmani's skills are specialists that are consulted but never drive the flow. The sources are joined only through documents the skills already read (the adapter, `AGENTS.md`, `CLAUDE.md`, `openspec/config.yaml`), and no third-party skill is ever modified, so every skill can be updated from upstream with `npx skills update`.

## Consequences

- OpenSpec is initialised with `--tools none`: its `/opsx:*` commands and their model-invoked skills are not installed, because they would compete with `to-spec` and `implement`.
- Addy's slash commands, agents, hooks and plugin are never installed, only individual skills.
- Matt's skills believe they talk to an issue tracker; the adapter is what makes that tracker OpenSpec.
