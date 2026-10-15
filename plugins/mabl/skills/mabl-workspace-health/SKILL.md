---
name: mabl-workspace-health
description: |
  Audit the health of one mabl workspace's test suite. Ranks failing tests by
  the failures they contribute (not failure rate or coverage), computes how
  many pass-rate points fixing the top N would buy, diagnoses each selected
  test to a verified root cause with a concrete repair move, and audits the
  catalog for dormant, duplicated, unlabelled tests and disabled plans.
  Read-only; it recommends and never edits.
  Fire when someone asks "how healthy is my mabl workspace", "audit my test
  suite", "which tests should we fix first", "why is our pass rate low", "what
  should we fix to raise the pass rate", "rank our failing tests", "is this an
  environment issue or a test issue across the suite", or "what can we clean
  out of our test catalog". Takes a workspace id. For ONE failed run use
  mabl-debug; to CHANGE a test use mabl-test-edit.
allowed-tools: Read, Bash(jq *), mcp__mabl__list_mabl_workspaces, mcp__plugin_mabl_mabl__list_mabl_workspaces, mcp__mabl__list_mabl_environments, mcp__plugin_mabl_mabl__list_mabl_environments, mcp__mabl__get_test_quality_report, mcp__plugin_mabl_mabl__get_test_quality_report, mcp__mabl__list_mabl_tests, mcp__plugin_mabl_mabl__list_mabl_tests, mcp__mabl__get_mabl_test, mcp__plugin_mabl_mabl__get_mabl_test, mcp__mabl__list_mabl_test_versions, mcp__plugin_mabl_mabl__list_mabl_test_versions, mcp__mabl__list_mabl_plans, mcp__plugin_mabl_mabl__list_mabl_plans, mcp__mabl__list_mabl_deployment_events, mcp__plugin_mabl_mabl__list_mabl_deployment_events, mcp__mabl__get_failure_category_report, mcp__plugin_mabl_mabl__get_failure_category_report, mcp__mabl__list_mabl_failure_reasons, mcp__plugin_mabl_mabl__list_mabl_failure_reasons, mcp__mabl__list_mabl_test_runs, mcp__plugin_mabl_mabl__list_mabl_test_runs, mcp__mabl__get_mabl_test_run, mcp__plugin_mabl_mabl__get_mabl_test_run, mcp__mabl__analyze_mabl_failure, mcp__plugin_mabl_mabl__analyze_mabl_failure, mcp__mabl__list_mabl_test_run_artifacts, mcp__plugin_mabl_mabl__list_mabl_test_run_artifacts, mcp__mabl__get_mabl_test_run_artifact, mcp__plugin_mabl_mabl__get_mabl_test_run_artifact, mcp__mabl__get_mabl_test_steps, mcp__plugin_mabl_mabl__get_mabl_test_steps, mcp__mabl__get_mabl_flow_steps, mcp__plugin_mabl_mabl__get_mabl_flow_steps, mcp__mabl__search_mabl_flows, mcp__plugin_mabl_mabl__search_mabl_flows, mcp__mabl__list_mabl_tests_using_flow, mcp__plugin_mabl_mabl__list_mabl_tests_using_flow, mcp__mabl__list_mabl_data_tables, mcp__plugin_mabl_mabl__list_mabl_data_tables, mcp__mabl__get_mabl_data_table, mcp__plugin_mabl_mabl__get_mabl_data_table, mcp__chrome-devtools__new_page, mcp__plugin_mabl_chrome-devtools__new_page, mcp__chrome-devtools__navigate_page, mcp__plugin_mabl_chrome-devtools__navigate_page, mcp__chrome-devtools__take_snapshot, mcp__plugin_mabl_chrome-devtools__take_snapshot
---

# mabl workspace health

Audit one workspace's test suite. Decide which tests are worth fixing, prove why
each one fails, and say what should be cleaned out of the catalog. The output is a
ranked worklist with a verified cause per test. It is not a list of everything
that is failing.

