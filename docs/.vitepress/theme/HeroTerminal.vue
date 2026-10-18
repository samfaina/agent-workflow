<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';

// One change going through the workflow, the same example as the guide.
// Each line is a list of [class, text] segments; `cmd` lines are typed.
const PROMPT = ['prompt', '> '];
const SCRIPT = [
  { cmd: true, segs: [PROMPT, ['cmd', '/grill-with-docs add a "done" command']] },
  { segs: [['dim', 'Q1 · Should "list" hide finished to-dos? '], ['ok', 'yes']] },
  { segs: [['path', 'GLOSSARY.md'], ['dim', '  + Done']] },
  { cmd: true, segs: [PROMPT, ['cmd', '/to-spec add-done-command']] },
  { segs: [['dim', 'branch  '], ['path', 'change/add-done-command']] },
  { segs: [['dim', 'openspec validate --strict  '], ['ok', '✓ valid']] },
  { cmd: true, segs: [PROMPT, ['cmd', '/to-tickets add-done-command']] },
  { segs: [['path', 'tasks.md'], ['dim', '  '], ['num', '4'], ['dim', ' tickets · #4 is the manual test']] },
  { cmd: true, segs: [PROMPT, ['cmd', '/implement add-done-command#1']] },
  { segs: [['dim', 'tdd           '], ['num', '3'], ['dim', ' tests  '], ['ok', 'passing']] },
  { segs: [['dim', 'code-review   '], ['ok', 'Standards ✓  Spec ✓']] },
  { segs: [['dim', 'quality-gate  npm test '], ['ok', '✓'], ['dim', '  commit '], ['path', 'Refs: add-done-command#1']] },
  { cmd: true, segs: [PROMPT, ['cmd', '/close-change add-done-command']] },
  { segs: [['ok', '✓ '], ['dim', 'simplify · security · verify']] },
  { segs: [['dim', 'archived → '], ['path', 'openspec/specs/']] },
];
const length = (segs) => segs.reduce((n, [, text]) => n + text.length, 0);

// The page renders the finished run, so it reads without JavaScript or motion;
// once mounted, the run replays from the top.
const line = ref(SCRIPT.length);
const chars = ref(0);
let timer;

const lines = computed(() => {
  const shown = SCRIPT.slice(0, line.value).map(({ segs }) => ({ segs, cursor: false }));
  if (line.value < SCRIPT.length) {
    let left = chars.value;
    const segs = SCRIPT[line.value].segs.map(([cls, text]) => {
      const part = text.slice(0, Math.max(left, 0));
      left -= text.length;
      return [cls, part];
    });
    shown.push({ segs, cursor: true });
  } else {
    shown.push({ segs: [PROMPT], cursor: true });
  }
  return shown;
});

function step() {
  if (line.value >= SCRIPT.length) {
    timer = setTimeout(() => { line.value = 0; chars.value = 0; timer = setTimeout(step, 500); }, 3200);
    return;
  }
  const { cmd, segs } = SCRIPT[line.value];
  if (cmd && chars.value < length(segs)) {
    chars.value = Math.max(chars.value, PROMPT[1].length) + 1;
    timer = setTimeout(step, 40 + Math.random() * 40);
    return;
  }
  if (!cmd && chars.value === 0) {
    chars.value = length(segs);
    timer = setTimeout(step, 260);
    return;
  }
  line.value += 1;
  chars.value = 0;
  timer = setTimeout(step, SCRIPT[line.value]?.cmd ? 700 : 180);
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  line.value = 0;
  timer = setTimeout(step, 600);
});
onUnmounted(() => clearTimeout(timer));
</script>

<template>
  <div class="hero-terminal" role="img" aria-label="A change going through the five workflow commands, from /grill-with-docs to /close-change">
    <div class="bar" aria-hidden="true">
      <i /><i /><i />
      <span>~/my-project · claude</span>
    </div>
    <div class="body" aria-hidden="true">
      <div v-for="(l, i) in lines" :key="i" class="line">
        <span v-for="([cls, text], j) in l.segs" :key="j" :class="cls">{{ text }}</span>
        <span v-if="l.cursor" class="cursor" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-terminal {
  position: relative;
  z-index: 1;
  width: 100%;
  text-align: left;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--aw-term-bg);
  overflow: hidden;
  box-shadow: 0 16px 40px -20px var(--aw-term-shadow);
}
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--vp-c-divider);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-3);
}
.bar i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.bar i:nth-child(1) { background: var(--vp-c-danger-1); }
.bar i:nth-child(2) { background: var(--vp-c-warning-1); }
.bar i:nth-child(3) { background: var(--aw-term-ok); }
.bar span { margin-left: 8px; }
.body {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 26.5em;
  padding: 14px 16px;
  overflow: hidden;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--vp-c-text-1);
}
.line { min-height: 1.65em; }
.prompt { color: var(--aw-term-prompt); font-weight: 600; }
.cmd { font-weight: 600; }
.dim { color: var(--vp-c-text-3); }
.ok { color: var(--aw-term-ok); }
.path { color: var(--aw-term-path); }
.num { color: var(--aw-term-num); }
.cursor {
  display: inline-block;
  width: 0.55em;
  height: 1.1em;
  vertical-align: -0.2em;
  background: var(--vp-c-brand-1);
  animation: blink 1s steps(1) infinite;
}
@keyframes blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .cursor { animation: none; }
}
</style>
