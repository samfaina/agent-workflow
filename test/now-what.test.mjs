import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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

// The slash commands now-what recommends in its states.
function commandsInStates() {
  const text = readFileSync(path.join(KIT_ROOT, 'skills', 'now-what', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const states = text.match(/^## 3\. Find the state\n([\s\S]*?)(?=^## )/m);
  assert.ok(states, 'now-what has a "## 3. Find the state" section');
  return [...new Set([...states[1].matchAll(/`\/([a-z-]+)/g)].map((m) => m[1]))];
}

it('now-what recommends only commands the installer installs, its own skills included', () => {
  const kitSkills = readdirSync(path.join(KIT_ROOT, 'skills'));
  const names = commandsInStates();
  assert.ok(names.includes('light-change'), 'now-what recommends /light-change');
  for (const name of names) {
    const skill = SKILLS.find((s) => s.name === name);
    assert.ok(kitSkills.includes(name) || (skill && skill.tier !== 'excluded'), `/${name} is neither a kit skill nor installable`);
  }
});
