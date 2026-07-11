---
name: mabl-version-compare
description: >-
  Explain what changed in a mabl test between versions (or against another test),
  decide whether an edit caused a failure, and recommend restore-vs-fix-forward.
  Everything Claude runs is read-only (`mabl tests versions` / `tests compare`); a
  `tests restore` is a **write handed to a human** with a write-capable key, never
  run by Claude. Use when someone asks "what changed in this
  test", "why did this test start failing after an edit", "compare these two
  tests / test versions", "diff this test across workspaces", or "should we roll
  this test back".
allowed-tools: Bash
---

# mabl Version Compare (what changed, and should we restore?)

A daily maintenance question: *this test started failing — did a recent edit break
it, and what exactly changed?* mabl keeps test version history; this skill diffs it
and turns the diff into a plain-language explanation + a restore-or-fix decision.

## When to use

- "What changed in this test?" / "Why did it start failing after someone edited it?"
- "Compare version A vs B" or "compare these two tests" (e.g. across workspaces).
- "Should we restore the previous version?"

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.118.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth info    # verify you're logged in (run `mabl auth login --auto` if not)
```

Everything Claude runs here is **read-only** (`versions`, `compare`) — a
read-scoped API key covers it (recommended for regulated environments). The one
write in scope, `tests restore`, is a **human hand-off**: Claude presents the
exact command and a human runs it with a write-capable key after confirming the
target version (on a read-scoped key it 403s). If `versions` returns nothing,
say so — don't guess a timeline.

**Inputs:** a test id (`*-j`); optionally a second test id or a specific version
to compare against. Optional: a failing `*-jr` (its `test_version` pins the version
that failed).

**Output:** write any dumps and the final report under `./mabl-reports/` (create
it; add it to `.gitignore` if you're in a repo). Report:
`./mabl-reports/version-compare-<test-id>-<date>.md`.

## Hard rules

- **Claude runs only reads** (`versions`, `compare`). `tests restore` is a **write**
  and a **human hand-off** — Claude never runs it; present the exact command for a
  human to run after they confirm the target version. It needs a write-capable key
  (a read-scoped key 403s it). Never merge.

## Procedure

### Step 1 — List versions

```bash
mabl tests versions <test-id>
```
This command has **no `--output json` and no `-w`** — it resolves by test id and
prints a plain-text list, e.g.:

```
Versions for test <test-id>:
  v2 (latest) [master]
  v1 [master]
  v0 [master]

Restore one with mabl tests restore <test-id> <version>
```

Each line is `v<N>` (the version number is the **integer** you pass to `compare`
and `restore`), a `(latest)` marker on the current one, and the `[branch]` the
version belongs to. It does **not** include author or timestamp — if you need
who/when, use the workspace activity feed. Identify the **current** version and a
plausible **last-known-good** (e.g. the version that predates when the test began
failing).

### Step 2 — Diff

```bash
mabl tests compare <source> <target> --output json      # structured diff
mabl tests compare <source> <target>                     # formatted human view
```
`<source>`/`<target>` are **`<id>`** (latest version) or **`<id>:<version>`** (a
specific integer version) — no `-w`. Add `-a`/`--show-all-properties` to print the
full property set of every step, not just the ones that differ. The `--output json`
form returns:

```json
{ "source": "...", "target": "...:1",
  "summary": { "added": 0, "removed": 1, "changed": 2, "unchanged": 5 },
  "steps": [ { "operation": "changed", "stepNumber": 3, "from": {…}, "to": {…} } ] }
```

Common pairs:
- **current vs last-passing version** (`<id>` vs `<id>:<N>`) — did an edit break it?
- **two tests** (`<id-a>` vs `<id-b>`, e.g. a golden-image test vs a team's copy across
  workspaces) — drift.

### Step 3 — Explain the diff (you)

Translate the step diff into plain language: which **steps added/removed/reordered**,
which **selectors** changed, which **assertions** changed (expected value), which
**URLs/data** changed. Then correlate with the failure: does a changed step line up
with the failing step (from a failing `*-jr` test run or a deployment triage)? Name
the **likely culprit change**.

### Step 4 — Recommend

- **Edit was bad / unintended** → recommend restore. State exactly what reverts, then
  hand the command to a human to run once they confirm the target version:
  `mabl tests restore <test-id> <good-version>` (a write — Claude never runs it; needs a
  write-capable key, 403s on a read-scoped one).
- **Change was intended but the test now asserts old behavior elsewhere** → fix-forward:
  a human opens the Trainer with `mabl tests edit --id <test-id>` — describe the exact
  edit to make (Claude never runs this either; it opens a browser/Trainer and needs a
  write-capable key).
- **Drift between two tests** → note which to align to which.

## Report

- **Version timeline** (current + last-good, authors/timestamps).
- **Diff summary** — steps/selectors/assertions/URLs that changed.
- **Likely culprit** — the change that best explains the failure (cite the failing step).
- **Recommendation** — restore (with the exact command, pending confirmation) or
  fix-forward in the Trainer.

## Caveats

- `tests compare` diffs **steps**, not run results — pair it with a failing `*-jr`
  test run to tie a changed step to the actual failure. The diff's
  `summary` counts (added/removed/changed) are the fastest signal; drill into
  `steps[].operation == "changed"` and read `from`/`to` for the specific selector,
  assertion value, URL, or data that moved.
- Sourcing version refs: `tests versions` lists the integer versions; correlate with
  when the failures started (from a failing `*-jr` test run) to pick the
  last-passing one. `versions` alone doesn't timestamp each version, so use the failure
  timeline — not the version list — to bracket the bad edit.
- `tests restore <test-id> <version>` overwrites the current version with an old one —
  it's the one write here, so it's a human hand-off: Claude never runs it, a human
  confirms the target version first, and it needs a write-capable key (a read-scoped
  key 403s). `restore`, `versions`, `compare`, and `export` all take the test id
  directly (no `-w`).
