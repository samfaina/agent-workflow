// How /close-change opens pull requests: the `pullRequest` setting in
// .claude/agent-workflow.json. The kit knows no code host; it only proposes a
// command for the two CLIs it can recognise from the remote.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const NO_PULL_REQUEST = { via: 'none' };

const KNOWN_CLIS = [
  { host: 'github.com', cli: 'gh', command: 'gh pr create --base {base} --head {branch} --title {title} --body-file {bodyFile}' },
  { host: 'gitlab', cli: 'glab', command: 'glab mr create --target-branch {base} --source-branch {branch} --title {title} --description {body} --yes' },
];

export const PULL_REQUEST_QUESTION = 'How should /close-change open pull requests? Type "none" (you open them yourself), "mcp:<server>" (an MCP server connected to Claude Code), or a command using {base}, {branch}, {title}, {body} and {bodyFile}.';

// The command for the code host of `origin`, when its CLI is installed; '' otherwise.
export function detectPullRequestCommand(projectDir, run) {
  const remote = run('git remote get-url origin', { cwd: projectDir, quiet: true });
  if (remote.status !== 0) return '';
  const known = KNOWN_CLIS.find((k) => remote.stdout.includes(k.host));
  if (!known || run(`${known.cli} --version`, { cwd: projectDir, quiet: true }).status !== 0) return '';
  return known.command;
}

// Turns the answer to PULL_REQUEST_QUESTION (or --pull-request) into the setting.
export function parsePullRequest(answer) {
  const value = answer.trim();
  if (!value || value === 'none') return NO_PULL_REQUEST;
  if (value.startsWith('mcp:')) {
    const server = value.slice(4).trim();
    if (!server) throw new Error('mcp: needs the name of the MCP server, for example mcp:gitlab.');
    return { via: 'mcp', server };
  }
  return { via: 'cli', command: value };
}

// The project's .claude/agent-workflow.json, parsed; null when missing or not JSON.
export function readWorkflowConfig(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Adds the kit's settings missing from an existing .claude/agent-workflow.json,
// keeping every value the user already has.
export async function mergeWorkflowConfig(file, kitConfig, { io, projectDir }) {
  const shown = path.relative(projectDir, file).replace(/\\/g, '/');
  const current = readWorkflowConfig(file);
  if (!current) {
    io.warn(`${shown} is not valid JSON, so it was kept. Compare it with the kit's templates/.claude/agent-workflow.json by hand.`);
    return 'kept';
  }
  const missing = Object.keys(kitConfig).filter((key) => !(key in current));
  if (!missing.length) return 'unchanged';
  if (!(await io.confirm(`Add ${missing.join(', ')} to ${shown}? Existing settings are kept.`, true))) {
    io.log(`  kept ${shown}`);
    return 'kept';
  }
  const next = { ...current };
  for (const key of missing) next[key] = kitConfig[key];
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  io.log(`  updated ${shown}`);
  return 'replaced';
}
