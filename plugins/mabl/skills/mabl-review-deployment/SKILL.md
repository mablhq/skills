---
name: mabl-review-deployment
description: >-
  Triage a mabl deployment event end-to-end for a team:
  classify every failed test as flaky vs broken, root-cause the broken ones over
  raw artifacts, tie failures to the triggering commit/PR, and hand back a
  prioritized "what's wrong + how to fix + open the Trainer" list. Diagnoses and
  prescribes; never auto-edits and never merges.
  Use for a whole-deployment gate verdict (a `*-v` event); for a deep root-cause of
  one failing run (`*-jr`), use `mabl-failure-triage`.
  Use when someone gives a deployment id (`*-v`) or asks "review this deployment",
  "did this deploy break anything", "is this PR safe to ship", "triage this
  deployment", or "what needs attention from this deploy".
allowed-tools: Bash
---

# mabl Review Deployment (diagnose + prescribe, human applies)

The day-to-day CI-gate question: *a deployment ran the suite — what failed, is it
real, and what do we do?* This skill does the whole triage/classify half and
**delivers a precise fix prescription + a Trainer hand-off** for a human to
apply. Every command is read-only, so it is safe to run in locked-down or
regulated environments.

## When to use

- "Review this deployment / did it break anything / is this PR safe to ship?"
- Daily: your CI gate (`deployments create`) went red — triage it.

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.118.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth info    # verify you're logged in (run `mabl auth login --auto` if not)
```

This skill only **reads** (and never merges). If your account supports scoped API
keys, a **read-scoped** key is sufficient (and recommended for regulated
environments). Optional: `gh` for PR attribution; a mabl API key for run-history
(Step 2). If `describe` returns no failed executions, report a clean deploy
rather than empty metrics.

**Input:** a deployment event id (`*-v`) or a `.../output/deployments/<id>-v` URL.

**Output:** write dumps and the final report under `./mabl-reports/` (create it;
add it to `.gitignore` if you're in a repo). Report:
`./mabl-reports/review-deployment-<deployment-id>-<date>.md`.

## Hard rules

- **Read-only + diagnose.** `describe` / `agent debug` / result reads only. **Never
  edit a test, never merge.** The human applies fixes via the Trainer.
- **`deployments describe` needs `--output json`** for `executions[]` + `is_retry`.

## Procedure

### Step 1 — Pull + classify (within-deployment)

```bash
mkdir -p ./mabl-reports   # working dumps + final report live here (gitignore in a repo)
mabl deployments describe <id> --output json > ./mabl-reports/dep.json
```

From `dep.json`: `run_result.plan_execution_metrics` / `journey_execution_metrics`
(headline pass/fail), `properties` (repo/branch/commit/build_info_url — for
attribution), and `run_result.executions[]`. Per test in `journey_executions[]`
(`test_id`, `success`, `status`, `browser_type`, `journey_execution_id`, `href`):
- **flaky** = failed then passed on a retry (a second `executions[]` entry with
  `plan_execution.is_retry:true`, matched to the original by the same `plan.id`,
  where the same `test_id` flips fail→pass).
- **broken** = failed with no passing evidence this deployment.
(join `test_id` → name via `mabl tests list`.)

### Step 2 — Widen with run history (new vs existing)

Use the public run-history endpoint to avoid mis-calling a chronic failure "flaky":
```
GET https://api.mabl.com/v1/results/workspace/{ws}/testRuns?test_id=<invariant-id>
    &earliest_run_start_time=<ms>&latest_run_start_time=<ms>&limit=2000
```
Green-before/failing-now → **new** (likely change-related); long intermittent →
**existing flaky**; consistently failing (incl. flaky-with-an-all-red-tail) →
**broken**. (No API key? Skip; note the classification is within-deployment only.)
**Key hygiene (required):** never inline the API key literal — read it from an env
var and pass it in the header, e.g. `-H "X-API-Key: $MABL_API_KEY"` (confirm the
exact header name in the api.mabl.com docs). Never echo, log, or persist the key;
prefer the CLI where it has an equivalent read.

### Step 3 — Root-cause the broken ones (raw artifacts)

Per broken test's `*-jr` (fan out — read-only):
```bash
mabl agent debug steps <jr>
mabl agent debug artifact network <jr> --step-run-id <sid> --query '.log.entries[]|select(.response.status>=400)'
mabl agent debug artifact console <jr> --step-run-id <sid> --query '[.console_logs[]|select(.level=="error")]+.javascript_exceptions'
mabl agent debug artifact dom <jr> --step-run-id <sid> --text-only
mabl agent debug artifact screenshot <jr> --step-run-id <sid>
```
`--query` needs `jq` on PATH. **No `jq`, or `mabl agent debug` disabled** (it may be
off on some accounts)? Fall back to the read-only bulk
export and parse the files: `mabl test-runs export <jr> --types console_logs doms hars
screenshots --file ./mabl-reports/run_<jr>`. Those files can contain session tokens,
PII, and app URLs/selectors — handle per your data policy and delete them when done.
(Or the public single-run read `GET /v1/results/testRun/{jr}` for `failure_category`/`failure_summary`.)

### Step 4 — Attribute to a change

From `properties`: `repository_name`, `revision` (commit), `repository_branch_name`,
`build_info_url`. If `gh` is available:
`gh api repos/<org>/<repo>/commits/<revision>/pulls` → PR # + title + author. If the
title has a ticket id, note it. If no clear PR, say so and report the commit + build URL.

### Step 5 — Classify fix-type + hand off (NO auto-edit)

Per failing test, assign a fix-type and the concrete next action:
- **update-test** (stale selector/assertion; a change moved the goalposts, or clear
  test-rot named consistently across runs) → prescribe the exact step + change; a human
  then opens the Trainer with `mabl tests edit --id <test-id>` and applies it (Claude
  never runs this — it opens a browser/Trainer and needs a write-capable key). If it's
  stale after an intended change, compare its recent versions with
  `mabl tests versions <test-id>` and `mabl tests compare` to see the diff.
- **likely product bug** (mabl `regression`, deterministic 4xx/5xx, JS error every run,
  in a surface the change touched) → flag to the engineer: test, step, expected-vs-found,
  suspected commit. Do NOT edit the test to mask it.
- **environment** (shared-credential 429 / "Unexpected Error" cluster under parallel load,
  unseeded data, runner/infra) → name it + owner; don't touch test or product.
- **flaky** (timing/race) → note it; recommend a wait-on-state fix via the Trainer.

> **Shared-flow caveat:** if the root cause is in a shared/reusable flow (an
> `EvaluateFlow` / "Running Flow:" step), say so — a fix there affects every test that
> calls it; it's a deliberate human change, not a one-test edit.

## Report

- **Identity** — deployment label/time, repo + commit + PR (author, what it changed).
- **Headline** — `N passed / M failed / K terminated`; test breakdown `flaky / broken`.
- **Classification table** — one row per failing test: class · age (new/existing) ·
  caused-by-change (y/n) · fix-type · step-level root cause · action (Trainer / flag / env).
- **Prioritized fixes** — broken-blocking-the-gate first, then flaky by frequency.
- **Verdict** — one line: ship / hold / needs a test update. Surface every id
  (`-v`, failing `-jr`s, PR) so a human can verify.

## Caveats

- **This never edits or merges** — the human applies the prescribed fix in the
  Trainer. That's the intended workflow.
- flaky/broken is a within-deployment verdict until Step 2 widens it with history.
- The shared-credential 429 cluster is a *known* env instability — name it, don't
  re-diagnose it as N separate bugs.
