# Docs site on VitePress, deployed by GitHub Actions

The docs site is built with VitePress from `docs/` and deployed to GitHub Pages by a GitHub Actions workflow, unlike `samfaina/agent-skills`, whose site is Jekyll with just-the-docs built by Pages from the branch. The kit is already a Node project, so VitePress adds no second toolchain. It gives a custom home page (the animated terminal is a Vue component) and local search without overriding a theme's layouts, and its build fails on dead links. The site uses the Catppuccin palette (Mocha for dark, the default, and Latte for light), because Shiki ships code themes for both modes and no custom one has to be kept.

## Considered options

- **Jekyll with just-the-docs, as in agent-skills.** Needs no Actions workflow, but a Ruby toolchain to preview locally, and the hand-built landing page has to be maintained against theme upgrades.
- **Tokyo Night palette.** The first choice, dropped once the site gained a light mode: Shiki has no Tokyo Night Day theme, so light-mode code would need a custom theme file.

## Consequences

- `docs/adr/`, `docs/agents/`, `docs/experiments/` and `docs/experiment-log.md` are excluded from the build. Pages link to them, and to `GLOSSARY.md`, by their GitHub URL.
- `vitepress` is a root `devDependency`. `npx github:samfaina/agent-workflow` does not install devDependencies, so the installer stays dependency-free.
- The repository's Pages source must be set to "GitHub Actions".
