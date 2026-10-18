<script setup>
defineProps({
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  shapes: { type: Array, required: true },
  label: { type: String, required: true },
});
</script>

<template>
  <svg :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="label">
    <template v-for="(s, i) in shapes" :key="i">
      <rect v-if="s.type === 'rect'" :class="s.cls" :x="s.x" :y="s.y" :width="s.w" :height="s.h" :rx="s.rx" />
      <text v-else-if="s.type === 'text'" :class="s.cls" :x="s.x" :y="s.y" :text-anchor="s.anchor">{{ s.content }}</text>
      <line v-else-if="s.type === 'line'" :class="s.cls" :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2" />
      <path v-else-if="s.type === 'path'" :class="s.cls" :d="s.d" />
      <polygon v-else :class="s.cls" :points="s.points" />
    </template>
  </svg>
</template>
