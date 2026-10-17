import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { frontier, isDone, parseTickets } from '../scripts/experiment/tickets.mjs';
import { latestRun, loadedFromProject, transcriptDir } from '../scripts/experiment/transcript.mjs';

const TASKS = `# Tasks

## 1. Remove a to-do by id

Blocked by: none

What to build: \`remove 1\` deletes to-do 1.

- [x] 1.1 \`remove 1\` deletes it; verified by a CLI test
- [x] 1.2 \`list\` no longer shows it; verified by a CLI test
- Note: prototype on branch prototype/remove

## 2. Reject unknown ids

Blocked by: 1

What to build: errors for unknown ids.

- [ ] 2.1 \`remove 9\` prints an error; verified by a CLI test

## 3. Manual test

Blocked by: 1, 2

What to build: a human checks it.

- [ ] 3.1 Run it by hand
`;

describe('tasks.md parsing', () => {
  const tickets = parseTickets(TASKS);

  it('reads every ticket with its blockers, boxes and What to build line', () => {
    assert.deepEqual(tickets.map((t) => [t.number, t.title, t.blockedBy, t.whatToBuild, t.boxes.length]), [
      [1, 'Remove a to-do by id', [], true, 2],
      [2, 'Reject unknown ids', [1], true, 1],
      [3, 'Manual test', [1, 2], true, 1],
    ]);
  });

  it('ignores Note bullets', () => assert.equal(tickets[0].boxes.length, 2));

  it('finds the frontier ticket', () => {
    assert.equal(isDone(tickets[0]), true);
    assert.equal(frontier(tickets).number, 2);
  });

  it('treats a group without Blocked by as blocked by the previous group', () => {
    const legacy = parseTickets('## 1. Setup\n\n- [ ] 1.1 a\n\n## 2. Core\n\n- [ ] 2.1 b\n');
    assert.equal(frontier(legacy).number, 1);
  });
});

describe('transcript reading', () => {
  function fakeHome(projectDir, lines) {
    const home = mkdtempSync(path.join(tmpdir(), 'aw-home-'));
    const dir = transcriptDir(projectDir, home);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'session.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n'));
    return home;
  }

  const projectDir = path.resolve('/work/try-real');
  const skillDir = path.join(projectDir, '.claude', 'skills', 'code-review');
  const user = (content, timestamp = '2026-10-17T10:00:00Z') => ({ type: 'user', timestamp, message: { role: 'user', content } });
  const assistant = (content) => ({ type: 'assistant', message: { role: 'assistant', content } });

  const home = fakeHome(projectDir, [
    user('<command-message>implement</command-message>\n<command-name>/implement</command-name>\n<command-args>remove-todo</command-args>'),
    user([{ type: 'text', text: `Base directory for this skill: ${path.join(projectDir, '.claude', 'skills', 'implement')}\n\nImplement...` }]),
    assistant([{ type: 'text', text: 'Ticket remove-todo#1: Remove a to-do by id' }, { type: 'tool_use', name: 'Skill', input: { skill: 'tdd' } }]),
    assistant([{ type: 'tool_use', name: 'Bash', input: { command: 'git push' } }]),
    user([{ type: 'tool_result', content: 'agent-workflow git-guard: git push is disabled.' }]),
    assistant([{ type: 'tool_use', name: 'Skill', input: { skill: 'code-review' } }]),
    user([{ type: 'text', text: `Base directory for this skill: ${skillDir}\n\nTwo-axis review` }]),
    assistant([{ type: 'text', text: '## Standards\nok\n## Spec\nok' }]),
    user('<command-name>/clear</command-name>', '2026-10-17T11:00:00Z'),
  ]);

  it('summarises the latest run of a command', () => {
    const run = latestRun(projectDir, 'implement', { args: 'remove-todo', home });
    assert.deepEqual(run.skills, ['tdd', 'code-review']);
    assert.deepEqual(run.commands, ['git push']);
    assert.match(run.assistantText, /Ticket remove-todo#1/);
    assert.match(run.toolResults, /agent-workflow git-guard/);
    assert.equal(loadedFromProject(run, 'code-review', projectDir), true);
    assert.equal(loadedFromProject(run, 'close-change', projectDir), false);
  });

  it('returns null when the command never ran', () => {
    assert.equal(latestRun(projectDir, 'close-change', { home }), null);
    assert.equal(latestRun(path.resolve('/nowhere'), 'implement', { home }), null);
  });
});
