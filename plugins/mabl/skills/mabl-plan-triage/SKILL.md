---
name: mabl-plan-triage
description: |
  Triage a mabl PLAN: the plan's state, not one run of it. Given a plan run id
  (`*-pr`) it groups that run's failing tests by shared cause. Given a plan id
  (`*-p`) it starts from the most recent run and reads back through earlier runs
  for what only history shows: which failures repeat, which tests flip either
  way, whether the plan gets past its first stage, whether a value one test sets
  reaches the next. Separates flaky from broken, one defect surfacing many times
  from many unrelated problems, and reports what deserves a person, in order.
  Fire on a plan run id, a plan id, a deployment event, or "the nightly plan
  failed", "what broke in this run", "triage this plan", "are these failures
  related", "which of these are flaky", "is this plan healthy".
  This is the MANY-runs question. For ONE already-failed test run (`*-jr`), with
  step traces, screenshots, DOM, network and live reproduction, use mabl-debug.
  Reads results only. Never edits a test, a plan, or a label.
allowed-tools: Bash, Write, mcp__mabl__get_current_user, mcp__mabl__list_mabl_workspaces, mcp__mabl__get_mabl_plan_run, mcp__mabl__list_mabl_plan_runs, mcp__mabl__get_mabl_plan, mcp__mabl__list_mabl_test_runs, mcp__mabl__list_mabl_test_run_summaries, mcp__mabl__get_mabl_test_run, mcp__mabl__list_mabl_deployment_events, mcp__mabl__list_mabl_failure_reasons, mcp__mabl__list_mabl_environments
---

# mabl plan triage

Forty tests ran, six failed. The useful answer is almost never six separate
investigations. It is "one login change broke four of these, one is the flake
we have been ignoring, and one is real." This skill produces that answer.

The subject is the **plan**, not a single run of it. One run is one sample of a
thing that has a state over time: how often it fails, whether it ever gets past
its first stage, whether a value one test sets survives into the next, whether
the failures move around or stay put. A single run answers none of that. Reading
back through earlier runs is part of the job, not an optional extra.

It reads only. It never edits a test, changes a plan, applies a label, or
re-runs anything on its own initiative.

**Where it stops.** The output is grouped findings, each carrying one `*-jr`.
Taking one of those apart, step by step, is a different job with different
tools. This skill does not do it and does not pretend to.

## Prerequisites

This skill uses the hosted **`mabl` MCP server** (bundled with this plugin), not
the mabl CLI. No CLI command runs anywhere in it. Start by calling
`get_current_user` for `defaultWorkspaceId`, the fallback workspace when nobody
picks one, and `list_mabl_workspaces` when the plan lives somewhere else.

**The skill is available when `get_mabl_plan_run` is in the tool list.** Without
it, name the missing server and stop rather than triaging from whatever else is
reachable.

Pass every id verbatim, exactly as it arrived or as the API returned it. Never
derive one id from another: the suffixed form encodes the same bytes, so a
computed id round-trips perfectly, looks right, and authenticates as something
else.

## 1. Pick the run, then decide how far back to read

Given a plan run id (`*-pr`), that run is the subject. Given a plan id (`*-p`),
**default to the most recent run** and say which one, with its completion time,
before reporting anything about it.

```
list_mabl_plan_runs({ planId: "<*-p>", workspaceId, limit })
get_mabl_plan_run({ planRunId: "<*-pr>", workspaceId })
```

A plan id is a question about the plan, so the most recent run is where reading
starts, not where it ends. **Compare back through earlier runs as far as the
question needs.** What only the sequence answers:

- Does this plan fail every time, on a cadence, or once.
- Does it get past its first stage, or die in setup before the tests that matter
  ever start.
- Does a value one test sets reach the test that consumes it, or does the second
  test fail in a way that only makes sense as a missing input.
- Is this run typical of the plan, or the outlier worth a person's attention.

There is no fixed depth. Read back until the pattern is decided, then **say how
far back you went and what stopped you**: the answer settled, the page ran out,
or the call budget did.

Two things about `list_mabl_plan_runs` that the payload will not tell you:

- **A page can be hours deep and still not reach the run someone means.** A busy
  plan runs many times a day, so the run under discussion may not be on page 1.
  Paginate with the returned `cursor`; treat it as opaque.
