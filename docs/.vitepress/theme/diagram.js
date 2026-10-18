// Shapes for the SVG diagrams. Each diagram builds a list of them per layout and
// DiagramSvg.vue draws the list; colors come from the classes in custom.css.

// Width of one JetBrains Mono character at 12px, rounded up so chips never clip.
const CHAR = 7.4;
export const chipWidth = (text) => Math.round(text.length * CHAR + 22);

export const rect = (x, y, w, h, cls, rx = 12) => ({ type: 'rect', x, y, w, h, cls, rx });
export const text = (x, y, cls, content, anchor = 'start') => ({ type: 'text', x, y, cls, content, anchor });
export const line = (x1, y1, x2, y2, cls = 'ln') => ({ type: 'line', x1, y1, x2, y2, cls });
export const path = (d, cls = 'ln') => ({ type: 'path', d, cls });

// An arrowhead whose tip is at (x, y), pointing right, left, down or up.
export function head(x, y, dir, cls = 'ah') {
  const [a, b] = { r: [[-9, -5], [-9, 5]], l: [[9, -5], [9, 5]], d: [[-5, -9], [5, -9]], u: [[-5, 9], [5, 9]] }[dir];
  return { type: 'polygon', cls, points: `${x},${y} ${x + a[0]},${y + a[1]} ${x + b[0]},${y + b[1]}` };
}

// A vertical or horizontal arrow from (x1, y1) to the tip at (x2, y2), with a pulse to trace.
export function arrow(x1, y1, x2, y2, cls = '') {
  const dir = x1 === x2 ? (y2 > y1 ? 'd' : 'u') : (x2 > x1 ? 'r' : 'l');
  return [line(x1, y1, x2, y2, `ln ${cls}`), pulse(`M ${x1},${y1} L ${x2},${y2}`), head(x2, y2, dir, `ah ${cls}`)];
}

// Animation. A diagram tags its shapes with keys; DiagramSvg.vue draws each run of shapes
// with the same key as one <g data-k>. A timeline is a list of steps, each acting at `t` ms
// on the group with key `k`: play() first dims every group, the steps light them up again,
// and at the end every group is lit and the diagram is back to its static look.
export const tag = (k, shapes) => shapes.map((s) => ({ ...s, k }));
// An outline that flashes around a card when the pulse reaches it.
export const lit = (x, y, w, h, rx = 12) => rect(x, y, w, h, 'lit', rx);
// A bright copy of a line or path that the pulse traces.
export const pulse = (d) => path(d, 'pulse');

export const on = (t, k) => ({ t, k, fx: 'on' });
export const off = (t, k) => ({ t, k, fx: 'off' });
// n picks one of the group's outlines, pulse paths or stacked copies; without it, all of them.
export const flash = (t, k, n) => ({ t, k, n, fx: 'flash', dur: 900 });
export const trace = (t, k, dur, n) => ({ t, k, n, dur, fx: 'trace' });
// Slides a stacked copy out from behind its card. Copies count from the nearest.
export const deal = (t, k, n) => ({ t, k, n, fx: 'deal', dur: 400 });

const DIM = 0.3;
const FADE = 400;

const shift = (el) => `translate(${-el.dataset.off}px, ${el.dataset.off}px)`;

const FX = {
  on: (g) => [[g, [{ opacity: 1 }], 300]],
  off: (g) => [[g, [{ opacity: DIM }], 500]],
  flash: (g, s) => pick(g, '.lit', s.n).map((el) => [el, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], s.dur]),
  trace: (g, s) => pick(g, '.pulse', s.n).map((el) => {
    const len = el.getTotalLength(), dash = `${len} ${len}`;
    return [el, [
      { strokeDasharray: dash, strokeDashoffset: len, opacity: 1 },
      { strokeDasharray: dash, strokeDashoffset: 0, opacity: 1, offset: 0.75 },
      { strokeDasharray: dash, strokeDashoffset: 0, opacity: 0 },
    ], s.dur];
  }),
  deal: (g, s) => pick(g, '.ghost', s.n).map((el) => [el, [{ opacity: 0, transform: shift(el) }, { opacity: 1, transform: 'translate(0px, 0px)' }], s.dur]),
};

function pick(g, sel, n) {
  const els = [...g.querySelectorAll(sel)].sort((a, b) => (a.dataset.off ?? 0) - (b.dataset.off ?? 0));
  return n === undefined ? els : els.slice(n, n + 1);
}

// Runs a timeline on an SVG drawn by DiagramSvg.vue and returns its animations; cancelling
// them puts the diagram back to its static look, which is also how it ends.
export function play(svg, steps) {
  const groups = [...svg.querySelectorAll('[data-k]')];
  const anims = [];
  const run = (el, frames, delay, duration) =>
    anims.push(el.animate(frames, { delay, duration, fill: 'forwards', easing: 'ease-in-out' }));
  for (const g of groups) run(g, [{ opacity: DIM }], 0, FADE);
  for (const el of svg.querySelectorAll('.ghost')) run(el, [{ opacity: 0, transform: shift(el) }], 0, FADE);
  for (const s of steps) {
    for (const g of svg.querySelectorAll(`[data-k="${s.k}"]`)) {
      for (const [el, frames, dur] of FX[s.fx](g, s)) run(el, frames, s.t, dur);
    }
  }
  const end = Math.max(...steps.map((s) => s.t + (s.dur ?? 0)));
  for (const g of groups) run(g, [{ opacity: 1 }], end, FADE);
  Promise.all(anims.map((a) => a.finished)).then(() => anims.forEach((a) => a.cancel()), () => {});
  return anims;
}
