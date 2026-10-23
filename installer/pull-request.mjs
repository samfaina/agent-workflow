// How /close-change opens pull requests: the `pullRequest` setting in
// .claude/agent-workflow.json. The kit knows no code host; it only offers presets
// for two CLIs it can recognise from the remote and for Atlassian's MCP server.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const NO_PULL_REQUEST = { via: 'none' };

const CLI_PRESETS = {
  github: { host: 'github.com', cli: 'gh', install: 'https://cli.github.com', command: 'gh pr create --base {base} --head {branch} --title {title} --body-file {bodyFile}' },
  gitlab: { host: 'gitlab', cli: 'glab', install: 'https://gitlab.com/gitlab-org/cli', command: 'glab mr create --target-branch {base} --source-branch {branch} --title {title} --description {body} --yes' },
};
const ATLASSIAN_SERVER = 'atlassian';
const ATLASSIAN_DOCS = 'https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/';

const PLACEHOLDERS = [
  'Placeholders, quoted for the shell when filled in:',
  '{base}      the change\'s base branch',
  '{branch}    the change\'s branch',
  '{title}     the pull request title',
  '{body}      the body as text',
  '{bodyFile}  a temporary file holding the body',
  'Example: tea pr create --base {base} --head {branch} --title {title}',
];

const isInstalled = (cli, projectDir, run) => run(`${cli} --version`, { cwd: projectDir, quiet: true }).status === 0;

// The preset for the code host of `origin`, when its CLI is installed; '' otherwise.
export function detectPullRequestPreset(projectDir, run) {
  const remote = run('git remote get-url origin', { cwd: projectDir, quiet: true });
  if (remote.status !== 0) return '';
  const found = Object.entries(CLI_PRESETS).find(([, p]) => remote.stdout.includes(p.host));
  return found && isInstalled(found[1].cli, projectDir, run) ? found[0] : '';
}

// The installer's question about pull requests, for io.choose().
export function pullRequestQuestion(projectDir, run) {
  const mcpServer = (fallback) => ({ label: 'MCP server name', fallback, lines: ['The name the server has in Claude Code.'], value: (name) => `mcp:${name}` });
  const choices = [
    { label: 'GitHub', note: 'gh CLI', value: 'github' },
    { label: 'GitLab', note: 'glab CLI', value: 'gitlab' },
    { label: 'Bitbucket', note: 'Atlassian MCP server', input: mcpServer(ATLASSIAN_SERVER) },
    { label: 'Other MCP server…', note: 'connected to Claude Code', input: mcpServer('') },
    { label: 'Custom command…', input: { label: 'Command', lines: PLACEHOLDERS } },
    { label: 'None', note: 'you open them yourself', value: 'none' },
  ];
  const detected = detectPullRequestPreset(projectDir, run);
  return {
    title: 'Pull requests',
    detail: 'How /close-change opens the pull request of a finished change. It writes the title and body either way.',
    choices,
    selected: detected ? choices.findIndex((c) => c.value === detected) : choices.length - 1,
  };
}

// Turns the answer to the question (or --pull-request) into the setting:
// none, github, gitlab, bitbucket, mcp:<server> or a command.
export function parsePullRequest(answer) {
  const value = answer.trim();
  if (!value || value === 'none') return NO_PULL_REQUEST;
  if (CLI_PRESETS[value]) return { via: 'cli', command: CLI_PRESETS[value].command };
  if (value === 'bitbucket') return { via: 'mcp', server: ATLASSIAN_SERVER };
  if (value.startsWith('mcp:')) {
    const server = value.slice(4).trim();
    if (!server) throw new Error('mcp: needs the name of the MCP server, for example mcp:gitlab.');
    return { via: 'mcp', server };
  }
  return { via: 'cli', command: value };
}

// What the user still has to do before /close-change can use the setting:
// a warning to show now and a line for "Next steps", or null.
export function pullRequestFollowUp(setting, projectDir, run) {
  if (setting.via === 'mcp') {
    const how = setting.server === ATLASSIAN_SERVER ? `follow ${ATLASSIAN_DOCS}` : 'run `claude mcp add`, then `/mcp` in Claude Code to sign in';
    return { step: `Connect the \`${setting.server}\` MCP server to Claude Code if it is not connected yet: ${how}.` };
  }
  if (setting.via !== 'cli') return null;
  const preset = Object.values(CLI_PRESETS).find((p) => setting.command.split(/\s+/)[0] === p.cli);
  if (!preset || isInstalled(preset.cli, projectDir, run)) return null;
  return {
    warning: `${preset.cli} is not installed, so /close-change cannot open pull requests with it yet.`,
    step: `Install ${preset.cli} (${preset.install}) and sign in with \`${preset.cli} auth login\`.`,
  };
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
// keeping every value the user already has. The `answered` settings come from a
// question or flag of this run, so they are added without asking again.
export async function mergeWorkflowConfig(file, kitConfig, { io, projectDir, answered = [] }) {
  const shown = path.relative(projectDir, file).replace(/\\/g, '/');
  const current = readWorkflowConfig(file);
  if (!current) {
    io.warn(`${shown} is not valid JSON, so it was kept. Compare it with the kit's templates/.claude/agent-workflow.json by hand.`);
    return 'kept';
  }
  const missing = Object.keys(kitConfig).filter((key) => !(key in current));
  if (!missing.length) return 'unchanged';
  const unanswered = missing.filter((key) => !answered.includes(key));
  const addUnanswered = !unanswered.length || (await io.confirm(`Add ${unanswered.join(', ')} to ${shown}?`, true, 'Existing settings are kept.'));
  const added = addUnanswered ? missing : missing.filter((key) => answered.includes(key));
  if (!added.length) {
    io.log(`  kept ${shown}`);
    return 'kept';
  }
  const next = { ...current };
  for (const key of added) next[key] = kitConfig[key];
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  io.log(`  updated ${shown}`);
  return 'replaced';
}
