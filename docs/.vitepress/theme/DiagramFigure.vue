<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import DiagramSvg from './DiagramSvg.vue';
import { play } from './diagram.js';

const props = defineProps({
  layouts: { type: Object, required: true },
  label: { type: String, required: true },
  steps: { type: Array, required: true },
  caption: { type: String, default: '' },
});

// The timeline plays once, when half the figure is on screen, and again from the replay
// button. With reduced motion it never plays and the button is hidden (custom.css).
const figure = ref();
let anims = [], observer;

function replay() {
  observer?.disconnect();
  anims.forEach((a) => a.cancel());
  anims = [...figure.value.querySelectorAll(':scope > svg')]
    .filter((svg) => svg.getBoundingClientRect().width > 0)
    .flatMap((svg) => play(svg, props.steps));
}

onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  observer = new IntersectionObserver(([e]) => e.isIntersecting && replay(), { threshold: 0.5 });
  observer.observe(figure.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  anims.forEach((a) => a.cancel());
});
</script>

<template>
  <figure ref="figure" class="aw-diagram">
    <DiagramSvg v-for="(l, name) in layouts" :key="name" :class="name" v-bind="l" :label="label" />
    <figcaption v-if="caption">{{ caption }}</figcaption>
    <button class="aw-replay" type="button" aria-label="Replay animation" title="Replay animation" @click="replay">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89M12.5 1.5v3h-3" />
      </svg>
    </button>
  </figure>
</template>
