---
name: mabl-failure-triage
description: >-
  Root-cause a failing mabl test run or deployment by fetching its raw artifacts
  (network/HAR, console logs, DOM, screenshots) via the read-only mabl CLI and
  reasoning over them — then classify each failure as flaky vs. real and suggest
  a fix. This is the deep "why did this specific run fail" analysis; for a
  whole-deployment gate verdict with PR attribution and a ship/hold call, use
  `mabl-review-deployment`. Use when someone shares a failing test-run id
  (ends in -jr), a deployment id, or asks "why did this fail", "triage this
  failure", "is this flaky or a real bug", or "debug this run".
allowed-tools: Bash
---

# mabl Failure Triage (Claude over raw artifacts)

Root-cause a failing run by pulling the artifacts that describe it — network
requests, console logs, DOM, screenshots — and having Claude reason over them.
This skill does that with read-only CLI calls, so it is safe to run in
locked-down or regulated environments.

## When to use

- "Why did this run fail?" (a `*-jr` test-run id)
- "Triage this deployment / what broke?" (a deployment id)
- "Is this failure flaky or a real product bug?"

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
nothing Claude runs here creates, edits, runs, or deletes. The `mabl agent`
subtree ("agent-friendly debug commands") is the artifact-slicing path used
below. If `describe`/`steps` returns nothing, say so — don't fabricate a cause.

**Inputs:** a failing **test-run id** (`*-jr`) OR a **deployment id**
(triage all failures in it). Optional: `workspace_id` (`-w`).

