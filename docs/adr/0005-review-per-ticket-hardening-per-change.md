# Code review per ticket, simplification, security and verification per change

`/implement` already runs Matt's `code-review` on each ticket's diff, so `/close-change` does not run it again. Instead it runs `code-simplification` and `security-and-hardening` on the whole change's diff, then verifies the change against its specs, then archives it. Verification is written into `close-change` itself, built on `openspec instructions apply --json`, because OpenSpec's own verify skill is only generated from a machine-wide OpenSpec profile, which the kit must not change.

## Consequences

- Commits carry `Refs: <change>#N` so `code-review` can find the spec a ticket came from.
