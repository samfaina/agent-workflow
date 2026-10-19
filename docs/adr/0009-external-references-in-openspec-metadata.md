# External references live in `.openspec.yaml` and travel in commits and the pull request

A change's external references are a list under `x-external-references` in its `.openspec.yaml`, written by the adapter when `/to-spec` publishes the spec. OpenSpec 1.14.3 fails `validate --strict` on unknown keys in that file but accepts top-level `x-` keys as extensions and archives the file untouched, and one place avoids copies that drift. Every commit of the change carries one `External-Ref: <reference>` trailer per reference, next to `Refs: <change>#N`. The pull request title ends in ` (<references>)` and its body has a `Work items:` line. Integrations look in different places: Jira and Bitbucket read the branch, the commits and the pull request title; GitHub, GitLab and Azure Boards read commit messages and the pull request body; Linear reads the branch and the pull request.

## Considered Options

- **The reference in the branch name**: rejected. `#` is not valid there, and the adapter, `now-what` and `close-change` all rely on `change/<change>`.
- **Frontmatter or a `## Links` section in `proposal.md`**: both pass validation, but they mix metadata into the spec.
- **Closing keywords** (`Closes #42`, `Fixes`, `#close`): rejected. When a work item is split into several changes, the first merge would close it early; closing belongs to the team or its automation.

## Consequences

- OpenSpec's JSON output does not return `x-` keys, so the status module (ADR 0010) reads `.openspec.yaml` itself.
- A change without references is valid, and changes made before this setting keep working. A reference added later is a `docs(<change>): link <reference>` commit.
