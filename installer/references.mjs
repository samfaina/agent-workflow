// Addy Osmani's skills link to shared checklists with ../../references/<file>.md,
// which resolves to .claude/references/ once a skill sits in .claude/skills/<name>/.
// The Skills CLI installs only the skill folder, so the installer fetches them.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileSafely } from './files.mjs';

const LINK = /(?:\.\.\/)+references\/[A-Za-z0-9_.-]+\.md/g;

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

// Every link in the given skill folders that points into `referencesDir`.
export function sharedReferenceLinks(skillDirs, referencesDir) {
  const links = [];
  for (const skillDir of skillDirs.filter((d) => existsSync(d))) {
    for (const file of markdownFiles(skillDir)) {
      for (const link of readFileSync(file, 'utf8').match(LINK) ?? []) {
        const target = path.resolve(path.dirname(file), link);
        if (path.dirname(target) === path.resolve(referencesDir)) links.push({ file, link, target });
      }
    }
  }
  return links;
}

export async function installReferences({ skillDirs, referencesDir, baseUrl, fetchText, io, projectDir }) {
  const names = [...new Set(sharedReferenceLinks(skillDirs, referencesDir).map((l) => path.basename(l.target)))].sort();
  for (const name of names) {
    try {
      await writeFileSafely(path.join(referencesDir, name), await fetchText(`${baseUrl}${name}`), { io, projectDir });
    } catch (error) {
      io.warn(`Could not download ${name} (${error.message}). Copy it by hand from ${baseUrl}${name}.`);
    }
  }
  return names;
}

export async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}