**Output:** write working dumps and the final report under `./mabl-reports/`
(create it; add it to `.gitignore` if you're in a repo). Report:
`./mabl-reports/failure-triage-<jr>-<date>.md`.

## Hard rules

- **Read-only.** `describe`, `export`, and `agent debug artifact` only. Never
  edit/rerun a test. You are the analyst.
- **Slice, don't dump.** HARs and DOMs are large. Use `--query` / `--text-only`
  filters (below) — never print a multi-MB artifact wholesale into context.

## Procedure

### Step 0 — If given a deployment, find the failing runs first

```bash
mkdir -p ./mabl-reports   # working dumps + final report live here (gitignore in a repo)
mabl deployments describe <deployment_id> --output json > ./mabl-reports/dep.json
```

From `dep.json`, list every `run_result.executions[].journey_executions[]` entry
with `success:false`. For each, capture `test_id`, `journey_execution_id`,
`href`, `initial_url`, and `browser_type` (the run id you'll debug is the
`journey_execution_id` / the tail of `href`). These entries do **not** include a
failure message or `test_name` — resolve names via `mabl tests list` if needed,
and get the failure detail from the artifacts in the next steps. A plan that was
retried appears as a second `executions[]` entry with
`plan_execution.is_retry:true` (matched to the original by the same `plan.id` —
there is no `retry_of_id`); if the same `test_id` failed on the first attempt and
passed on the retry, that's a strong *flaky* signal.

### Step 1 — Locate the failing step

```bash
mabl agent debug steps <jr-id>      # default: failed + recovered steps; copy the step_run_id
```

### Step 2 — Pull only the relevant artifact slices

```bash
# Network: only error responses
mabl agent debug artifact network <jr-id> --step-run-id <sid> \
  --query '.log.entries[] | select(.response.status >= 400)'

# Console: only errors + JS exceptions
mabl agent debug artifact console <jr-id> --step-run-id <sid> \
  --query '[.console_logs[] | select(.level == "error")] + .javascript_exceptions'

# DOM at failure (text only)
mabl agent debug artifact dom <jr-id> --step-run-id <sid> --text-only

# Screenshot at failure (open the returned file path)
mabl agent debug artifact screenshot <jr-id> --step-run-id <sid>
```

`--query` needs `jq` on PATH. **No `jq`, or `mabl agent debug` disabled?** The
`mabl agent` subtree may be disabled on some accounts; either way, fall back to
the read-only bulk export and parse the files yourself:
```bash
mabl test-runs export <jr-id> --types console_logs doms hars screenshots --file ./mabl-reports/run_<jr-id>
```
`--types all` covers those but excludes `xray_json`. These files can contain
session tokens, PII, and app URLs/selectors — handle per your data policy and
delete them when done.

**Public REST API shortcut (has the failure detail `describe` omits):** if you
have a mabl API key, `GET https://api.mabl.com/v1/results/testRun/{test_run_id}`
returns `failure_category`, `status_cause`, `failure_summary`, and per-flow
metrics directly — often enough to classify without pulling artifacts. For
artifacts, `POST /v1/report/runArtifacts/testRun/{id}` then
`GET /v1/report/runArtifacts/export/{export_id}` yields a signed ZIP
(screenshots/HARs/DOMs/console/traces). **Key hygiene (required):** never inline
the API key literal — read it from an env var and pass it in the header, e.g.
`-H "X-API-Key: $MABL_API_KEY"` (confirm the exact header name in the
api.mabl.com docs). Never echo, log, or persist the key; prefer the CLI where it
has an equivalent read.

### Step 3 — Reason to a root cause

Correlate the evidence:
- **Network 4xx/5xx** on the failing step → backend/API dependency, auth/token
  expiry, or a changed endpoint. Map the failing URL back to the app.
- **Console errors / JS exceptions** → front-end regression or a broken script
  step.
- **DOM at failure** → element missing/renamed/detached (selector drift),
  unexpected modal/interstitial, or "not secure"/nav interstitial.
- **Screenshot** → visual confirmation (blank page, error page, unexpected
  state).
- **Timing pattern** ("execution context destroyed", element found-then-gone) →
  race/navigation timing.

### Step 4 — Classify and recommend

Produce, per failing test:

```
## <test_name>  (<jr-id>)
- Verdict: FLAKY | REAL FAILURE  (+ confidence)
  - flaky if: a retry passed, or evidence points to timing/transient network
  - real if: deterministic 4xx/5xx, missing element, or JS error every run
- Symptom: <one line>
- Evidence: <the specific 4xx URL / console error / missing selector / screenshot state>
- Likely root cause: <hypothesis>
- Suggested fix: <test-side (selector/wait/step) OR product-side (file a bug on endpoint/component)>
- Owner hint: test author vs. app team
```

If triaging a deployment, end with a short roll-up: N failures → X flaky / Y
real; the real ones grouped by app/endpoint/component so a human can route them.

### Step 5 — Prescribe the fix and hand off to a human

Claude doesn't auto-edit the test — the fix itself is a human action, so
pinpoint it precisely, then hand it off.

**Prescribe the fix precisely.** Name the exact step + the change: the new selector, the
corrected assertion (expected value), an added wait-on-state (not a sleep), or the data
fix. Confirm the culprit step is in the test's **own** flow — if it's a shared/reusable
flow (`EvaluateFlow` / "Running Flow:"), say so; that's a human change affecting every
caller.

**Hand off to the Trainer (human, write-capable key).** Tell the user exactly what to
change, then have *them* open the test in the Trainer with
`mabl tests edit --id <test-id>` and apply it. Claude never runs this — it opens a
browser/Trainer and needs a write-capable key (a read-scoped key can't). If the test
broke right after an edit, compare its recent versions with
`mabl tests versions <test-id>` and `mabl tests compare` to see the diff and
decide restore-vs-fix-forward.

## Caveats

- Distinguish **test-side** fixes (selector/wait/data) from **product-side**
  bugs (a real 5xx or regression) — say which, and don't recommend "just add a
  wait" for what is actually a broken endpoint.
- A single failed run can't prove flakiness; a passed retry or a cross-run
  pattern can. State your confidence.

## Optional deep repro — human-run only, NOT read-only, never against production

If the artifacts aren't conclusive, a human can reproduce the failure live.
**This is not read-only and Claude never runs it.**
`mabl agent debug session start --run-id <jr>` opens a real Chrome **seeded with the
failing run's credentials, environment, and URL**, and the `run-*` verbs
(`session run-to-step`, `run-step`, `run-all`) **re-execute the test's own steps** in
that browser — which in a real app can submit forms or create/modify data. So a human
runs it, with a write-capable key, and **never against a production environment**.

For that human: `mabl agent debug session start --run-id <jr>` returns a session id;
`mabl agent debug session list-steps <sid> --output json` lists steps;
`mabl agent debug session run-to-step <sid> <position>` steps to the break (stops on
failure); `mabl agent debug session get-variables <sid>` inspects variable state at the
failure. Only the `run-*` verbs execute steps — `start`, `list-steps`, and
`get-variables` do not.
