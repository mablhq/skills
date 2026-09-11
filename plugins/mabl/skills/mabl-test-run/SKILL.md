---
name: mabl-test-run
description: |
  START a mabl run of a target the caller already chose, then report the ids,
  outcomes and cost. Takes a test id (`*-j`), test labels, a set of test
  ids, a plan id (`*-p`), an application (`*-a`) and/or environment (`*-e`) for
  a deployment event, or a finished plan run (`*-pr`) to re-run its failures.
  Applies the overrides asked for — application, environment,
  deployment, URL, credentials, DataTable scenario, mabl branch, browsers —
  locally or in the cloud, with billable features on.
  Fire on "run this test", "run these tests", "run the smoke plan", "kick off
  the nightly", "trigger a deployment for <app> in <env>", "rerun the failures
  from that plan run", "run it locally", "/mabl-test-run".
  Never picks which tests to run, never judges whether one is safe, never prices
  a run beforehand, never rules on the result. NOT for explaining a
  finished run: one failed test run (`*-jr`) is mabl-debug. NOT for certifying
  an edit, which is mabl-test-edit-verify. A plan by id and re-running failures
  need the mabl MCP server.
allowed-tools: Bash(command -v mabl:*), Bash(npm install -g:*), Bash(mabl --version:*), Bash(mabl auth login:*), Bash(mabl tests --help:*), Bash(mabl tests run --help:*), Bash(mabl tests run-cloud --help:*), Bash(mabl deployments --help:*), Bash(mabl tests run:*), Bash(mabl tests run-cloud:*), Bash(mabl tests get-runs:*), Bash(mabl deployments create:*), Bash(mabl deployments watch:*), Bash(mabl deployments describe:*), Bash(printf:*), Bash(sort:*), Bash(head:*), Bash(grep:*), Bash(jq:*), Bash(mkdir:*), Bash(date:*), Bash(xargs:*), Write, mcp__mabl__run_mabl_test_cloud, mcp__mabl__run_mabl_test_batch_cloud, mcp__mabl__run_mabl_test_local, mcp__mabl__get_mabl_test, mcp__mabl__get_mabl_test_run, mcp__mabl__list_mabl_test_runs, mcp__mabl__run_mabl_plan, mcp__mabl__get_mabl_plan_run, mcp__mabl__list_mabl_plan_runs, mcp__mabl__rerun_mabl_plan, mcp__mabl__trigger_mabl_deployment, mcp__mabl__get_mabl_deployment_status
---

# mabl test run

Start the run someone asked for, then say what happened to it.

A launch response is a dispatch, not a result. Everything here turns on that one
distinction: hold the ids the launch handed back, poll them to a terminal state,
and report that state. This skill does not choose what to run, does not judge
whether a target is safe to run, does not price a run beforehand, and does not
rule on the outcome.

## Prerequisites

Either surface works for most lanes. Two lanes exist only on the **`mabl` MCP
server**, which ships in this plugin: running a plan by its id, and re-running
just the failures of a finished plan run.

