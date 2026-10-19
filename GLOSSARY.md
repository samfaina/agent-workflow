# Agent Workflow Kit

A reusable kit that sets up a spec-first development workflow for Claude Code in any project: Matt Pocock's skills run the workflow, OpenSpec stores its output, and Addy Osmani's skills act as specialists.

## The kit

**Kit**:
This repository: the installer, templates, hooks and own skills that set the workflow up in a project.
_Avoid_: framework, toolkit, plugin

**Target project**:
A project the kit is installed into.
_Avoid_: host project, consumer, client repo

**Source**:
One of the three upstream collections the kit draws from: Matt Pocock's skills, OpenSpec, Addy Osmani's skills.
_Avoid_: vendor, dependency

**Adapter**:
The document in a target project that tells Matt's skills how to read and write OpenSpec as if it were their issue tracker.
_Avoid_: bridge, shim, integration

## Changes and tickets

**Workflow**:
The fixed sequence of stages a change goes through: interview, spec, tickets, implementation (one ticket per session) and close.
_Avoid_: pipeline, process, flow

**Change**:
One unit of planned work, from spec to archive, stored as a folder of OpenSpec artifacts and named in kebab-case.
_Avoid_: feature, proposal, epic, PRD

**User story**:
A need described from a user's point of view, the usual starting point of a change; the spec turns each one into requirements.
_Avoid_: feature request, requirement

**Spec**:
The planning artifacts of a change (proposal, delta specs and design) produced by `/to-spec`.
_Avoid_: PRD, issue, requirements doc

**Delta spec**:
The requirements a change adds, modifies, removes or renames, written against the living spec.
_Avoid_: spec diff, patch

**Living spec**:
The specification of what the product does today, made by merging the delta specs of every archived change.
_Avoid_: main spec, source of truth, docs

**Ticket**:
A vertical slice of a change that can be built in one session and demoed or verified on its own.
_Avoid_: task, issue, story, step

**Acceptance criterion**:
One checkable statement a ticket must satisfy, together with how it is verified.
_Avoid_: subtask, todo

**Blocker**:
A ticket that must be done before another ticket can start.
_Avoid_: dependency, prerequisite

**Frontier ticket**:
The first ticket, in order, whose blockers are done and which still has an acceptance criterion left.
_Avoid_: current ticket, next task

**Roadmap**:
The list of a change's tickets, marking which are done, which is the frontier ticket and which remain.
_Avoid_: plan, progress bar

**Ticket reference**:
The name of a change, optionally followed by a ticket number, that identifies the work an agent should pick up.
_Avoid_: issue number, ticket ID

**Manual test**:
The last ticket of every change, in which a human exercises the finished behaviour by hand.
_Avoid_: QA ticket, smoke test

**Verification**:
Checking a finished change against its tickets, requirements, scenarios and design before it is archived.
_Avoid_: validation, review

**Archive**:
Retiring a finished change and merging its delta specs into the living spec.
_Avoid_: close, merge, done

**Pull request**:
The request, opened in the project's code host, to bring a change branch into a protected branch.
_Avoid_: merge request, PR

## Team tracker

**Team tracker**:
The tool where a team plans and follows its work outside the repository, such as Jira, Linear, GitHub Issues, Notion or a spreadsheet; never OpenSpec.
_Avoid_: issue tracker, board, PM tool

**Work item**:
One unit of work in the team tracker, whatever the tracker calls it: story, issue, card or row.
_Avoid_: issue, story, ticket, card

**External reference**:
The identifier of a work item exactly as the team writes it, such as `PROJ-123`, `#42`, `AB#987` or a URL.
_Avoid_: issue key, tracker id, link

**Progress snapshot**:
The whole state of a change at one moment (its stage, how many of its tickets are done, its external references), as the developer sees it or the team tracker receives it.
_Avoid_: status update, report, sync

**Projection**:
Posting a change's progress snapshots to the work items it references, in one direction only.
_Avoid_: sync, mirroring

## Skills

**Workflow skill**:
A skill that moves a change from one stage to the next; only Matt's skills and the kit's `close-change` play this role.
_Avoid_: driver, orchestrator

**Guide skill**:
A kit skill that reads where the work stands and recommends the next command, without moving any change itself.
_Avoid_: router, wizard, assistant

**Specialist skill**:
A skill that brings expertise on one topic (security, performance, accessibility…) when the work touches it, without driving the workflow.
_Avoid_: helper, plugin, addon

**Core skill**:
A skill the installer always installs, because the workflow depends on it.
_Avoid_: required skill, default skill

**Optional skill**:
A skill the installer offers one by one and installs only if accepted.
_Avoid_: extra, add-on

**Excluded skill**:
A third-party skill the kit never installs, because it would drive the workflow or overlap a skill that already covers its topic.
_Avoid_: banned, blacklisted

**Shared checklist**:
A reference document that several of Addy's skills link to, kept outside any single skill.
_Avoid_: reference, appendix

## Guardrails

**Protected branch**:
A branch the agent may never commit to directly.
_Avoid_: locked branch, main

**Protected path**:
A file or folder the agent may never edit directly.
_Avoid_: read-only file, locked file

**Quality gate**:
The project's check command, which must pass before the agent may commit.
_Avoid_: CI, pre-commit, linter
