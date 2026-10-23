#!/usr/bin/env node
// agent-workflow CLI. Run it inside a project:
//   npx github:samfaina/agent-workflow init [dir] [--yes] [--language <name>] [--check <command>] [--pull-request <how>] [--branch <pattern>] [--branch-for <base>=<pattern>]... [--protected-branches <list>] [--user <value>] [--tracker <how>] [--optional all|none|a,b]
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
    'pull-request': { type: 'string' },
    branch: { type: 'string' },
    'branch-for': { type: 'string', multiple: true },
    'protected-branches': { type: 'string' },
    user: { type: 'string' },
    tracker: { type: 'string' },
    optional: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const [command, dir = '.'] = positionals;
const usage = `Usage:
  agent-workflow init [dir] [options]   Install the kit into a project (default: current folder)
  agent-workflow skills-table           Print the skill catalog as a Markdown table

Options for init:
  -y, --yes            Accept every default without asking; existing files are kept,
                       and the status line is left out
  --language <name>    Language Claude talks to you in (default: English)
  --check <command>    Command the quality gate runs before each commit
  --pull-request <how> How /close-change opens pull requests: none, github, gitlab,
                       bitbucket (Atlassian's MCP server), mcp:<server>, or a command
                       using {base} {branch} {title} {body} {bodyFile}
  --branch <pattern>   How each new change's branch is named (default: change/{change}),
                       using {change}, and optionally {ref} and {user}
  --branch-for <base>=<pattern>
                       The pattern for changes based on another protected branch,
                       such as main=hotfix/{ref}__{change}; repeat it for each base
  --protected-branches <list>
                       Branches Claude never commits or pushes to, separated by commas
                       (default: develop,main when the repository has a develop branch
                       or the branch pattern is feature/{ref}-{change}, otherwise main,master)
  --user <value>       Your value for {user}, stored with git config agent-workflow.user
  --tracker <how>      How Claude posts progress to your team tracker: none, mcp:<server>,
                       or a command using {ref} {change} {stage} {done} {total} {url}
                       {message} {messageFile}
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
    // The status line is a personal preference: --yes leaves it out instead of accepting it.
    const statusLine = values.yes ? false : undefined;
    await init({ projectDir: path.resolve(dir), io, language: values.language, checkCommand: values.check, pullRequest: values['pull-request'], branch: values.branch, branchFor: values['branch-for'], protectedBranches: values['protected-branches'], user: values.user, tracker: values.tracker, statusLine, optional });
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
