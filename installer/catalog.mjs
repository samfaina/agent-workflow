// The skill catalog: which third-party skills the kit installs, offers or
// excludes, and why. installer/skills.json is the single source of truth.
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('./skills.json', import.meta.url), 'utf8'));

export const SOURCES = catalog.sources;
export const SKILLS = catalog.skills;

export function skillsWhere({ tier, source }) {
  return SKILLS.filter((s) => (!tier || s.tier === tier) && (!source || s.source === source));
}

// The CLAUDE.md lines telling the agent when to reach for each installed specialist.
export function specialistLines(installedNames) {
  const lines = skillsWhere({ source: 'addy' })
    .filter((s) => s.tier !== 'excluded' && installedNames.includes(s.name))
    .map((s) => `- \`${s.name}\`: ${s.when}.`);
  return lines.length ? lines.join('\n') : '- None installed.';
}

// The skills table of docs/what-gets-installed.md.
export function skillsTable() {
  const order = { core: 0, optional: 1, excluded: 2 };
  const rows = [...SKILLS]
    .sort((a, b) => a.source.localeCompare(b.source) * -1 || order[a.tier] - order[b.tier])
    .map((s) => `| \`${s.name}\` | ${SOURCES[s.source].author} | ${s.tier} | ${s.reason} |`);
  return ['| Skill | Author | Tier | Why |', '| --- | --- | --- | --- |', ...rows].join('\n');
}
