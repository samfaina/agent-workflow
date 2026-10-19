#!/usr/bin/env node
// The progress snapshot of the project: where each active change stands and
// the next command. Reads git and the change files itself, never the openspec
// CLI (ADR 0010), so it stays fast and works where openspec is not installed.
//   node .claude/hooks/agent-workflow/status.mjs           the roadmap of each change
//   node .claude/hooks/agent-workflow/status.mjs --json    the snapshot as JSON
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentBranch, loadConfig } from './shared.mjs';

// ---------------------------------------------------------------------------
// Tickets

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
    const box = line.match(/^- \[([ xX])\] (\d+)\.(\d+) (.+)$/);
    if (box) current.boxes.push({ done: box[1].toLowerCase() === 'x', group: Number(box[2]), item: Number(box[3]), text: box[4] });
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
export function changeProgress(name, tasks) {
  const tickets = tasks === null ? [] : parseTickets(tasks);
  const byNumber = new Map(tickets.map((t) => [t.number, t]));
  const next = frontier(tickets);
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
      const state = isDone(t) ? 'done' : t === next ? 'frontier' : waitingOn.length ? 'blocked' : 'ready';
      return { number: t.number, title: t.title, state, blockedBy: blockersOf(tickets, i), waitingOn };
    }),
    frontier: next?.number ?? null,
    next: stage === 'no-tickets' ? `/to-tickets ${name}`
      : stage === 'finished' ? `/close-change ${name}`
      : `/implement ${name}${next ? `#${next.number}` : ''}`,
  };
}

// ---------------------------------------------------------------------------
// The project

export const INSTALL_COMMAND = 'npx github:samfaina/agent-workflow init';

const readIfExists = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

// The output of a git command, or null when it fails (no repository, no such ref).
function git(dir, ...args) {
  try {
    return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

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

// Change branches not merged into `base` whose change is archived on the branch:
// /close-change has run, and the branch waits to be handed over. `pushed` reads
// the local remote-tracking branch, so it needs no network.
function pendingHandOvers(projectDir, base, remote) {
  if (!base) return [];
  const branches = (git(projectDir, 'branch', '--list', 'change/*', '--no-merged', base, '--format=%(refname:short)') ?? '').split('\n').filter(Boolean);
  return branches.flatMap((branch) => {
    const change = branch.slice('change/'.length);
    const archived = (git(projectDir, 'ls-tree', '-d', '--name-only', `${branch}:openspec/changes/archive`) ?? '').split('\n');
    if (!archived.some((name) => /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(name.trim())?.[1] === change)) return [];
    const pushed = Boolean(remote && git(projectDir, 'rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`));
    return [{ change, branch, pushed }];
  });
}

// The progress snapshot: the state now-what walks, in its order, and the
// progress of every active change, the change of the current branch first.
export function readStatus(projectDir) {
  const config = loadConfig(projectDir);
  const branch = currentBranch(projectDir);
  const installed = existsSync(path.join(projectDir, 'openspec')) && existsSync(path.join(projectDir, '.claude', 'agent-workflow.json'));
  const changes = activeChanges(projectDir)
    .map((name) => ({ ...changeProgress(name, readIfExists(path.join(projectDir, 'openspec', 'changes', name, 'tasks.md'))), current: branch === `change/${name}` }))
    // The change in hand comes first; the sort is stable, so the rest keep name order.
    .sort((a, b) => b.current - a.current);
  const dirty = dirtyPaths(projectDir);
  const strayFiles = dirty.filter((file) => !isChangeWork(file));
  const base = config.protectedBranches.find((b) => git(projectDir, 'rev-parse', '--verify', '--quiet', `refs/heads/${b}`)) ?? null;
  const remotes = (git(projectDir, 'remote') ?? '').split('\n').filter(Boolean);
  const remote = remotes.includes('origin') ? 'origin' : remotes[0] ?? null;
  const handOvers = changes.length ? [] : pendingHandOvers(projectDir, base, remote);

  const [state, next] = !installed ? ['not-installed', INSTALL_COMMAND]
    : strayFiles.length ? ['stray-files', null]
    : !changes.length && dirty.some(isContextWork) ? ['context-lost', '/grill-with-docs']
    : changes.length ? [changes[0].stage, changes[0].next]
    : handOvers.length ? ['hand-over-pending', handOvers[0].pushed ? null : `/close-change ${handOvers[0].change}`]
    : ['nothing-in-flight', '/grill-with-docs'];
  return { state, next, branch, base, remote, changes, strayFiles, handOvers };
}

// ---------------------------------------------------------------------------
// Developer view

const MARKS = { done: '✓', frontier: '→', ready: '·', blocked: '·' };

// The roadmap of one change: its tickets, the frontier ticket with its command.
function changeRoadmap(change, marked) {
  const head = change.stage === 'no-tickets' ? `${change.name} · no tickets yet` : `${change.name} · ${change.ticketsDone} of ${change.ticketsTotal} tickets done`;
  const lines = [marked ? `${head} (current branch)` : head];
  const labels = change.tickets.map((t) => `${t.number}. ${t.title}`);
  const width = Math.max(0, ...labels.map((l) => l.length)) + 2;
  change.tickets.forEach((t, i) => {
    const note = t.state === 'frontier' ? `(next: ${change.next})` : t.state === 'blocked' ? `(blocked by ${t.waitingOn.join(', ')})` : '';
    lines.push(`  ${MARKS[t.state]} ${note ? labels[i].padEnd(width) + note : labels[i]}`);
  });
  if (change.frontier === null) lines.push(`  next: ${change.next}`);
  return lines.join('\n');
}

// The developer view: the roadmap of each active change, then what stands in
// the way or, with no change in flight, the next step.
export function formatRoadmap(status) {
  if (status.state === 'not-installed') return `agent-workflow is not installed in this project. Next: ${INSTALL_COMMAND}`;
  const blocks = status.changes.map((c) => changeRoadmap(c, c.current && status.changes.length > 1));
  if (status.strayFiles.length) blocks.push(`Files changed outside a change: ${status.strayFiles.join(', ')}. Commit or stash them first.`);
  if (status.state === 'context-lost') blocks.push('No change in flight, but GLOSSARY.md or docs/adr/ has uncommitted edits. Next: /grill-with-docs, then /to-spec <change>');
  for (const h of status.handOvers) {
    blocks.push(h.pushed
      ? `${h.branch} waits for its pull request. Once it is merged: git switch ${status.base} && git pull`
      : `${h.branch} is archived and waits to be handed over. Next: /close-change ${h.change}`);
  }
  if (status.state === 'nothing-in-flight') blocks.push('No change in flight. Next: /grill-with-docs');
  return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------
// Command

const USAGE = 'Usage: node .claude/hooks/agent-workflow/status.mjs [--json]';

// The project the command runs in: Claude Code's, or the repository around the current folder.
function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || git(process.cwd(), 'rev-parse', '--show-toplevel')?.trim() || process.cwd();
}

function main(args) {
  if (args.some((a) => a !== '--json')) {
    process.stderr.write(`${USAGE}\n`);
    process.exitCode = 1;
    return;
  }
  const status = readStatus(projectDir());
  process.stdout.write(`${args.includes('--json') ? JSON.stringify(status, null, 2) : formatRoadmap(status)}\n`);
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
