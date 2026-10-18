import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGE, withSkillsTable } from '../scripts/sync-skills-table.mjs';

it('docs/what-gets-installed.md lists every skill of the catalog', () => {
  const page = readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(page, withSkillsTable(page), 'run `node scripts/sync-skills-table.mjs`');
});
