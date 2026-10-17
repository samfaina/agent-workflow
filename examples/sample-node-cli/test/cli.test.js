import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');

function todo(file, ...args) {
  return spawnSync(process.execPath, [CLI, ...args], { env: { ...process.env, TODO_FILE: file }, encoding: 'utf8' });
}

test('an empty list says there is nothing to do', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-')), 'todos.json');
  assert.equal(todo(file, 'list').stdout.trim(), 'Nothing to do.');
});

test('added to-dos are listed in order', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-')), 'todos.json');
  todo(file, 'add', 'Buy milk');
  todo(file, 'add', 'Call Ana');
  assert.equal(todo(file, 'list').stdout.trim(), '[ ] 1. Buy milk\n[ ] 2. Call Ana');
});

test('a to-do without a title is rejected', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-')), 'todos.json');
  const result = todo(file, 'add', '  ');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /needs a title/);
});