- **Each failed entry carries an `errorMessage`**, a written multi-test root
  cause for the whole plan run. It is useful context and it is generated text.
  Treat it exactly like `failureCategorization` below: a starting hypothesis
  whose numbers are not evidence.

## 2. What the plan-run payload gives you, and what it does not

One `get_mabl_plan_run` returns the plan run plus **every** test run in it, each
with failure detail attached. That is the fan-in this skill runs on: do not
fetch the test runs one at a time.

What it does not return is the more useful half to know in advance.

| Wanted | Where it is |
|---|---|
| Plan run id, status, credentials | `planRun`, and that is the whole object |
| Whether the plan run finished | not here. Its entry in `list_mabl_plan_runs` carries `terminal` and `completedTimeMs` |
| Whether one test run finished | not here either. `get_mabl_test_run` carries `terminal` for a single `*-jr` |
| Why something is in the status it is in | `statusCause`, on `planRun` and on each `testRuns[]` entry, **only when a cause was recorded**, which is a minority of runs |
| Whether this run is a retry, and of what | not here, and not on `list_mabl_plan_runs` either. `list_mabl_deployment_events` carries the retry link and a final-attempt flag |
| Stage index, stage names, ordering, counts | not here, in any form |
| Per-test environment, application, browser, labels | not here. `list_mabl_test_run_summaries` carries `environmentId`, `applicationId`, `browser` and `labels` |
| Failing step, flow, error, screenshot | `testRuns[].failureSummary` |
| mabl's category guess and its narrative | `testRuns[].failureCategorization` |

Two consequences worth stating plainly, because both invite a confident wrong
answer:

- **"The plan run failed as a unit" and "tests failed inside a run that
  completed" are often not distinguishable here.** `statusCause` is the field
  that would say, and it is free text with no fixed vocabulary, absent on most
  runs. Quote it when it is there; its absence is evidence of nothing. Without
  it, answer from the test runs: a plan run marked failed whose test runs
  contain no failure is a run-level failure, and the test outcomes in it are
  consequences rather than findings. Say that and stop, rather than triaging
  forty downstream timeouts as forty test problems.
- **There is no stage data.** "All the failures sit in one stage" is not a
  signal you can read here. Whether the plan got past its first stage is
  answered from which tests ran at all, and from comparing against earlier runs
  of the same plan, not from a stage field.

### Statuses

Several vocabularies describe one concept and none of them match each other.
Statuses change rarely, so read these as complete.

| Where | Values |
|---|---|
| `planRun.status` in a response | `queued`, `pre_execution`, `scheduling`, `scheduled`, `post_execution`, `succeeded`, `completed`, `failed`, `cancelled`, `terminated` |
| `testRuns[].status` in a response | `awaiting_precondition`, `queued`, `rate_limited`, `running`, `completed`, `failed`, `skipped`, `terminating`, `terminated` |
| `testRuns[].outcome` in a response | `passed`, `failed`, `stopped`, and **absent entirely on a skipped run** |
| `status` filter on `list_mabl_test_runs` and `list_mabl_test_run_summaries` (a request, and a different vocabulary again) | `passed` selects `completed`; `failed` selects `failed`; `running` selects `queued`, `running`, `awaiting_precondition`, `rate_limited`, `terminating`; `stopped` selects `terminated` and `skipped` |

Four ways that bites:

- **A passing test run is `completed`, never `passed`.** `passed` exists only as
  an `outcome` and as a request filter.
- **A plan run passes as either `succeeded` or `completed`.** Matching on one
  misses the other.
- **`stopped` is not a status in any response.** It is a request filter covering
  `terminated` and `skipped`, and separately an `outcome`.
- **A skipped test run has no `outcome` key at all**, so any reading built on
  `outcome` drops every skipped run silently. Read `status` for skipped, and
  `outcome` for pass or fail.

**Resolve category ids before reporting them.**
`list_mabl_failure_reasons({ workspaceId })` gives each id a display name and a
description, and a workspace can define its own reasons on top of the defaults.
The default ids read as words already, so the reason to make this call is the
description text and the detection of custom reasons, not the id itself.

## 3. Four things that look like a plan run

Get this wrong and every count downstream is wrong, including the denominator
the reader uses to judge severity.

