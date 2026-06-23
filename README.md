# mabl for AI coding agents

**Independent verification for agentic development.** mabl closes the loop between application change and verified behavior — authoring, orchestrating, executing, and maintaining automated test suites, analyzing failures, and generating reporting, all with the auditable evidence that business-critical applications require.

This repo packages mabl's agent skills as a **Claude Code plugin** and a **GitHub Copilot plugin** (both named `mabl`), and as **agent skills** installable with the GitHub CLI — so your coding agent can create, run, and debug mabl end-to-end tests without leaving your editor or terminal.

Trusted by industry leaders like Microsoft, JetBlue, and Priceline.

## Why mabl in your coding agent?

- **Quickly achieve reliable, independent coverage.** mabl builds automated end-to-end tests in minutes — an independent verification layer that validates the quality of your apps. As your app evolves, your tests evolve with it, dramatically reducing test maintenance.
- **Instant failure root cause analysis.** mabl reports exactly why your test failed and what to do about it. Evidence-rich failure summaries with screenshots, DOM snapshots, network activity, and performance logs give full traceability.
- **Move fast with unlimited parallelization.** mabl runs your tests in parallel across all major browsers in the cloud with zero operational overhead.
- **Effortlessly extend into agentic workflows.** mabl is your independent quality teammate directly in your coding environment, bringing a rich, semantic understanding of your coverage needs to your developer's fingertips.

## What's included

### Skills

| Skill | What it does |
|-------|--------------|
| [`mabl-test-authoring`](skills/mabl-test-authoring/SKILL.md) | Create mabl browser and API tests through conversational planning. Describe what to test in plain language, refine the plan with the mabl AI agent, then generate the test in the mabl cloud — no local browser needed. |
| [`mabl-test-coverage-design`](skills/mabl-test-coverage-design/SKILL.md) | Design a whole suite of mabl tests for a feature, not just one. The agent explores your app like a user (never reading source), maps what it sees onto proven UI-coverage patterns, then authors a set of self-isolating tests in the mabl cloud. |
| [`mabl-debug`](skills/mabl-debug/SKILL.md) | Diagnose and fix mabl test failures. Forensic triage of a failed run (step traces, screenshots, DOM snapshots, network logs, console errors), then live reproduction: the agent re-runs the test step by step in a real Chrome it controls, patches the page or your code, and verifies the fix. |

### MCP servers

The plugin also configures two MCP servers (Claude Code wires these automatically):

| Server | Type | Purpose |
|--------|------|---------|
| `mabl` | Hosted (`https://mcp.mabl.com/mcp`) | Structured tools for your workspace: failure analysis with root-cause inference, test details, applications, environments, credentials, and more. |
| `chrome-for-mabl` | Local (`npx chrome-devtools-mcp`) | Attaches to the Chrome instance that `mabl agent debug session` launches, so the agent can see and drive the live browser while reproducing a failure. |

## Prerequisites

1. A [mabl account](https://www.mabl.com/registration/signup) (free trial available).
2. The mabl CLI, authenticated:

   ```bash
   npm install -g @mablhq/mabl-cli
   mabl auth login --auto
   ```

   If the CLI is missing or too old, the skills detect that and install or upgrade it for you — but you still need to run `mabl auth login --auto` once.

3. Node.js 20+ (the local MCP server runs via `npx`).

## Installation

### Claude Code

```
/plugin marketplace add mablhq/skills
/plugin install mabl@mabl
```

That's it — skills and both MCP servers are configured in one step.

### GitHub Copilot in VS Code

The repo is also a native VS Code agent plugin (root `plugin.json`). Install it straight from source:

1. Open the Command Palette (`⌘⇧P` / `Ctrl+Shift+P`).
2. Run **Chat: Install Plugin From Source**.
3. Enter the repo URL: `https://github.com/mablhq/skills`
4. Trust the plugin when prompted.

Both skills and both MCP servers are configured in one step. To roll it out across a team, add the repo as a marketplace in your `chat.plugins.marketplaces` setting (or a workspace `.github/copilot/settings.json`) and enable `mabl`.

### GitHub Copilot CLI (and other agents) via `gh skill`

```bash
# install the skills into the current project
gh skill install mablhq/skills mabl-test-authoring
gh skill install mablhq/skills mabl-test-coverage-design
gh skill install mablhq/skills mabl-debug
```

`gh skill install` installs skills only. To use the debugging skill's full capabilities, also add the two MCP servers to your agent's MCP configuration:

```json
{
  "mcpServers": {
    "chrome-for-mabl": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:9222"]
    },
    "mabl": {
      "type": "http",
      "url": "https://mcp.mabl.com/mcp"
    }
  }
}
```

Alternatively, `mabl agent install <claude|cursor|vscode|copilot>` from the mabl CLI sets up skills and MCP servers for your agent in one command.

## Quick tour

Once installed, just talk to your agent:

> "Create a mabl test for the checkout flow on https://staging.shop.example.com — add an item to the cart, check out as a guest, and verify the confirmation number appears."

The agent plans the test conversationally with mabl, then generates it in the cloud while you keep working.

> "mabl test run abc123-jr failed in CI. Find out why and fix it."

The agent pulls the step trace, inspects screenshots, DOM, network, and console artifacts from the failed run, maps the failure back to your code, and — when needed — replays the test step by step in a real local Chrome to verify the fix.

> "Why is this test flaky? It passes on retry."

The agent uses mabl's failure analysis and run artifacts to decide whether it's a test bug (missing wait, stale selector) or an app regression, and tells you who owns the fix — with evidence.

## Learn more

- [mabl](https://www.mabl.com) — product overview
- [mabl docs](https://help.mabl.com) — documentation and guides
- [mabl CLI](https://www.npmjs.com/package/@mablhq/mabl-cli) — command line interface
- [Support](https://help.mabl.com) — help center

---

© mabl Inc. Licensed under the [MIT License](LICENSE).
