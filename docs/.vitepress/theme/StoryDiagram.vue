<script setup>
import DiagramFigure from './DiagramFigure.vue';
import { arrow, chipWidth, flash, head, lit, line, on, path, pulse, rect, tag, text, trace } from './diagram.js';

// What one user story became in the example: the story on top, the five stages with what each
// produced for it, and the pull request at the bottom. Same layouts as StageDiagram. Keys for
// the timeline: story, s0-s4 for a stage and its results, a0-a5 for the arrow into the next box,
// and pr for the pull request.
const STAGES = [
  { label: 'INTERVIEW', cmd: '/grill-with-docs', out: ['11 questions', '4 glossary terms'] },
  { label: 'SPEC', cmd: '/to-spec remove-todo', out: ['5 requirements', '12 scenarios'] },
  { label: 'TICKETS', cmd: '/to-tickets remove-todo', out: ['3 build tickets', '1 manual test'] },
  { label: 'IMPLEMENT', cmd: '/implement remove-todo#N', out: ['4 commits', 'Refs: remove-todo#N'], loop: true },
  { label: 'CLOSE', cmd: '/close-change remove-todo', out: ['archived', 'specs/todo-removal'] },
];
const STORY = ['User story', 'Remove a to-do by its id'];
const PR = ['Pull request', 'change/remove-todo → main'];
const LABEL = 'How the user story "remove a to-do by its id" went through the five stages, what each stage produced for it, and the pull request at the end';

function card(s, i, x, y, w, h) {
  const shapes = [
    rect(x, y, w, h, s.loop ? 'card hot' : 'card'),
    lit(x, y, w, h),
    text(x + 16, y + 25, 'num', `0${i + 1}`),
    text(x + 40, y + 25, 'lbl', s.label),
    text(x + 16, y + 50, 'cmd', s.cmd),
  ];
  if (s.loop) {
    // One session per ticket: a loop on the card's left edge.
    const a = y + 18, b = y + h - 18;
    shapes.push(text(x + w - 14, y + 25, 'badge', '×4', 'end'));
    const d = `M ${x},${a} C ${x - 30},${a} ${x - 30},${b} ${x - 3},${b}`;
    shapes.push(path(d, 'ln hot'), pulse(d), head(x - 1, b, 'r', 'ah hot'));
  }
  return shapes;
}

function chip(x, y, label, h) {
  return [rect(x, y, chipWidth(label), h, 'chip', 8), text(x + 11, y + h / 2 + 4.5, 'chipt', label)];
}

function band(k, [title, sub], x, y, w, h, wide) {
  return tag(k, [
    rect(x, y, w, h, 'band'), lit(x, y, w, h),
    wide ? text(x + 18, y + h / 2 + 6, 'bandt', title) : text(x + 16, y + 27, 'bandt', title),
    wide ? text(x + 144, y + h / 2 + 6, 'bands', sub) : text(x + 16, y + 47, 'bands', sub),
  ]);
}

function wide() {
  const W = 656, X = 40, CW = 236, CH = 66, STEP = 96, CX = 316, BW = W - X - 8, BH = 54;
  const shapes = [...band('story', STORY, X, 8, BW, BH, true)];
  const top = 8 + BH + 30;
  shapes.push(...tag('a0', arrow(X + CW / 2, 8 + BH + 4, X + CW / 2, top - 3)));
  STAGES.forEach((s, i) => {
    const y = top + i * STEP, mid = y + CH / 2, stage = [...card(s, i, X, y, CW, CH)];
    stage.push(line(X + CW + 6, mid, CX - 6, mid, 'ln dash'));
    let cx = CX;
    for (const label of s.out) {
      stage.push(...chip(cx, mid - 14, label, 28));
      cx += chipWidth(label) + 8;
    }
    shapes.push(...tag(`s${i}`, stage), ...tag(`a${i + 1}`, arrow(X + CW / 2, y + CH + 4, X + CW / 2, y + STEP - 3)));
  });
  const by = top + 4 * STEP + CH + 30;
  shapes.push(...band('pr', PR, X, by, BW, BH, true));
  return { width: W, height: by + BH + 8, shapes };
}

function narrow() {
  const W = 340, X = 34, CW = 290, CH = 62;
  const shapes = [...band('story', STORY, X, 8, CW, 62, false)];
  let y = 8 + 62 + 32;
  shapes.push(...tag('a0', arrow(X + CW - 24, 8 + 62 + 4, X + CW - 24, y - 3)));
  STAGES.forEach((s, i) => {
    const stage = [...card(s, i, X, y, CW, CH)];
    let cx = X, cy = y + CH + 10;
    for (const label of s.out) {
      if (cx + chipWidth(label) > X + CW) { cx = X; cy += 34; }
      stage.push(...chip(cx, cy, label, 26));
      cx += chipWidth(label) + 6;
    }
    const next = cy + 26 + 32;
    shapes.push(...tag(`s${i}`, stage), ...tag(`a${i + 1}`, arrow(X + CW - 24, cy + 30, X + CW - 24, next - 3)));
    y = next;
  });
  shapes.push(...band('pr', PR, X, y, CW, 62, false));
  return { width: W, height: y + 70, shapes };
}

// The pulse carries the story down the stages, laps Implement once per ticket, and ends at the
// pull request.
function timeline() {
  const steps = [on(900, 'story'), flash(900, 'story')];
  let t = 1700;
  steps.push(trace(t, 'a0', 600), on(t + 400, 'a0'));
  t += 600;
  STAGES.forEach((s, i) => {
    steps.push(on(t, `s${i}`), flash(t, `s${i}`));
    if (s.loop) for (let lap = 0; lap < 4; lap++, t += 1000) steps.push(trace(t + 1000, `s${i}`, 800), flash(t + 1600, `s${i}`, undefined, 900));
    t += 800;
    steps.push(trace(t, `a${i + 1}`, 600), on(t + 400, `a${i + 1}`));
    t += 600;
  });
  steps.push(on(t, 'pr'), flash(t, 'pr'));
  return steps;
}

const layouts = { wide: wide(), narrow: narrow() };
const steps = timeline();
</script>

<template>
  <DiagramFigure :layouts="layouts" :label="LABEL" :steps="steps" />
</template>