**A rerun is a separate plan-run record.** Re-running a plan run creates a new
plan run carrying a retry pointer (`retry_of_id`, surfaced as `retryOfId`) to
the run it retried, and it may contain **only a subset** of the tests: the
failed ones, or the failed and skipped ones. A failed-scope rerun narrows harder
still, reproducing only the exact test, browser, deployment and data-row
combinations that failed, so it is not "those tests again". The pointer names
the immediate predecessor rather than the first run, so a rerun of a rerun is a
chain to walk. Neither `get_mabl_plan_run` nor `list_mabl_plan_runs` carries it:
`list_mabl_deployment_events` is where the retry link and a final-attempt flag
are reachable, and its `summaryOnly` option drops superseded attempts. Triaging
a rerun as if it were a full run inflates the failure rate and hides every test
that never re-ran, so compare the run's test set against the plan's membership
from `get_mabl_plan` before calling a run complete, and when the run is a rerun,
say so and name the run it retried.

**A plan run fans out per deployment, not per test.** The runs in it are the
cross product of deployments (an application, an environment and a URL),
browsers or device configurations, and data-table rows. So one test yields
several test runs inside one plan run, the same `testName` comes back several
times with different results, and the number of test runs and the number of
distinct tests diverge. This is noisy on purpose and it is not duplication.
`get_mabl_plan_run` carries no environment, application or browser on a test
run, so from that call alone those rows are indistinguishable: pull
`environmentId`, `applicationId` and `browser` from
`list_mabl_test_run_summaries` and resolve the environment id to a name with
`list_mabl_environments` before reporting it. Do not read the environment off
the plan run itself, where the single environment field is the first of its
deployments rather than the set. Count distinct tests and test runs separately,
every time. One test passing in one environment and failing in another is a
finding about the environment, not a flake.

**A single test run in plan context is a real plan run for a plan that does not
exist.** Running or re-running one test creates an ad-hoc plan run: a genuine
`*-pr` id whose plan is ephemeral and never stored. It holds one test run, there
is nothing to group, and no plan verdict applies, so say that rather than
reporting one. Two consequences follow. Ad-hoc runs are excluded from
`list_mabl_plan_runs` for any real plan, so a plan run reachable only from a
test run is usually this shape. And an ad-hoc run executes a disabled test,
which a scheduled plan run does not, so a passing ad-hoc run is not evidence
that the test runs in the plan at all.

**Skipped is significant and gets reported.** A skipped test run is a
consequence: the plan stopped, a dependency failed, a stage gated. Skipped tests
are not passes and they are not unknowns. They get their own count and their own
section, with whatever is knowable about what gated them. Folding five skipped
tests into "not determined" is the same error this skill exists to prevent, one
status over.

## 4. Group by shared cause, before judging any one test

Group first, judge second. Failures at the same place, from the same cause, are
one finding with several instances.

| Signal | Reading |
|---|---|
| Same `flow_id` **including its version suffix** plus the same `step_id` | the strongest same-cause evidence in this payload |
| Near-identical `failureSummary.error` string | the same error at the same place |
| Same element, selector, or page named in the summary | one UI change, many tests touching it |
| Every test that uses one shared flow failed | the flow, not the tests |
| Same `failureCategorization.categoryId` | **not** evidence of a shared cause |

**A category id is a bucket, not a cause.** Most failures in a workspace land in
one or two categories, so grouping by category id reliably groups unrelated
failures together and splits related ones apart: two failures at the same flow,
the same step and the same minute can carry different category ids, while four
unrelated failures carry the same one. Group on shared cause evidence, which
means shared flow, shared step, shared error text. The category is an input to
"Application defect or test problem", not to grouping.

**Step numbers are treacherous and do not survive nesting.** `step_number` is a
position at the top level of the test, so when the failing step is inside a
shared flow, `step_number` is the *flow's* position and `step_display_number`
(`"3.14"`) locates the step inside it. Two failures showing the same
`step_number` may be in different flows, and two failures at the identical step
of one shared flow show different `step_number`s when the flow sits at a
different position in each test. Group on `step_id` and `flow_id`. Never on a
step number.

**Carry version ids everywhere, on both sides.** `flow_id` comes back as
`<id>-f:<version>` and `testId` as `<id>-j:<version>`. Record the version
alongside every id in every finding, because it is the only signal that the
thing being read is still the thing that ran. A version that changes part way
through the window being examined invalidates a flaky or a broken reading
silently: the history describes two different tests.

**Requires `mabl-compare-versions`.** When the version moves inside the window,
that skill says what actually changed between the two. If it is not there, stop
at reporting the version change with both version ids and say which skill is
missing, rather than inspecting the versions here or guessing how to install it,
which depends on how this skill was installed.

