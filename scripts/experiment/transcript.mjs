// Reads Claude Code session transcripts (~/.claude/projects/<project>/*.jsonl)
// to see what a workflow command actually did. The format is internal to
// Claude Code, so every reader here is best effort: callers treat a missing
// transcript as "not checked", never as a failure.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export function transcriptDir(projectDir, home = homedir()) {
  return path.join(home, '.claude', 'projects', path.resolve(projectDir).replace(/[^A-Za-z0-9-]/g, '-'));
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => part.text ?? (typeof part.content === 'string' ? part.content : textOf(part.content))).filter(Boolean).join('\n');
}

export function parseLines(text) {
  return text.split('\n').filter((l) => l.trim()).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
}

const COMMAND = /<command-name>\/([\w:-]+)<\/command-name>(?:[\s\S]*?<command-args>([\s\S]*?)<\/command-args>)?/;

// Splits one session's entries into segments, one per slash command typed.
export function segments(entries) {
  const result = [];
  let current = null;
  for (const entry of entries) {
    const content = entry.message?.content;
    if (entry.type === 'user') {
      const match = textOf(content).match(COMMAND);
      if (match) {
        current = { command: match[1], args: (match[2] ?? '').trim(), timestamp: entry.timestamp, entries: [] };
        result.push(current);
        continue;
      }
    }
    current?.entries.push(entry);
  }
  return result;
}

// What happened inside one segment.
export function summarise(segment) {
  const summary = { command: segment.command, args: segment.args, timestamp: segment.timestamp, skills: [], skillDirs: [], questions: 0, commands: [], assistantText: '', toolResults: '', userText: '' };
  for (const entry of segment.entries) {
    const content = entry.message?.content;
    if (entry.type === 'assistant' && Array.isArray(content)) {
      for (const part of content) {
        if (part.type === 'text') summary.assistantText += `${part.text}\n`;
        if (part.type !== 'tool_use') continue;
        if (part.name === 'Skill') summary.skills.push(part.input?.skill);
        if (part.name === 'AskUserQuestion') summary.questions += 1;
        if ((part.name === 'Bash' || part.name === 'PowerShell') && part.input?.command) summary.commands.push(part.input.command);
      }
    }
    if (entry.type === 'user') {
      const parts = Array.isArray(content) ? content : [{ type: 'text', text: textOf(content) }];
      for (const part of parts) {
        if (part.type === 'tool_result') {
          summary.toolResults += `${textOf(part.content)}\n`;
          continue;
        }
        const text = part.text ?? '';
        const dir = text.match(/^Base directory for this skill: (.+)$/m);
        if (dir) summary.skillDirs.push(dir[1].trim());
        else summary.userText += `${text}\n`;
      }
    }
  }
  return summary;
}

// The latest run of `/command` (optionally with these args) in any session of the project.
export function latestRun(projectDir, command, { args, home } = {}) {
  const dir = transcriptDir(projectDir, home);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f))
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
  let latest = null;
  for (const file of files) {
    for (const segment of segments(parseLines(readFileSync(file, 'utf8')))) {
      if (segment.command !== command) continue;
      if (args && !segment.args.startsWith(args)) continue;
      if (!latest || String(segment.timestamp) >= String(latest.timestamp)) latest = segment;
    }
  }
  return latest && summarise(latest);
}

// True when a skill was loaded from the project's .claude/skills, not a plugin or ~/.claude.
export function loadedFromProject(summary, skill, projectDir) {
  const expected = path.join(path.resolve(projectDir), '.claude', 'skills', skill).toLowerCase();
  return summary.skillDirs.some((d) => path.resolve(d).toLowerCase() === expected);
}
