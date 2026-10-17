// Console prompts. With `yes`, every question takes its default answer, and
// every question about overwriting a file defaults to keeping it.
import { createInterface } from 'node:readline/promises';

export function createConsoleIO({ yes = false } = {}) {
  let rl = null;
  const readline = () => (rl ??= createInterface({ input: process.stdin, output: process.stdout }));

  return {
    log: (message = '') => console.log(message),
    warn: (message) => console.warn(`! ${message}`),
    async ask(question, fallback = '') {
      if (yes) return fallback;
      const answer = (await readline().question(`? ${question}${fallback ? ` (${fallback})` : ''} `)).trim();
      return answer || fallback;
    },
    async confirm(question, fallback = false) {
      if (yes) return fallback;
      const hint = fallback ? 'Y/n' : 'y/N';
      const answer = (await readline().question(`? ${question} [${hint}] `)).trim().toLowerCase();
      return answer ? answer.startsWith('y') || answer.startsWith('s') : fallback;
    },
    close: () => rl?.close(),
  };
}
