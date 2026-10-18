import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/400-italic.css';
import '@fontsource/jetbrains-mono/600.css';
import HeroTerminal from './HeroTerminal.vue';
import MermaidDiagram from './MermaidDiagram.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'home-hero-image': () => h(HeroTerminal) }),
  enhanceApp({ app }) {
    app.component('MermaidDiagram', MermaidDiagram);
  },
};
