# CLAUDE.md

This repo is the public home of mabl's agent skills. One repo, five install surfaces — all sharing **one plugin home, `plugins/mabl/`**. That directory holds the skills, the MCP config, and each surface's plugin manifest; there is exactly one copy of everything. The repo root holds only the per-surface marketplace files that point into it (plus the Copilot manifest, which has to live at the root — see below).

Why a subdirectory and not the repo root? **Codex.** Its marketplace requires each plugin in a subdirectory (`codex plugin add` rejects the repo root as a plugin) and copies that subdir into its cache **without following symlinks** — so the skills and MCP config have to be real files inside the plugin dir, not links back to the root. Rather than keep a second copy in sync, `plugins/mabl/` *is* the home and the other four surfaces point at it.

- **OpenAI Codex plugin** (`mabl`) — manifest `plugins/mabl/.codex-plugin/plugin.json`, listed by `.agents/plugins/marketplace.json` (`source: ./plugins/mabl`). Reads `plugins/mabl/skills/` and `plugins/mabl/.mcp.json`. Codex reads the same `.mcp.json` shape as Claude (camelCase `mcpServers`, `type: http` remote servers with OAuth).
- **Claude Code plugin** (`mabl`) — manifest `plugins/mabl/.claude-plugin/plugin.json`; marketplace `.claude-plugin/marketplace.json` at the root with `source: ./plugins/mabl`. Claude reads skills and `.mcp.json` by convention at the plugin root (`plugins/mabl/`).
- **Cursor plugin** (`mabl`) — manifest `plugins/mabl/.cursor-plugin/plugin.json`; marketplace `.cursor-plugin/marketplace.json` at the root with `source: ./plugins/mabl`. Cursor reads MCP servers from `plugins/mabl/mcp.json` (note: not `.mcp.json` — Cursor only reads `mcp.json`).
- **GitHub Copilot / VS Code plugin** (`mabl`) — manifest is the **root `plugin.json`**, because VS Code's plugin loader checks for a manifest at the repo root. It points into the home: `"skills": "plugins/mabl/skills/"`, `"mcpServers": "plugins/mabl/.mcp.json"`.
- **`gh skill install` source** — skills discovered via the `skills/*/SKILL.md` convention, which `gh skill` finds even nested under a prefix (`plugins/mabl/skills/...`).

### Keep the manifests and MCP files in sync

The four plugin manifests — `plugins/mabl/.claude-plugin/plugin.json`, `plugins/mabl/.cursor-plugin/plugin.json`, `plugins/mabl/.codex-plugin/plugin.json`, and the root `plugin.json` (Copilot) — describe the same plugin. When you bump `version` or change `name`/`description`/`author`, update **all four** (and the `version` in the three `marketplace.json` files, which isn't parity-checked). CI checks this parity.

The one remaining duplication is MCP config: `plugins/mabl/mcp.json` (Cursor) must be a byte-identical copy of `plugins/mabl/.mcp.json` (Claude/Copilot/Codex). Cursor refuses any other filename, so the two can't be collapsed — CI enforces they match.

CI validates the manifests and the MCP files (`.github/workflows/validate-plugin.yml`).

## Writing PRs

This repo is public — external developers read our PRs. Write them short and human:

- Lead with what changed and why it matters, in plain sentences. The diff shows the rest.
- A few paragraphs, not a report. Skip the `### Testing` / `### Follow-up` headers and bullet dumps unless the PR is genuinely large.
- No AI boilerplate: no "This PR introduces...", no generated-by footer, no emoji section markers.
- Keep the one caveat that actually matters; drop the exhaustive list.

## Rules for every skill

### Skills must be self-contained

`gh skill install` copies ONE skill folder at a time. Anything a skill needs (references, scripts, version pins) must live inside its own `plugins/mabl/skills/<name>/` folder. Never reference files from outside the skill folder.

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
node .github/scripts/validate-codex-parity.mjs         # Codex/Claude manifest parity + marketplace
```

`scripts/validate-template.mjs` is vendored verbatim from [`cursor/plugin-template`](https://github.com/cursor/plugin-template) — it's the validator the Cursor team's submission checklist runs. Keep it in sync if that upstream script changes. Its "no hooks/hooks.json" line is an expected warning (we ship no hooks), not an error.

To test the Claude plugin end to end: `claude --plugin-dir <this repo>` in any project, or `/plugin marketplace add <this repo path>` + `/plugin install mabl@mabl`.

To test the Copilot plugin: in VS Code, run **Chat: Install Plugin From Source** and point it at this repo (a local path or the GitHub URL).

To test the Cursor plugin: import this repo as a team marketplace (Cursor **Dashboard → Settings → Plugins → Add Marketplace → Import from Repo**), then install `mabl` from the **Customize** panel.

To test the Codex plugin: `codex plugin marketplace add .` (or `mablhq/skills`) then `codex plugin add mabl@mabl`. Confirm with `codex plugin list` (should be `installed, enabled`) and `codex mcp list` (both servers present; the `mabl` server shows `Auth: OAuth`).

## Syncing with mabl-cli

The skills originated from `mabl-cli` (`runtime/src/resources/skills/`). Content fixes that apply there too should be synced back in a follow-up PR on mabl-cli.
