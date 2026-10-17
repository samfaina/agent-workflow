#!/usr/bin/env node
// PreToolUse hook for file-editing tools: blocks edits to protected paths.
import { block, loadConfig, projectDirFor, protectedPattern, readHookInput } from './shared.mjs';

const input = await readHookInput();
const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? input.tool_input?.path;
if (typeof target === 'string') {
  const projectDir = projectDirFor(input);
  const pattern = protectedPattern(target, { projectDir, cwd: input.cwd, config: loadConfig(projectDir) });
  if (pattern) {
    block('protected-paths', `${target} is protected (matches "${pattern}" in .claude/agent-workflow.json). Ask the user to change it.`);
  }
}
