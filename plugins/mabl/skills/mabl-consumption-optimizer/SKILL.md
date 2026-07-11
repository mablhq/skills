---
name: mabl-consumption-optimizer
description: >-
  Find and quantify wasted mabl execution — retry/rerun waste, always-passing
  low-signal tests run too often, disabled-but-scheduled tests, and redundant
  cross-browser runs — then recommend concrete cuts with an estimated
  run-volume saving. Read-only CLI; Claude computes the metrics. This is the
  cost/run-volume waste deep-dive; for overall workspace quality/health use
  `mabl-workspace-quality-scorecard`. Use when
  someone asks "how do we cut mabl run cost / consumption", "where are we wasting
  executions", "reduce our run volume", "infra/execution waste", or wants to
  optimize a high-volume mabl footprint.
allowed-tools: Bash
---

# mabl Consumption Optimizer

For high-volume mabl footprints (millions of runs/month), a lot of execution
buys little signal. This skill quantifies the waste and proposes cuts — using
only read-only data; you (Claude) do the analysis. Because every command is
read-only, it is safe to run in locked-down or regulated environments.

## When to use

- "We run a huge volume — where's the waste / how do we cut cost?"
- "Which tests give little signal for their run cost?"
- Reducing execution before a renewal / budget review.

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.118.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth info    # verify you're logged in (run `mabl auth login --auto` if not)
```

This skill only **reads**. If your account supports scoped API keys, a
**read-scoped** key is sufficient (and recommended for regulated environments) —
nothing here creates, edits, runs, or deletes. If a `list` returns 0 rows, stop
and say so — don't emit NaN/empty waste numbers.

**Inputs:** `workspace_id` (`-w`); `window` (default 30 days). Optional: a
per-run unit cost/credit value if you want savings in dollars (otherwise report
in runs and %).

**Output:** write working dumps and the final report under `./mabl-reports/`
(create it; add it to `.gitignore` if you're in a repo). Report:
`./mabl-reports/consumption-optimizer-<workspace>-<date>.md`.

## Hard rules

- **Read-only.** `list` / `describe` only.
- **`--limit`**: override the default 10 (tests/plans `--limit 5000`,
  deployments `--limit 100`).
- **Truncation guard.** `tests list`/`plans list` have only `--limit` (no cursor). If a
  `list` returns exactly `--limit` rows the set is **truncated** — headline the report
  **"PARTIAL — computed on first N"** and scope by `--labels` to get under the cap.
- **`deployments describe` needs `--output json`** (per-test `journey_executions`
  + `plan_execution.is_retry`). Names via `test_id → tests list` join.

## Procedure

### Step 1 — Pull data

```bash
WS="<workspace_id>"
mkdir -p ./mabl-reports   # working dumps + final report live here (gitignore in a repo)
mabl tests list       -w "$WS" --output json --limit 5000 > ./mabl-reports/tests.json    # enabled, last_updated_time
mabl plans list       -w "$WS" --output json --limit 5000 > ./mabl-reports/plans.json    # labels, application_id
mabl deployments list -w "$WS" --output json --limit 100  > ./mabl-reports/deps.json
# per deployment in window:
mabl deployments describe <id> --output json > ./mabl-reports/dep_<id>.json
```

### Step 2 — Quantify each waste lever (from the JSON)

- **Retry waste** — count `executions[]` with `plan_execution.is_retry:true`
  and the journey runs under them. Report retried runs and % of all runs. High
  retry volume = flake tax; fixing the underlying flaky tests removes both the
  retries and the noise.
- **Low-signal always-pass tests** — tests whose `test_id` runs many times in the
  window and is `success:true` 100% of the time. These are candidates to run less
  often (e.g. move from every-deploy to nightly) — *not* to delete. Rank by
  `run_count × 1` (most runs, zero failures = most reducible volume).
- **Disabled-but-present / orphaned** — `enabled:false` tests in `tests.json`
  (dead weight), and enabled tests never run in the window (orphaned) — remove or
  archive to cut maintenance and any scheduled runs.
- **Cross-browser redundancy** — using `browser_type` on `journey_executions`,
  find tests run across multiple browsers where outcomes are identical across
  browsers over the window. Cross-browser matters for rendering-sensitive flows;
  for pure logic/API-ish flows it may be redundant — flag for review, don't
  auto-cut.
- **Duplicate/near-duplicate tests** (optional, heavier) — `mabl tests export`
  two suspected duplicates and `mabl tests compare <a> <b>` to confirm before
  recommending consolidation.

### Step 3 — Estimate the saving

For each lever, estimate the reducible run volume over the window (e.g. "moving
the 40 always-pass smoke tests from per-deploy to nightly saves ~N runs/mo").
Sum to a total reducible %. If a unit cost was provided, multiply; otherwise
report runs and % only.

### Step 4 — Report

```
# Consumption Optimizer — <workspace> (<window>)

## Waste summary
- Total runs (window): N
- Retry waste: R runs (X% of total)  → root cause: flaky tests
- Low-signal always-pass volume: P runs across K tests (reducible via cadence)
- Disabled/orphaned tests: D (carried, some scheduled)
- Cross-browser redundancy (review): B runs across J tests

## Recommended cuts (prioritized by saving × safety)
1. <e.g. "Reduce cadence of the 40 always-pass smoke tests → ~N runs/mo saved">
2. <e.g. "Fix/quarantine the top flaky tests → cut R retry runs">
3. <e.g. "Archive D disabled/orphaned tests">
   Estimated total reducible volume: ~NN% of runs.
```

### Step 5 — Prioritize by saving × safety

Safest, biggest wins first: fixing flake (removes retries *and* noise) and
cadence changes to always-pass tests are high-saving/low-risk. Cross-browser and
duplicate cuts need human judgment — present as "review," not "cut."

## Caveats

- Run volume is derived from deployment run history — scheduled/ad-hoc runs
  outside deployment events are under-counted. State the window.
- **"Always passes" is not "useless."** A green smoke test may be guarding a
  critical path cheaply. Recommend *reduced cadence* or review, not deletion, and
  leave the call to the team.
- Savings are estimates from observed volume; actual depends on their schedule
  config (which the CLI list doesn't fully expose — confirm with the team).
