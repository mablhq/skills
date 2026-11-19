# mabl

**Independent verification for agentic development using the world's most advanced testing harness.** Create, run, and debug mabl end-to-end tests without leaving your coding agent — and get evidence-rich failure analysis with screenshots, DOM snapshots, and network activity when something breaks.

## Skills

| Skill | What it does |
|-------|--------------|
| [`mabl-init`](skills/mabl-init/SKILL.md) | One-time project setup: records your workspace, apps, environments, and credentials in agent memory. |
| [`mabl-test-authoring`](skills/mabl-test-authoring/SKILL.md) | Plan a test in plain language, generate it in the mabl cloud, and check it against what you asked for. |
| [`mabl-test-coverage-design`](skills/mabl-test-coverage-design/SKILL.md) | Explore a feature like a user and author a suite of self-isolating tests, each checked against the ask. |
| [`mabl-test-edit`](skills/mabl-test-edit/SKILL.md) | Change an existing test through the cheapest lane that works, confirming before it writes to the default branch. |
| [`mabl-version-compare`](skills/mabl-version-compare/SKILL.md) | Say what changed between two versions of a test or flow, separating real changes from reorganization. |
| [`mabl-test-edit-verify`](skills/mabl-test-edit-verify/SKILL.md) | Certify an edit against its intent and the prior version instead of trusting one green run; never edits or merges. |
| [`mabl-debug`](skills/mabl-debug/SKILL.md) | Triage a failed run from its artifacts, then reproduce and verify the fix step by step in a live Chrome. |
| [`mabl-test-impact`](skills/mabl-test-impact/SKILL.md) | Find, screen, and run the existing tests a code change reaches, and report the gaps; never starts a plan run itself. |
| [`mabl-playwright-export`](skills/mabl-playwright-export/SKILL.md) | Move a mabl browser test into your Playwright project, fitted to its config and run locally until it passes. |

## MCP servers

| Server | Purpose |
|--------|---------|
| `mabl` | Hosted at `https://mcp.mabl.com/mcp`. Your workspace's tests, runs, plans, environments, and failure analysis. Signs in with OAuth on first use. |
| `chrome-for-mabl` | Attaches to the Chrome that `mabl agent debug session` launches, so the agent can drive a live reproduction of a failed run. |
| `chrome-devtools` | Drives its own Chrome so the agent can explore your app while designing test coverage. |

## Before you start

1. A [mabl account](https://www.mabl.com/trial-registration) (free trial available).
2. Node.js 20+, for the local Chrome servers.
3. The mabl CLI, signed in. The skills install or upgrade the CLI when they need it; run `mabl auth login --auto` once yourself.

Then run `/mabl-init` in your project.

## Learn more

- Source, changelog, and install steps for other coding agents: [github.com/mablhq/skills](https://github.com/mablhq/skills)
- mabl docs: [help.mabl.com](https://help.mabl.com)
