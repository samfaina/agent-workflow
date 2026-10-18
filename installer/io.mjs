// Console prompts laid out over several lines: a title, a dimmed explanation,
// then numbered choices or a yes/no answer. With `yes`, every question takes its
// default answer, and every question about overwriting a file defaults to keeping it.
import { createInterface } from 'node:readline';
import { styleText } from 'node:util';

export function createConsoleIO({ yes = false, input = process.stdin, output = process.stdout, env = process.env } = {}) {
  const color = Boolean(output.isTTY) && !env.NO_COLOR && env.TERM !== 'dumb';
  const style = (format, text) => (color ? styleText(format, text, { validateStream: false }) : text);
  const write = (text = '') => output.write(`${text}\n`);

  // Word-wraps `text` to the terminal width, indenting every line by `indent` spaces.
  const wrap = (text, indent, format) => {
    const width = Math.max(Math.min(output.columns || 80, 100) - indent, 30);
    const lines = text.split('\n').flatMap((paragraph) => {
      // A paragraph's own leading spaces (as in YAML) are kept on every line it wraps to.
      const lead = paragraph.match(/^ */)[0];
      const out = [''];
      for (const word of paragraph.slice(lead.length).split(' ')) {
        const last = out.length - 1;
        if (out[last] && lead.length + out[last].length + word.length + 1 > width) out.push(word);
        else out[last] = out[last] ? `${out[last]} ${word}` : word;
      }
      return out.map((line) => lead + line);
    });
    return lines.map((line) => ' '.repeat(indent) + (format && line ? style(format, line) : line)).join('\n');
  };

  // Lines are queued as they arrive, so piped answers are not lost between questions.
  let rl = null;
  let closed = false;
  const lines = [];
  const waiting = [];
  const readline = () => {
    if (rl) return rl;
    rl = createInterface({ input, output });
    rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : lines.push(line)));
    rl.on('close', () => {
      closed = true;
      while (waiting.length) waiting.shift()(null);
    });
    rl.on('SIGINT', () => {
      write();
      process.exit(130);
    });
    return rl;
  };
  // Resolves to the trimmed answer, or '' once the input has ended.
  const read = async (prompt) => {
    readline().setPrompt(prompt);
    rl.prompt();
    const line = lines.length ? lines.shift() : closed ? null : await new Promise((resolve) => waiting.push(resolve));
    return (line ?? '').trim();
  };

  const warn = (message) => console.warn(wrap(message, 2, 'yellow').replace(/^ {2}/, style('yellow', '! ')));

  const heading = (step, title, detail) => {
    const prefix = step ? `[${step}]` : '?';
    write();
    write(`${style('cyan', prefix)} ${style('bold', title)}`);
    if (detail) write(wrap(detail, prefix.length + 1, 'dim'));
  };

  // The labels of `choices`, numbered, with their notes lined up after them.
  const list = (choices, selected) => {
    const labels = choices.map((c, i) => `${i + 1}) ${c.label}`);
    const width = Math.max(...labels.map((l) => l.length));
    write();
    choices.forEach((choice, i) => {
      const current = i === selected;
      const label = current ? style('bold', labels[i]) : labels[i];
      const note = choice.note ? `  ${' '.repeat(width - labels[i].length)}${style('dim', choice.note)}` : '';
      write(`  ${current ? style('cyan', '›') : ' '} ${label}${note}`);
      if (choice.detail) write(wrap(choice.detail, 7, 'dim'));
    });
    write();
  };

  // The free-text field under a choice; null when left empty without a fallback.
  const field = async ({ label, fallback = '', lines: notes = [], value = (text) => text }) => {
    for (const note of notes) write(wrap(note, 4, 'dim'));
    const text = (await read(`    ${label}${fallback ? ` [${fallback}]` : ''}: `)) || fallback;
    return text ? value(text) : null;
  };

  return {
    log: (message = '') => console.log(message),
    warn,
    // One of `choices`: { label, note?, detail?, value } or, for free text,
    // { label, input: { label, fallback?, lines?, value? } }.
    async choose({ step, title, detail, choices, selected = 0 }) {
      if (yes) return choices[selected].value;
      heading(step, title, detail);
      list(choices, selected);
      for (;;) {
        const answer = await read(`  Choose [${selected + 1}]: `);
        const choice = answer ? (/^\d+$/.test(answer) ? choices[Number(answer) - 1] : undefined) : choices[selected];
        if (!choice) {
          warn(`Type a number from 1 to ${choices.length}, or press Enter for ${selected + 1}.`);
          continue;
        }
        if (!choice.input) return choice.value;
        const value = await field(choice.input);
        if (value !== null) return value;
      }
    },
    // Any number of `choices`; none by default.
    async chooseMany({ step, title, detail, choices }) {
      if (yes) return [];
      heading(step, title, detail);
      list(choices, -1);
      for (;;) {
        const answer = (await read('  Choose [none]: ')).toLowerCase();
        if (!answer || answer === 'none') return [];
        if (answer === 'all') return choices.map((c) => c.value);
        const numbers = answer.split(/[\s,]+/).filter(Boolean).map(Number);
        if (numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= choices.length)) {
          return [...new Set(numbers)].sort((a, b) => a - b).map((n) => choices[n - 1].value);
        }
        warn(`Type numbers from 1 to ${choices.length} separated by commas, "all", or press Enter for none.`);
      }
    },
    async confirm(question, fallback = false, detail = '') {
      if (yes) return fallback;
      heading(null, question, detail);
      for (;;) {
        const answer = (await read(`  ${fallback ? '[Y/n]' : '[y/N]'}: `)).toLowerCase();
        if (!answer) return fallback;
        if (answer.startsWith('y') || answer.startsWith('s')) return true;
        if (answer.startsWith('n')) return false;
        warn('Type y or n.');
      }
    },
    close: () => rl?.close(),
  };
}