Two smaller traps in the same payload:

- **`flow_name` is present on some failures and absent on others** that carry a
  `flow_id`. Grouping on the human-readable name silently under-groups. Group on
  the id and use the name for the report.
- **`testId` echoes back with a version suffix, and the request wants it
  without.** The id you send is not the id you get back. Strip nothing and
  invent nothing: take the request form from the source that gave you the plain
  id.

Report each group as one finding with its instances listed. **Never report a
count of failing tests as if it were a count of problems.** "Six failures" and
"six problems" are different claims, and the second is usually false.

## 5. Flaky, broken, pre-existing: anchored to the failure being triaged

One run cannot tell you a test is flaky. One failure is one sample. For each
test inside a finding:

```
list_mabl_test_runs({ testId: "<*-j>", workspaceId, limit })
```

**Anchor the window to the failure you are triaging, before reading a number out
of it.** The default window is a count of recent runs, not a span of time, and
in a busy workspace a handful of runs can be a few hours. That means the window
can begin *after* the failure under triage, in which case it describes a period
that failure is not in, and every statistic in it is about something else. A
test whose failure you are holding can report a perfect pass rate and zero
consecutive failures on a window that postdates it.

So compare the window's oldest start time against the plan run's completion
time. If the failure is not inside the window, either reach back until it is, or
report the history as **unknown**. Do not read the numbers as if they applied.

Two mechanics for reaching back:

- **`sinceMs` filters within the page rather than widening it.** A far-past
  `sinceMs` with a small limit still returns only the newest runs, which reads
  convincingly as "there were no runs before then". Widen with `cursor`
  pagination, not with `sinceMs`.
- **When time filters do not get you there, navigate by structure.** Plan run to
  the test run inside it, that test to its earlier runs, each earlier run back
  to the plan run it belonged to. Walking plan runs back with
  `list_mabl_plan_runs` and reading the same test out of each reaches history no
  time filter on a single test will.

**Read the computed `history` block rather than eyeballing the run list.** The
first page of `list_mabl_test_runs` carries it: `windowRunCount`,
`windowDecisiveRunCount`, `passRateLast10`, `consecutiveFailures`,
`isNewFailure`, `firstFailedTime`, `streakExtendsBeyondWindow`. `isNewFailure`
and `streakExtendsBeyondWindow` are the broken and pre-existing questions,
already answered.

**`passRateLast10` is computed over decisive runs, and its name does not say
so.** Read `windowDecisiveRunCount` beside it every time. A window of ten runs
where half were skipped yields a confident 1.0 over five samples, which reads as
a clean bill of health and is a statement about half the evidence. Combined with
an unanchored window, it is the single most reliable way to declare a failing
test healthy.

| Pattern | Reading |
|---|---|
| Passing, then failing, and failing since (`isNewFailure`) | **broken**, something changed |
| Alternating pass and fail with nothing changing between | **flaky**, the test rather than the app |
| Failing already before this run (`streakExtendsBeyondWindow`) | **pre-existing**, this run did not break it and it is not news |
| First run of a test, or the version suffix changed inside the window | **unproven**, which is not the same as broken |
| The window does not contain the failure, or history was not pulled | **unknown** |

"Flaky" is a claim about history and needs the history to support it. If you did
not look, or looked at the wrong window, the answer is **unknown**, and unknown
is a real outcome to report rather than a gap to fill in. A **pre-existing**
failure is not part of this run's story: separate it out so it does not inflate
what the run broke.

**Read the whole earlier test set, not only the tests failing today.** The
question is not "did these failures happen before". It is what changed in either
direction. Reading each earlier plan run's full membership catches what a
failure-only reading cannot:

- A test failing in earlier runs and passing in this one: a fix, or a flake
  resolving, and either way it belongs in the report.
- A test present in earlier runs and absent from this one: the plan's
  membership changed, and the denominator changed with it.
- A test that alternates across runs while passing in this one: flaky, and
  invisible from this run alone.

## 6. Application defect or test problem

`failureCategorization` is a **starting hypothesis, never a verdict.** Corroborate
it against evidence before repeating it, and check the common failure causes
independently of what it says. A category is a label applied by something that
saw less than you are about to see.

