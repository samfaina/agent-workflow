# Run 4

The fourth real run of [the plan](../experiment-log.md), on a fresh trial project with the fixes from [run 3](run-3.md). Issue: #15.

## Must cover

What run 3 left untested live:

- [ ] The guardrails in the last build ticket's session, before its `check implement` (step 5), with all three hooks reported there
- [ ] The manual test ticket kept to about five steps: the main path, one failure, and what only a person can judge (fix 2 of run 3)
- [ ] Claude giving the manual steps on its own as one block for the user's shell (fresh setup, each command, its output and its exit code), ending with a direct question asking for that output, so the first check passes the question test (fix 3). If the first message already has the block, skip step 3 of section 6 and note it here
- [ ] No tdd and no code-review in the manual test session, while every build ticket still runs both (fix 4)
- [ ] The whole run from the kit's main checkout, with every check in one `.sandbox/results/run-4.md` (fix 5)
- [ ] Every message to the user in Spanish after every `/clear`, short notes between tool calls included (fix 6)

## Results

| Step | Result (ok / failed / partly) | Notes: what happened instead, exact messages |
| --- | --- | --- |
| 1. Set up | | |
| 2. grill-with-docs + to-spec | | |
| 3. to-tickets | | |
| 4. implement (per build ticket) | | |
| 5. guardrails | | |
| 6. manual test ticket | | |
| 7. close-change | | |

## Fixes after this run
