# Work too small for a spec is a light change, opened by a kit skill

A bug fix, a one-line change or a chore still needs a branch, a code review, external references and projection, so it goes through the workflow as a light change: an OpenSpec change whose `.openspec.yaml` declares `skip_specs: true`, with a short `proposal.md` and a `tasks.md` of one ticket. The kit's `light-change` skill opens it once the user approves the ticket, and `/implement <change>` and `/close-change` take it from there like any other change. Work qualifies only when it adds, modifies, removes or renames no requirement of the living spec and fits one ticket. The user decides; `now-what` may suggest it.

## Considered Options

- **`/implement` with a description and no change**: rejected. Matt's `implement` reads the adapter only when given a ticket reference and commits to the current branch, so the change would exist only after the work had started, through a rule in `AGENTS.md` and `git-guard`'s refusal.
- **`/to-spec` publishing a light change**: rejected. Its name promises a spec, and its own instructions (its template, agreeing test seams with the user) would contradict the adapter. The skill cannot be modified (ADR 0002).
- **Leaving the work outside the workflow** (ADR 0008 until now): rejected, because the work got no review, no roadmap and no projection.

## Consequences

- `light-change` is the kit's second workflow skill, after `close-change`, and a core skill. It refuses work that breaks either condition and points to `/grill-with-docs`.
- OpenSpec 1.14.3 accepts zero deltas under `skip_specs` in `validate --strict`, `instructions apply` and `archive`, as long as `schema:` is valid and nothing exists under `specs/`. A light change has no `design.md`, which OpenSpec needs neither to apply nor to archive, and no manual test ticket: a check by hand is one more acceptance criterion of its ticket.
- The opening is one commit holding the proposal and the ticket, so projection skips `spec-published` and starts at `tickets-published`. The status module reads `skip_specs` and marks the change as light in the roadmap and the snapshot.
- `close-change` keeps simplify, harden, archive, the pull request and projection. Its verification checks only that the ticket is done and that the living spec's scenarios still pass.
- When the work turns out to need a requirement or a second ticket, the agent stops and leaves a note. The change is promoted in place, keeping its name, branch and references: `/to-spec` removes `skip_specs` and writes delta specs and design, and `/to-tickets` rewrites `tasks.md`, keeping the finished work and adding the manual test ticket. A change is never demoted to light.
