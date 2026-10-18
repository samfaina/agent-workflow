# Install third-party skills one by one, and exclude any skill that overlaps

Every third-party skill is installed individually with the Skills CLI and classified as core (always installed), optional (offered one by one by the installer) or excluded. A skill is excluded when it would drive the workflow, overlap a skill that already covers its topic, or fight the kit's own hooks and git rules. Most of these skills are model-invoked, so an installed overlapping skill triggers on its own and competes silently. The full classification, with a reason per skill, lives in `docs/what-gets-installed.md`.

## Consequences

- Non-obvious exclusions: `setup-matt-pocock-skills` (it would overwrite the adapter), `triage` and `wayfinder` (they need labels or tracker operations OpenSpec does not have), `implement-spec` (parallel worktrees on an integration branch, against one ticket per session), Addy's `constraint-driven-development` (its own quality gate) and `doubt-driven-development` (a trigger so broad it fires on every decision).
- Addy's skills link to shared checklists with `../../references/<file>.md`, so the installer also copies the checklists each installed Addy skill needs into `.claude/references/`.