The **mabl CLI** serves three lanes: a local run, tests in the cloud, and a
deployment event. Install and version-check it only when one of those is the
lane being taken:

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.129.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest
```

An installed CLI still has to be signed in. `mabl auth login --auto` is the
variant that completes without anyone at the terminal; plain `mabl auth login`
waits for a person and reads as a hang.

**Probe for the command, never trust the number.** Features ship together, so a
version that passes the check can still lack the subcommand or the flag:

```bash
mabl tests --help | grep -qw get-runs            # reading a test run's outcome
mabl deployments --help | grep -qw describe      # reading a deployment event
mabl tests run --help | grep -qw -- --reporter   # publishing local results
```

**The MCP server fails three ways, and they need different handling.**

| What is observable | What it means | Do |
|---|---|---|
| The tool is absent from the tool list | The server is not connected | Name the server, take the CLI lane, or stop |
| The run tools are absent and an `authenticate` tool is present | The server is connected and not signed in | Say so, take the CLI lane, or stop with what would have been launched. Never call `authenticate` on the caller's behalf unasked |
| The tool is present and the call errors | This account does not have access to it | Quote the error verbatim, take the lane's fallback |

**Report the observable, not the conclusion alone.** Say what fixed the
classification: an `authenticate` tool present in the list, or no mabl tools in
the list at all. "The server is unauthenticated" with nothing quoted behind it
is a guess, and the two states send the caller to different fixes.

This plugin ships one mabl MCP server, named `mabl`. Where a host has more than
one configured, read each server's tool list before calling a lane closed, and
never launch through another server without the caller's explicit yes.

Workspace id, and the environment and application ids the cloud lanes need, come
from the caller or from the project's saved mabl setup. This skill resolves
properties of the entity it was handed, and nothing else.

## Router

**Take the target as given.** It resolves only from what the caller supplied or
from the project's saved mabl setup. A name with no id is the no-target empty
state below: ask. Never list to turn a name into an id, and never pick a target
by recent activity.

| What the caller gave | Lane |
|---|---|
| One or more `*-j`, or test labels, and the run is to happen on this machine | [1. Local run](#1-local-run) |
| `*-pr`, finished, and only its failures are wanted | [2. Re-run the failures of a plan run](#2-re-run-the-failures-of-a-plan-run) |
| One `*-j`, or test labels, in the cloud | [3. Tests in the cloud](#3-tests-in-the-cloud) |
| Several `*-j` wanted as one run with one results page | [A set as one run](#a-set-as-one-run) |
| `*-p` | [4. A plan by id](#4-a-plan-by-id) |
| An application id (`*-a`) and/or an environment id (`*-e`), optionally plan labels | [5. A deployment event](#5-a-deployment-event) |

Lanes are ordered by what they spend. Local and CI runs consume no cloud credits;
billable features inside them do, and this skill turns those on — see
[Billable features](#billable-features). Re-running a plan run's failures re-fires
a subset. The cloud and plan lanes spend what the target contains. A deployment
event is the widest: the server picks which plans match, so the run count is not
knowable before the event is created.

**Say the cost once the launch is under way**, in the unit the reader feels: how
many runs, split by browser, and minutes of cloud execution. The shape is
`14 runs: 5 firefox, 9 chrome; 22 min cloud execution so far`. Never gate the
launch on an estimate.

### Three empty states, all normal

1. **No target.** Ask for one, report nothing else, and do not offer candidates.
2. **A label set that matches nothing.** The CLI exits non-zero and echoes the
   labels it was given. That plus a non-zero exit is "nothing started", not a
   launch failure. Quote it and stop.
3. **A deployment event that matches no plan.** The event is created and nothing
   runs. Report the reasons the server gave, verbatim; where it gave none, say
   that nothing ran and no reason came back. Never change a plan to make it
   match. `references/launch-mechanics.md` lists the reason names.

## Overrides

Every lane takes overrides, and which ones it takes differs by lane. Two rules
hold across all of them.

**Pin the whole target before dispatch**, not just the URL: application,
environment, URL or deployment, credentials, and the workspace results report
into. The resolved-target header reaches the log only after that run has started,
so confirming afterwards is not confirming.

**An environment on its own does not change the URL.** `--environment-id` selects
the variables and find information for that environment and leaves the URL alone.
Pair it with `--application-id` to run against the URL of the matching
deployment, or set `--url` directly. The application and environment pair has to
resolve to exactly one target; where it resolves to more, pass the deployment id
or the URL.

`references/overrides.md` carries the full option-by-lane table, the MCP
parameter names beside the CLI flags, and what each override does not do.

### Billable features

**Run what the caller asked for, with mabl's capabilities on.** Visual and GenAI
assertions are part of what a test asserts, and a run with them switched off is a
quieter run rather than a cheaper equivalent — it passes on coverage it never
executed. On the local lane those assertions are gated behind
`--allow-billable-features`, and this skill passes it. In the cloud they run as
authored.

Say what that spends, once the run is under way, in the cost line.

The caller can say otherwise, and three answers are worth recognizing: run with
billable features, which is the default; run free only; or ask first. **Free-only
is a narrower run**, so name the assertions that will not execute rather than
reporting a pass as though they had. Never choose free-only to save someone money
they did not ask to save.

## 1. Local run

Sequential execution, on this machine or in CI, and no cloud credits. The command
blocks until the run ends, and its exit status is the outcome.

```bash
mabl tests run --headless --allow-billable-features \
  { --id <*-j> | --labels <a> <b> [--exclude-labels <c>] | --from-plan-id <*-p> } \
  [-w <workspace-id>] [-a <app-id> -e <env-id> | --url <url>] \
  [--credentials-id <id>] [--basic-auth-credentials-id <id>] \
  [--scenario-id <id> | --data-table-id <id>] [--mabl-branch <branch>] \
  [--reporter mabl]
