<script setup>
import { onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';

const props = defineProps({ code: { type: String, required: true } });
const { isDark } = useData();
const svg = ref('');
const id = `mermaid-${Math.random().toString(36).slice(2)}`;

// Catppuccin Mocha and Latte, the palettes of custom.css.
const palettes = {
  dark: {
    background: '#1e1e2e', textColor: '#cdd6f4', lineColor: '#9399b2',
    primaryColor: '#313244', primaryTextColor: '#cdd6f4', primaryBorderColor: '#cba6f7',
    secondaryColor: '#181825', secondaryTextColor: '#cdd6f4', secondaryBorderColor: '#45475a',
    tertiaryColor: '#181825', tertiaryTextColor: '#cdd6f4', tertiaryBorderColor: '#45475a',
    edgeLabelBackground: '#1e1e2e', clusterBkg: '#181825', clusterBorder: '#45475a',
  },
  light: {
    background: '#eff1f5', textColor: '#4c4f69', lineColor: '#7c7f93',
    primaryColor: '#e6e9ef', primaryTextColor: '#4c4f69', primaryBorderColor: '#8839ef',
    secondaryColor: '#dce0e8', secondaryTextColor: '#4c4f69', secondaryBorderColor: '#bcc0cc',
    tertiaryColor: '#dce0e8', tertiaryTextColor: '#4c4f69', tertiaryBorderColor: '#bcc0cc',
    edgeLabelBackground: '#eff1f5', clusterBkg: '#e6e9ef', clusterBorder: '#bcc0cc',
  },
};

async function draw() {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    themeVariables: { ...palettes[isDark.value ? 'dark' : 'light'], fontSize: '16px' },
  });
  ({ svg: svg.value } = await mermaid.render(id, decodeURIComponent(props.code)));
}

onMounted(draw);
watch(isDark, draw);
</script>

<template>
  <div class="mermaid-diagram" v-html="svg" />
</template>

<style scoped>
.mermaid-diagram {
  margin: 24px 0;
  overflow-x: auto;
  text-align: center;
}
</style>