**Read-only.** Never edit tests, flows, data tables, plans or environments.
Recommend changes and let the user apply them.

Three ideas carry the method.

- **The unit of audit is one workspace.** Several workspaces are several audits,
  and their results are never added together.
- **A test's importance is the failures it contributes.** A test failing 60
  percent of 2,000 runs matters far more than one failing 100 percent of 30.
  Ranking by failure rate or by feature coverage produces a list that feels
  balanced and barely moves the pass rate.
- **Measure the environment tier being repaired.** A rate blended across
  environments averages the tier under repair with tiers that are already
  healthy, and sends the work at the wrong tests.

## What this needs

The `mabl` MCP server, signed in to the workspace. Every step runs on it.

The `chrome-devtools` MCP server, for checking a live page before recommending a
locator change. Many sites block command line fetches, so a real browser is the
only reliable check. Without it, record those findings as unverified rather than
dropping them.

If the workspace has the mabl BigQuery export switched on and a BigQuery
connector is available, exported test results can supply tier totals and trigger
breakdowns. The export has no backfill, so it only covers dates after it was
enabled.

Use `jq` for the arithmetic. Quality report pages run
to roughly 50 KB each and are often saved to a file; read them back from there
rather than shrinking the page size.

## Checklist

```
- [ ]  1. Intake
- [ ]  2. Confirm scope
- [ ]  3. Pull volume for the tier
- [ ]  4. Gate: is there anything to rank?
- [ ]  5. Separate test-development runs
- [ ]  6. Band the tests for context
- [ ]  7. Rank by failures contributed
- [ ]  8. Points by depth, and read the curve
- [ ]  9. Order the work and pair siblings
- [ ] 10. Describe the failure mix
- [ ] 11. Describe how tests are triggered
- [ ] 12. Diagnose each selected test
- [ ] 13. Name a repair move for each test
- [ ] 14. Audit the catalog
- [ ] 15. Test quality
- [ ] 16. Deliver
```

## 1. Intake

Ask these before measuring anything. Each one changes the answer.

1. The workspace id.
2. Which environment tier is being repaired. Report that tier's rate as the
   headline.
3. Which brands, regions or locales count toward the goal, and which suites
   never run in that tier.
4. Whether any failures are expected on purpose. Some teams schedule a test so
   its failure signals something to a person. Nothing in mabl marks these.
   Exclude them from the denominator before ranking.
5. The pass-rate target, and by when.
6. Whether the team already has a list of tests it planned to fix. Score it
   alongside the ranking, because the difference in points is usually the most
   persuasive output of the audit.
7. What the team currently believes is wrong. Write it down before looking.
8. How heavily data tables are used, and whether they are split per brand or
   region.
9. Whether assertions default to fail at end.
10. Who owns environment and infrastructure faults, and on what timeline.

Read the answers back as four statements and get agreement before starting. The
tier, regions and window being measured. The expected failures held out. The
target with its date. Who owns environment fixes.

If the user wants to skip intake, proceed with stated defaults (all environments,
90 days, no target, no exclusions) and name each default in the report.

## 2. Confirm scope

Confirm the workspace with `list_mabl_workspaces`. If it is missing from that
list, try `list_mabl_environments` with the id before concluding there is no
access, because some access levels read workspaces that list never returns.

Get the environments and confirm which ones the target covers. Use a 90 day
window in epoch milliseconds. The API rejects anything longer.

## 3. Pull volume for the tier

Call `get_test_quality_report` with the workspace id, the window, `limit: 100`,
and `environmentId` for the tier. Page with the cursor until it stops advancing.

**Page through every test before ranking anything.** The report is ordered by
quality metrics rather than volume, so the first page is not the top of the list
and there is no safe early stop.

Keep per test `testId`, `totalPlanRuns`, `consistentPassRuns`,
`consistentFailRuns`, `flakyPlanRuns`, `passRate` and `runsCapped`. The report
carries no totals, so build the tier denominator by summing the pages.

