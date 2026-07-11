---
name: mabl-suite-signal
description: >-
  Profile a CI/CD **test suite** — a recurring deployment signature
  (repo · branch · plan labels · environment) — over a time window and deliver a
  signal-vs-noise-vs-waste verdict: pass/fail + trend, the rerun/flake tax, run
  duration (including hung runs), and a run-volume cost proxy — then DECOMPOSE
  the suite-level result into the specific plans/tests driving it, so an
  all-or-nothing "100% red" becomes an action list. Uses read-only mabl CLI data
  only; your Claude computes the metrics and the verdict. This
  profiles ONE recurring suite signature over time; for whole-workspace gate
  metrics across all deployments use `mabl-pipeline-reliability`. Use
  when someone asks "is this test suite worth running / giving signal", "suite
  health / scorecard", "why is this suite always red", "which of our CI suites
  are noise or waste", "flake tax", "rank our test suites", or wants a per-suite
  deployment-gate view over time.
allowed-tools: Bash
---

# mabl Test-Suite Signal (signal vs noise vs waste)

A CI test suite that shows red every run isn't necessarily broken — and one
that's always green isn't necessarily valuable. This skill profiles a **suite**
over time from read-only deployment data and answers the question a raw
pass/fail can't: **is this suite giving real signal, drowning in flake, or
burning runs for little value?** It computes every metric itself, and every
command is read-only, so it is safe in locked-down or regulated environments.

> A **suite** = a stable deployment signature: `repo · branch · plan-labels ·
> environment`. The same pipeline firing the same labelled plans against the same
> environment, run after run. Grouping deployments this way is what turns
> individual events into a trend.

## When to use

- "Is this CI test suite worth what it costs / is it giving signal?"
- "Why is this suite always red?" — decompose the all-or-nothing rollup.
- "Rank our test suites by health — find the noise and the waste."
- A recurring per-suite gate review (the "I check this every week" cadence).

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
rows (unauthenticated, wrong workspace, or no deployment events), stop and say
so — don't emit NaN metrics or an empty ranking.

