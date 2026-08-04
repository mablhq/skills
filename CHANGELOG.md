# Changelog

All notable changes to the `mabl` plugin are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Version numbers match
the `version` field in `plugin.json` (kept in sync across all manifests — see
`CLAUDE.md`).

## [1.2.0] - 2026-08-04
### Added
- `mabl-test-edit` skill — change a test that already exists. It routes each
  edit to the cheapest lane that can make it deterministically: metadata
  (rename, labels, enable/disable), structured step edits
  (replace / insert / delete / move, no browser), or a live cloud authoring
  agent when the change needs to look at the running app. Handles shared
  reusable flows (blast-radius review before you commit), branch-aware writes
  with a confirmation before touching the default branch, and honest
  degradation when the authoring preview isn't enabled for the workspace.

## [1.1.0] - 2026-07-27
### Added
- `mabl-init` skill — one-time project setup that discovers your workspace,
  applications, environments, and credentials over the `mabl` MCP server and
  writes them (with resolved deployment URLs and worked create/run examples)
  into your agent memory file, so later sessions can author and run tests
  without re-explaining the setup. Auto-detects the memory file per client
  (`CLAUDE.md` / `AGENTS.md` / Copilot instructions) and never stores secrets.

## [1.0.2] - 2026-07-15
### Changed
- `mabl-test-coverage-design` now defaults to authoring a suite **serially** —
  the central happy-path test first, then each later test referencing all the
  siblings before it — so the suite converges on one consistent shape.
### Removed
- The `seed` suite-strategy mode. `serial` already is the seed, so the hybrid
  mode was redundant; `parallel` remains for when speed matters more than
  consistency.

## [1.0.1] - 2026-07-10
### Added
- `chrome-devtools` MCP server, so `mabl-test-coverage-design` drives its own
  Chrome instance while exploring an app instead of sharing `chrome-for-mabl`
  (which stays reserved for `mabl-debug`'s attach-to-session use).

## [1.0.0] - 2026-06-29
### Added
- Cursor as a fourth install surface.
- OpenAI Codex as a fifth install surface.
- `mabl-test-coverage-design` skill.
### Fixed
- Stale CLI commands in `mabl-test-authoring`.
- Stale `MABL_API_URL` documentation removed from `mabl-debug`.

## [0.1.0] - 2026-06-22
### Added
- Initial release: `mabl` skills marketplace plugin for Claude Code, with the
  `mabl-debug` and `mabl-test-authoring` skills, the hosted `mabl` MCP server,
  and the `chrome-for-mabl` MCP server.