**A test's failures are `totalPlanRuns - consistentPassRuns`.** `passRate` counts
only plan runs where every attempt passed, so a flaky plan run (some attempts
passed, some failed, counted in `flakyPlanRuns`) costs pass rate exactly as a
consistent failure does. Using `consistentFailRuns` alone ranks flaky
high-volume tests too low and understates what fixing them is worth. Keep the
split between consistent and flaky failures for the report, because it says
whether a test is broken or unstable.

**Do not read `passingPlanRuns` as a pass count.** It counts runs whose previous
run passed, which is the denominator for breakage. Use `consistentPassRuns`.

A test with `runsCapped: true` is counted over its newest 50,000 runs only, so
its numbers are floors.

It excludes tests with fewer than 5 plan runs by default (`minPlanRuns`), so do
not use it to count dormant tests and do not apply a second run-count filter.

Do not use `breakageRate` or `reliabilityRate` to find bad tests. A test that has
never passed reports breakage 0 and reliability 1 and scores as healthy.

**Read the status vocabulary before computing any rate.** Run listings can report
a passing run as `completed` while the filter option is called `passed`, and
exported data varies by workspace. Pull a short window with
`list_mabl_test_runs` on a few tests, or from the export, read the status values
back, then write the rate. A rate filtered on a value that does not exist
reports a plausible 0 percent with no error.

## 4. Gate: is there anything to rank?

Check before ranking. If the tier has very few plan runs (under about 50), or no
test has a failure, the ranking, points table, diagnosis and repair-move steps
have nothing to work on. Say so plainly, report the tier volume and pass rate,
and go straight to step 14 (catalog) and step 15 (quality). New workspaces and
healthy ones both land here, and the catalog is usually where their real work is.

## 5. Separate test-development runs

Before ranking, split out failures from tests that are still being built. In a
sandbox or development workspace these can be nearly every failure.

Treat a test as in development when it was created or last edited within the
last 7 days, when its name or start URL points at `localhost`, a local dev
server or a tunnel. Get dates from `list_mabl_tests` (`createdTime`,
`lastUpdatedTime`). Run count is no signal here, because the quality report
already drops tests with fewer than 5 plan runs.

Report these separately with their counts, and rank the rest. Ask before
excluding them from the headline rate.

## 6. Band the tests for context

Compute `fail_rate = 1 - passRate`, which matches the failure count in step 3,
and label each test.

| Band | fail_rate | Read it as |
|---|---|---|
| Never passes | 1.00 | Handle in the catalog step |
| Near-total | 0.90 to 0.99 | Broken, and cheap to verify fixed |
| Recoverable | 0.50 to 0.89 | Usually the most tractable |
| Mostly healthy | below 0.50 | Can still be the largest failure contributor |

**The bands describe tractability. They never decide which tests make the
list.** Filtering to a band before ranking puts failure rate back in front of
failure volume and routinely excludes the highest-volume tests. Report what
share of tier failures each band carries.

## 7. Rank by failures contributed

Sort every test with at least one failure by its failures from step 3
(`totalPlanRuns - consistentPassRuns`), highest first. Show each row with its
band and its consistent and flaky split. If the team supplied a candidate list, score it the
same way and compare.

## 8. Points by depth, and read the curve

Fixing a test that fails F times out of R tier runs moves the tier pass rate by
roughly F / R. Points at depth N are the sum of failures (from step 3) for the
top N, divided by R, times 100. Build the table at several depths (5, 10, 20, 50 and
so on), let the user pick a cut against the target, and group the cut into waves
with an owner and a window each.

**Read the shape before writing a plan.** If a few tests carry most of the
points, repair the head and wave the rest. If the table climbs slowly and evenly,
no test owns the failures and the cause is shared. Stop ranking and look for it.

- Run `search_mabl_flows` and `list_mabl_tests_using_flow` on the sign-in and
  setup flows. One flow used by hundreds of tests never appears in a per-test
  ranking.
