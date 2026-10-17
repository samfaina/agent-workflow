import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { currentRun, nextTrialDir, resultsName } from '../scripts/experiment/setup.mjs';
import { frontier, isDone, parseTickets } from '../scripts/experiment/tickets.mjs';
import { allRuns, latestRun, loadedFromProject, transcriptDir } from '../scripts/experiment/transcript.mjs';
import { asksAfterList, hasReviewHeadings, nextCommand } from '../scripts/experiment/checks.mjs';

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

describe('run naming', () => {
  function fakeKit(runFiles, trialDirs = []) {
    const root = mkdtempSync(path.join(tmpdir(), 'aw-kit-'));
    mkdirSync(path.join(root, 'docs', 'experiments'), { recursive: true });
    for (const f of runFiles) writeFileSync(path.join(root, 'docs', 'experiments', f), '');
    for (const d of trialDirs) mkdirSync(path.join(root, '.sandbox', d), { recursive: true });
    return root;
  }

  it('takes the run from the highest docs/experiments/run-N.md', () => {
    assert.equal(currentRun(fakeKit(['run-1.md', 'run-2.md', 'run-10.md', 'notes.md'])), 10);
    assert.equal(currentRun(mkdtempSync(path.join(tmpdir(), 'aw-kit-'))), 1);
  });

  it('names the trial folder after the run, and numbers repeated trials', () => {
    const root = fakeKit(['run-2.md'], ['run-2']);
    assert.equal(nextTrialDir(2, root), path.join(root, '.sandbox', 'run-2-2'));
    assert.equal(nextTrialDir(3, root), path.join(root, '.sandbox', 'run-3'));
  });

  it('saves every trial of a run to one results file', () => {
    assert.equal(resultsName('/kit/.sandbox/run-2'), 'run-2');
    assert.equal(resultsName('/kit/.sandbox/run-2-3'), 'run-2');
    assert.equal(resultsName('/kit/.sandbox/try-2026-10-17'), 'try-2026-10-17');
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

  it('ends a run at the first checker run, so the reply to it does not count', () => {
    const checked = fakeHome(projectDir, [
      user('<command-name>/implement</command-name>\n<command-args>remove-todo#2</command-args>'),
      assistant([{ type: 'text', text: 'Revisión: Spec ok, Estándares ok' }]),
      user('<bash-input> node E:/kit/scripts/experiment.mjs check implement remove-todo</bash-input>'),
      assistant([{ type: 'text', text: '## Standards\nok\n## Spec\nok' }]),
    ]);
    const run = latestRun(projectDir, 'implement', { args: 'remove-todo', home: checked });
    assert.match(run.assistantText, /Revisión/);
    assert.doesNotMatch(run.assistantText, /## Standards/);
  });

  it('also ends a run at a checker run sent as a message, but not at a tool result naming the checker', () => {
    const sent = fakeHome(projectDir, [
      user('<command-name>/implement</command-name>\n<command-args>remove-todo#2</command-args>'),
      user([{ type: 'tool_result', content: 'usage: node scripts/experiment.mjs check <step> <change>' }]),
      assistant([{ type: 'text', text: 'Revisión: Spec ok, Estándares ok' }]),
      user(' ! node E:/kit/scripts/experiment.mjs check implement remove-todo'),
      assistant([{ type: 'text', text: '## Standards\nok\n## Spec\nok' }]),
    ]);
    const run = latestRun(projectDir, 'implement', { args: 'remove-todo', home: sent });
    assert.match(run.assistantText, /Revisión/);
    assert.doesNotMatch(run.assistantText, /## Standards/);
  });

  it('lists every run of a command, oldest first', () => {
    const twice = fakeHome(projectDir, [
      user('<command-name>/implement</command-name>\n<command-args>remove-todo#1</command-args>', '2026-10-17T10:00:00Z'),
      user([{ type: 'tool_result', content: 'agent-workflow git-guard: git push is disabled.' }]),
      user('<command-name>/implement</command-name>\n<command-args>remove-todo#2</command-args>', '2026-10-17T11:00:00Z'),
    ]);
    const runs = allRuns(projectDir, 'implement', { args: 'remove-todo', home: twice });
    assert.deepEqual(runs.map((r) => r.args), ['remove-todo#1', 'remove-todo#2']);
    assert.match(runs[0].toolResults, /git-guard/);
  });
});

describe('check helpers', () => {
  it('names the next ticket, or the close when every ticket is done', () => {
    assert.equal(nextCommand('remove-todo', parseTickets(TASKS)), '/implement remove-todo#2');
    assert.equal(nextCommand('remove-todo', parseTickets(TASKS.replace(/- \[ \]/g, '- [x]'))), '/close-change remove-todo');
  });

  it('finds a numbered breakdown followed by a question in any language', () => {
    assert.equal(asksAfterList('**1. Eliminar un to-do**\n- **Bloqueado por:** ninguno\n\n¿Te parece bien la granularidad?'), true);
    assert.equal(asksAfterList('1. Remove a to-do\nBlocked by: none\n\nDoes this breakdown work?'), true);
    assert.equal(asksAfterList('1. Remove a to-do\nPublished.'), false);
  });

  it('wants the literal review headings, not the words alone', () => {
    assert.equal(hasReviewHeadings('## Standards\nok\n\n## Spec\nok'), true);
    assert.equal(hasReviewHeadings('**Revisión:**\n- **Spec:** ok\n- **Standards:** ok'), false);
    assert.equal(hasReviewHeadings('## Estándares\nok\n## Spec\nok'), false);
  });
});
