#!/usr/bin/env node
// agent-workflow CLI. Run it inside a project:
//   npx github:samfaina/agent-workflow init [dir] [--yes] [--language <name>] [--check <command>] [--optional all|none|a,b]
import path from 'node:path';
import { parseArgs } from 'node:util';
import { skillsTable } from '../installer/catalog.mjs';
import { init } from '../installer/init.mjs';
import { createConsoleIO } from '../installer/io.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    yes: { type: 'boolean', short: 'y', default: false },
    language: { type: 'string' },
    check: { type: 'string' },
    optional: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const [command, dir = '.'] = positionals;
const usage = `Usage:
  agent-workflow init [dir] [options]   Install the kit into a project (default: current folder)
  agent-workflow skills-table           Print the skill catalog as a Markdown table

Options for init:
  -y, --yes            Accept every default without asking; existing files are kept
  --language <name>    Language Claude talks to you in (default: English)
  --check <command>    Command the quality gate runs before each commit
  --optional <list>    Optional skills to install: all, none, or names separated by commas`;

if (values.help || !command) {
  console.log(usage);
} else if (command === 'skills-table') {
  console.log(skillsTable());
} else if (command === 'init') {
  const io = createConsoleIO({ yes: values.yes });
  const optional = values.optional === undefined ? (values.yes ? 'none' : undefined)
    : ['all', 'none'].includes(values.optional) ? values.optional
    : values.optional.split(',').map((s) => s.trim());
  try {
    await init({ projectDir: path.resolve(dir), io, language: values.language, checkCommand: values.check, optional });
  } catch (error) {
    console.error(`\nagent-workflow: ${error.message}`);
    process.exitCode = 1;
  } finally {
    io.close();
  }
} else {
  console.error(`Unknown command: ${command}\n\n${usage}`);
  process.exitCode = 1;
}
