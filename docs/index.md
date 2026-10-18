---
layout: home

hero:
  name: agent-workflow
  text: Spec-first development for Claude Code
  tagline: Interview, spec, tickets, test-first implementation and close. One command per stage, set up in any project with one line.
  actions:
    - theme: brand
      text: How it works
      link: /how-it-works
    - theme: alt
      text: Get started
      link: /guide

features:
  - title: Matt Pocock's skills
    details: Run the workflow. They hold the interview, write the spec and the tickets, build each ticket test-first and review it.
    link: /what-gets-installed#skills
    linkText: The skills
  - title: OpenSpec
    details: Stores what they produce. Each change is a folder of specs and tickets, and a finished change merges into the living spec of your product.
    link: /how-it-works#where-things-live
    linkText: Where things live
  - title: Addy Osmani's skills
    details: Act as specialists. Claude reaches for security, performance or accessibility skills when the work touches the topic. They never drive the workflow.
    link: /what-gets-installed#skills
    linkText: The specialists
---

## Install

In a git repository, on a branch of its own:

```sh
npx github:samfaina/agent-workflow init
```

The installer asks four things: the language Claude talks to you in, the command that proves your project works, how pull requests are opened, and which optional skills you want. [The guide](./guide.md) walks through it step by step, including the tools to install first.
