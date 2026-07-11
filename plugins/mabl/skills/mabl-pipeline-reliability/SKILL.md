---
name: mabl-pipeline-reliability
description: >-
  Measure how reliable a mabl deployment gate is over time — deploy pass rate and
  trend, flake share of failures, retry waste, recovery time, and the plans/tests
  that most often break the gate. Uses read-only mabl deployment data; Claude
  computes the metrics. Use when someone asks about "pipeline
  reliability", "how reliable is our CI gate", "deployment pass rate", "how much
  is flake costing us", "MTTR for tests", or wants a deployment/CI health report.
allowed-tools: Bash
---

# mabl Pipeline Reliability

For teams that gate deployments with mabl, this reports whether that gate is
trustworthy: does a green deploy mean quality, how much of the noise is flake,
and what's dragging reliability down — computed from deployment-event history.
Every command is read-only, so it is safe to run in locked-down or regulated
environments.

## When to use

- "How reliable is our deployment gate?" / "Is our pipeline healthy?"
- "What's our deploy pass rate and is it improving?"
- "How much are retries/flake costing us in the pipeline?"
- "Which plans/tests break the gate most often?"

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
nothing here creates, edits, runs, or deletes. If `deployments list` returns 0
rows, stop and say so — don't emit NaN reliability numbers.

**Inputs:** `workspace_id` (`-w`); `window` (default: last 100 deployments or
~30 days). Optionally focus on one application/environment (filter after the
pull — the CLI list has no app/env filter).

**Output:** write working dumps and the final report under `./mabl-reports/`
(create it; add it to `.gitignore` if you're in a repo). Report:
`./mabl-reports/pipeline-reliability-<workspace>-<date>.md`.

## Hard rules

- **Read-only.** `deployments list` + `deployments describe` only.
- **`--limit`**: `deployments list` defaults to 10 — pass `--limit 100`+ .
- **`deployments describe` requires `--output json`** to expose `executions[]`
  (per-plan/per-test results + `is_retry`). The default output strips them.

## Procedure

### Step 1 — Pull deployment history

```bash
WS="<workspace_id>"
mkdir -p ./mabl-reports   # working dumps + final report live here (gitignore in a repo)
mabl deployments list -w "$WS" --output json --limit 100 > ./mabl-reports/deployments.json
```

Each entry carries `id` (a `*-v` id), `received_time`, `application_id`,
`environment_id`, `revision`, `properties` (repo name / branch / commit /
build_info_url), and `triggered_plan_run_summaries[]`. This gives you the
deployment timeline and lets you tie failures back to commits/branches — but
**it does NOT include pass/fail counts**. Aggregate pass/fail comes from
`describe` (Step 2), so you need Step 2 for any reliability metric beyond
"how often did we deploy."

### Step 2 — Go deep on each (for flake/retry/MTTR)

```bash
# For each deployment id in window
mabl deployments describe <id> --output json > ./mabl-reports/dep_<id>.json
```

From each: `run_result.event_status`, `plan_execution_metrics` /
`journey_execution_metrics` (`total/passed/failed/running/skipped/terminated`),
and `executions[]` with `plan_execution.is_retry` and per-test
`journey_executions[]` (`test_id`, `success`, `status`, `browser_type`,
`journey_execution_id`, `href`, timing). Note: journey executions carry `test_id`
but not `test_name` — join to `mabl tests list` when you need names for the gate-
breaker ranking.

### Step 3 — Compute reliability metrics

- **Deploy pass rate & trend** — % of deployments with `event_status` success
  over the window, plotted by time (improving / flat / degrading).
- **Flake share of failures** — of all failed test executions, what fraction
  recovered on a retry. Detect via the retried `executions[]` entries
  (`plan_execution.is_retry:true`, matched to the original by the same `plan.id`
  since `retry_of_id` isn't emitted): a `test_id` that failed on the first
  attempt and passed on the retry is flaky. High flake share = the gate is noisy,
  green is less meaningful.
- **Retry waste** — total retried runs and retries as a % of all runs; estimate
  the extra execution volume spent re-running.
- **Recovery time (proxy MTTR)** — for plans/tests that went red, how many
  deployments (or how much wall-clock) until they were green again.
- **Gate breakers** — the plans and tests with the highest failure frequency
  across deployments (rank top 10 each), split into flaky vs. consistently
  failing.
- **Reliability score** — a simple composite you define and show the math for,
  e.g. `pass_rate * (1 - flake_share)`, so "reliability" isn't inflated by
  retries masking flake.

### Step 4 — Report

```
# Pipeline Reliability — <workspace> (<window>, N deployments)

## Headline
- Deploy pass rate: NN% (trend: up/flat/down)
- Flake share of failures: NN%  → green means: <trustworthy / noisy>
- Retry waste: X retried runs (Y% of all runs)
- Composite reliability score: 0.NN  (= pass_rate * (1 - flake_share))

## Trend
<by-week pass rate>

## Gate breakers
- Flaky (fail→pass on retry): top plans/tests
- Consistently failing (real blockers): top plans/tests + which app

## Recommendations
1. <e.g. "quarantine the 4 flaky gate-breakers costing 60% of retries">
2. <e.g. "the checkout plan fails 30% of deploys deterministically — likely a real regression, route to app team">
```

## Caveats

- Reliability here is measured over **deployment events**; scheduled/ad-hoc plan
  runs not tied to a deployment aren't included. State the window and count.
- MTTR is a proxy (deploys-to-green), not a precise incident timer.
- A high pass rate with high flake share is a *false* green — always report both;
  don't let retries hide instability.
