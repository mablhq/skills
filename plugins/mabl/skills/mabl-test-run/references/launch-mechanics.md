# Launch mechanics

Detail behind the lanes in `SKILL.md`: which surface starts what, which keys a
deployment event carries, and the reason names an event that matched nothing can
come back with. Every rule, default and bound has its single home in `SKILL.md`.

## Which surface starts what

| Lane | CLI | MCP |
|---|---|---|
| Local run | `mabl tests run` | `run_mabl_test_local` |
| Tests in the cloud | `mabl tests run-cloud` | `run_mabl_test_cloud` |
| A set of tests as one cloud run | none | `run_mabl_test_batch_cloud` |
| A plan by id | none; `mabl plans` describes and lists | `run_mabl_plan` |
| Failures of a plan run | none; no plan-run command | `rerun_mabl_plan` |
| Deployment event | `mabl deployments create` | `trigger_mabl_deployment` |
| Poll a test run | `mabl tests get-runs <*-j> -o json` | `get_mabl_test_run` |
| Poll a plan run | none | `get_mabl_plan_run` |
| Poll a deployment event | `mabl deployments watch <*-v>`, `mabl deployments describe <*-v>` | `get_mabl_deployment_status` |

A mobile test runs on its own local command, `mabl tests run-mobile`, which takes
a build file as well as a test and is not reachable from `run_mabl_test_local`.

## Reading a deployment event

`mabl deployments describe <*-v> -o json` carries more than the first screen, so
take the fields wanted with `jq`. The ones worth reading:

- The triggered plan run summaries, each pairing a plan id with a plan run id.
  These are the launch's own ids.
- The plan labels, revision, environment, application, received time, and a
  free-form properties object a CI system may have filled with a build URL.
- An event status object: whether the event succeeded, whether it succeeded on
  the first attempt, and whether it succeeded only with retries. The first can be
  true while the second is false.
- Plan execution metrics and test execution metrics, each as a total with
  passed, failed and — for tests — running, skipped and terminated counts.
- An executions list, one entry per plan execution, each saying whether it is a
  retry and carrying the test runs beneath it with a browser per run. The browser
  split in the cost line comes from here.
- A failure analysis section: a written headline, summary and evidence. That text
  is the server's, and it is passed through as the server's words, never restated
  as this skill's own finding.

## Why an event matched no plan

A trigger that started nothing still succeeds, and the response carries reasons.
These names are listed for recognition only; report whatever the response
actually says, verbatim.

Per plan: the plan is disabled, it has no deployment trigger, it contains no
tests, or its labels did not match the ones passed.

For the event as a whole: no deployment binding, no plans target that deployment,
plans were excluded, plans matched but no runs were created, or the server could
not determine a reason.

On the CLI the same state is an empty triggered-plan-run list on
`mabl deployments describe`.

## Candidate deployments instead of run ids

Where an environment binds more than one URL for the application, a cloud launch
comes back with candidate deployments rather than run ids, and nothing has
started. Repeating the call re-asks the same question.

Candidates carry no marker saying which is canonical, and the set can include a
URL that cloud execution cannot reach. Where the test's own saved URL, read with
`get_mabl_test`, equals one candidate's URL, name that candidate. Otherwise ask
which URL, then re-invoke with that deployment id.

## Reading the ids back from a cloud launch

`mabl tests run-cloud` returns a run id only when it created exactly one run, so
a wider launch leaves the ids to be read back per target.

One `*-j` on several browsers: `mabl tests get-runs <that *-j> -o json`, keeping
the rows that started at or after the launch.

A label launch has no single `*-j`, and `get-runs` takes one test id and no label
flag. Hold the test ids the CLI prints as it launches each selected test, then
`get-runs` each of those, up to the fan-out cap in `SKILL.md`'s **Poll and
report**. Past the cap, report the results page and say the rest are unverified.

## Checking whether a run exists, per lane

Behind `SKILL.md`'s **A launch that came back with no ids**. Each list call here
exists for that check alone, never to find a target.

**A test lane.** `list_mabl_test_runs({ testId, workspaceId, sinceMs: <launch
time> })`. The since filter is what makes "started after the launch" observable
here: no row inside the window, and no cursor left to read, licenses the single
re-fire.

**A set dispatched as one run.** There is no check. The run carries no plan id, so
`list_mabl_plan_runs` has nothing to filter on, and an identical repeat inside the
refusal window comes back without the id. Report unverified and do not re-fire.

**A plan lane.** `list_mabl_plan_runs({ planId, workspaceId })`. The plan id comes
from the caller when a plan was launched by id, and from `get_mabl_test_run` on
one of the source run's test runs when the failures of a `*-pr` were re-run,
because reading that `*-pr` does not hand back the plan id. The rows carry no
start time, so "started after the launch" cannot be checked on this lane. Any
listed run that is not terminal, or that completed at or after the launch time,
may be the launch's: report unverified and do not re-fire. Re-fire only when every
listed run is terminal, completed before the launch time, and no cursor is left.

**The deployment lane.** `get_mabl_deployment_status({ workspaceId,
environmentId, applicationId, revision: <the whole commit hash passed at launch>
})`. The revision is matched as a prefix inside a lookback window, and the
environment is what narrows the search on the server, so pass the full hash, and
pass a longer lookback when the waits ran past the default. A prefix match is
narrower than exclusive: a CI retry, or a second push of the same commit inside
the window, satisfies it too. Take a returned deployment as the launch's only when
its id was not already known before the launch and every plan-run start time it
carries is at or after the launch time; otherwise report unverified and do not
re-fire. Where the launch carried no revision at all, report unverified and do not
re-fire: a status call filtered only by application and environment can answer
with somebody else's event.
