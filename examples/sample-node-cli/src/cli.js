#!/usr/bin/env node
import { addTodo, formatTodos, loadTodos, saveTodos } from './todos.js';

const file = process.env.TODO_FILE || 'todos.json';
const [command, ...rest] = process.argv.slice(2);

try {
  if (command === 'add') {
    const todos = addTodo(loadTodos(file), rest.join(' '));
    saveTodos(file, todos);
    console.log(`Added ${todos.at(-1).id}. ${todos.at(-1).title}`);
  } else if (command === 'list' || command === undefined) {
    console.log(formatTodos(loadTodos(file)));
  } else {
    console.error(`Unknown command: ${command}. Use "add <title>" or "list".`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