```

`--headless` defaults to false, so an unattended run passes it or opens a visible
browser window per test. `--scenario-id` binds one DataTable row and
`--data-table-id` binds every row.

**`--from-plan-id` is not a plan run.** It takes the plan's test list and its
configuration, and runs those tests sequentially against one base URL. Stages,
per-plan browser settings, shared variables, and DataTable and credential
overrides are not applied, and there is no ordering or concurrency control, so its
result is not the plan's result and is never reported as one. It is still the
right lane when the caller wants a local sweep of a plan's tests; say which of the
plan's settings did not apply.

**Local results reach the app only with `--reporter mabl`.** Without it the CLI
prints to the terminal and publishes nothing. Two consequences belong in the
reply: results publish after every test in the invocation has completed, so an
interrupted run publishes none of them; and local runs carry step descriptions
and results only, with no performance data, no accessibility results, and no
results analysis. `--from-plan-id` alongside it groups the published results
under that plan, as a grouping and nothing more.

The exit status is the outcome and there is nothing to poll. If the host's
command timeout cuts the run off, that is **unverified**: report it as its own
state, never as a pass and never as a failure.

**With no CLI on this machine**, `run_mabl_test_local` returns a link for a person
to click, and the run happens on their machine. There is no status, no log and no
pass or fail to read back, so the only honest report is "launched by link,
outcome unverified". The link needs the mabl desktop app signed in as that user.

## 2. Re-run the failures of a plan run

Runs on the MCP server. The CLI has no plan-run command.

Confirm the source run is finished first, and count what failed in it:

```
get_mabl_plan_run({ planRunId: "<*-pr>", workspaceId })
```

Then:

```
rerun_mabl_plan({ planRunId: "<*-pr>", workspaceId, scope: "failed" })
```

Passing a scope is what makes this the subset lane. Read the tool's input schema
for the value set and the default rather than assuming one: the default re-runs
every test the original plan run contained. It hands back a new plan run id and
links to the test runs it created. Poll that id per
[Poll and report](#poll-and-report).

## 3. Tests in the cloud

Parallel execution in the mabl cloud, and the lane that collects the fullest
diagnostics. **Several ids wanted as one run go to
[a set as one run](#a-set-as-one-run)**; one test, or a label set, takes the
commands here.

```bash
mabl tests run-cloud --no-prompt --browsers chrome [-w <workspace-id>] \
  { --id <*-j> | --labels <a> <b> [--exclude-labels <c>] } \
  [-a <app-id> -e <env-id>] [-d <deployment-id> | --url <url> | --api-url <url>] \
  [--credentials-id <id>] [--basic-auth-credentials-id <id>] \
  [--mabl-branch <branch>] [--revision <sha>]
