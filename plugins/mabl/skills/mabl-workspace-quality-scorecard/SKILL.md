---
name: mabl-workspace-quality-scorecard
description: >-
  Produce a test-automation health scorecard for a mabl workspace — flake rate,
  pass/fail trend, test rot, authoring velocity, coverage-by-application, and
  infrastructure waste — plus a prioritized maintenance list. Uses read-only
  mabl CLI data; Claude computes the metrics. This is
  the overall workspace quality/health view; for a cost/run-volume waste
  deep-dive use `mabl-consumption-optimizer`. Use
  when someone asks "how healthy is this workspace", "what should we fix first",
  "flake rate", "test rot", "which tests are wasting runs", or wants a
  quality/health report or scorecard for a mabl workspace or application.
allowed-tools: Bash
---

# mabl Workspace Quality Scorecard

Turns raw mabl CLI output into the metrics testing leadership cares about:
**coverage, flake rate, test rot, velocity, and infrastructure waste** — with a
ranked "fix this first" list. You (Claude) do the analysis over data the CLI
already exposes. Every command here is **read-only**, which makes the scorecard
safe to run in locked-down or regulated environments.

## When to use

- "Give me a health scorecard for workspace X."
- "What's our flake rate / which tests are flaky?"
- "Which tests are rotting (stale, always-failing, never-run)?"
- "Where are we wasting execution / how do we cut run cost?"
- Monthly/quarterly quality review for a workspace or application.

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
nothing here creates, edits, runs, or deletes. If a `list` returns 0 rows
(unauthenticated, wrong workspace, or empty), stop and say so — don't emit
NaN/empty metrics.

**Inputs (ask if not given):**

- `workspace_id` (`-w`) — target workspace. If omitted, uses the CLI default (`mabl config`).
- `window` — how far back to analyze (default: last 30 days of deployments).
- Optional `labels` — scope to a subset of tests/plans (recommended for very large workspaces; start scoped, then widen).

