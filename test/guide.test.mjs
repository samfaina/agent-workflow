import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE, withSkillsTable } from '../scripts/sync-guide.mjs';

it('docs/guide.md lists every skill of the catalog', () => {
  const guide = readFileSync(GUIDE, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(guide, withSkillsTable(guide), 'run `node scripts/sync-guide.mjs`');
});