**Output:** write working dumps and the final report under `./mabl-reports/`
(create it; add it to `.gitignore` if you're in a repo). Report:
`./mabl-reports/suite-signal-<workspace>-<date>.md`.

**Inputs (ask if not given):**

- A **suite signature** to profile: repo + branch (+ optional plan label + environment). Or "all suites" to rank every suite in the workspace.
- `workspace_id` (`-w`) — target workspace. If omitted, uses the CLI default (`mabl config`).
- `window` — how far back to analyze (default: last 30 days of deployments).

## Hard rules

- **Read-only.** Only `deployments list` / `deployments describe` (+ `environments list` / `tests list` to resolve names). Never run/edit/create/delete. You reason over the raw status.
- **Beat the default limit.** `deployments list` defaults to `--limit 10`; pass a large `--limit`.
- **Truncation guard.** `deployments list` has only `--limit` (no cursor). If it returns exactly `--limit` rows, the window is **truncated** — the oldest events (and possibly whole suites) are missing; raise the `--limit`, or narrow the window and headline the report **"PARTIAL — computed on the most recent N events"**.
- **`deployments describe` needs `--output json`** or it strips the per-plan results.
- **Never report suite pass/fail without decomposing it.** Suite status is all-or-nothing across every plan in the event — one chronic failer makes *every* run red. Always report plan-level pass rate alongside, and name the plans driving the result.

## Procedure

### Step 1 — List deployment events in the window

```bash
WS="<workspace_id>"
mkdir -p ./mabl-reports   # working dumps + final report live here (gitignore in a repo)
mabl deployments list -w "$WS" --output json --limit 500 > ./mabl-reports/events.json
```

Each event carries `id`, `received_time`, `environment_id`, `application_id`,
and `properties.{repository_name, repository_branch_name, repository_commit_username, build_info_url}`,
plus `triggered_plan_run_summaries[]`. The **plan labels** that complete the
suite signature live on `describe`, not `list` (Step 2).

### Step 2 — Group events into suites (the signature)

Describe each event to read its `plan_labels` and confirm repo/branch/env, then
group by the signature `repository_name · repository_branch_name · plan_labels · environment_id`:

```bash
mabl deployments describe <event_id> --output json > ./mabl-reports/dep_<id>.json
mabl environments list -w "$WS" --output json --limit 100 > ./mabl-reports/envs.json   # resolve environment_id -> name (default --limit is 10)
```

To profile ONE suite, filter to events whose `plan_labels` + repo/branch/env
match the target. Cap describes at ~50–100 events for cost; **note if you sampled**.

### Step 3 — Read the per-event result

From each `dep_<id>.json`, `run_result` gives you the decomposition without any
manual retry-matching:

- `event_status.succeeded_first_attempt` — **initial** status (before any rerun).
- `event_status.succeeded_with_retries` — **final** status (after reruns).
- `event_status.succeeded_by_plan` — `{plan_id: bool}` **per-plan final** status (the decomposition, handed to you).
- `plan_execution_metrics.{total, passed, failed}` — plan-run counts (`total` includes reruns).
- `executions[]` — each has `plan.{id,name}`, `plan_execution.{is_retry, status}`, `start_time`, `stop_time`, and `journey_executions[]` (`test_id`, `browser_type`, `success`).

### Step 4 — Compute the suite rollup (you, across the window's events)

- **Pass rate + trend** — % of events with `succeeded_with_retries=true`. Compare initial (`succeeded_first_attempt`) vs final to see how much reruns are propping the gate up. Run two windows for the trend arrow.
- **Rerun / flake tax** — per event, a plan that failed initially then passed on a retry (an `is_retry` execution with `success=true`) is *rescued-by-rerun* → **flakiness**. A plan that failed both is **broken**. Report the % of runs needing reruns, split rescued-vs-not.
- **Duration + hung runs** — per event, `max(stop_time) − received_time`. Report total / avg / fastest / slowest. **Flag hung runs**: any event whose duration is a large multiple of the median (or exceeds a couple of hours) — a hang is different from a failure and is pure waste.
- **Cost proxy** — total plan runs and test runs (+ total runtime). Credits aren't in the public CLI, so run-volume is the honest proxy for spend.

### Step 5 — Decompose the red (the reframe)

Aggregate `succeeded_by_plan` across all the suite's events → per-plan pass rate.

- Report **plan-level pass rate** next to the suite-level rate. They diverge hard: a suite can read "100% failed" at the event level while its plans pass 70%+ — because one chronic failer sinks every event.
- Rank plans by failure rate. Separate **chronic** (fails ~every run → the suite-killers) from **flaky** (fails then passes). Resolve `plan.name` from `executions[]`. For the worst plans, drill to tests via `journey_executions[].test_id` (join names from `mabl tests list -w "$WS" --output json`).

### Step 6 — Verdict (signal vs noise vs waste)

Apply this rubric to the numbers and state a verdict + action:

| Reading | Means | Action |
|---|---|---|
| Initial (first-attempt) mostly green | fast feedback, engineers trust it | keep |
| Initial red, final green via reruns | reruns are masking flakiness; slow feedback | fix the flaky plans; don't rely on reruns |
| Final mostly red, few chronic killers | a handful of broken plans sink an otherwise-working suite | fix/quarantine the N killers → restore signal |
| Final mostly red, broadly | little value; engineers likely ignore it | prune or overhaul |
| Always green, ~never any failure | may be under-covering (never catches anything) | check coverage depth |

Verdict = **SIGNAL** (catches real regressions, low flake) · **FLAKE-NOISE** (reruns rescue most failures) · **WASTE** (never green and/or hung, burning runs). Tie it to the specific killers + the run-volume cost.

### Step 7 — Output

```
# Suite Signal — <repo · branch · label · env>  (<window>)
Verdict: SIGNAL | FLAKE-NOISE | WASTE  — <one line why>

## Rollup
- Suite runs: N   | Final pass: NN%  (initial NN%; reruns rescue +NN pts)
- Plan-level pass: NN%   ← vs suite-level NN%  (the all-or-nothing gap)
- Flake tax: NN% of runs need reruns  (rescued M / not-rescued K)
- Duration: avg <t>, slowest <t>   [WARNING: H hung runs > <threshold>]
- Cost proxy: R plan runs / T test runs in window

## Suite-killers (fix these first)
| plan | fail% | chronic / flaky | example failing tests |

## Recommendation
<fix/quarantine the N killers · fix flaky plans · reduce cadence · prune · investigate hangs>
```

For "rank all suites" mode, emit one row per suite (verdict, final pass, plan-level pass, flake tax, cost proxy), sorted worst-first.

## Caveats

- **Suite status is all-or-nothing.** Always pair the suite-level number with the plan-level pass rate; never report the scary rollup alone (it hides an otherwise-working suite behind a few killers).
- **Credits aren't public.** Run volume + runtime are the cost proxy — say so; don't imply a dollar figure the CLI can't give.
- **Labels come from `describe`, not `list`,** so building the full signature (or the "all suites" ranking) means describing events — cap the describes and note sampling.
- **Per-test-type split** (browser / api / mobile / performance) isn't clean on the public surface; `browser_type` is available per journey execution, the rest isn't.
