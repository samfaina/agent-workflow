<script setup>
import { computed } from 'vue';

const props = defineProps({
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  shapes: { type: Array, required: true },
  label: { type: String, required: true },
});

// Runs of shapes with the same key share a <g data-k>, which the timeline animates as one.
const groups = computed(() => props.shapes.reduce((gs, s) => {
  if (gs.length && gs.at(-1).k === s.k) gs.at(-1).shapes.push(s);
  else gs.push({ k: s.k, shapes: [s] });
  return gs;
}, []));
</script>

<template>
  <svg :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="label">
    <g v-for="(g, gi) in groups" :key="gi" :data-k="g.k">
      <template v-for="(s, i) in g.shapes" :key="i">
        <rect v-if="s.type === 'rect'" :class="s.cls" :x="s.x" :y="s.y" :width="s.w" :height="s.h" :rx="s.rx" :data-off="s.off" />
        <text v-else-if="s.type === 'text'" :class="s.cls" :x="s.x" :y="s.y" :text-anchor="s.anchor">{{ s.content }}</text>
        <line v-else-if="s.type === 'line'" :class="s.cls" :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2" />
        <path v-else-if="s.type === 'path'" :class="s.cls" :d="s.d" />
        <polygon v-else :class="s.cls" :points="s.points" />
      </template>
    </g>
  </svg>
</template>
