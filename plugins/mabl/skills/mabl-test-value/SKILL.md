---
name: mabl-test-value
description: |
  Assess which tests in a mabl workspace are worth keeping. Scores every test on
  what it protects (whether it gates a deployment, how strong its assertions
  are, whether it has ever caught a real change, whether it covers a journey the
  team calls critical, whether another test already covers the same ground)
  against what it costs (flakiness, maintenance, run time), then sorts the
  catalog into keep, fix, question, merge and retire, with the evidence for
  each. Also maps the team's critical journeys to the tests that cover them and
  flags journeys nothing covers. Read-only; it recommends and never edits.
  Fire when someone asks "which of our mabl tests are valuable", "which tests
  can we delete", "is our suite worth what it costs", "do our tests actually
  protect anything", "what does our catalog cover", "rationalize our test
  suite", or "which tests are just noise". Takes a workspace id. To raise a
  pass rate use mabl-workspace-health; for ONE failed run use mabl-debug; to
  CHANGE a test use mabl-test-edit.
allowed-tools: Read, Bash(jq *), mcp__mabl__list_mabl_workspaces, mcp__plugin_mabl_mabl__list_mabl_workspaces, mcp__mabl__list_mabl_environments, mcp__plugin_mabl_mabl__list_mabl_environments, mcp__mabl__list_mabl_tests, mcp__plugin_mabl_mabl__list_mabl_tests, mcp__mabl__search_mabl_tests, mcp__plugin_mabl_mabl__search_mabl_tests, mcp__mabl__get_mabl_test, mcp__plugin_mabl_mabl__get_mabl_test, mcp__mabl__get_test_quality_report, mcp__plugin_mabl_mabl__get_test_quality_report, mcp__mabl__list_mabl_plans, mcp__plugin_mabl_mabl__list_mabl_plans, mcp__mabl__get_mabl_plan, mcp__plugin_mabl_mabl__get_mabl_plan, mcp__mabl__list_mabl_deployment_events, mcp__plugin_mabl_mabl__list_mabl_deployment_events, mcp__mabl__list_mabl_test_runs, mcp__plugin_mabl_mabl__list_mabl_test_runs, mcp__mabl__list_mabl_test_versions, mcp__plugin_mabl_mabl__list_mabl_test_versions, mcp__mabl__get_mabl_test_steps, mcp__plugin_mabl_mabl__get_mabl_test_steps, mcp__mabl__get_mabl_flow_steps, mcp__plugin_mabl_mabl__get_mabl_flow_steps, mcp__mabl__list_mabl_tests_using_flow, mcp__plugin_mabl_mabl__list_mabl_tests_using_flow, mcp__mabl__list_mabl_failure_reasons, mcp__plugin_mabl_mabl__list_mabl_failure_reasons, mcp__mabl__get_mabl_test_run, mcp__plugin_mabl_mabl__get_mabl_test_run, mcp__mabl__list_mabl_test_run_artifacts, mcp__plugin_mabl_mabl__list_mabl_test_run_artifacts, mcp__mabl__get_mabl_test_run_artifact, mcp__plugin_mabl_mabl__get_mabl_test_run_artifact, mcp__mabl__identify_coverage_gaps, mcp__plugin_mabl_mabl__identify_coverage_gaps
---

# mabl test value

Decide which tests in one workspace are worth what they cost. A test earns its
place by protecting something: it gates a change, it checks enough to prove the
journey works, and it has caught real problems or covers a journey nothing else
does. Pass rate says nothing about this. A test can pass every day and prove
almost nothing, and a test that fails often can be the most valuable one in the
suite.

**Read-only.** Never edit, run, merge or delete anything. The output is a
recommendation per test with the evidence behind it.

Three ideas carry the method.

- **Value and cost are separate questions.** Score what a test protects and what
  it costs independently, then combine them into a class. A single blended
  number hides the reason a test landed where it did.
- **Rules, not weights.** Each class is reached by an explicit rule the reader
  can check. Weighted scores look precise and are tuned to whoever chose the
  weights.
- **mabl cannot know what matters to the business.** Which journeys are critical
  is the team's answer. Everything else comes from the workspace.

