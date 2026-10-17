# A ticket is a numbered group in tasks.md

A ticket is one `## N. <title>` group in the change's `tasks.md`: a `Blocked by:` line, a short "What to build" paragraph, then its acceptance criteria as `- [ ] N.M` checkboxes, each saying how it is verified. Tickets are vertical tracer-bullet slices (as `to-tickets` wants), not OpenSpec's usual layer-by-layer groups, and the last group is always a manual test. This keeps the checkbox format OpenSpec parses for progress (`openspec list`, `openspec instructions apply`), and the rule is written into `rules.tasks` of `openspec/config.yaml` so `openspec instructions tasks` prints it.

## Considered Options

- **One file per ticket** (Matt's local-markdown tracker): rejected because OpenSpec only tracks progress in `tasks.md`.
- **Layer-by-layer groups** (OpenSpec's default): rejected because a slice of one layer cannot be demoed or verified on its own.
