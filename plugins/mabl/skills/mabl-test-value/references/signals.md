# Computing the signals

## Assertion strength

Read `get_mabl_test_steps` with `detail: "compact"`. It returns every flow on
the test, tagged structural or reusable, so count assertions across all of
them. Older tests list their reusable flows as flow entries rather than
`EvaluateFlow` steps, so do not rely on `EvaluateFlow` to find them. Step groups
nest their children, so count recursively. Use `get_mabl_flow_steps` only for a
flow the test read did not include.

Built-in tests (the default page-load and link crawl tests) have no authored
steps. Rate their assertion strength as not applicable rather than weak.

Count:

- **Enabled assertions.** Step types beginning with `Assert`, minus any marked
  disabled. The compact read does not show disabled state for browser steps, so
  read the full steps (`stepIds` from the compact read) for any test whose
  rating depends on it, and say which tests were checked.
- **Content assertions.** Assertions on text, values, attributes other than the
  URL, AI prompts and visual checks. These prove the page shows the right thing.
- **Shallow assertions.** Assertions that only check the URL, or only that an
  element is present. These prove the page loaded, not that it is right.
- **Fail-at-end assertions.** `onFailure` values that let the run continue.

| Rating | Rule |
|---|---|
| Strong | At least three content assertions, and content assertions are at least half of all enabled assertions |
| Adequate | At least one content assertion |
| Weak | No content assertions, only shallow ones, or most assertions disabled |

Count from the step data alone. Pages reached by clicking are not visible in it,
so the rule does not depend on how many pages a test visits.

A test with no assertions at all is weak even when it passes every run.

## Catch record

Pull `list_mabl_test_runs` with `limit: 50`, paging with the cursor until the
window is covered. Each run carries `testVersion`, status, `environmentId` and,
for failures, `failureCategorization.categoryId`.

Confirm the status vocabulary first. Runs can report a pass as `completed`
rather than `passed`.

Drop runs with no `environmentId`, which are local or authoring runs. Group the
rest by environment and browser, sort each group by time, and walk it. A failure
on one browser followed by a pass on another is not a recovery.

- **Same-version recovery.** A failure followed by a pass on the same
  `testVersion`. The test did not change, so the application, its data or the
  environment did.
- **Edit recovery.** A failure followed by a pass only on a newer version. The
  test was wrong, or the application changed and the test was updated to match.

Resolve category ids with `list_mabl_failure_reasons`, since workspaces can add
custom reasons. Then sort each same-version recovery.

- **Candidate catch.** The category is `regression`, or a custom reason that
  describes an application defect.
- **Noise.** The category is `environment`, `network` or `timing`. Also
  `test_implementation`, because a test that was not edited and then passed was
  not wrong; the failure was most likely flaky.
- **Unconfirmed.** No category assigned. It counts as a catch only if its
  screenshots show a fully rendered page with wrong content.

Confirm the two or three strongest candidate catches per test before calling any
test proven. `get_mabl_test_run` returns the failing step's screenshot URI, and
`list_mabl_test_run_artifacts` returns every step's. Open them with
`get_mabl_test_run_artifact`. A confirmed catch shows the page rendered and
wrong, not an error page or a page still loading.

Report catches as counts with dates. One confirmed catch in the window is
strong evidence of value. Zero is not evidence against a test, because a stable
application gives a good test nothing to catch.

## Gate

Take the gate from what ran, not only from plan settings.

- **Deployment.** A deployment event in the window started a plan run that
  includes the test. Read the plan runs from `list_mabl_deployment_events`
  without `summaryOnly`, because `summaryOnly` drops the plan runs that passed.
  A deployment can run a plan that is now disabled, and an enabled plan with a
  deployment trigger can go the whole window without firing. Both are worth
  reporting.
- **Schedule.** In an enabled plan with a schedule, and the test has plan runs
  in the window.
- **On demand.** In an enabled plan with no trigger.
- **None.** In no enabled plan and not run by any deployment.

`get_mabl_plan` returns environment-and-application ids rather than environment
ids. Take a test's environments from its run history instead.

## Cost

| Rating | Rule |
|---|---|
| High | Flaky in more than 10 percent of plan runs, or more than 5 versions in the window, or more than half its failures cleared only after an edit |
| Medium | Flaky in 3 to 10 percent of runs, or 3 to 5 versions in the window, or a median run time over 10 minutes, or more than 60 seconds of fixed waits |
| Low | None of the above |

Version counts include every branch. A burst of versions right after a test was
created is authoring, not maintenance, so ignore versions from its first 7 days.

## Journey match

Match a test to a critical journey when two of these hold. Its name or labels
name the journey's subject. Its visited URLs include the journey's pages. A
reusable flow it calls is named for a step in the journey.

When only one holds, call `identify_coverage_gaps` with the journey as
`requirementDescription`. Treat a coverage score that the tool reports as most of
the requirement covered as a match, and record the uncovered gaps it lists. If
the tool returns `analysis_unavailable`, record the match as unverified.