## What this needs

The `mabl` MCP server, signed in to the workspace. Use `jq` for counting and
joining. Large tool results are often saved to a file; read them from there.

## Checklist

```
- [ ] 1. Intake
- [ ] 2. Inventory the catalog and the plans
- [ ] 3. First pass over the whole catalog
- [ ] 4. Value signals for each active test
- [ ] 5. Cost signals for each active test
- [ ] 6. Overlap
- [ ] 7. Classify
- [ ] 8. Map critical journeys
- [ ] 9. Deliver
```

## 1. Intake

Ask before measuring.

1. The workspace id. One workspace per assessment.
2. **The critical journeys.** Five to fifteen short descriptions of what must
   never break, such as "a client logs in and views their portfolio" or "an
   advisor submits a trade". This is the one input mabl cannot supply.
3. Which environment and gate counts as protection. Usually the deployment or
   pipeline gate into production or pre-production.
4. Tests that must stay whatever the data says, for compliance, contractual or
   audit reasons. They are reported but never recommended for retirement.
5. Tests that are run by hand on purpose, such as release checklists. Without
   this, they look dormant.

If the user wants to skip intake, proceed with no critical journeys and no
protected tests, say that journey coverage could not be assessed, and name each
default in the report.

## 2. Inventory the catalog and the plans

1. Confirm the workspace with `list_mabl_workspaces`. If it is missing, try
   `list_mabl_environments` with the id before concluding there is no access.
2. Pull the full catalog with `list_mabl_tests` (`limit: 200`, follow
   `nextCursor`). Keep id, name, type, enabled, labels, created and updated
   times.
3. Pull run volume with `get_test_quality_report` over 90 days (the API maximum),
   passing `minPlanRuns: 1` so low-volume tests are not silently dropped. Page
   until the cursor stops advancing.
4. List plans with `list_mabl_plans`. For each enabled plan call
   `get_mabl_plan` and record its triggers (deployment event, schedule and
   cadence, or none) and the tests in its stages. It returns
   environment-and-application ids rather than environment ids, so take
   environments from run history.
5. Call `list_mabl_deployment_events` over the window (`limit: 100`, paging with
   the cursor) and record which plans each deployment actually ran. Do not pass
   `summaryOnly`, which drops the plan runs that passed. Call `get_mabl_plan` for
   any plan a deployment ran that is not in the enabled list, since deployments
   can run disabled plans.

Join these into one row per test with its gate, using the definitions in
`references/signals.md`. In short, Deployment means a deployment actually ran
the test in the window, Schedule means a scheduled plan ran it, On demand means
an enabled plan with no trigger holds it, and None means nothing does. Report
enabled plans with a trigger that never fired, and deployments that ran no plan,
since both mean the pipeline is not doing what its settings say.

## 3. First pass over the whole catalog

Most catalogs are mostly inactive, so decide the cheap cases first and spend the
expensive reads on what is left. Apply rules 1 to 8 of
`references/classification.md` to every test, matching critical journeys by
name and labels only at this stage. Those rules need nothing beyond the
inventory, and they cover protected, disabled, dormant, never-firing and
in-development tests.

Tests those rules decide are final and skip steps 4 to 6. Everything else is an
active test. Record the count for each rule, since they are often the
headline.

## 4. Value signals for each active test

Read `references/signals.md` for how to compute each one and its pitfalls.

- **Gate**, from step 2.
- **Assertion strength.** From `get_mabl_test_steps` (`detail: "compact"`),
  including the steps of any reusable flow the test calls. Count enabled
  assertions, AI or visual assertions, assertions that only check a URL or the
  presence of an element, and assertions set to fail at end. Rate the test
  strong, adequate or weak using the rule in the reference.
- **Catch record.** From `list_mabl_test_runs` over the window. A failure that
  clears on the next run **without a new test version** means something outside
  the test changed. A failure that clears only after a new version means the
  test itself was wrong. Count both, matching runs on environment and browser.
  Treat a same-version recovery as a candidate catch only when it is categorized
  as a regression, and confirm the strongest few with screenshots. Never call a
  test proven valuable on categories alone.
