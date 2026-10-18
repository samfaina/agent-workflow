<script setup>
import DiagramSvg from './DiagramSvg.vue';
import { arrow, path, head, rect, text } from './diagram.js';

// The five commands as you type them, grouped by the Claude Code session each runs in,
// then the pull request you open yourself. Wide: two rows; narrow: one column.
const SESSIONS = [
  { label: 'SAME SESSION', cards: [['/grill-with-docs', '<idea>'], ['/to-spec', '<change>']] },
  { label: 'FRESH SESSION', cards: [['/to-tickets', '<change>']] },
  { label: 'FRESH SESSION · EACH TICKET', cards: [['/implement', '<change>#N']], each: true },
  { label: 'FRESH SESSION', cards: [['/close-change', '<change>']] },
  { label: 'YOU, IN THE SHELL', cards: [['git push', 'gh pr create']], you: true },
];
const LABEL = 'The five workflow commands, the session each runs in, and the pull request you open at the end';
// LIFT is room above the cards for the stacked copies behind /implement; every session
// keeps it, so the cards of a row line up.
const CH = 62, PAD = 12, GAP = 26, LIFT = 8;

function card([cmd, arg], x, y, w, s) {
  const shapes = [];
  if (s.each) shapes.push(rect(x + 8, y - 8, w, CH, 'ghost', 10), rect(x + 4, y - 4, w, CH, 'ghost', 10));
  shapes.push(rect(x, y, w, CH, s.each ? 'card hot' : 'card', 10));
  shapes.push(text(x + 14, y + 26, 'cmd', cmd), text(x + 14, y + 46, s.you ? 'cmd' : 'arg', arg));
  if (s.each) shapes.push(text(x + w - 12, y + 26, 'badge', '×N', 'end'));
  return shapes;
}

// Lays out one session with its top-left corner at (x, top), cards side by side or stacked;
// returns its size and card boxes. The last session is yours, so it has no session box.
function session(s, x, top, cw, stacked) {
  const n = s.cards.length;
  const w = stacked ? cw + 2 * PAD : 2 * PAD + n * cw + (n - 1) * GAP + (s.each ? LIFT : 0);
  const h = 2 * PAD + LIFT + (stacked ? n * CH + (n - 1) * GAP : CH);
  const shapes = s.you ? [] : [rect(x, top, w, h, 'grp', 14)];
  shapes.push(text(x + 4, top - 8, 'grpt', s.label));
  const boxes = s.cards.map((c, i) => {
    const bx = x + PAD + (stacked ? 0 : i * (cw + GAP)), by = top + PAD + LIFT + (stacked ? i * (CH + GAP) : 0);
    shapes.push(...card(c, bx, by, cw, s));
    if (i > 0) shapes.push(...(stacked ? arrow(bx + 40, by - GAP + 4, bx + 40, by - 3) : arrow(bx - GAP + 4, by + CH / 2, bx - 3, by + CH / 2)));
    return { x: bx, y: by, w: cw };
  });
  return { w, h, shapes, boxes };
}

function wide() {
  const CW = 160, BETWEEN = 30, rows = [[0, 1], [2, 3, 4]], rowY = [30, 194];
  const shapes = [], boxes = [];
  rows.forEach((row, r) => {
    let x = 30;
    for (const i of row) {
      const g = session(SESSIONS[i], x, rowY[r], CW, false);
      shapes.push(...g.shapes);
      boxes[i] = g.boxes;
      x += g.w + BETWEEN;
    }
  });
  for (const [a, b] of [[1, 0], [3, 2], [4, 3]]) {
    const A = boxes[b].at(-1), B = boxes[a][0], y = B.y + CH / 2;
    shapes.push(...arrow(A.x + A.w + 4, y, B.x - 3, y));
  }
  // From /to-tickets, back to the left and down into /implement.
  const T = boxes[1][0], I = boxes[2][0], iy = I.y + CH / 2;
  shapes.push(path(`M ${T.x + T.w / 2},${T.y + CH + 4} V 160 H 14 V ${iy} H ${I.x - 4}`), head(I.x - 3, iy, 'r'));
  return { width: 656, height: 300, shapes };
}

function narrow() {
  const X = 24, CW = 268, shapes = [];
  let y = 26;
  SESSIONS.forEach((s, i) => {
    const g = session(s, X, y, CW, true);
    shapes.push(...g.shapes);
    if (i < SESSIONS.length - 1) shapes.push(...arrow(X + 54, y + g.h + 4, X + 54, y + g.h + 43));
    y += g.h + 70;
  });
  return { width: 340, height: y - 40, shapes };
}

const layouts = { wide: wide(), narrow: narrow() };
</script>

<template>
  <figure class="aw-diagram">
    <DiagramSvg v-for="(l, name) in layouts" :key="name" :class="name" v-bind="l" :label="LABEL" />
    <figcaption>Start a fresh session where the diagram says so: a clean context makes Claude follow the documents instead of the conversation.</figcaption>
  </figure>
</template>
