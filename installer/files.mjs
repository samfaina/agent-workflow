// File writes that never overwrite existing content without asking.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const BLOCK_START = '<!-- agent-workflow:start -->';
export const BLOCK_END = '<!-- agent-workflow:end -->';

function write(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const normalise = (text) => text.replace(/\r\n/g, '\n');

// Writes `content` to `file`. An identical file is left alone; a different one
// is replaced only when the user agrees. Returns what happened.
export async function writeFileSafely(file, content, { io, projectDir }) {
  const shown = path.relative(projectDir, file).replace(/\\/g, '/');
  if (!existsSync(file)) {
    write(file, content);
    io.log(`  created ${shown}`);
    return 'created';
  }
  if (normalise(readFileSync(file, 'utf8')) === normalise(content)) return 'unchanged';
  if (await io.confirm(`Overwrite ${shown}?`, false, 'It already exists and differs from the kit\'s version.')) {
    write(file, content);
    io.log(`  replaced ${shown}`);
    return 'replaced';
  }
  io.log(`  kept ${shown}`);
  return 'kept';
}

// Puts `body` between the agent-workflow markers in a Markdown file: creates the
// file, appends the block, or replaces an older block, asking before touching
// content that already exists.
export async function writeBlockSafely(file, body, { io, projectDir }) {
  const shown = path.relative(projectDir, file).replace(/\\/g, '/');
  const block = `${BLOCK_START}\n${body.trim()}\n${BLOCK_END}\n`;
  if (!existsSync(file)) {
    write(file, block);
    io.log(`  created ${shown}`);
    return 'created';
  }
  const current = normalise(readFileSync(file, 'utf8'));
  const start = current.indexOf(BLOCK_START);
  const end = current.indexOf(BLOCK_END);
  if (start !== -1 && end > start) {
    const next = current.slice(0, start) + block + current.slice(end + BLOCK_END.length).replace(/^\n/, '');
    if (next === current) return 'unchanged';
    if (!(await io.confirm(`Update the agent-workflow section of ${shown}?`, true))) return 'kept';
    write(file, next);
    io.log(`  updated ${shown}`);
    return 'replaced';
  }
  if (!(await io.confirm(`Append the agent-workflow section to ${shown}?`, true, 'The file already exists; its content is kept.'))) {
    io.log(`  kept ${shown}`);
    return 'kept';
  }
  write(file, `${current.trimEnd()}\n\n${block}`);
  io.log(`  appended to ${shown}`);
  return 'appended';
}

// Sets the conversation language in .claude/settings.local.json, keeping every
// other setting. The local scope outranks ~/.claude/settings.json, so a global
// "language" cannot override the language chosen for this project.
export async function writeLanguageSetting(file, language, { io, projectDir }) {
  const shown = path.relative(projectDir, file).replace(/\\/g, '/');
  const value = language.trim().toLowerCase();
  let settings = {};
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      io.warn(`${shown} is not valid JSON, so the language was not set. Add "language": "${value}" to it by hand.`);
      return 'kept';
    }
  }
  if (settings.language === value) return 'unchanged';
  if (settings.language && !(await io.confirm(`Change the language in ${shown} to "${value}"?`, true, `It sets the language to "${settings.language}".`))) {
    io.log(`  kept ${shown}`);
    return 'kept';
  }
  const existed = existsSync(file);
  write(file, `${JSON.stringify({ ...settings, language: value }, null, 2)}\n`);
  io.log(`  ${existed ? 'updated' : 'created'} ${shown}`);
  return existed ? 'replaced' : 'created';
}

// Appends `entry` to the project's .gitignore unless a line already matches it.
export function ensureGitignored(projectDir, entry, { io }) {
  const file = path.join(projectDir, '.gitignore');
  const current = existsSync(file) ? normalise(readFileSync(file, 'utf8')) : '';
  if (current.split('\n').some((line) => line.trim() === entry || line.trim() === `/${entry}`)) return 'unchanged';
  write(file, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${entry}\n`);
  io.log(`  added ${entry} to .gitignore`);
  return current ? 'appended' : 'created';
}

// Adds the kit's hook entries to .claude/settings.json, keeping every existing
// setting. Entries already present (same script) are skipped.
export async function mergeSettings(file, kitSettings, { io, projectDir }) {
  const shown = path.relative(projectDir, file).replace(/\\/g, '/');
  let settings = {};
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      io.warn(`${shown} is not valid JSON, so the hooks were not added. Add the "hooks" section from the kit's templates/.claude/settings.json by hand.`);
      return 'kept';
    }
  }
  const scriptsIn = (group) => (group.hooks ?? []).map((h) => [h.command, ...(h.args ?? [])].join(' '));
  let added = 0;
  const next = structuredClone(settings);
  next.hooks ??= {};
  for (const [event, groups] of Object.entries(kitSettings.hooks)) {
    next.hooks[event] ??= [];
    for (const group of groups) {
      // Compare within the same matcher: a script wired for edits is not wired for commands.
      const sameMatcher = next.hooks[event].filter((g) => g.matcher === group.matcher);
      const existing = sameMatcher.flatMap(scriptsIn);
      const missing = group.hooks.filter((h) => !existing.includes([h.command, ...(h.args ?? [])].join(' ')));
      if (!missing.length) continue;
      if (sameMatcher.length) sameMatcher[0].hooks = [...(sameMatcher[0].hooks ?? []), ...missing];
      else next.hooks[event].push({ ...group, hooks: missing });
      added += missing.length;
    }
  }
  if (!added) return 'unchanged';
  const existed = existsSync(file);
  if (existed && !(await io.confirm(`Add ${added} agent-workflow hook(s) to ${shown}?`, true, 'Existing settings are kept.'))) {
    io.log(`  kept ${shown}`);
    return 'kept';
  }
  write(file, `${JSON.stringify(next, null, 2)}\n`);
  io.log(`  ${existed ? 'updated' : 'created'} ${shown}`);
  return existed ? 'replaced' : 'created';
}