```

`--prompt` defaults to true, so an unattended launch passes `--no-prompt`.
`--browsers` defaults to chrome. `--labels` matches **any** of the labels given,
so two labels run the union and not the intersection. No flag here waits for the
result.

**The two surfaces are not interchangeable on this lane, and the difference
decides which one to take.** Selecting tests by label is CLI-only. Binding a
DataTable row to a cloud run is MCP-only — this command has no DataTable flag at
all. So a label set goes to the CLI, and a data-driven test that needs its rows
goes to the MCP tool.

**Label selection is capped.** At the cap the CLI says so in two lines — that the
maximum test search limit was hit, and that the most recently created tests will
be considered — then runs that recency-chosen subset. Report both lines verbatim,
because the set that ran is not the set the labels describe. Do not add a cap of
your own, and do not stop to confirm.

**This command hands back a run id only when it created exactly one run.** One
test on one browser ends with a link whose last path segment is the run id;
anything wider ends with a link to the workspace results page, which carries no
ids at all. `references/launch-mechanics.md` carries how to read the ids back
per target for a wider launch, and what to report past the fan-out cap in
[Poll and report](#poll-and-report).

MCP:

```
run_mabl_test_cloud({
  testId: "<*-j>", workspaceId, environmentId, applicationId,
  browsers: ["chrome"],
  branch, deploymentId, urlOverride, credentialsId   // as asked for
})
```

`testId`, `workspaceId`, `environmentId`, `applicationId` and `browsers` are all
required. Given a `*-j` and no application id, read the test with `get_mabl_test`
and take the application, the URL and the environment from what the response
actually carries; none of the three is guaranteed to be there. With no
environment id from the caller, the test, or the project setup, take the CLI lane
or ask. Never list environments to pick one.

**Data-driven tests.** Check the tool's input schema for a scenario key. Where it
is there, one row and every row are mutually exclusive choices. Where it is not,
this lane runs whatever binding the test carries, and the reply says so.

Then poll each returned id per [Poll and report](#poll-and-report).

### A set as one run

`run_mabl_test_batch_cloud` executes up to 50 test ids as **one ad-hoc plan run**
with one results page, so one poll covers the set. It is the cloud path for a set:
it returns a plan run id where the per-test calls return ids one at a time.

```
run_mabl_test_batch_cloud({
  testIds: ["<*-j>", "<*-j>"], workspaceId, environmentId, applicationId,
  browsers: ["chrome"],
  concurrency: "sequential" | "parallel", concurrencyLimit,
  branch, deploymentId, urlOverride, credentialsId   // as asked for
})
```

**Concurrency is the caller's grouping, expressed to the server.** A set the
caller says must not collide is `sequential`; anything else is `parallel`, and
`concurrencyLimit` caps how many run at once. This skill picks neither on its own
judgment about what a test writes.

**Four things this lane does that a per-test call does not**, each of which
belongs in the reply:

- **A mixed set is refused and nothing dispatches.** Browser and performance
  tests go in one call, API tests in another.
- **A disabled test still runs**, because an ad-hoc run executes disabled tests.
- **No DataTable row is bound to anything in the set.** A data-driven test runs
  one unbound scenario, and its rows are not covered. The response names each
  such test; those rows need `run_mabl_test_cloud` with a scenario or table id.
- **Warnings are part of the result.** A mobile test, or a test from another
  workspace, is reported in warnings while the rest dispatch, so the set that ran
  is not the set that was asked for.

**The returned test-run list is a first page**, and the response says so in a
warning. Count what was dispatched from the poll, never from that array. The test
ids in it carry a version suffix (`<*-j>:0`) that the poll does not return: reuse
the id as it was passed, and take run ids from the response as they came.

**Hold the returned plan run id.** An identical repeat within 60 seconds is
refused rather than re-run, and that refusal does not carry the id. The run is a
plan run with no plan, and `list_mabl_plan_runs` requires a plan id, so no query
can recover it afterwards — losing the id means the run is unverifiable, not that
it did not happen. Poll it per
[Poll and report](#poll-and-report).

**Where the tool is absent from the tool list**, this account's server does not
expose it. Say so, and dispatch the set one `run_mabl_test_cloud` call per test
instead, which is a run id per test and no single results page.

## 4. A plan by id

Runs on the MCP server. The CLI's `mabl plans` commands describe and list plans;
none of them starts one.

```
run_mabl_plan({ planId: "<*-p>", workspaceId,
                urlOverride, apiUrlOverride, branch, browsers,
                credentialsId, httpAuthCredentialsId })   // overrides optional
```

One plan run, containing as many test runs as the plan holds. It returns the plan
run id and links to the test runs. Poll the plan run id.

**Read the plan before overriding it.** A plan already carries browsers, stages,
credentials, DataTable bindings and retry behaviour that somebody chose. An
override replaces that choice for the run rather than adding to it — passing
`browsers` discards the plan's own list — so read the plan first and say in the
reply which of its settings the run did not use.

## 5. A deployment event

The widest lane. **Plan selection happens on the server**: an event runs the plans
that are enabled, carry a deployment-event trigger, contain the application and
environment given, and match a plan label when one is passed. Neither surface
takes plan ids here.

```bash
mabl deployments create { -a <app-id> | -e <env-id> | -a <app-id> -e <env-id> } \
  [-w <workspace-id>] [-l <plan-label> ...] [--mabl-branch <branch>] \
  [--revision <sha>] [--url <url>] [-b <browser> ...] -o json
