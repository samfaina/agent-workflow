#!/usr/bin/env node
// The progress snapshot of the project: where each active change stands and
// the next command. Reads git and the change files itself, never the openspec
// CLI (ADR 0010), so it stays fast and works where openspec is not installed.
//   node .claude/hooks/agent-workflow/status.mjs                the roadmap of each change
//   node .claude/hooks/agent-workflow/status.mjs --json         the snapshot as JSON
//   node .claude/hooks/agent-workflow/status.mjs --statusline   one line for Claude Code's status line
//   node .claude/hooks/agent-workflow/status.mjs --report       the text to paste into a team tracker
//   node .claude/hooks/agent-workflow/status.mjs --project <stage> <change>
//                                                               posts the snapshot to the change's work items
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { currentBranch, git, loadConfig, projectDirFor } from './shared.mjs';

// ---------------------------------------------------------------------------
// Tickets

// A checkbox line as OpenSpec counts it: any list marker, any indent, a box
// holding at most one character, of which only x or X means done. In the
// ticket format each box is an acceptance criterion, `- [ ] N.M <text>`.
const BOX = /^\s*(?:[-*+]|\d{1,9}[.)])\s*\[(?:\s*([^\]\s]?)\s*\](?![([])|\s+\])\s*(.*)/;

// Parses a change's tasks.md in the ticket format of the adapter
// (docs/agents/issue-tracker.md, "Ticket format").
export function parseTickets(text) {
  const tickets = [];
  let current = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(/^## (\d+)\. (.+)$/);
    if (heading) {
      current = { number: Number(heading[1]), title: heading[2].trim(), blockedBy: null, whatToBuild: false, boxes: [] };
      tickets.push(current);
      continue;
    }
    if (!current) continue;
    const blocked = line.match(/^Blocked by:\s*(.+)$/i);
    if (blocked) {
      current.blockedBy = /^none\b/i.test(blocked[1].trim()) ? [] : (blocked[1].match(/\d+/g) ?? []).map(Number);
    }
    if (/^What to build:/i.test(line)) current.whatToBuild = true;
    const box = line.match(BOX);
    if (box) {
      const id = box[2].match(/^(\d+)\.(\d+)\s+(.*)$/);
      current.boxes.push({ done: /^x$/i.test(box[1] ?? ''), group: id ? Number(id[1]) : null, item: id ? Number(id[2]) : null, text: id ? id[3] : box[2] });
    }
  }
  return tickets;
}

export const isDone = (ticket) => ticket.boxes.length > 0 && ticket.boxes.every((b) => b.done);

// A group with no `Blocked by:` line predates tickets: it is blocked by the group before it.
const blockersOf = (tickets, i) => tickets[i].blockedBy ?? (i > 0 ? [tickets[i - 1].number] : []);

// The frontier ticket: the first ticket whose blockers are done and that still has an unticked box.
export function frontier(tickets) {
  const byNumber = new Map(tickets.map((t) => [t.number, t]));
  return tickets.find((t, i) => !isDone(t) && blockersOf(tickets, i).every((n) => byNumber.has(n) && isDone(byNumber.get(n)))) ?? null;
}

// The progress of one change, from its tasks.md (null when it has none).
export function changeProgress(name, tasksMd) {
  const tickets = tasksMd === null ? [] : parseTickets(tasksMd);
  const byNumber = new Map(tickets.map((t) => [t.number, t]));
  const frontierTicket = frontier(tickets);
  const boxes = tickets.flatMap((t) => t.boxes);
  const stage = !tickets.length ? 'no-tickets' : tickets.every(isDone) ? 'finished' : 'tickets-open';
  return {
    name,
    stage,
    ticketsDone: tickets.filter(isDone).length,
    ticketsTotal: tickets.length,
    criteriaDone: boxes.filter((b) => b.done).length,
    criteriaTotal: boxes.length,
    tickets: tickets.map((t, i) => {
      const waitingOn = blockersOf(tickets, i).filter((n) => !byNumber.has(n) || !isDone(byNumber.get(n)));
      const state = isDone(t) ? 'done' : t === frontierTicket ? 'frontier' : waitingOn.length ? 'blocked' : 'ready';
      return { number: t.number, title: t.title, state, blockedBy: blockersOf(tickets, i), waitingOn };
    }),
    frontier: frontierTicket?.number ?? null,
    next: stage === 'no-tickets' ? `/to-tickets ${name}`
      : stage === 'finished' ? `/close-change ${name}`
      : `/implement ${name}${frontierTicket ? `#${frontierTicket.number}` : ''}`,
  };
}

