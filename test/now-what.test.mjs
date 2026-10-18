import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SKILLS } from '../installer/catalog.mjs';
import { KIT_ROOT } from '../installer/init.mjs';

// The skills named in now-what's map of situations off the workflow.
function skillsInMap() {
  const text = readFileSync(path.join(KIT_ROOT, 'skills', 'now-what', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const map = text.match(/^## Map off the workflow\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  assert.ok(map, 'now-what has a "## Map off the workflow" section');
  return [...map[1].matchAll(/→ `([^`]+)`/g)].map((m) => m[1]);
}

it('now-what\'s map names only skills the installer can install', () => {
  const names = skillsInMap();
  assert.ok(names.length >= 5, 'the map names its skills as "→ `<skill>`"');
  for (const name of names) {
    const skill = SKILLS.find((s) => s.name === name);
    assert.ok(skill, `${name} is missing from installer/skills.json`);
    assert.notEqual(skill.tier, 'excluded', `${name} is excluded by the kit`);
  }
});
