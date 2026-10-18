<script setup>
import DiagramFigure from './DiagramFigure.vue';
import { arrow, deal, flash, head, lit, off, on, path, pulse, rect, tag, text, trace } from './diagram.js';

// The five commands as you type them, grouped by the Claude Code session each runs in,
// then the pull request you open yourself. Wide: two rows; narrow: one column. Keys for the
// timeline: g0-g4 for a session and its cards, x0-x3 for the arrow out of it.
const SESSIONS = [
  { label: 'SAME SESSION', cards: [['/grill-with-docs', '<idea>'], ['/to-spec', '<change>']] },
  { label: 'FRESH SESSION', cards: [['/to-tickets', '<change>']] },
  { label: 'FRESH SESSION · EACH TICKET', cards: [['/implement', '<change>#N']], each: true },
  { label: 'FRESH SESSION', cards: [['/close-change', '<change>']] },
  { label: 'YOU, IN THE SHELL', cards: [['git push', 'gh pr create']], you: true },
];
const LABEL = 'The five workflow commands, the session each runs in, and the pull request you open at the end';
// Two copies sit behind /implement, each STEP further up and to the right. LIFT is room
// above the cards for them; every session keeps it, so the cards of a row line up.
const CH = 62, PAD = 12, GAP = 26, STEP = 5, LIFT = 2 * STEP;

function card([cmd, arg], x, y, w, s) {
  const shapes = [];
  // Each copy reaches down to the card's bottom edge, so only its top and right edges show.
  if (s.each) for (const k of [2 * STEP, STEP]) shapes.push({ ...rect(x + k, y - k, w, CH + k, 'ghost', 10), off: k });
  shapes.push(rect(x, y, w, CH, s.each ? 'card hot' : 'card', 10), lit(x, y, w, CH, 10));
  shapes.push(text(x + 14, y + 26, 'cmd', cmd), text(x + 14, y + 46, s.you ? 'cmd' : 'arg', arg));
  if (s.each) shapes.push(text(x + w - 12, y + 26, 'badge', '×N', 'end'));
  return shapes;
}

// Lays out one session with its top-left corner at (x, top), cards side by side or stacked;
// returns its size and card boxes. The last session is yours, so it has no session box.
function session(s, i, x, top, cw, stacked) {
  const n = s.cards.length;
  const w = (stacked ? cw + 2 * PAD : 2 * PAD + n * cw + (n - 1) * GAP) + (s.each ? LIFT : 0);
  const h = 2 * PAD + LIFT + (stacked ? n * CH + (n - 1) * GAP : CH);
  const shapes = s.you ? [] : [rect(x, top, w, h, 'grp', 14)];
  shapes.push(text(x + 4, top - 8, 'grpt', s.label));
  const boxes = s.cards.map((c, i) => {
    const bx = x + PAD + (stacked ? 0 : i * (cw + GAP)), by = top + PAD + LIFT + (stacked ? i * (CH + GAP) : 0);
    shapes.push(...card(c, bx, by, cw, s));
    if (i > 0) shapes.push(...(stacked ? arrow(bx + 40, by - GAP + 4, bx + 40, by - 3) : arrow(bx - GAP + 4, by + CH / 2, bx - 3, by + CH / 2)));
    return { x: bx, y: by, w: cw + (s.each ? LIFT : 0) };
  });
  return { w, h, shapes: tag(`g${i}`, shapes), boxes };
}

function wide() {
  const CW = 160, BETWEEN = 30, rows = [[0, 1], [2, 3, 4]], rowY = [30, 194];
  const shapes = [], boxes = [];
  rows.forEach((row, r) => {
    let x = 30;
    for (const i of row) {
      const g = session(SESSIONS[i], i, x, rowY[r], CW, false);
      shapes.push(...g.shapes);
      boxes[i] = g.boxes;
      x += g.w + BETWEEN;
    }
  });
  for (const [a, b] of [[1, 0], [3, 2], [4, 3]]) {
    const A = boxes[b].at(-1), B = boxes[a][0], y = B.y + CH / 2;
    shapes.push(...tag(`x${b}`, arrow(A.x + A.w + 4, y, B.x - 3, y)));
  }
  // From /to-tickets, back to the left and down into /implement.
  const T = boxes[1][0], I = boxes[2][0], iy = I.y + CH / 2;
  const d = `M ${T.x + T.w / 2},${T.y + CH + 4} V 160 H 14 V ${iy} H ${I.x - 4}`;
  shapes.push(...tag('x1', [path(d), pulse(d), head(I.x - 3, iy, 'r')]));
  return { width: 656, height: 300, shapes };
}

function narrow() {
  const X = 24, CW = 268, shapes = [];
  let y = 26;
  SESSIONS.forEach((s, i) => {
    const g = session(s, i, X, y, CW, true);
    shapes.push(...g.shapes);
    if (i < SESSIONS.length - 1) shapes.push(...tag(`x${i}`, arrow(X + 54, y + g.h + 4, X + 54, y + g.h + 43)));
    y += g.h + 70;
  });
  return { width: 340, height: y - 40, shapes };
}

// The pulse runs through the commands. A session goes dark once the pulse leaves it, as its
// context is thrown away; /implement runs three tickets and deals out a copy for each rerun.
function timeline() {
  const steps = [];
  let t = 900;
  SESSIONS.forEach((s, i) => {
    steps.push(on(t, `g${i}`));
    s.cards.forEach((c, n) => {
      if (n > 0) {
        steps.push(trace(t, `g${i}`, 600, n - 1));
        t += 600;
      }
      steps.push(flash(t, `g${i}`, n));
      t += 800;
    });
    if (s.each) {
      t += 800;
      for (let n = 0; n < 2; n++, t += 1100) steps.push(deal(t, `g${i}`, n), flash(t + 300, `g${i}`, undefined, 1000));
    }
    if (i === SESSIONS.length - 1) return;
    const dur = i === 1 ? 1200 : 600;
    steps.push(trace(t, `x${i}`, dur), on(t + dur * 0.7, `x${i}`), off(t, `g${i}`));
    t += dur;
  });
  return steps;
}

const layouts = { wide: wide(), narrow: narrow() };
const steps = timeline();
const CAPTION = 'Start a fresh session where the diagram says so: a clean context makes Claude follow the documents instead of the conversation.';
</script>

<template>
  <DiagramFigure :layouts="layouts" :label="LABEL" :steps="steps" :caption="CAPTION" />
</template>
