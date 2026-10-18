# Docs site on VitePress, deployed by GitHub Actions

The docs site is built with VitePress from `docs/` and deployed to GitHub Pages by a GitHub Actions workflow, unlike `samfaina/agent-skills`, whose site is Jekyll with just-the-docs built by Pages from the branch. The kit is already a Node project, so VitePress adds no second toolchain. It gives a custom home page (the animated terminal is a Vue component) and local search without overriding a theme's layouts, and its build fails on dead links. The site uses the Rosé Pine palette (Main for dark, the default, and Dawn for light), because Shiki ships code themes for both modes and no custom one has to be kept. Headings are set in Space Grotesk, running text in Inter (VitePress's default) and code in JetBrains Mono.

## Considered options

- **Jekyll with just-the-docs, as in agent-skills.** Needs no Actions workflow, but a Ruby toolchain to preview locally, and the hand-built landing page has to be maintained against theme upgrades.
- **Tokyo Night palette.** The first choice, dropped once the site gained a light mode: Shiki has no Tokyo Night Day theme, so light-mode code would need a custom theme file.
- **Catppuccin palette.** The second choice, replaced by Rosé Pine after comparing every Shiki theme that VitePress bundles on a mock of the site.

## Consequences

- `docs/adr/`, `docs/agents/`, `docs/experiments/` and `docs/experiment-log.md` are excluded from the build. Pages link to them, and to `GLOSSARY.md`, by their GitHub URL.
- `vitepress` is a root `devDependency`. `npx github:samfaina/agent-workflow` does not install devDependencies, so the installer stays dependency-free.
- Space Grotesk and JetBrains Mono are `@fontsource` devDependencies, served with the site rather than from a font CDN; VitePress already ships Inter.
- Diagrams are Vue components that draw SVG from the theme's colors (`docs/.vitepress/theme/*Diagram.vue`), not Mermaid. A diagram change means editing its layout code, and pages read on GitHub show no diagram.
- The repository's Pages source must be set to "GitHub Actions".
