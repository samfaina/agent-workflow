<script setup>
import DiagramFigure from './DiagramFigure.vue';
import { arrow, chipWidth, flash, head, line, lit, on, path, pulse, rect, tag, text, trace } from './diagram.js';

// The five stages of a change, what each leaves behind, and the living spec they feed.
// Wide: stages down the left, their files to the right, drawn 1:1 for the 688px content column.
// Narrow: the files wrap under each stage. Keys for the timeline: s0-s4 for a stage and its
// files, a0-a4 for the arrow out of it, spec for the living spec and back for the way back up.
const STAGES = [
  { label: 'INTERVIEW', cmd: '/grill-with-docs', out: ['GLOSSARY.md', 'docs/adr/'] },
  { label: 'SPEC', cmd: '/to-spec', out: ['proposal.md', 'delta specs', 'design.md'] },
  { label: 'TICKETS', cmd: '/to-tickets', out: ['tasks.md'] },
  { label: 'IMPLEMENT', cmd: '/implement #N', out: ['code + tests', 'Refs: #N'], loop: true },
  { label: 'CLOSE', cmd: '/close-change', out: ['simplify', 'security', 'archive'] },
];
const LABEL = 'The five stages of a change, the files each leaves behind, and the living spec that closing a change updates';

function card(s, i, x, y, w, h) {
  const shapes = [
    rect(x, y, w, h, s.loop ? 'card hot' : 'card'),
    lit(x, y, w, h),
    text(x + 16, y + 25, 'num', `0${i + 1}`),
    text(x + 40, y + 25, 'lbl', s.label),
    text(x + 16, y + 50, 'cmd', s.cmd),
  ];
  if (s.loop) {
    // Implement runs once per ticket: a loop on the card's left edge.
    const a = y + 18, b = y + h - 18;
    shapes.push(text(x + w - 14, y + 25, 'badge', '×N', 'end'));
    const d = `M ${x},${a} C ${x - 30},${a} ${x - 30},${b} ${x - 3},${b}`;
    shapes.push(path(d, 'ln hot'), pulse(d), head(x - 1, b, 'r', 'ah hot'));
  }
  return shapes;
}

function chip(x, y, label, h) {
  return [rect(x, y, chipWidth(label), h, 'chip', 8), text(x + 11, y + h / 2 + 4.5, 'chipt', label)];
}

function wide() {
  const W = 656, X = 40, CW = 236, CH = 66, STEP = 96, CX = 316;
  const shapes = [];
  STAGES.forEach((s, i) => {
    const y = 8 + i * STEP, mid = y + CH / 2, stage = [...card(s, i, X, y, CW, CH)];
    stage.push(line(X + CW + 6, mid, CX - 6, mid, 'ln dash'));
    let cx = CX;
    for (const label of s.out) {
      stage.push(...chip(cx, mid - 14, label, 28));
      cx += chipWidth(label) + 8;
    }
    shapes.push(...tag(`s${i}`, stage), ...tag(`a${i}`, arrow(X + CW / 2, y + CH + 4, X + CW / 2, y + STEP - 3)));
  });
  const by = 8 + 4 * STEP + CH + 30, top = 8 + CH / 2, BW = W - X - 8;
  shapes.push(...tag('spec', [
    rect(X, by, BW, 54, 'band'), lit(X, by, BW, 54),
    text(X + 18, by + 33, 'bandt', 'Living spec'), text(X + 124, by + 33, 'bands', 'openspec/specs/ · the next change starts here'),
  ]));
  // The next change starts from the living spec: back up to the interview.
  const d = `M ${X},${by + 27} H 10 V ${top} H ${X - 3}`;
  shapes.push(...tag('back', [path(d), pulse(d), head(X - 1, top, 'r')]));
  return { width: W, height: by + 62, shapes };
}

function narrow() {
  const W = 340, X = 34, CW = 290, CH = 62;
  const shapes = [];
  let y = 8;
  STAGES.forEach((s, i) => {
    const stage = [...card(s, i, X, y, CW, CH)];
    let cx = X, cy = y + CH + 10;
    for (const label of s.out) {
      if (cx + chipWidth(label) > X + CW) { cx = X; cy += 34; }
      stage.push(...chip(cx, cy, label, 26));
      cx += chipWidth(label) + 6;
    }
    const next = cy + 26 + 32;
    shapes.push(...tag(`s${i}`, stage), ...tag(`a${i}`, arrow(X + CW - 24, cy + 30, X + CW - 24, next - 3)));
    y = next;
  });
  shapes.push(...tag('spec', [
    rect(X, y, CW, 62, 'band'), lit(X, y, CW, 62),
    text(X + 16, y + 27, 'bandt', 'Living spec'), text(X + 16, y + 47, 'bands', 'openspec/specs/'),
  ]));
  return { width: W, height: y + 70, shapes };
}

// The pulse walks down the stages, laps Implement once per ticket (three times here), feeds
// the living spec and climbs back to the interview, where the next change starts.
function timeline() {
  const steps = [];
  let t = 900;
  STAGES.forEach((s, i) => {
    steps.push(on(t, `s${i}`), flash(t, `s${i}`));
    if (s.loop) for (let lap = 0; lap < 3; lap++, t += 900) steps.push(trace(t + 300, `s${i}`, 900));
    t += 800;
    steps.push(trace(t, `a${i}`, 600), on(t + 400, `a${i}`));
    t += 600;
  });
  steps.push(on(t, 'spec'), flash(t, 'spec'), trace(t + 900, 'back', 1400), on(t + 1900, 'back'), flash(t + 2300, 's0'));
  return steps;
}

const layouts = { wide: wide(), narrow: narrow() };
const steps = timeline();
</script>

<template>
  <DiagramFigure :layouts="layouts" :label="LABEL" :steps="steps" />
</template>
