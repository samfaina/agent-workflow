// Rewrites the skills table in docs/guide.md from installer/skills.json.
// Run it after editing the catalog: node scripts/sync-guide.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { skillsTable } from '../installer/catalog.mjs';

export const GUIDE = fileURLToPath(new URL('../docs/guide.md', import.meta.url));
const START = '<!-- skills-table:start -->';
const END = '<!-- skills-table:end -->';

export function withSkillsTable(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 || end < start) throw new Error(`docs/guide.md needs the ${START} and ${END} markers.`);
  return `${text.slice(0, start + START.length)}\n${skillsTable()}\n${text.slice(end)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(GUIDE, withSkillsTable(readFileSync(GUIDE, 'utf8')));
  console.log('docs/guide.md skills table updated.');
}
