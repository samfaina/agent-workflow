import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
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