- **Critical journey match.** Match the test to the intake journeys by name,
  labels, and the URLs and pages its steps visit. Where a match is plausible but
  unclear, call `identify_coverage_gaps` with the journey as the requirement and
  read its coverage score and gaps. It takes 10 to 30 seconds per call, so use
  it on candidates, not on every test.

## 5. Cost signals for each active test

- **Instability.** `flakyPlanRuns` and the consistent failure count from the
  quality report. Flaky runs cost trust in every other result.
- **Maintenance.** `list_mabl_test_versions`. Versions created in the window, and
  how many failures cleared only after an edit.
- **Run time.** Median duration from the run history.
- **Fixed waits.** Total seconds of fixed waits from the steps.

Rate cost low, medium or high using the rule in the reference.

## 6. Overlap

Two tests overlap when they cover the same journey with the same flows and
mostly the same pages. Find candidates three ways.

- Names that match once Desktop, Mobile, copy numbers and dates are removed.
- The same reusable flows plus a large share of the same visited URLs.
- `search_mabl_tests` with the journey description, which returns tests that
  describe the same behaviour.

For each overlapping group, name the strongest member (a confirmed catch
first, then best gate, strongest assertions, lowest cost) and mark the rest as
merge candidates. Read the steps
of both before calling it overlap, since two tests through the same pages can
check entirely different things.

## 7. Classify

Apply `references/classification.md` in order. The first rule that matches
decides the class. Every test gets exactly one class and the rule that put it
there.

| Class | In short |
|---|---|
| Keep | Gates something, checks enough to prove it, and costs little. Or has a confirmed catch |
| Fix | Worth having, but unstable, expensive to maintain, too weak to trust, or covering a critical journey while nothing runs it |
| Question | Runs and proves little, sits in a plan that never fires, is half built, or covers nothing anyone named |
| Merge | Another test covers the same ground at least as well |
| Retire | Inactive, disabled, or never passes with nothing depending on it |

**Question is the class that matters most.** Tests that run green every day
while checking almost nothing look like the healthiest part of the suite. Lead
with them.

## 8. Map critical journeys

For each intake journey, list the tests that cover it with their gate,
assertion strength and class. Flag every journey with no Keep or Fix test as
**unprotected**, and every journey covered only by tests outside a deployment
gate as **unguarded**. A suite can have hundreds of tests and still leave the
most important journey unprotected.

## 9. Deliver

Lead with four numbers. How many tests are active. How many of those gate a
deployment. How many critical journeys are unprotected. How many tests fall in
Question.

Then:

1. **Critical journeys**, the table from step 8, unprotected ones first.
2. **Counts by class**, with the rule that produced most of each.
3. **Question**, every test, with what it checks and why that is not enough.
4. **Fix**, with the specific weakness (unstable, heavy maintenance, weak
   assertions) and the evidence.
5. **Merge**, by group, naming the member to keep.
6. **Retire**, as counts by reason with the full list attached, since it is
   usually long.
7. **Keep**, as a list.

For each test listed, give its id, name, gate, assertion strength, catch record,
cost rating and the rule that classified it.

Name every gap. Signals not computed, journeys that could not be matched,
catches taken from categories without a screenshot check, and tests whose steps
could not be read are reported as such.

## Gotchas

**Pass rate is not value.** Never use pass rate, quality score or reliability to
decide a class. They describe stability, which is a cost signal at most.

**Failure categories are unreliable alone.** The automatic analyzer can assign
different categories to the same error on the same test, and teams override
them heavily. Use them to separate environment noise from candidate catches,
then confirm with screenshots.

**Assertions inside reusable flows count.** A test whose own steps assert
nothing can still be strong if its flows assert. Expand flows before rating.

**Dormant is not always worthless.** A test run by hand before each release can
show no plan runs. That is what intake question 5 is for.

**The quality report drops tests below 5 plan runs by default.** Always pass
`minPlanRuns: 1`, or most of a small workspace disappears.

**The 90 day window is a hard cap.** Ninety-one days fails.

**Deleting a test is not free when it passes.** If the user acts on Retire for an
active test, its passes leave the pass rate along with its failures. Say so when
a Retire recommendation covers a running test.