// ---------------------------------------------------------------------------
// External references

// One YAML scalar: double-quoted, single-quoted, or plain up to a ` #` comment.
// A plain `#42` is a comment in YAML, so it reads as nothing.
function yamlScalar(text) {
  const double = text.match(/^\s*"((?:[^"\\]|\\.)*)"/);
  if (double) return double[1].replace(/\\(.)/g, '$1');
  const single = text.match(/^\s*'((?:[^']|'')*)'/);
  if (single) return single[1].replace(/''/g, "'");
  return text.replace(/(?:^|\s)#.*$/, '').trim();
}

// The external references of a change: the top-level list `x-external-references`
// of its .openspec.yaml (ADR 0009). OpenSpec's JSON leaves `x-` keys out, so the
// module reads the file itself. The adapter writes a block list; a flow list
// written by hand reads too.
export function parseExternalReferences(yaml) {
  const references = [];
  let inList = false;
  for (const line of (yaml ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const key = line.match(/^([A-Za-z_][\w-]*):(?:\s+(.*))?$/);
    if (key) {
      inList = key[1] === 'x-external-references';
      const flow = inList && key[2]?.match(/^\[(.*)\]/);
      if (flow) references.push(...(flow[1].match(/\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*')|[^,]+/g) ?? []).map(yamlScalar));
      continue;
    }
    const item = inList && line.match(/^\s*-(?:\s+(.*))?$/);
    if (item) references.push(yamlScalar(item[1] ?? ''));
  }
  return references.filter(Boolean);
}

// The branch a change lives on: the top-level `x-branch` of its .openspec.yaml,
// written once when the change opens (ADR 0012). A change made before that key
// existed lives on `change/<change>`. A branch name is never parsed back into a change.
export function changeBranch(name, yaml) {
  const line = (yaml ?? '').replace(/\r\n/g, '\n').match(/^x-branch:[ \t]*(.*)$/m);
  return (line && yamlScalar(line[1])) || `change/${name}`;
}

// A light change (ADR 0011): its .openspec.yaml declares `skip_specs: true`, so
// it has no delta specs and a single ticket.
const isLight = (yaml) => /^skip_specs:\s*true\s*(?:#.*)?$/m.test(yaml ?? '');

// ---------------------------------------------------------------------------
// The project

const INSTALL_COMMAND = 'npx github:samfaina/agent-workflow init';

const readIfExists = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);
// A change folder's .openspec.yaml, null when it has none.
const metadataIn = (dir) => readIfExists(path.join(dir, '.openspec.yaml'));
// The change name of an archive folder, `2026-10-01-add-greeting`, or undefined.
const archivedName = (folder) => /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(folder)?.[1];

// One change, from its tasks.md and .openspec.yaml: its progress, whether it is
// light, its external references and its branch.
const changeFrom = (name, tasksMd, metadata) => ({
  ...changeProgress(name, tasksMd),
  light: isLight(metadata),
  references: parseExternalReferences(metadata),
  branch: changeBranch(name, metadata),
});

// One change, read from its folder.
const readChange = (dir, name) => changeFrom(name, readIfExists(path.join(dir, 'tasks.md')), metadataIn(dir));

// A change's name as the developer and the team tracker see it, marking a light change.
const changeLabel = (change) => (change.light ? `${change.name} (light)` : change.name);

// The active changes: every folder under openspec/changes/ except archive/.
function activeChanges(projectDir) {
  const dir = path.join(projectDir, 'openspec', 'changes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'archive')
    .map((e) => e.name)
    .sort();
}

// Uncommitted paths, from `git status --porcelain -z`: a rename or copy is
// followed by its source path, which is skipped.
function dirtyPaths(projectDir) {
  const entries = (git(projectDir, 'status', '--porcelain', '-z', '--untracked-files=all') ?? '').split('\0');
  const paths = [];
  for (let i = 0; i < entries.length; i++) {
    if (!entries[i]) continue;
    paths.push(entries[i].slice(3));
    if (/^[RC]/.test(entries[i])) i++;
  }
  return paths;
}

// The paths a change may leave uncommitted, as the adapter's "Branch" section lists them.
const isChangeWork = (file) => /^openspec\/changes\/[^/]+\//.test(file) || isContextWork(file);
const isContextWork = (file) => file === 'GLOSSARY.md' || file.startsWith('docs/adr/');

// The folders under openspec/changes/archive/ at `ref`.
const archiveFolders = (projectDir, ref) => (git(projectDir, 'ls-tree', '-d', '--name-only', `${ref}:openspec/changes/archive`) ?? '')
  .split('\n').map((name) => name.trim()).filter(Boolean);

// A file of archive folder `folder` as it is on `branch`, null when it has none.
const showArchived = (projectDir, branch, folder, file) => git(projectDir, 'show', `${branch}:openspec/changes/archive/${folder}/${file}`);

// The archive folder on `branch` of the change that lives on it, among the
// archives `base` lacks (`onBase`), or null. It reads only the .openspec.yaml of those archives.
function archiveOn(projectDir, branch, onBase) {
  for (const folder of archiveFolders(projectDir, branch)) {
    const name = archivedName(folder);
    if (!name || onBase.has(folder)) continue;
    if (changeBranch(name, showArchived(projectDir, branch, folder, '.openspec.yaml')) === branch) return folder;
  }
  return null;
}

// The change waiting on `branch` to be handed over, as it is on that branch:
// the base's working tree has neither its tasks.md nor its .openspec.yaml until the branch is merged.
function readArchivedOn(projectDir, branch, base) {
  const folder = archiveOn(projectDir, branch, new Set(archiveFolders(projectDir, base)));
  const show = (file) => showArchived(projectDir, branch, folder, file);
  return changeFrom(archivedName(folder), show('tasks.md'), show('.openspec.yaml'));
}

// Branches not merged into `base` that hold the archive of the change living on
// them, an archive `base` does not have yet: /close-change has run, and the
// branch waits to be handed over. The candidates are the branches that start
// with the fixed part of the `branch` pattern, every branch when it starts with
// a placeholder, and change/* for changes named before the pattern. `pushed`
// reads the local remote-tracking branch, so it needs no network.
function pendingHandOvers(projectDir, base, remote, config) {
  if (!base) return [];
  const prefix = config.branch.split('{')[0];
  const globs = prefix ? [...new Set([`${prefix}*`, 'change/*'])] : [];
  const branches = (git(projectDir, 'branch', '--list', ...globs, '--no-merged', base, '--format=%(refname:short)') ?? '')
    .split('\n').filter((branch) => branch && !config.protectedBranches.includes(branch));
  const onBase = new Set(archiveFolders(projectDir, base));
  return branches.flatMap((branch) => {
    const folder = archiveOn(projectDir, branch, onBase);
    if (!folder) return [];
    const pushed = Boolean(remote && git(projectDir, 'rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`));
    return [{ change: archivedName(folder), branch, pushed }];
  });
}

// The progress snapshot: the state now-what walks, in its order, and the
// progress of every active change, the change of the current branch first.
export function readStatus(projectDir) {
  const config = loadConfig(projectDir);
  const branch = currentBranch(projectDir);
  const installed = existsSync(path.join(projectDir, 'openspec')) && existsSync(path.join(projectDir, '.claude', 'agent-workflow.json'));
  // Work items lag only behind a tracker the agent posts to.
  const ledger = (config.tracker?.via ?? 'none') === 'none' ? null : readLedger(ledgerFile(projectDir));
  const active = activeChanges(projectDir);
  const changes = active
    .map((name) => {
      const change = readChange(path.join(projectDir, 'openspec', 'changes', name), name);
      return { ...change, current: branch === change.branch, behind: ledger ? updatesBehind(change, ledger) : {} };
    })
    // The change in hand comes first; the sort is stable, so the rest keep name order.
    .sort((a, b) => b.current - a.current);
  const dirty = dirtyPaths(projectDir);
  const strayFiles = dirty.filter((file) => !isChangeWork(file));
  const base = config.protectedBranches.find((b) => git(projectDir, 'rev-parse', '--verify', '--quiet', `refs/heads/${b}`)) ?? null;
  const remotes = (git(projectDir, 'remote') ?? '').split('\n').filter(Boolean);
  const remote = remotes.includes('origin') ? 'origin' : remotes[0] ?? null;
  const handOvers = changes.length ? [] : pendingHandOvers(projectDir, base, remote, config);

  const [state, next] = !installed ? ['not-installed', INSTALL_COMMAND]
    : strayFiles.length ? ['stray-files', null]
    : !changes.length && dirty.some(isContextWork) ? ['context-lost', '/grill-with-docs']
    : changes.length ? [changes[0].stage, changes[0].next]
    : handOvers.length ? ['hand-over-pending', handOvers[0].pushed ? null : `/close-change ${handOvers[0].change}`]
    : ['nothing-in-flight', '/grill-with-docs'];
  return { state, next, branch, base, remote, changes, strayFiles, handOvers, archivedBehind: ledger ? archivedBehind(projectDir, ledger, active) : [] };
}

// ---------------------------------------------------------------------------
// Developer view

const MARKS = { done: '✓', frontier: '→', ready: '·', blocked: '·' };

// The roadmap of one change: its tickets, the frontier ticket with its command.
function changeRoadmap(change, marked) {
  const head = [
    changeLabel(change),
    change.stage === 'no-tickets' ? 'no tickets yet' : `${change.ticketsDone} of ${change.ticketsTotal} tickets done`,
    ...(change.references.length ? [change.references.join(', ')] : []),
  ].join(' · ');
  const lines = [marked ? `${head} (current branch)` : head];
  const labels = change.tickets.map((t) => `${t.number}. ${t.title}`);
  const width = Math.max(0, ...labels.map((l) => l.length)) + 2;
  change.tickets.forEach((t, i) => {
    const note = t.state === 'frontier' ? `(next: ${change.next})` : t.state === 'blocked' ? `(blocked by ${t.waitingOn.join(', ')})` : '';
    lines.push(`  ${MARKS[t.state]} ${note ? labels[i].padEnd(width) + note : labels[i]}`);
  });
  if (change.frontier === null) lines.push(`  next: ${change.next}`);
  return [...lines, ...behindLines(change.behind)].join('\n');
}

const behindLines = (behind) => Object.entries(behind)
  .map(([reference, n]) => `  ${reference}: ${n === null ? 'not posted yet' : `${n} update${n > 1 ? 's' : ''} behind`}`);

// The developer view: the roadmap of each active change and each archived
// change with work items behind, then what stands in the way or, with no
// change in flight, the next step.
export function formatRoadmap(status) {
  if (status.state === 'not-installed') return `agent-workflow is not installed in this project. Next: ${status.next}`;
  const blocks = status.changes.map((c) => changeRoadmap(c, c.current && status.changes.length > 1));
  for (const { name, behind } of status.archivedBehind ?? []) {
    blocks.push([`${name} · archived`, ...behindLines(behind), `  next: ${COMMAND} --project change-closed ${name} [--url <pull request>]`].join('\n'));
  }
  if (status.strayFiles.length) blocks.push(`Files changed outside a change: ${status.strayFiles.join(', ')}. Commit or stash them first.`);
  if (status.state === 'context-lost') blocks.push(`No change in flight, but GLOSSARY.md or docs/adr/ has uncommitted edits. Next: ${status.next}, then /to-spec <change>`);
  for (const h of status.handOvers) {
    blocks.push(h.pushed
      ? `${h.branch} waits for its pull request. Once it is merged: git switch ${status.base} && git pull`
      : `${h.branch} is archived and waits to be handed over. Next: /close-change ${h.change}`);
  }
  if (status.state === 'nothing-in-flight') blocks.push(`No change in flight. Next: ${status.next}`);
  return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------
// Snapshot to paste

const STAGE_LABELS = {
  'no-tickets': 'spec published, no tickets yet',
  'tickets-open': 'tickets open',
  finished: 'every ticket done, ready to close',
};

// The progress snapshot of one change as text to paste into a team tracker
// (ADR 0008): its name, stage, tickets done and external references. Nothing
// from the spec or the tickets leaves the repository.
export function formatSnapshot(change) {
  return [
    `Change: ${changeLabel(change)}`,
    `Stage: ${change.handOver ? `finished, ${change.handOver}` : STAGE_LABELS[change.stage]}`,
    `Tickets done: ${change.ticketsDone} of ${change.ticketsTotal}`,
    ...(change.references.length ? [`Work items: ${change.references.join(', ')}`] : []),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Projection

// The transitions after whose commit the agent projects (ADR 0008).
export const PROJECTION_STAGES = ['spec-published', 'tickets-published', 'ticket-done', 'change-closed'];
const COMMAND = 'node .claude/hooks/agent-workflow/status.mjs';
const NO_TRACKER = { via: 'none' };
const POST_TIMEOUT_MS = 60_000;

// A change's folder: the active one, else its latest archive once /close-change has archived it.
function changeDir(projectDir, name) {
  const changes = path.join(projectDir, 'openspec', 'changes');
  if (name !== 'archive' && existsSync(path.join(changes, name))) return path.join(changes, name);
  const archive = path.join(changes, 'archive');
  const dated = existsSync(archive) ? readdirSync(archive).filter((d) => archivedName(d) === name).sort() : [];
  return dated.length ? path.join(archive, dated.at(-1)) : null;
}

// The branch of change `name`, active or archived.
export function branchOf(projectDir, name) {
  const dir = changeDir(projectDir, name);
  return changeBranch(name, dir && metadataIn(dir));
}

const remoteOf = (projectDir) => {
  const remotes = (git(projectDir, 'remote') ?? '').split('\n').filter(Boolean);
  return remotes.includes('origin') ? 'origin' : remotes[0] ?? null;
};

// What a transition posts: only state, never spec or ticket content. `state` is
// the message without the change name, as the agent shows each post.
export function projectionSnapshot(change, stage, { url = '', remote = null } = {}) {
  const handOver = stage !== 'change-closed' ? null : url ? `pull request ${url}` : remote ? 'ready for review' : 'merged locally';
  const state = stage === 'spec-published' ? 'spec published'
    : handOver ? `finished, ${handOver}`
    : `${change.ticketsDone} of ${change.ticketsTotal} tickets done`;
  return { stage, done: change.ticketsDone, total: change.ticketsTotal, url, handOver, state, message: `${change.name}: ${state}` };
}

// The ledger keeps the last snapshot posted per change and reference, in git's
// common directory so every worktree shares it and it is never committed.
function ledgerFile(projectDir) {
  const common = git(projectDir, 'rev-parse', '--git-common-dir')?.trim();
  return common ? path.join(path.resolve(projectDir, common), 'agent-workflow', 'tracker.json') : null;
}

function readLedger(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function recordPost(file, name, reference, snapshot) {
  if (!file) return;
  const ledger = readLedger(file);
  ledger[name] = { ...ledger[name], [reference]: { stage: snapshot.stage, done: snapshot.done, total: snapshot.total, message: snapshot.message } };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
}

// How many transitions a work item has missed: each transition moves a change
// one step, from the spec (0) through the tickets published (1), each ticket
// done, and the hand-over of the archived change.
const position = ({ stage, done }) => (stage === 'spec-published' || stage === 'no-tickets' ? 0
  : stage === 'change-closed' ? 2 + done
  : 1 + done);

// Per reference, the transitions it missed, or null when it was never posted:
// one post carries the whole state, so a work item linked late is not counted
// behind for transitions that happened before it was linked.
export function updatesBehind(change, ledger) {
  const current = position({ stage: change.archived ? 'change-closed' : change.stage, done: change.ticketsDone });
  return Object.fromEntries(change.references
    .map((reference) => {
      const last = ledger[change.name]?.[reference];
      return [reference, last ? current - position(last) : null];
    })
    .filter(([, behind]) => behind === null || behind > 0));
}

// Archived changes the ledger knows of whose work items missed a post, most
// often the hand-over: no transition follows to catch them up.
function archivedBehind(projectDir, ledger, active) {
  return Object.keys(ledger)
    .filter((name) => !active.includes(name))
    .sort()
    .flatMap((name) => {
      const dir = changeDir(projectDir, name);
      if (!dir) return [];
      const change = { ...readChange(dir, name), archived: true };
      const behind = updatesBehind(change, ledger);
      return Object.keys(behind).length ? [{ name, behind }] : [];
    });
}

// One value quoted for the shell the command runs in: cmd.exe on Windows, sh elsewhere.
// cmd.exe still expands a defined %NAME% inside quotes; references and URLs rarely hold one.
export function shellQuote(value, platform = process.platform) {
  const text = String(value);
  return platform === 'win32' ? `"${text.replace(/"/g, '""')}"` : `'${text.replace(/'/g, "'\\''")}'`;
}

export function fillCommand(command, values, platform) {
  return command.replace(/\{(ref|change|stage|done|total|url|message|messageFile)\}/g, (_, key) => shellQuote(values[key] ?? '', platform));
}

// Runs the tracker command for one reference; the reason it failed, or null.
function postWithCommand(projectDir, command, values) {
  const messageDir = mkdtempSync(path.join(tmpdir(), 'agent-workflow-'));
  const messageFile = path.join(messageDir, 'message.txt');
  writeFileSync(messageFile, `${values.message}\n`);
  try {
    const result = spawnSync(fillCommand(command, { ...values, messageFile }), {
      cwd: projectDir, shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: POST_TIMEOUT_MS,
    });
    if (result.error) return result.error.code === 'ETIMEDOUT' ? `timed out after ${POST_TIMEOUT_MS / 1000} s` : result.error.message;
    if (result.status === 0) return null;
    const detail = result.stderr.split('\n').map((l) => l.trim()).find(Boolean);
    return `exit code ${result.status}${detail ? `: ${detail}` : ''}`;
  } finally {
    rmSync(messageDir, { recursive: true, force: true });
  }
}

// Projects a transition of change `name` onto its work items, through the
// `tracker` setting. Returns the text to show; '' when there is nothing to post.
// Never throws for a failed post: the workflow goes on, with the text to paste.
export function project(projectDir, { stage, name, url = '', posted = null }) {
  const dir = changeDir(projectDir, name);
  if (!dir) throw new Error(`No change named ${name}.`);
  const tracker = loadConfig(projectDir).tracker ?? NO_TRACKER;
  const change = readChange(dir, name);
  const snapshot = projectionSnapshot(change, stage, { url, remote: remoteOf(projectDir) });
  const ledger = ledgerFile(projectDir);
  const toPaste = formatSnapshot({ ...change, handOver: snapshot.handOver });
  if (posted !== null) {
    if (!change.references.includes(posted)) throw new Error(`${posted} is not an external reference of ${name}.`);
    recordPost(ledger, name, posted, snapshot);
    return `Posted to ${posted}: ${snapshot.state}`;
  }
  if (tracker.via === 'none' || !change.references.length) return '';
  const last = readLedger(ledger)[name] ?? {};
  const pending = change.references.filter((reference) => last[reference]?.message !== snapshot.message);
  if (!pending.length) return '';
  // One line per work item that missed the snapshot, then the text to paste into them.
  const withPaste = (lines, refs) => [...lines, `Paste this into ${refs.length > 1 ? 'them' : 'it'} instead:`, toPaste].join('\n');

  if (tracker.via === 'mcp' && tracker.server) {
    const urlOption = url ? ` --url ${shellQuote(url)}` : '';
    return [
      `Post to ${pending.join(', ')} with the \`${tracker.server}\` MCP server: ${snapshot.message}`,
      `After each post, run: ${COMMAND} --project ${stage} ${name}${urlOption} --posted "<reference>"`,
      'If a post fails, paste this into the work item instead:',
      toPaste,
    ].join('\n');
  }
  if (tracker.via !== 'cli' || typeof tracker.command !== 'string' || !tracker.command.trim()) {
    return withPaste([`Could not post to ${pending.join(', ')} (tracker in .claude/agent-workflow.json is not none, mcp:<server> or a command).`], pending);
  }
  const lines = [];
  const missed = [];
  for (const reference of pending) {
    const reason = postWithCommand(projectDir, tracker.command, {
      ref: reference, change: name, stage, done: snapshot.done, total: snapshot.total, url, message: snapshot.message,
    });
    if (reason) {
      missed.push(reference);
      lines.push(`Could not post to ${reference} (${reason}).`);
    } else {
      recordPost(ledger, name, reference, snapshot);
      lines.push(`Posted to ${reference}: ${snapshot.state}`);
    }
  }
  return missed.length ? withPaste(lines, missed) : lines.join('\n');
}

// ---------------------------------------------------------------------------
// Status line

// The change of the current branch on one line, for Claude Code's status line:
// `add-greeting · 2/4 · next #3`. Empty when no active change lives on the
// current branch. It runs after every message, so it reads only the branch, the
// .openspec.yaml of each active change and the tasks.md of the one it finds.
export function readStatusLine(projectDir) {
  const branch = currentBranch(projectDir);
  const changesDir = path.join(projectDir, 'openspec', 'changes');
  const name = branch && activeChanges(projectDir)
    .find((n) => changeBranch(n, metadataIn(path.join(changesDir, n))) === branch);
  if (!name) return '';
  const change = changeProgress(name, readIfExists(path.join(changesDir, name, 'tasks.md')));
  const progress = change.stage === 'no-tickets' ? 'no tickets' : `${change.ticketsDone}/${change.ticketsTotal}`;
  // The next command, without the change name the line starts with.
  const next = change.frontier === null ? change.next.split(' ')[0] : `#${change.frontier}`;
  return [name, progress, `next ${next}`].join(' · ');
}

// The session data Claude Code sends a status line on stdin; {} when run by hand.
function readSessionData() {
  if (process.stdin.isTTY) return {};
  try {
    return JSON.parse(readFileSync(0, 'utf8').trim() || '{}');
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Command

const USAGE = [
  'Usage: node .claude/hooks/agent-workflow/status.mjs [--json | --statusline | --report [<change>]]',
  `       node .claude/hooks/agent-workflow/status.mjs --project <${PROJECTION_STAGES.join(' | ')}> <change> [--url <url>] [--posted <reference>]`,
].join('\n');

// `--project <stage> <change> [--url <url>] [--posted <reference>]`, parsed; null when invalid.
function projectArgs(args) {
  try {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { url: { type: 'string' }, posted: { type: 'string' } } });
    const [stage, name] = positionals;
    if (positionals.length !== 2 || !PROJECTION_STAGES.includes(stage)) return null;
    return { stage, name, url: values.url ?? '', posted: values.posted ?? null };
  } catch {
    return null;
  }
}

// The snapshot of the change named, else of the current branch's change, else
// of every active change, else of every change waiting to be handed over.
function snapshotToPaste(projectDir, status, name) {
  if (status.state === 'not-installed') return formatRoadmap(status);
  const changes = name ? status.changes.filter((c) => c.name === name)
    : status.changes.some((c) => c.current) ? status.changes.filter((c) => c.current)
    : status.changes.length ? status.changes
    : status.handOvers.map((h) => ({
      ...readArchivedOn(projectDir, h.branch, status.base),
      handOver: h.pushed ? 'waits for its pull request' : 'waits to be handed over',
    }));
  if (name && !changes.length) return null;
  return changes.length ? changes.map(formatSnapshot).join('\n\n') : 'No change in flight.';
}

function main(args) {
  const projection = args[0] === '--project' ? projectArgs(args.slice(1)) : null;
  const valid = args[0] === '--project' ? projection !== null
    : args[0] === '--report' ? args.length <= 2 && !args[1]?.startsWith('-')
    : args.length <= 1 && args.every((a) => a === '--json' || a === '--statusline');
  if (!valid) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  // Claude Code's project, or the repository around the current folder.
  const findProjectDir = () => projectDirFor({ cwd: git(process.cwd(), 'rev-parse', '--show-toplevel')?.trim() });
  if (projection) {
    try {
      const text = project(findProjectDir(), projection);
      if (text) process.stdout.write(`${text}\n`);
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
    return;
  }
  if (args[0] === '--statusline') {
    // A status line gets no CLAUDE_PROJECT_DIR: its session data names the project.
    // No output leaves the status line blank.
    const line = readStatusLine(readSessionData().workspace?.project_dir || findProjectDir());
    if (line) process.stdout.write(`${line}\n`);
    return;
  }
  const projectDir = findProjectDir();
  const status = readStatus(projectDir);
  if (args[0] === '--report') {
    const text = snapshotToPaste(projectDir, status, args[1]);
    if (text === null) {
      process.stderr.write(`No active change named ${args[1]}.\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`${text}\n`);
    }
    return;
  }
  process.stdout.write(`${args[0] === '--json' ? JSON.stringify(status, null, 2) : formatRoadmap(status)}\n`);
}

// Run as a command, not imported by a test or a script.
function isEntryPoint() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isEntryPoint()) main(process.argv.slice(2));