**Check who assigned it.** `assignmentSource`, `assignedById` and
`suggestedCategoryId` say whether a person ever looked. A category that is
machine-assigned, with the suggestion equal to the assignment, has been reviewed
by nobody. A human-assigned category is worth materially more, and the payload
says which one is in front of you.

**The generated narrative is a shape, not a source of numbers.**
`failureCategorization.summaryText` is written per run and contradicts the
structured data it ships beside: a consecutive-failure count that disagrees with
the `history` block, a step number that disagrees with
`failureSummary.step_number`. Use it for the story it tells and take every
number from the structured fields. The same rule covers
`list_mabl_plan_runs`'s `errorMessage`, which is the same class of artifact.

**Read the assertion's operator before quoting `expected` and `found`.** An
`assert_failure` can render the two as the same string and still be a genuine
failure, because the assertion is a not-equals, or another operator where
matching is what fails. Quoting the pair without the operator produces a finding
that reads as nonsense and sends the reader looking in the wrong place.

Name mabl's split between an application defect and a test implementation issue,
use it, and say when you disagree and why. Do not silently overrule it, and do
not repeat it as certainty. The distinction decides who the finding goes to, so
when the evidence is thin, say the evidence is thin rather than picking to look
decisive.

## 7. Report, ordered by what someone should do first

Write to `.mabl/triage/<plan-run-id>.md`:

- **Verdict on the run** and, when the subject was a plan id, on the plan: did
  the plan run fail as a unit or did tests fail within a run that completed, is
  this run typical of the plan, and how far back the reading went.
- **Findings, most actionable first.** Each one: what broke, which tests it took
  down, broken / flaky / pre-existing / unproven / unknown, application defect
  or test problem with the evidence for that call, the ids **with their version
  suffixes**, and one `*-jr`.
- **Passed.** Say which count it is: distinct tests, and test runs, whenever the
  two differ. In a multi-environment run they always differ.
- **Skipped.** Its own count and its own section, with what gated them where
  that is knowable.
- **Not determined.** Every test that could not be classified, and what was
  missing. This section being empty is a strong claim; make it earn that.

**The report is the input to someone else's judgment.** Report what is observed
and let the reader, human or agent, rule on it. A computed judgment, a health
percentage, a pass rate for the plan, a safe-to-ship call, is produced when
someone asks for exactly that and is never volunteered, because volunteered it
stands in for the finding and gets quoted onward without its denominator. Count
what is real; do not grade it unasked.

One thing that rots: `image_href` is a signed URL with an expiry inside it, so
pasted into the report it is dead evidence within days. Write
`image_artifact_url` instead.

## 8. Hand off the ones that need real forensics

Triage stops at "this needs a closer look". It does not open step traces,
screenshots, DOM snapshots, or a live browser.

**Requires `mabl-debug`.** Hand it the shortlist: one `*-jr` per finding, not
one per failing test. Six instances of one cause need one investigation, and
picking the clearest instance is part of the triage.

Two conditions on that hand-off:

- **If that skill is not there**, stop and say which skill is missing. Do not
  attempt the forensic pass here, and do not guess how to install it, because
  that depends on how this skill was installed.
- **If the session has no shell**, do not route there either, even when the
  skill is installed. It drives the mabl CLI, which a session holding only MCP
  access cannot run, so routing produces a hand-off that dead-ends. Hand the
  finding back instead, with its `*-jr` and what the next step would be, and say
  why it stops here.

## Bounds

- **A plan run that is still executing has no verdict yet.** `get_mabl_plan_run`
  carries no completion flag, so read `terminal` from the plan run's entry in
  `list_mabl_plan_runs`, or `terminal` on `get_mabl_test_run` for a single run.
  If it is not terminal, say what is still running and stop rather than triaging
  a partial result. On a run still retrying, `lastAttemptError` is an earlier
  attempt's error and not a final verdict.
- **Cap the history lookups.** One `list_mabl_test_runs` call per distinct test
  in the findings, not per failing run: grouped instances share a test more
  often than not. Above roughly 20 distinct failing tests, do the grouping
  first, pull history only for the tests inside the findings being reported, and
  say which tests were skipped.
- **Bound the walk back through plan runs the same way.** Set a page budget
  before starting, say what it is in the report, and stop at it rather than
  paginating until something interesting appears. These calls are rate limited
  per identity, so pace a long walk rather than firing it as fast as it will go.
- **Every id in the report is one the reader can look up**, copied verbatim from
  the payload, with the version suffix kept where the payload carried one.
