import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export function loadTodos(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

export function saveTodos(file, todos) {
  writeFileSync(file, `${JSON.stringify(todos, null, 2)}\n`);
}

export function addTodo(todos, text) {
  const title = text.trim();
  if (!title) throw new Error('A to-do needs a title.');
  const id = todos.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  return [...todos, { id, title, done: false }];
}

export function formatTodos(todos) {
  if (!todos.length) return 'Nothing to do.';
  return todos.map((t) => `${t.done ? '[x]' : '[ ]'} ${t.id}. ${t.title}`).join('\n');
}