```

`-o json` returns the event id with its links and implies `--silent`; without it
the command prints a link whose last path segment is the id. `-l` matches any of
the plan labels given.

MCP:

```
trigger_mabl_deployment({ workspaceId,
                          applicationId, environmentId,   // one or both
                          planLabels, branch, revision, urlOverride })
```

**Pass a revision whenever the caller has one.** It makes the event findable
again without guessing, and the existence check on this lane depends on it. **When
a revision is reused** — a CI retry on the same commit — call
`get_mabl_deployment_status` with the same filters once before the launch and hold
any deployment id it returns, so a pre-existing event cannot be read back as this
one.

**What an event would run can be previewed before it is created**, but only on
the public API: the deployment-event endpoint takes a preview parameter that
reports what would run without creating anything. Neither the CLI nor the MCP tool
exposes it. Where the caller needs to know before spending, say the preview exists
and is reachable only from the API; never estimate the plan set from a plan
listing, because matching happens on the server.

**An event that matched nothing still succeeds.** The response carries an empty
triggered-plan-runs list and, where the server fills them, a set of reasons. An
empty list means nothing ran: report the reasons verbatim, per the no-match empty
state above.

Poll with `get_mabl_deployment_status`, passing the event id the trigger returned.
On the CLI, `mabl deployments watch <event-id>` blocks until the event finishes and
exits non-zero when it failed; set the host command timeout to the bound in
[Poll and report](#poll-and-report) or the host's maximum, whichever is lower. When
the kill comes first, report unverified with the elapsed time and the event id, so
the caller can resume with `describe` or the status tool.

**Read the whole event, not the first screen of it.** Take the fields wanted out
of the JSON with `jq`. Piping `describe` through `head` truncates your own
observation, and the gap then gets written into the record as though the server had
withheld it. `references/launch-mechanics.md` names the keys worth reading.

**Pass every id exactly as it came back.** Never derive one id from another.

## Dispatching a set

A caller who hands over several ids gets them all run. Bands — read-only,
contained, approved-by-id, or whatever grouping the caller uses — are an
**input**: run them in the order and grouping given. **This skill does not screen
a target and does not rule on whether one is safe to run.** Where no bands come
with the set, it is one wave.

In the cloud, [a set as one run](#a-set-as-one-run) dispatches the whole set in
one call and carries the caller's grouping as its concurrency setting. What
follows is the local path, and the cloud fallback where that tool is absent.

**Canary first.** Dispatch exactly one, read what comes back, and only then run
the rest. Three things surface in that one run that otherwise cost the whole wave:
a mis-resolved target, a missing credential the response only warns about after
the fact, and an application build that never deployed. Read the receipt for the
target: a cloud run returns its resolved binding in the response, a CLI run prints
a `URL:` / `Environment:` / `Credentials:` header. Same purpose, two different
artifacts, so do not look for one in the other's output. A cloud run exercises
whatever is deployed to the target environment, never the working tree.

**Locally, serial.** Local and CI execution is sequential; a second local run
started alongside the first fails with `EADDRINUSE: address already in use`
before any step executes. It is a race, so a fan-out can pass twice and fail the
third time, which reads exactly like a flaky test. Run a local set one at a time,
and where the caller asks for concurrency anyway, recognize that signature before
reporting a failure as the test's.

**Bound the wave, not just the run.** Set a wall-clock budget before dispatching.
When it runs out, stop dispatching, report what completed, and mark the remainder
`not run, timed out`. A timed-out wave is an incomplete run, never a passing one
with fewer rows.

**Capture each exit status immediately.** `mabl tests run` prints no machine
format, so the exit status is the only pass or fail it gives, and any command that
follows it — an `echo` included — becomes the status. Assign it to a variable on
the next line, then report the variable.

`references/local-dispatch.md` carries the worked dispatch, the userland check it
depends on, and how to read the aggregate status.

## Poll and report

Poll rather than sleeping and hoping, and stop at the bound.

**Polling happens in the foreground of this skill's own turn**: a blocking
`mabl deployments watch <event-id>`, or a loop the turn waits on. Never hand
polling to a background process and return, and never promise a report a later
turn would have to deliver. A background loop dies with the session, and the
reader is left believing a watch is still running.

**When the turn has to end before every id is terminal**, say so in the reply:
each non-terminal id named as unverified, with the elapsed time and the command
that resumes the wait. The run record says the same. A placeholder such as
"filled in below as polling proceeds" is false the moment the turn ends.

| Operation | Interval | Bound | At the bound |
|---|---|---|---|
| One test run | 30 s | 30 min | Report the ids as still running, stop |
| Plan run | 30 s | 30 min | Same |
| Deployment event | The interval the response suggests, else 30 s, floor 15 s | 30 min, higher if the caller asks | Same |
| Local run | The command blocks | The host command timeout or 30 min, whichever is lower | Report unverified |

Poll individual ids up to 10 of them. Past 10, report every id plus the results
page and stop, with the un-polled ones unverified, unless the caller asks to wait
for all of them.

Never poll faster than every 15 seconds, and space the ids inside one cycle at
least 2 seconds apart: the per-identity burst allowance is small enough that a
fan-out fired at once rate-limits itself. Never start a new cycle sooner than the
larger of 30 seconds and 3 seconds per id being polled. A poll that comes back
rate-limited bought nothing.

Read the poll like this:

- `get_mabl_test_run`: poll while the terminal flag is false. The success flag and
  the failure summary are trustworthy only once it is true. An error field on a
  non-terminal run is a retry in flight, not a verdict.
- `get_mabl_plan_run`: one call returns every test run in the plan run, and it is
  the authority on what the set contains. Its own status lags the test runs it
  carries, so read the per-test statuses for progress and the plan run's terminal
  flag for the whole.
- `get_mabl_deployment_status`: a snapshot; it does not block.
- `mabl tests get-runs <*-j> --limit N -o json`: rows carry the run id, status,
  outcome, start and completion times in epoch milliseconds, duration,
  environment, branch, execution source and termination reason. It takes no
  workspace flag, so it reads the workspace the CLI is signed in to.

### A launch that came back with no ids

One rule covers a rate limit and a timeout, because the question is the same: does
a run exist?

1. **Wait.** Honour the retry-after number when there is one, at most three waits
   per launch. With no number, wait 30 seconds.
2. **Check for existence**, scoped to the entity launched. These list calls exist
   for this check alone, never to find a target.
3. **An empty page is not proof.** `list_mabl_test_runs` says outright that an
   empty result never means no such run exists, and that a returned cursor means
   there is more history to search. Read both before concluding anything.
4. **Re-fire at most once**, and only where the lane licenses it. Otherwise report
   **unverified, not re-fired**, and let the caller decide.

What to list per lane, what makes "started after the launch" observable there, and
when a single re-fire is licensed: `references/launch-mechanics.md`.

**A refusal that says the call is already in progress, or that an identical call
was made moments ago, is evidence the run started.** Poll for it. Never raise a
repeat ordinal and never vary the arguments to get past that refusal: that starts
a second run. A set dispatched as one run has no plan id, so where its plan run id
was not held, no list call can find it: report unverified and do not re-fire.

## Signals that lie

| Signal | Why it lies | What to trust |
|---|---|---|
| A successful launch response | It is a dispatch, not a result | A terminal poll: the terminal flag, then the success flag |
| An empty triggered-plan-runs list on a successful event | Nothing ran | The reasons the response carries, quoted verbatim |
| An event reporting success | It can report success while failed tests are counted under it, with the retry flags carrying the real story | The metric counts and the retry flags, not the single boolean |
| A plan-execution count | It counts executions including retries, so it can exceed the number of triggered plan runs | The triggered plan run ids |
| A plan in a deployment status with no test metrics | An API-check-only plan reports plan status and no test metrics | Plan status and test metrics as two separate signals |
| Candidate deployments instead of run ids | The environment binds more than one URL for the application, so nothing started, and repeating the call re-asks the same question | Where the test's saved URL from `get_mabl_test` equals one candidate's URL, name that candidate; otherwise ask which URL, then re-invoke with that deployment id |
| "The most recent run in the workspace is mine" | A busy workspace runs thousands of tests a day | Only the ids the launch returned, or `get-runs` rows that started at or after the launch |
| A run's status read on its own | It sits beside a termination reason, and neither field implies the other | Both fields, quoted as returned. Any value that is not a plain completion is reported as its own state, never folded into pass or fail |
| A local run's app record | Results publish only after every test in that invocation completes, and carry step results alone | The terminal output, whether the invocation completed, and what the lane collects |
| One trigger, one run | A trigger creates a run per browser, and a plan run many | Every id terminal before the report says done. One green sibling is not a green result |
| A set dispatched as one run covering its tests' DataTable rows | No row is bound to any test in the set, so each data-driven test runs one unbound scenario | The warnings the response names, and a separate per-test call for the rows |
| A disabled test being skipped | An ad-hoc run executes disabled tests | The set the response says it dispatched |
| A data-driven test's outcome on an unbound run | The run exercises none of its rows, so passing or failing says nothing about them | Whether a row was bound at launch, and the rows run separately |
| A plan run's own status | It lags the tests beneath it: a plan run reads `scheduled` with three of its four tests already terminal | Each test run's status, and the plan run's terminal flag for the whole |
| A failure categorization on a run | It is the server's own generated analysis, and repeating it makes this skill look like it diagnosed the failure | Report the outcome and the run id. Where the text is passed on, pass it as the server's words |
| A version number | A version that passes the check can lack the subcommand | The `--help` probe |
| A run tool being in the tool list | A present tool can still be missing a parameter | The tool's own input schema, read for the key |

**"Unverified" is a required outcome.** A bound hit, a local run by link, a launch
whose ids never came back, a watch killed by a command timeout: each is reported
as its own state, never folded into done and never into failed.

## The run record

One file per launch, at `.mabl/runs/<launch-id>.md`, where the launch id is the
first id the launch returned — the deployment event id, the plan run id, or the
first test run id — verbatim.

```bash
mkdir -p .mabl/runs
```

Where the launch returned no id at all, name the file for the lane and the launch
time in epoch milliseconds.

It holds the target as given, the lane, the exact call made, every id returned,
the poll timeline, the terminal state per run, the cost line, and what could not
be seen. **Every field is written in a state that is true when the file is
saved**: a run still going is `unverified, still running at <elapsed>`, a field
nobody read is `not read`. Never `pending`, and never a promise that something
will be filled in later, because nothing returns to fill it.

Scratch work goes in `/tmp`. Nothing else is written on this skill's own
initiative.

## What the reply says

In this order, and nothing else:

1. **What started**, as ids.
2. **The terminal state of each**, with unverified as its own state.
3. **The cost**, as one line — `14 runs: 5 firefox, 9 chrome; 22 min cloud
   execution so far`. Where the minutes are not observable yet, write `minutes:
   not yet, runs still in flight` rather than dropping the unit. A local run says
   it consumed no cloud credits, and names the billable assertions it ran.
4. **Anything the reader has to decide**: a candidate URL, a bound that was hit, a
   no-match reason, a truncated label selection.
5. The path to the run record.

Which lane ran, which call errored before one worked, how many times a poll came
back non-terminal: all of that belongs in the record, none of it in the reply.
Getting past an error is the job, not a finding.

## What this skill does not do

- **It does not choose the target.** No searching, no listing, no ranking
  candidates by recent activity.
- **It does not screen a target**, band a set, or refuse an id on the grounds that
  running it looks unsafe. Bands arrive with the set or not at all.
- **It does not price the run beforehand.** Cost is stated once the launch is under
  way.
- **It does not quietly run a narrower test than the one it was handed.**
- **It does not rule on the result.** A failed run is reported as failed, with its
  run id, and the diagnosis belongs to whoever owns it. No verdict on the change
  under test, and no root cause.
- **It does not act on the outcome.** No repair, no edit, no follow-up launch the
  caller did not ask for.
- **It does not re-fire on its own initiative**, beyond the single re-fire the
  existence check licenses.
- **It does not change a plan, a test, or an environment** to make a launch match
  more.