**Output:** write working dumps and the final report under `./mabl-reports/`
(create it; add it to `.gitignore` if you're in a repo). Report:
`./mabl-reports/scorecard-<workspace>-<date>.md`.

## Hard rules

- **Read-only.** Only `list` and `describe`. Never run/edit/create/delete.
- **Beat the default limit.** Every `list` command defaults to `--limit 10`. Always pass a large `--limit` (e.g. `--limit 5000`) or you'll silently analyze 10 of thousands of tests.
- **Truncation guard.** `tests list`/`plans list` have only `--limit` (no cursor). If a `list` returns exactly `--limit` rows, the set is **truncated** — headline the report **"PARTIAL — computed on first N"** and scope by `--labels` to get under the cap. (`plans list --limit` is applied **before** label filtering, so `--labels X --limit 5000` can still miss matching plans on a huge workspace.)
- **`deployments describe` needs `--output json`** or it strips the per-test executions you need.

## Procedure

### Step 1 — Pull the raw data (read-only)

```bash
WS="<workspace_id>"
mkdir -p ./mabl-reports   # working dumps + final report live here (gitignore in a repo)

# Full test inventory. Fields include: id, name, enabled, created_time,
# last_updated_time, created_by_user, last_updated_by_user. (Add --labels to scope.)
mabl tests list -w "$WS" --output json --limit 5000 > ./mabl-reports/tests.json

# Plans give the application_id mapping the tests list lacks
mabl plans list -w "$WS" --output json --limit 5000 > ./mabl-reports/plans.json

# Recent deployment events (pass/fail/total per deploy) — your run history
mabl deployments list -w "$WS" --output json --limit 100 > ./mabl-reports/deployments.json
```

Then, for the deployments inside your window, pull full per-test results
(this is where flake + per-test failure data live):

```bash
# For each deployment id in window (cap at ~30–50 for cost; note if you sampled)
mabl deployments describe <deployment_id> --output json > ./mabl-reports/dep_<id>.json
```

`deployments describe --output json` returns `run_result` with
`plan_execution_metrics` / `journey_execution_metrics` (`total/passed/failed/…`)
and `executions[]`. Each execution has `status`, `success`, `plan`,
`plan_execution` (`id`, `status`, `is_retry` — note: **no `retry_of_id`**), and
`journey_executions[]` with per-test `test_id`, `success`, `status`,
`browser_type`, `initial_url`, `journey_execution_id`, `href` (timing too).
**There is no `test_name`/`test_labels`/`failure_summary` on a journey
execution** — join `test_id` → name/labels against `tests.json` when you need
them.

### Step 1b — (Recommended) richer run history via the public REST API

The CLI gives deployment-scoped results only. mabl's **public REST API** exposes a
cross-run *history* endpoint that makes flake, rot, and pass-rate far more
accurate. Use it when you have a mabl API key (the same credential the CLI uses;
confirm the exact auth header from the api.mabl.com docs — don't assume one).
**Key hygiene (required):** never inline the API key literal — read it from an env
var and pass it in the header, e.g. `-H "X-API-Key: $MABL_API_KEY"` (confirm the
exact header name per those docs). Never echo, log, or persist the key; prefer the
CLI where it has an equivalent read.

```
GET https://api.mabl.com/v1/results/workspace/{workspace_id}/testRuns
    ?earliest_run_start_time=<epoch_ms>&latest_run_start_time=<epoch_ms>
    &limit=2000[&cursor=...][&test_label=...][&application_id=...][&outcomes=failed]
```

- **Max 90 days per query** — iterate windows for longer history. Page with `cursor`.
- Pass the **invariant** test id (the id from `mabl tests list`); a variant id can return empty.
- Returns `number_of_runs`, `number_of_successful_runs`, `number_of_failed_runs`,
  and `test_results[]` where each run carries `success`, `outcome`
  (`passed|failed|stopped`), `failure_category`, `status_cause`, `start_time`,
  `browser`, `trigger_type` (includes `retry`), `test_id`/`test_version`,
  `plan_id`, `triggering_deployment_event_id`.

This yields, per test, exact run counts + pass/fail + last-run time + retry flag
across the whole window — the ideal input for the metrics below. If you can't use
the API, fall back to the deployment `describe` data from Step 1.

### Step 2 — Compute the metrics (you, from the JSON)

Prefer the Step 1b run-history fields where available (cleaner + wider than
deployment data); the definitions below map to both sources.

Build one record per test across all deployments in the window, then derive:

- **Flake rate** — a test is *flaky* if the same `test_id` shows both a
  `success:false` and a `success:true` result with no code/test change between
  them: either across the window's deployments, or within one deployment where a
  plan was retried (an `executions[]` entry with `plan_execution.is_retry:true`
  — match it to the original by the same `plan.id`, since `retry_of_id` isn't
  emitted). Report: overall flake rate = flaky tests / tests run, and the **top
  15 flakiest tests** (resolve names via the `test_id`→`tests.json` join; include
  flip count and browser).
- **Pass/fail health & trend** — aggregate `passed/failed/total` per deployment
  (from `run_result.*_execution_metrics`), ordered by deployment time. Report
  current pass rate + direction (improving/flat/degrading).
- **Test rot** — flag four rot classes (all directly computable):
  1. *Disabled dead weight*: `enabled:false` in `tests.json` — carried but not run.
  2. *Orphaned/never-run*: enabled but its `test_id` never appears in any
     windowed deployment's `journey_executions`.
  3. *Chronically broken*: runs in the window but `success:true` in 0% of runs.
  4. *Stale*: old `last_updated_time` (not edited in N months) with low/zero
     recent run count. (`tests list` exposes `last_updated_time`, so "stale" is a
     real edit-recency signal, not a guess.)
- **Velocity** — new tests per week from `created_time`; deployment frequency
  (deploys/week); total runs in window. (Version-level authoring history is not
  a CLI capability, so velocity = creation + execution cadence.)
- **Coverage by application** — join `tests`/`plans` to `application_id` (from
  `plans.json`) and by label; report tests-per-app and per-label, and call out
  apps/labels with 0–few tests as thin coverage. This is inventory mapping, not
  code coverage — for route/flow gap analysis, map each test's exported steps to
  your app's routes rather than relying on these counts.
- **Infrastructure waste** — quantify:
  - *Retry waste*: total retried runs (count of `is_retry:true`) and % of runs
    that are retries.
  - *Low-signal tests*: tests that pass 100% of the time over many runs and run
    on a high-frequency schedule — candidates to run less often.
  - *Dead weight*: orphaned tests (never run) still carried in the suite.

### Step 3 — Emit the scorecard

Output this structure (fill every section; show counts and name the
worst offenders, don't just summarize):

```
# Workspace Quality Scorecard — <workspace/app> (<window>)

## Headline
- Overall pass rate: NN%  (trend: up/flat/down)
- Flake rate: NN%  (M flaky of K run)
- Tests: total T | run in window R | never run in window O
- Deployment frequency: D/week | Retry waste: X% of runs are retries

## Flake — top offenders
| test | flips | browser | note |

## Test rot
- Orphaned (never run): N  → [names / first 10]
- Chronically broken (0% pass): N  → [names]
- Stale (old + idle): N

## Coverage by application (inventory)
| application_id | tests | plans | thin? |

## Infrastructure waste
- Retry waste: ... | Low-signal always-pass tests: ... | Dead weight: ...

## Fix this first (prioritized)
1. <highest-leverage action, e.g. "quarantine + fix the 5 chronically-broken tests in app X">
2. ...
```

### Step 4 — Prioritize honestly

Rank the "fix first" list by leverage: chronically-broken tests blocking a gate
> high-flip flaky tests in critical apps > retry waste > orphaned dead weight >
thin-coverage apps. Tie every recommendation to a specific test/app/number.

## Caveats to state in the report

- "Coverage" here is **test inventory mapped to apps/labels**, not code
  coverage. A black-box E2E tool cannot report code coverage.
- Flake and rot are derived from **deployment run history**; tests run outside
  deployment events (ad-hoc/scheduled plans not captured here) may be
  under-counted. Note the window and whether you sampled deployments.
- `tests list` exposes `created_time`, `last_updated_time`, and `enabled` — good
  for velocity and rot. It does NOT expose per-test last-*run* time or pass/fail;
  those come from the deployment `journey_executions` join, so a test run outside
  deployment events won't be counted. Treat rot as a strong signal to
  investigate, not proof.
- `journey_executions` carry `test_id` but not `test_name` — always resolve
  names via the `tests.json` join before naming offenders in the report.
