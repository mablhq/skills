# Computing the signals

## Assertion strength

Read `get_mabl_test_steps` with `detail: "compact"`. Step groups nest their
children, so count recursively. Expand every reusable flow the test calls with
`get_mabl_flow_steps` and count its steps too.

Count:

- **Enabled assertions.** Step types beginning with `Assert`, minus any marked
  disabled. If the compact read does not show disabled state, read the full step
  for the assertions that matter and say which tests were checked.
- **Content assertions.** Assertions on text, values, attributes other than the
  URL, AI prompts and visual checks. These prove the page shows the right thing.
- **Shallow assertions.** Assertions that only check the URL, or only that an
  element is present. These prove the page loaded, not that it is right.
- **Fail-at-end assertions.** `onFailure` values that let the run continue.

| Rating | Rule |
|---|---|
| Strong | At least one content assertion for each page the test visits, and at least three content assertions overall |
| Adequate | At least one content assertion, but not on every page visited |
| Weak | No content assertions, only shallow ones, or most assertions disabled |

A test with no assertions at all is weak even when it passes every run.

## Catch record

Pull `list_mabl_test_runs` with `limit: 50`, paging with the cursor until the
window is covered. Each run carries `testVersion`, status, `environmentId` and,
for failures, `failureCategorization.categoryId`.

Confirm the status vocabulary first. Runs can report a pass as `completed`
rather than `passed`.

Sort each environment's runs by time and walk them.

- **Same-version recovery.** A failure followed by a pass on the same
  `testVersion`. The test did not change, so the application, its data or the
  environment did.
- **Edit recovery.** A failure followed by a pass only on a newer version. The
  test was wrong, or the application changed and the test was updated to match.

A same-version recovery is a **candidate catch** when its failure category is
`regression` or `test_implementation`. It is **noise** when the category is
`environment`, `network` or `timing`, or when screenshots show error pages or a
page still loading. Confirm the two or three strongest candidate catches per
test with `get_mabl_test_run_artifact` before calling any test proven.

Report catches as counts with dates. One confirmed catch in the window is
strong evidence of value. Zero is not evidence against a test, because a stable
application gives a good test nothing to catch.

## Gate

A test's gate is the strongest of its enabled plans, in this order. Deployment,
then schedule, then on demand, then none. Count a plan as a deployment gate only
when `list_mabl_deployment_events` shows it was triggered in the window.

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
