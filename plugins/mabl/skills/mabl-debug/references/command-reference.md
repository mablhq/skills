# mabl Debug Command Reference

For the per-flag definition of every `mabl agent debug` subcommand, run
`mabl agent debug command-list` (or `mabl agent debug <group>
command-list` for a subtree). Pass `--output yaml` for a human-readable
form. Use `mabl agent debug <subcommand> --help` for yargs' formatted
text help on a specific command.

Below: artifact shape, install targets, and common runtime errors.

---

## debug steps — output shape

`mabl agent debug steps <jr-id>` emits a `steps[]` array (YAML by
default for readability; pass `--output json` when piping to tooling).
Each entry carries `index` (1-based), `step_run_id`, `flow`, `action`,
`description`, `status` (`passed` / `failed` / `skipped` /
`recovered`), `duration_ms`, `step_number_in_flow`, `step_id_in_test`,
optional `url_before` / `url_after`, an `error` block on
failed/recovered entries, an optional `recovery.session_id` on
recovered entries, and the list of artifact types captured for that
step. The trace also carries `total_steps` (unfiltered count),
`displayed_steps` (when filtering hid entries), and a top-level
`summary` block reflecting `failure_summary` from the API.

---

## debug artifact — envelope and slicing

Default output is a small envelope pointing at the cached file:

```json
{
  "step_run_id": "step-abc-1",
  "type": "network",
  "file": ".mabl/debug/foo-jr/step-run-step-abc-1-network.har",
  "size_bytes": 5242880
}
```

If the artifact does not exist for the step, the envelope contains a
`note` field instead of `file` / `size_bytes`.

`--head` / `--tail` / `--bytes` / `--print` / `--query` / `--text-only`
are mutually exclusive. None of them are valid for `screenshot`
(binary).

### Worked examples

```bash
# Failed and slow HTTP calls
mabl agent debug artifact network foo-jr --step-run-id step-1 \
  --query '.log.entries[]
            | select(.response.status >= 400 or .time >= 2000)
            | {url: .request.url, status: .response.status, ms: .time}'

# JS errors and uncaught exceptions
mabl agent debug artifact console foo-jr --step-run-id step-1 \
  --query '[.console_logs[] | select(.level == "error" or .level == "severe")]
           + (.javascript_exceptions // [])'

# Compact DOM listing — pipe to grep to find the failing element
mabl agent debug artifact dom foo-jr --step-run-id step-1 --text-only | grep -i submit

# Pre-action screenshot
mabl agent debug artifact screenshot foo-jr --step-run-id step-1 --before
```

Artifacts cache to `.mabl/debug/<jr-id>/`. Re-running the same call is
free; you can also bypass the CLI and read the cached file directly
once you know its path.

---

## agent install \<target\>

Install the `mabl-debug` skill (and the `chrome-for-mabl` + `mabl` MCP
entries on supported targets) into an AI tool.

```bash
mabl agent install <target> [--scope user|project] [--force] [--skip-mcp] [--append-snippet]
```

| Target | Skill destination (project scope) | MCP wired? |
|--------|-----------------------------------|-----------|
| `claude` | `<cwd>/.claude/skills/mabl-debug/` | yes |
| `vscode` | `<cwd>/.github/skills/mabl-debug/` | yes |
| `cursor` | `<cwd>/.cursor/skills/mabl-debug/` | yes |
| `copilot` | `<cwd>/.github/skills/mabl-debug/` | yes |
| `agents-md` | `<cwd>/.agents/skills/mabl-debug/` | no |

`--scope user` writes to the user's home directory instead.
`--append-snippet` appends a short "Testing: mabl" section to the
target's instruction file (`.claude/CLAUDE.md`, `.cursorrules`,
`AGENTS.md`, …).

---

## Error reference

| Error | Meaning |
|-------|---------|
| `Expected a test run ID, e.g. abc123-jr. Got: <x>` | Provided ID is not a test run — must end in `-jr` |
| `Step run not found: <sid>` | The `--step-run-id` does not match any step in this run |
| `<type> not available for step run <sid>` | No artifact of that type was captured (envelope `note`, not a thrown error) |
| `--query only supports JSON artifacts (console, network); got <type>` | Use `--text-only` for DOM, drop `--query` for screenshot |
| `--text-only only supports the dom artifact` | Drop `--text-only` for non-DOM |
| `--head, --tail and --bytes are mutually exclusive` | Pick one window flag |
| `` `jq` not found on PATH `` | Install jq, or read the cached artifact directly |
