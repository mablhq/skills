# CLAUDE.md

This repo is the public home of mabl's agent skills. One repo, four install surfaces:

- **Claude Code plugin** (`mabl`) — manifest in `.claude-plugin/plugin.json` (+ `marketplace.json`).
- **Cursor plugin** (`mabl`) — manifest in `.cursor-plugin/plugin.json` (+ `marketplace.json`), single plugin at the repo root (`source: "./"`). Cursor discovers skills by convention at `skills/` and reads MCP servers from a root `mcp.json` (note: not `.mcp.json` — Cursor only reads `mcp.json`).
- **GitHub Copilot / VS Code plugin** (`mabl`) — manifest in the root `plugin.json`. VS Code's plugin loader checks for a root `plugin.json` before `.claude-plugin/plugin.json`, so each agent reads its own manifest and they coexist in one repo.
- **`gh skill install` source** — skills discovered via `skills/*/SKILL.md`.

The skills (`skills/*/SKILL.md`) are shared by all four. MCP config lives in two files that must stay identical: `.mcp.json` (Claude + Copilot) and `mcp.json` (Cursor). Cursor refuses any other filename, so we can't collapse them to one — CI enforces that they match.

### Keep the manifests and MCP files in sync

`.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, and the root `plugin.json` describe the same plugin. When you bump `version` or change `name`/`description`/`author`, update **all three** (and the `version` in the two `marketplace.json` files, which isn't parity-checked). Likewise, any change to `.mcp.json` must be mirrored into `mcp.json` (they must be byte-equivalent JSON). CI validates the manifests and the two MCP files (`.github/workflows/validate-plugin.yml`).

## Rules for every skill

### Skills must be self-contained

`gh skill install` copies ONE skill folder at a time. Anything a skill needs (references, scripts, version pins) must live inside its own `skills/<name>/` folder. Never reference files from the repo root or from another skill.

### Folder name = frontmatter name

The frontmatter `name` in `SKILL.md` must match the folder name exactly, lowercase with hyphens. Mismatched or prefixed names (`mabl/debug`, `mabl:debug`) silently fail to load in Copilot.

### Every skill starts with the mabl CLI prerequisite block

Every `SKILL.md` must begin its instructions with a Prerequisites section that (1) installs the mabl CLI if missing and (2) upgrades it if older than the minimum version the skill needs. Use this canonical block, adjusting `MIN_MABL_CLI_VERSION` to the oldest CLI version that supports the commands the skill uses:

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.111.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest
```

When you add a skill or change a skill's CLI usage, re-check its `MIN_MABL_CLI_VERSION`.

## Validation

Run these before pushing (CI runs the same checks on every PR via `.github/workflows/validate-plugin.yml`):

```bash
claude plugin validate --strict .                      # marketplace + Claude manifest
node .github/scripts/validate-copilot-manifest.mjs     # root plugin.json (Copilot) + parity
node scripts/validate-template.mjs                      # Cursor manifests (official validator)
node .github/scripts/validate-cursor-parity.mjs        # mcp.json == .mcp.json + Cursor/Claude parity
```

`scripts/validate-template.mjs` is vendored verbatim from [`cursor/plugin-template`](https://github.com/cursor/plugin-template) — it's the validator the Cursor team's submission checklist runs. Keep it in sync if that upstream script changes. Its "no hooks/hooks.json" line is an expected warning (we ship no hooks), not an error.

To test the Claude plugin end to end: `claude --plugin-dir <this repo>` in any project, or `/plugin marketplace add <this repo path>` + `/plugin install mabl@mabl`.

To test the Copilot plugin: in VS Code, run **Chat: Install Plugin From Source** and point it at this repo (a local path or the GitHub URL).

To test the Cursor plugin: import this repo as a team marketplace (Cursor **Dashboard → Settings → Plugins → Add Marketplace → Import from Repo**), then install `mabl` from the **Customize** panel.

## Syncing with mabl-cli

The skills originated from `mabl-cli` (`runtime/src/resources/skills/`). Content fixes that apply there too should be synced back in a follow-up PR on mabl-cli.
