---
name: mabl-fleet-quality-rollup
description: >-
  Roll a test-automation health scorecard up across MANY mabl workspaces into one
  leadership view — a health leaderboard, at-risk-workspace flags, and org-level
  flake/pass-rate/rot/run-volume totals. For orgs running tens of workspaces who
  need the fleet picture, not one workspace at a time. Read-only CLI; Claude
  computes the metrics. Use when someone asks for an "org/fleet/portfolio
  quality view", "which teams/workspaces are healthiest or at risk", "leadership
  test-health dashboard", or "roll up quality across all our workspaces".
allowed-tools: Bash
---

# mabl Fleet Quality Roll-Up

A single-workspace health report answers "how healthy is this workspace."
Leadership in a large org asks a different question: **"across all our
workspaces, which are healthy, which are at risk, and how are we doing
overall?"** This skill produces that fleet view by scoring each workspace from
read-only CLI data and rolling the scores up into one leadership picture. You
(Claude) do the analysis. Every command here is **read-only**, which makes the
roll-up safe to run in locked-down or regulated environments.

## When to use

- Leadership/portfolio review across many workspaces (tens+).
- "Which teams are at risk?" / "Where do we focus maintenance effort?"
- An org-level quality trend for a QBR or leadership readout.

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
nothing here creates, edits, runs, or deletes. If a workspace's `list` returns 0
rows, skip it with a clear note rather than emitting NaN metrics.

**Output:** write per-workspace dumps and the final report under `./mabl-reports/`
(create it; add it to `.gitignore` if you're in a repo). Report:
`./mabl-reports/fleet-rollup-<account>-<date>.md`.

**Inputs (ask if not given):**

- Which workspaces: an explicit list of `workspace_id`s, or "all I can see"
  (enumerate via `mabl workspaces list`).
- `window` (default: last 30 days).
- Optional health thresholds (defaults below).
- **Scale control:** for many workspaces, sample deployments per workspace
  (e.g. last 10) to keep it fast/cheap — and say you sampled.

## Hard rules

- **Read-only** (`list` / `describe`). Parameterized.
- **`--limit`**: every `list` defaults to 10 — override (`--limit 5000` for
  tests/plans, `--limit 30` for deployments-per-workspace).
- **Truncation guard.** `tests list`/`plans list` have only `--limit` (no cursor). If a
  per-workspace `list` returns exactly `--limit` rows it's **truncated** — flag that
  workspace **"PARTIAL"** in the leaderboard and scope it by `--labels`; org totals
  built on truncated per-workspace data are wrong, so never present them as complete.
  (`plans list --limit` is applied **before** label filtering, so `--labels X --limit
  5000` can still miss matching plans on a huge workspace.)
- **`deployments describe` needs `--output json`** for per-test executions +
  `is_retry`. Names come from a `test_id → tests list` join.

## Procedure

### Step 1 — Enumerate the fleet

```bash
mkdir -p ./mabl-reports   # per-workspace dumps + final report live here (gitignore in a repo)
mabl workspaces list --output json --limit 200 > ./mabl-reports/workspaces.json
```

Fields per workspace: `id`, `name`, `account_id`, `execution_runner_size`,
`labs_features`. Filter to the target account/list. (If the user gave explicit
ids, skip enumeration.)

### Step 2 — Score each workspace

For each target `workspace_id`, gather the same read-only data a single-workspace
scorecard uses and compute its metrics:

```bash
WS="<id>"
mabl tests list       -w "$WS" --output json --limit 5000  > ./mabl-reports/tests_$WS.json
mabl deployments list -w "$WS" --output json --limit 30    > ./mabl-reports/deps_$WS.json
# then, per deployment in window:
mabl deployments describe <dep_id> --output json           > ./mabl-reports/dep_${WS}_<dep_id>.json
```

Per workspace, compute these metrics (definitions inline so each is
self-contained): **pass rate** (passed / total across the window's
deployments); **flake rate** (a `test_id` is flaky when it shows both a
`success:true` and a `success:false` with no change between them — including a
retried plan execution flagged `is_retry:true`); **test-rot count** (disabled =
`enabled:false`; orphaned = never appears in any windowed `journey_executions`;
chronically-broken = 0% pass over its runs; stale = old `last_updated_time` with
little recent activity); **run volume**; **active users**; **deployment
frequency**. Resolve names via the `test_id → tests list` join.

Reduce each workspace to a small record:
`{workspace, tests, run_volume, pass_rate, flake_rate, rot_count, deploys, users}`.

### Step 3 — Compute a health score + classify

Define a transparent composite (show the formula), e.g.:

```
health = 0.45*pass_rate + 0.35*(1 - flake_rate) + 0.20*(1 - rot_ratio)
rot_ratio = rot_count / tests
```

Classify each workspace by thresholds (defaults; state them):
- **At risk**: pass_rate < 0.85 OR flake_rate > 0.10 OR rot_ratio > 0.25
- **Watch**: any one metric near a threshold
- **Healthy**: otherwise

### Step 4 — Aggregate to org level

- Org totals: total tests, total 30d run volume, weighted pass rate (weight by
  runs), org flake rate, total rot, total deployments, active users.
- Distribution: count of workspaces Healthy / Watch / At-risk.
- Cross-workspace themes: the same failing dependency/app appearing in multiple
  workspaces; a metric (e.g. accessibility) declining fleet-wide.

### Step 5 — Emit the fleet report

```
# Fleet Quality Roll-Up — <org/account> (<window>, W workspaces)

## Org headline
- Weighted pass rate: NN% | Org flake rate: NN% | Total rot: N tests
- Run volume (30d): N | Active users: N | Deploys: N
- Health distribution: Healthy X · Watch Y · At-risk Z

## Leaderboard (by health score)
| workspace | health | pass% | flake% | rot | runs30d | class |

## At-risk workspaces (focus here)
- <workspace>: <the one-line reason + the single highest-leverage fix>

## Cross-workspace themes
- <shared flaky dependency / fleet-wide declining metric / common rot pattern>

## Recommended focus (prioritized, org-level)
1. <e.g. "3 workspaces share a flaky auth dependency — fix once, help all three">
2. ...
```

### Step 6 — Prioritize for leverage

Favor fixes that help multiple workspaces (shared dependencies/flows), then the
worst at-risk workspaces by run volume (biggest blast radius). Tie every
recommendation to specific workspaces + numbers.

## Caveats

- **Cost/scale:** scoring N workspaces × M deployments is many CLI calls. Sample
  deployments per workspace and **state the sample**; offer to deepen on the
  at-risk ones.
- Metrics are derived from deployment run history — runs outside deployment
  events (ad-hoc/scheduled plans not captured here) are under-counted. Note the
  window and whether you sampled.
- The health-score weights are a starting formula; tune them with the team
  (leadership may weight flake or coverage differently). Always show the formula
  so the score is auditable.