- Compare the tier against another environment running mostly the same tests.
  A large gap there is environmental and caps what test repair can reach.
- Check how many versions the shared flows have. A flow edited many times
  without the fix holding needs a rewrite rather than another patch.

Repair beats deletion whenever the test passes at all. Deleting a running test
removes its passes along with its failures. Deleting a dormant test is free,
which is why pruning lives in step 14.

## 9. Order the work and pair siblings

Call `list_mabl_test_versions` per selected test. Put barely edited tests first
and heavily edited ones later, without dropping them. Compare the latest version
against the version that ran, which run results report as `<testId>:<version>`.
When a fix sits on an unmerged branch, the recommendation is to merge it.

Get names with `get_mabl_test` per test rather than paging `list_mabl_tests`.
Tests whose names differ only by Desktop or Mobile, or that share a test case id,
are siblings. Diagnose them together.

## 10. Describe the failure mix

Call `get_failure_category_report` and resolve ids with
`list_mabl_failure_reasons`. Report the mix as a share of categorized failures,
and what share of all failures carry a category at all.

This report covers at most 31 days on daily buckets, or 60 with explicit start
and end times, so state both windows. Use the mix to describe the suite. Never
use it to pick tests, because automatic categories on the same error string can
differ from run to run.

| Dominant category | Usually means |
|---|---|
| Timing | Flake rather than breakage |
| Test implementation | Drift between the tests and the application |
| Environment | Platform faults, or an investigation that stopped at the error message |
| Regression | The tests work and the application changed |

## 11. Describe how tests are triggered

Using `list_mabl_plans` and `list_mabl_deployment_events`, or the BigQuery export
where available, show runs and failure rate by trigger type **crossed with
environment**. Grouping on trigger alone averages different gates together and
can point at the wrong lane.

Answer three questions. Is a large share run by hand, which means raising its
pass rate changes nobody's day? Do failure rates differ by trigger? Is the
scheduled set narrower than the deployment set, so a regression in the
difference is caught only on deploy?

Compare the measured shape with the pipeline the team describes, and call out any
documented gate that never fired in the window.

## 12. Diagnose each selected test

Follow `references/diagnosis-protocol.md` in order for every selected test.
Every step is there because skipping it produces a confident wrong answer.

In short. Read the test and its plans, split the pass rate into a per-cell table,
bucket failures by failing step, read mabl's saved analysis as a lead, open the
screenshots, read the step definitions, read every data table, check shared
flows and their callers, check the live page, then check which version runs.

**mabl's saved failure analysis is a lead, not a verdict.** It reads one run. It
cannot see data tables and does not know other cells of the same test pass.

**Environment is a real cause, and also the answer reached by stopping at the
error message.** Do not conclude environment until the screenshots show error
pages or every cell is degraded.

Classify each test as DATA, STEP, FLOW, ENVIRONMENT, SCHEDULE or TIMING, more than
one where cells disagree, and let the action follow.

| Cause | Action |
|---|---|
| Data | Fix the table, leave the test alone. Tables are shared, so one fix can clear several tests |
| Application defect | File the bug. The test did its job |
| Test logic | Replace only the failing step, keep selectors that still resolve |
| Environment | Send to whoever owns the platform, no test change |

## 13. Name a repair move for each test

Pick from `references/repair-moves.md`. Give the move, the exact location (step
index or table and column), the concrete change, the owner, the path (direct
edit, re-authoring, table write or no test change), and how it gets verified.

Write it as an instruction the user can apply without a follow-up question.
"Insert a wait until present on `[data-testid=foo]` at index 38, terminate on
failure" is a repair move. "The test has a timing issue" is not.

## 14. Audit the catalog

Pull the full catalog with `list_mabl_tests` (`limit: 200`, follow
`nextCursor`) and compare it with what actually ran in the window. Report counts
and the action for each.

