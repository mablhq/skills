---
name: mabl-run-digest
description: >-
  Turn a mabl test run or deployment into *information*, not a pass/fail verdict:
  what changed since last time — the test's version/steps, its runtime (feedback
  speed), console/JS error count, and network (API) error count — even when the
  run PASSED. Compares against the previous run of the same test(s) using
  read-only mabl CLI + public API data; your Claude computes the deltas. Use when
  someone asks "what changed in this run", "is this deploy slower / noisier than
  before", "what's different about this run", "give me the info beyond green/red",
  or "did anything degrade even though it passed".
allowed-tools: Bash
---

# mabl Run Digest (information beyond pass/fail)

Pass/fail throws away most of what a test run tells you. A run can stay green
while its runtime regressed, a new console error appeared, or an API call started
returning 4xx on a non-critical path. This skill reads the same artifacts a run
already produces and reports **what changed** relative to the previous run — so a
green pipeline still yields signal.

## When to use

- "What changed in this run / deployment?" (even a passing one)
- "Is this slower or noisier than last time?"
- "Give me the information, not just red/green."
- A recurring digest after each deployment for a leadership-facing trend.

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
nothing here creates, edits, runs, or deletes. Optionally, a mabl API key enables
the public run-history endpoint for baselines; the `mabl agent debug` subtree
supplies the per-step artifacts. If you can't find a comparable baseline run, say
so — don't invent a trend.

**Inputs:** a **test-run id** (`*-jr`) OR a **deployment id** (`*-v`, digest
every test in it). Optional: `workspace_id` (`-w`).

**Output:** write working dumps and the final report under `./mabl-reports/`
(create it; add it to `.gitignore` if you're in a repo). Report:
`./mabl-reports/run-digest-<jr>-<date>.md`.

## Hard rules

- **Read-only.** `describe`, run-history reads, and `agent debug artifact` only.
  You compute the deltas.
- **A delta needs a baseline.** Always compare against a *specific* prior run and
  name it. If you can't find a comparable prior run, say so — don't invent a trend.
- **Slice artifacts, don't dump.** Use `--query` / counts, never print MBs.

## Procedure

### Step 1 — Establish "this run" and its baseline

If given a deployment, list its runs first:
```bash
mkdir -p ./mabl-reports   # working dumps + final report live here (gitignore in a repo)
mabl deployments describe <deployment_id> --output json > ./mabl-reports/dep.json
```
Take each `run_result.executions[].journey_executions[]` (`test_id`,
`journey_execution_id`, `browser_type`, `timing`, `success`).

Find the **baseline** = the previous run of the *same* `test_id` on the *same*
`browser_type`. Best source is the public run-history endpoint (cross-run, invariant
test id):
```
GET https://api.mabl.com/v1/results/workspace/{ws}/testRuns?test_id={id}&latest_run_start_time={this_run_start}&limit=5
```
It returns prior runs with `start_time`, `outcome`, `browser`, `trigger_type`. Pick
the most recent run *before* this one on the same browser. (Without an API key,
fall back to comparing the two `executions[]` of a retried plan, or ask the user
for the prior `*-jr`.) **Key hygiene (required):** never inline the API key literal —
read it from an env var and pass it in the header, e.g. `-H "X-API-Key: $MABL_API_KEY"`
(confirm the exact header name in the api.mabl.com docs). Never echo, log, or persist
the key; prefer the CLI where it has an equivalent read.

### Step 2 — Compute the four deltas

For **this run** and the **baseline**, gather each signal and diff it.

**(a) Structural change — did the test itself change?**
```bash
mabl tests versions <test_id>            # integer versions; no --output/-w
```
If the version differs between the two runs, diff the steps (this explains behavior
changes):
```bash
mabl tests compare <test_id>:<baseline_ver> <test_id>:<this_ver> --output json
```
Report the `summary` (added/removed/changed) and the specific changed steps. A
version change is the *first* thing to check — it reframes every other delta.

**(b) Feedback speed — runtime delta.**
Compare run duration (from `journey_executions[].timing`, or run start→stop). Report
`this vs baseline` (e.g. `72s → 101s, +40%`). At the deployment level, also report
total wall-clock vs the previous deployment — "speed of feedback." To find that previous
deployment, list recent events and take the one received just before this one on the
same application/environment:
```bash
mabl deployments list -w <ws> --output json --limit 20 > ./mabl-reports/deployments.json
```

**(c) Console / JS error delta.** Count errors on each run's failing-or-final step
(a *passing* run can still log errors):
```bash
mabl agent debug steps <jr>                              # get step_run_id(s)
mabl agent debug artifact console <jr> --step-run-id <sid> \
  --query '[.console_logs[] | select(.level=="error")] + .javascript_exceptions | length'
```
Report `this vs baseline` error count and any *new* error strings present now but
not before.

**(d) Network / API error delta.** Count 4xx/5xx responses:
```bash
mabl agent debug artifact network <jr> --step-run-id <sid> \
  --query '[.log.entries[] | select(.response.status>=400)] | length'
```
Report the count delta and any *newly failing* endpoints (URL + status) that were
clean on the baseline. `--query` needs `jq` on PATH; **no `jq`, or `mabl agent debug`
disabled** (it may be off on some accounts)? Fall back to
`mabl test-runs export <jr> --types console_logs hars --file ./mabl-reports/run_<jr>`
and count from the files. Those files can contain session tokens, PII, and app
URLs/selectors — handle per your data policy and delete them when done.

### Step 3 — Report the digest

```
# Run Digest — <test_name> (<jr>)  vs baseline <baseline_jr>
Outcome: PASS/FAIL (this) | PASS/FAIL (baseline)   ← note: outcome is NOT the point

- Structural:  version <a>→<b> — <N changed steps: which>   (or "unchanged")
- Speed:       <72s → 101s, +40%>   ← regression worth flagging even on PASS
- Console:     <2 → 7 errors>  (+5)  new: "<error string>"
- Network:     <0 → 1>  new 4xx: POST /api/quotes 429

## Read
<one or two lines: what actually changed and whether it matters — e.g. "Passed,
but runtime +40% and a new 429 on /quotes; likely rate-limiting creeping in.">
```

For a deployment, roll up: which tests regressed on speed, which gained errors,
which had structural changes — ranked, so a human sees drift across the whole deploy.

## Optional enhancement — persisted per-run annotations

The core digest above runs entirely on the shipped CLI. If a future capability
lets you attach structured annotations to a `TestRun` (e.g.
`{digest:{durationMs, consoleErrors, networkErrors, version}}`), you could persist
each run's digest and, next time, read the stored annotation instead of
re-fetching the baseline — yielding a *multi-run* trend rather than just
this-vs-last. Treat this as strictly optional: never assume it exists or invoke a
command you haven't confirmed is available; otherwise use the live-compare path
above.

## Caveats

- **Baseline honesty.** Same test id, same browser, closest prior run. Cross-browser
  or cross-version comparisons are apples-to-oranges — say which you used.
- **Timing is noisy.** One run's duration can swing on network/CI load; flag a
  single-run spike as *possible*, a multi-run trend as *real* (a persisted multi-run
  history, where available, makes this rigorous).
- **A passing run with a new 5xx** may be a real product issue the assertions didn't
  catch — surface it, don't bury it under the green checkmark.
