// How the agent posts progress snapshots to the team tracker: the `tracker`
// setting in .claude/agent-workflow.json (ADR 0008). The kit knows no tracker,
// not even GitHub Issues: the project brings an MCP server or a command.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fillCommand, projectionSnapshot } from '../hooks/status.mjs';

export const NO_TRACKER = { via: 'none' };

const EXAMPLE = 'my-tracker comment {ref} --body-file {messageFile}';
const QUESTION = `How should the kit post progress to your team tracker? Type "none", "mcp:<server>", or a command using {ref}, {stage}, {message}, {messageFile}… (for example: ${EXAMPLE})`;
const PLACEHOLDERS = [
  'The command runs once per work item; each placeholder is quoted for the shell when filled in:',
  '{ref}          the external reference, such as PROJ-123',
  '{change}       the change name',
  '{stage}        spec-published, tickets-published, ticket-done or change-closed',
  '{done}         the tickets done',
  '{total}        the tickets in the change',
  '{url}          the pull request URL, on change-closed',
  '{message}      the snapshot as text',
  '{messageFile}  a temporary file holding the snapshot',
];

// Turns the answer to the question (or --tracker) into the setting:
// none, mcp:<server> or a command.
export function parseTracker(answer) {
  const value = answer.trim();
  if (!value || value === 'none') return NO_TRACKER;
  if (value.startsWith('mcp:')) {
    const server = value.slice(4).trim();
    if (!server) throw new Error('mcp: needs the name of the MCP server, for example mcp:jira.');
    return { via: 'mcp', server };
  }
  return { via: 'cli', command: value };
}

// The MCP servers of the project's .mcp.json, offered as hints; the kit recognises none of them.
export function mcpServers(projectDir) {
  try {
    return Object.keys(JSON.parse(readFileSync(path.join(projectDir, '.mcp.json'), 'utf8')).mcpServers ?? {});
  } catch {
    return [];
  }
}

// What the setting will post after a ticket of an example change, from the status module itself.
export function trackerSample(setting) {
  const snapshot = projectionSnapshot({ name: 'add-greeting', ticketsDone: 2, ticketsTotal: 4 }, 'ticket-done');
  if (setting.via === 'mcp') {
    return `After each ticket, Claude posts this comment to every work item the change references, with the \`${setting.server}\` MCP server:\n  ${snapshot.message}`;
  }
  const command = fillCommand(setting.command, {
    ref: 'PROJ-123', change: 'add-greeting', stage: snapshot.stage, done: snapshot.done, total: snapshot.total, url: '', message: snapshot.message, messageFile: '<temporary file>',
  });
  return `After each ticket, Claude runs this once per work item the change references:\n  ${command}\nwhere the snapshot is:\n  ${snapshot.message}`;
}

// The installer's question: free text, `none` by default. An answer other than
// `none` is accepted only once the user has seen what it will post.
export async function askTracker({ io, projectDir, step }) {
  const servers = mcpServers(projectDir);
  const lines = [...PLACEHOLDERS, ...(servers.length ? [`MCP servers in .mcp.json: ${servers.join(', ')}`] : [])];
  for (;;) {
    const answer = await io.ask({ step, title: 'Team tracker', detail: QUESTION, lines, fallback: 'none' });
    let setting;
    try {
      setting = parseTracker(answer ?? '');
    } catch (error) {
      io.warn(error.message);
      continue;
    }
    if (setting.via === 'none') return setting;
    if (await io.confirm('Post progress like this?', true, trackerSample(setting))) return setting;
  }
}
