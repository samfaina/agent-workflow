import { defineConfig } from 'vitepress';

const repo = 'https://github.com/samfaina/agent-workflow';

export default defineConfig({
  title: 'agent-workflow',
  description: 'A spec-first workflow for Claude Code: Matt Pocock\'s skills run it, OpenSpec stores it, Addy Osmani\'s skills act as specialists.',
  base: '/agent-workflow/',
  cleanUrls: true,
  appearance: 'dark',
  // The rest of docs/ is written for the agents and maintainers, and read on GitHub.
  srcExclude: ['adr/**', 'agents/**', 'experiments/**', 'experiment-log.md'],
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/agent-workflow/logo.svg' }]],
  markdown: {
    theme: { light: 'rose-pine-dawn', dark: 'rose-pine' },
  },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'How it works', link: '/how-it-works' },
      { text: 'What gets installed', link: '/what-gets-installed' },
      { text: 'Guide', link: '/guide' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'How it works', link: '/how-it-works' },
          { text: 'What gets installed', link: '/what-gets-installed' },
        ],
      },
      {
        text: 'Using it',
        items: [
          { text: 'Guide', link: '/guide' },
          { text: 'Troubleshooting', link: '/troubleshooting' },
        ],
      },
    ],
    outline: { level: [2, 3] },
    search: { provider: 'local' },
    editLink: { pattern: `${repo}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    socialLinks: [{ icon: 'github', link: repo }],
    footer: { message: 'agent-workflow · by samfaina' },
  },
});
