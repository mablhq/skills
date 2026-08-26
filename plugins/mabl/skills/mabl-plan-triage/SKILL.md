---
name: mabl-plan-triage
description: |
  A plan run came back with failures — say what happened across ALL of them at
  once. Groups the run's failing tests by shared cause, separates flaky from
  broken using each test's own recent history, separates one application defect
  surfacing many times from many unrelated test problems, and reports what
  deserves a person, in order.
  Fire on a plan run id (`*-pr`), a deployment event, or "the nightly plan
  failed", "what broke in this run", "triage this plan run", "are these
  failures related", "which of these are flaky", "is this release safe".
  This is the MANY-runs question. For ONE already-failed test run (`*-jr`) —
  step traces, screenshots, DOM, network, live reproduction — use mabl-debug,
  which this skill hands its shortlist to. It reads results and never edits a
  test, a plan, or a label.
allowed-tools: mcp__mabl__*, Bash
---

# mabl plan triage

Forty tests ran, six failed. The useful answer is almost never six separate
investigations — it's "one login change broke four of these, one is the flake
we've been ignoring, and one is real." This skill produces that answer.

It reads only. It never edits a test, changes a plan, applies a label, or
re-runs anything on its own initiative.

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.111.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth login --auto   # one-time OAuth in browser
mabl auth info           # verify you're logged in and the token hasn't expired
```

The whole read runs on the mabl MCP server. **This skill is available when
`get_mabl_plan_run` is in your tool list**; without it, say so rather than
triaging from a single run.

## 1. Pull the whole run in one call

```
get_mabl_plan_run({ planRunId: "<*-pr>", workspaceId })
```

One call returns the plan run's own status plus **every** test run in it, each
with `testId`, `testName`, `status`, `outcome`, `statusCause`,
`failureSummary`, and `failureCategorization`. That's the fan-in this skill runs
on — don't fetch the runs one at a time.

If you were handed a plan id (`*-p`) rather than a run id, get the run first
with `list_mabl_plan_runs({ planId, workspaceId })` and say which run you picked.

**Resolve the category ids before you report them.**
`list_mabl_failure_reasons({ workspaceId })` maps each id to a display name and
description, and a workspace can define its own. A raw category id in a report
is not an answer.

## 2. Separate the run's own failure from the tests'

Read `planRun.status` and `statusCause` **before** reading any test. A plan run
can fail as a unit — cancelled, quota, a bad deployment target — and when it
does, the individual test outcomes are consequences, not findings.

If the plan run failed as a unit, say that and stop. Triaging forty downstream
timeouts as forty test problems is the loudest way to be wrong here.

## 3. Group by shared cause, before judging any one test

This is the step that makes triage worth doing, and the order matters: group
first, judge second. Six failures with the same `failureCategorization`, the
same failing step description, or near-identical `failureSummary` text are one
finding with six instances.

Signals that two failures are the same finding:

| Signal | Reading |
|---|---|
| Same `failureCategorization` id | mabl already classified them together |
| Near-identical `failureSummary` | same error at the same place |
| Same element, selector, or page named in the summary | one UI change, many tests touching it |
| All the failures sit in one stage | a shared precondition — often login or setup |
| Every test that touches one shared flow failed | the flow, not the tests |

Report the group as one finding with its instances listed. **Never report a
count of failing tests as if it were a count of problems** — "6 failures" and
"6 problems" are different claims and the second one is usually false.

## 4. Flaky or broken — from history, not from this run

A single run cannot tell you whether a test is flaky. One failure is one
sample. So for each finding, look at the tests in it:

```
list_mabl_test_runs({ testId: "<*-j>", workspaceId })
```

| Pattern in recent runs | Reading |
|---|---|
| Passing, then failing, and failing since | **broken** — something changed |
| Alternating pass and fail with no change between | **flaky** — the test, not the app |
| Failing for a long time already | **pre-existing** — this run didn't break it, and it isn't news |
| First run of a new or newly edited test | **unproven** — not the same as broken |

Two rules keep this honest. **"Flaky" is a claim about history and needs the
history to support it** — if you didn't look, the answer is *unknown*, and
unknown is a real outcome to report. And a **pre-existing** failure is not part
of this run's story; separate it out so it doesn't inflate what the run broke.

## 5. Application defect or test problem

`failureCategorization` carries mabl's own split between an application defect
and a test implementation issue. Use it, name it, and say when you disagree and
why — don't silently overrule it, and don't repeat it as certainty either.

The distinction is what decides who the finding goes to, so when the evidence is
thin, say the evidence is thin rather than picking to look decisive.

## 6. Report — ordered by what someone should do first

Write to `.mabl/triage/<plan-run-id>.md`:

- **Verdict on the run** — did the plan run itself fail, or did tests fail
  within a run that completed.
- **Findings, most actionable first** — each one: what broke, how many tests it
  took down, flaky / broken / pre-existing / unknown, application-defect or
  test-problem, and the instance ids.
- **Passed** — the count, so the reader knows the denominator.
- **Not determined** — every test you couldn't classify, and what was missing.
  This section being empty is a strong claim; make it earn that.

Two things to refuse. **No score and no percentage standing in for a verdict** —
count what's real, don't grade it. And **no "safe to ship"** unless someone asks
for exactly that: this skill reports what broke, and shipping is a decision with
context it doesn't have.

## 7. Hand off the ones that need real forensics

Triage stops at "this needs a closer look." It does not open step traces,
screenshots, DOM snapshots, or a live browser.

**Requires `mabl-debug`.** If that skill isn't there, stop and say which skill
is missing — don't attempt the forensic pass here, and don't guess how to
install it, because that depends on how this skill was installed. Hand it the
shortlist: one `*-jr` per finding, not one per failing test. Six instances of
one cause need one investigation, and picking the clearest instance is part of
the triage.

## Bounds

- **A plan run that is still executing has no verdict yet.** Read the plan run's
  status; if it isn't terminal, say what's still running and stop rather than
  triaging a partial result.
- **Cap the history lookups.** One `list_mabl_test_runs` call per distinct test
  in the findings, not per failing run — grouped instances share a test more
  often than not. If a run has more than about 20 distinct failing tests, do the
  grouping first and pull history only for the tests inside the findings you're
  going to report, and say which tests you skipped.