| Signal | Action |
|---|---|
| Enabled but no plan run in the window | Archive candidates |
| Dormant and unedited for a year | Delete, it costs no pass rate |
| Never passes and rarely scheduled | Delete |
| Never passes and heavily scheduled | Fix or retire deliberately, someone expects it to mean something |
| Duplicate names, including once Desktop or Mobile is removed | Merge |
| No label | Label it so it has an owner |
| Disabled plans, and duplicate auto-generated default plans | Count them as scheduling debt |

Prune before repairing, since merges and deletions change which tests are worth
diagnosing. In a shared workspace, recommend agreeing on cleanup before anything
is deleted.

## 15. Test quality

Read step definitions with `get_mabl_test_steps` (`detail: "compact"` first) for
the selected tests, or for the most-run tests when step 4 skipped ranking.
Report the quality score from `get_test_quality_report`, assertion density,
disabled steps and assertions, assertions set to fail at end, hardcoded
credentials or identifiers, tests over 200 steps with their total fixed waits,
captured element text that contains data which changes daily, and repeated blocks
that belong in a reusable flow. State the date the steps were read, since
structure is current while run data covers a window.

Read stability and breakage for what they measure. Stability is 1 minus the
flake rate, so it reflects retries inside a single plan run. Breakage counts pass
to fail flips across runs. A failing test with high stability fails the same way
every attempt, which makes it broken rather than flaky.

## 16. Deliver

Lead with the tier pass rate, the points table, and what the chosen depth is
worth. State whether numbers are plan runs or test runs and never combine them.
Estimate the environment ceiling from the share of diagnosed tests whose primary
cause was environment, and state it next to the target. A target that assumes
every failure can be fixed by editing tests will be missed.

Then three separate views, because they use different arithmetic and have
different owners.

1. **Raise the pass rate.** The waves, then a ranked table with rank, name, test
   id, failures contributed, fail rate, edit count, sibling, cause, repair move
   with location and change, owner, path, and a confidence note naming the
   weakest link. A short dossier per diagnosed test, leading with any correction
   to what the team believed. Finish with a count of tests per repair move and
   how many need no test change.
2. **Catalog cleanup**, from step 14.
3. **Test quality**, from step 15.

Name every gap. Steps skipped, findings left unverified, and causes taken from
error messages rather than the full protocol are reported as such.

**Verification.** Nothing counts as fixed until it passes three consecutive
runs, ideally a plan run on a branch so the plan's credentials and data table
bindings apply. Check with `list_mabl_plans` (`testId`) that the test's plans are
enabled before promising verification.

**Scoring progress.** Score root causes resolved times the tests each one
unblocks, so shared flows and tables get priority over easy one-off fixes.

## Example of a good opening

> (Illustrative numbers.) Scoped to the staging tier, which is where the repair
> work happens. That tier runs at 42 percent, not the 63 percent the workspace
> reports, because production passes 88 percent. 480 tests ran in the tier.
>
> Reaching 70 percent needs the top 90 tests. Your existing 15-test list is
> worth 1.8 points. The top 15 ranked by failures is worth 6.2.
>
> Of the 18 tests diagnosed, environment was primary for 4, so repair alone
> tops out near 74 percent.

A bad output is a list of every failing test, a list balanced across feature
areas, a ranking that puts a test failing 30 of 30 runs above one failing 1,200
of 2,000, or a target quoted without its environment ceiling.

## Gotchas

**Ad hoc runs may not bind data table rows.** A test with data tables can fail
an ad hoc run on an unresolved variable, surfacing as a misleading element not
found. Confirm the table is associated with the test before reading an ad hoc
failure as evidence.

**The environment a test is configured for is often not where it runs.** Read
the recent runs rather than the configured environment.

**Assertions set to fail at end hide where a run died.** A test can fail at
sign-in and report a missing element dozens of steps later. Disabled
terminating checks inside shared flows do the same.

**A fix on a branch may never have run.** When the latest version and the
running version differ, the finding is "merge the fix", and any repair recorded
on the test is unverified.

**Run output numbers steps from 1, stored steps index from 0.** A failure at
step 40 is index 39.
