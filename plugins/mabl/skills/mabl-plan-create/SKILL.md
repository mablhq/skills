---
name: mabl-plan-create
description: |
  Create a mabl plan — a named set of existing tests that runs against one
  application in one environment — and change one that already exists: add or
  remove tests, add a stage, relabel, swap credentials, enable or disable it.
  Fire when someone says "create a plan", "make a regression plan", "set up a
  smoke suite", "add this test to the nightly plan", "remove that test from the
  plan", "disable the plan", or names a plan id (`*-p`) and wants it changed.
  A plan GROUPS tests that already exist. Deciding which tests SHOULD exist is
  mabl-test-coverage-design; creating one is mabl-test-authoring.
  Two things it cannot do at all: set a schedule or a trigger, and change a
  stage's concurrency after creation — both are app-only, so a plan made here
  runs on demand until a person schedules it. Say that rather than implying the
  plan is wired up.
allowed-tools: mcp__mabl__*, Bash
---

# mabl plan create

A plan is a set of tests, grouped into ordered stages, pointed at one
application in one environment. This skill builds one and changes one.

Two things shape everything below. The API **accepts test ids it doesn't
recognise and reconciles them away afterwards**, so what you asked for and what
got saved are different questions — and the answer arrives about a minute late.
And a plan is CI coverage — adding to it is cheap, removing from it is a
coverage decision someone should make on purpose.

## This is an MCP-only skill

The mabl CLI can `list`, `describe`, and `edit-metadata` a plan. It **cannot
create one and cannot change its stages** — there is no CLI path for the work
this skill does.

So judge the lane by what you can see: **this skill is available when
`create_mabl_plan` and `edit_mabl_plan` are in your tool list.** If they aren't,
say the plan tools aren't available to you and point the user at the plan editor
in the mabl app. Don't approximate a plan with something else.

## Prerequisites

The mabl MCP server, with `create_mabl_plan` and `edit_mabl_plan` in the tool
list. Every step below runs over MCP, and a session with no shell completes the
whole job (measured 2026-08-30).

The CLI is optional and buys exactly one thing: `mabl plans describe <*-p> -o
json` is the only surface that reads a stage's `concurrency` back, because
`get_mabl_plan` never returns it. Skip this block where there is no shell, and
report concurrency as unread rather than asserting it.

```bash
# Only where you have a shell and need the concurrency read-back
MIN_MABL_CLI_VERSION=2.111.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth login --auto   # one-time OAuth in browser
mabl auth info           # verify you're logged in and the token hasn't expired
```

Reading, labeling, creating and editing all run on the MCP server.

## 1. Resolve the target before you build anything

A plan needs a workspace, an application, an environment, and tests. If a mabl
setup was already saved to your agent memory file, take them from there;
otherwise discover them:

```
list_mabl_workspaces / get_current_user     → workspace id
list_mabl_applications({ workspaceId })     → application id
list_mabl_environments({ workspaceId })     → environment id
list_mabl_tests({ workspaceId })            → the test ids (*-j) to group
```

**The application must already be deployed to that environment.** If more than
one deployment binds them, `create_mabl_plan` refuses and hands back the
candidates. You can also see it before sending anything: `list_mabl_applications`
repeats an application and environment pair once per deployment URL, so a pair
listed twice is already ambiguous (measured 2026-08-30).

Either way, stop at the ambiguity and report it: name the candidate deployments
with their URLs, name the tests you were going to group, and say the target is
ambiguous. Three rules hold on this branch.

- **Don't pick.** The choice decides what URL the whole plan runs against.
- **Don't substitute.** Building against a different application or environment
  than the request implies is a larger change than the pick you are avoiding, and
  it produces a real plan whose tests cannot run against its URL. Disclosing the
  swap afterwards does not repair it (measured 2026-08-30: a cold session hit this
  gate, found no unambiguous environment on the application the tests belong to,
  and quietly built the plan against a different application instead).
- **With nobody to ask, stop and create nothing.** An unattended, headless or CI
  invocation has no user in the loop, so asking is not available. End there,
  with the candidates listed and what you need to proceed: which deployment, or
  an application and environment pair bound by exactly one.

`create_mabl_plan` takes no `deploymentId`, so a chosen deployment is not
something you can send. Once someone answers, the routes are an application and
environment pair bound by one deployment, or the plan editor in the mabl app.

## 2. Create

```
create_mabl_plan({
  workspaceId, name, applicationId, environmentId,
  testIds: ["<*-j>", "<*-j>"],
  concurrency: "parallel",        // or "sequential" — runs in testIds order
  description, credentialsId, httpAuthCredentialsId   // all optional
})
```

Three things to get right here, because none of them are changeable afterwards
in the same way:

- **`concurrency` is set once, at creation, and there is no edit operation for
  it.** `parallel` matches the mabl app's default. Pick `sequential` only when
  the tests genuinely depend on running in order.
- **Create makes exactly one stage.** Multi-stage plans are built by creating,
  then appending stages in step 4.
- **The two credential kinds are different and easy to swap.** `credentialsId`
  is the app's **login form** — mabl types a username and password into the
  page. `httpAuthCredentialsId` is the browser's native **HTTP-auth popup**,
  sent as a header. Getting these backwards produces a plan that fails on every
  test for a reason that looks nothing like credentials.

## 3. Validate the ids before you send them, and re-read after

**An id that isn't a test in this workspace is accepted, not rejected.** There
is no error at any point. `create_mabl_plan` echoes it straight back, `add_test`
takes it, and a `get_mabl_plan` taken seconds later still lists it. A
server-side reconcile deletes it about a minute on (30–58s, measured
2026-08-30). So diffing the returned `execution_stages` against the `testIds`
you sent proves nothing — the two agree while the id is still doomed, and the
plan comes back smaller later, when nobody is looking.

**A test from a *different application* is a different case: accepted and
kept.** It survives the reconcile, because plan membership isn't scoped to the
plan's application. That is the product working as intended — don't report it as
a dropped id or try to "correct" it. But it does mean a `*-j` pasted from the
wrong application lands silently, so it's worth naming when you see one.

Catch it on the way in instead. Before the create, and before any `add_test`,
confirm every `*-j` appears in `list_mabl_tests({ workspaceId })` or resolves
through `get_mabl_test`. An id that doesn't resolve never goes into the payload.

Where an id did go out unverified, a later re-read is worth doing but **do not
trust a clean one**. The cleanup is not on a clock: an invalid id has been seen
sitting in a plan untouched for six minutes of polling, then being removed the
instant an unrelated `set_enabled` wrote to the plan (measured 2026-08-30). So a
re-read can come back clean because the sweep simply hasn't run yet. Report an
id you could not verify as unverified — not as saved, and not as confirmed by a
read. A plan quietly missing two of its nine tests is worse than a failed call,
because it looks finished.

And say what it puts at risk, not just what it costs: when that sweep does run,
it **flattens every stage into one and resets concurrency** (see the trap table).
On a multi-stage plan, one unchecked id is a structural hazard, not a missing row.

Report the plan id and `viewPlanUrl` either way.

## 4. Change an existing plan

Read first — the stage structure is what every operation below is relative to:

```
get_mabl_plan({ workspaceId, planId })      # stages, tests, credentials, type
```

Then apply operations. They run **in order** and save **atomically**: if any one
fails, or the result would have no stages left, nothing is saved at all.

```
edit_mabl_plan({ planId, operations: [
  { op: "add_test",    test_id: "<*-j>", stage_index: 0, insert_at: 2 },
  { op: "remove_test", test_id: "<*-j>", stage_index: 1 },
  { op: "set_name", name: "…" }, { op: "set_description", description: "…" },
  { op: "add_label", label: "…" }, { op: "remove_label", label: "…" },
  { op: "set_enabled", enabled: false },
  { op: "set_login_credentials", credentials_id: "…" },
  { op: "set_http_auth_credentials", http_auth_credentials_id: "…" }
]})
```

**Append a stage** by adding a test with `stage_index` equal to the current
stage count. Any higher index is out of bounds and rejected. An appended stage
carries no concurrency of its own, so say that as you append it (last limit
below).

**Omitting a credential field leaves the old one attached**, so swapping a
credential means passing the new id. There is no clear-it path here: the tool's
schema says an empty string clears it, and `credentials_id: ""` is rejected with
HTTP 400 `id is required` (measured 2026-08-30) — which, the batch being atomic,
takes every other operation in the same call down with it. Detaching a
credential is done in the mabl app.

### The six traps

None of these announce themselves. They are the reason this skill exists rather
than a bare tool call.

| Trap | What actually happens |
|---|---|
| **Stage indices shift mid-batch** | Removing the last test in a stage deletes the stage. Later operations in the **same batch** are applied against the shortened list, so indices you computed from the original plan now point at the wrong stage. Order removals last, or apply them one batch at a time and re-read between. |
| **`stage_index` defaults to 0** | On both add and remove. A remove without it looks only in the first stage and fails with "not found in stage 0" even though the test is sitting in stage 2. Always pass it. |
| **Adding the same test twice succeeds** | There is no duplicate check. The test lands in the stage twice and runs twice, burning a run each time. Check the stage's contents before adding. |
| **Emptying the plan is rejected, in the language of stage indices** | Removing the last test of the last stage fails the whole batch and saves nothing. It reports as `Stage index 0 is out of bounds. The plan has 0 stage(s).`, which reads like a bad index and isn't one — it's the guard working, because a plan needs at least one stage with at least one test. Don't adjust the index and retry; drop a removal from the batch. |
| **A concurrent edit is lost silently** | There is no conflict error to catch and no version or etag to send: two `edit_mabl_plan` calls against one plan both return 200 (measured 2026-08-30). Two writes touching *different* fields both survived; two touching the same field would leave only the last, with nothing raised. So re-read with `get_mabl_plan` after every edit and diff it against what you intended. Treat any difference as somebody else's write, and re-apply on top of what is there rather than resending your payload. |
| **An unrecognised id takes the plan's shape with it, on the next write** | The cleanup that deletes a bad id doesn't just delete the row — it **flattens the plan**. Measured 2026-08-30: a 4-stage plan (3/2/3/2 tests) carrying one invalid id came back as **1 stage of 10 tests with `concurrency` reset from `sequential` to `parallel`**. The valid tests and their order survive; the stage structure does not. Two things make this hard to see. It fires **on the next write to the plan, not on a timer** — the id sat untouched through six minutes of polling, then a single unrelated `set_enabled` triggered the rewrite. And the triggering write's **own response still shows the old structure**, so the echo you get back is already stale. The trigger is the invalid id, not the edit: a plan built only from ids verified against `list_mabl_tests` took adds, renames, simultaneous edits and `set_enabled` with every stage, order and concurrency intact. This is the real reason step 3 says validate on the way in — an unverified id risks the whole plan, not just itself. |

### Confirm before you shrink coverage

Two operations quietly stop tests from running in CI:

- **`set_enabled: false`** pauses the whole plan. Every test in it stops running
  on schedule and on trigger.
- **`remove_test`** takes one test out of the suite.

Both are coverage changes, not cosmetic ones. Say which tests stop running and
get an explicit OK first. Renames, descriptions, and labels are cheap and
reversible — those don't need it.

## What this skill cannot do

Four limits, all of them the API's rather than the request's. Say each one **at
the moment the work runs into it** — not as a disclaimer up front. A list of
everything that won't work, delivered before anyone has asked for any of it,
reads as hedging and buries the one limit that actually applies today.

- **No schedule and no trigger.** Say it when you hand back a created plan, and
  again if someone asks for "nightly" or "on deploy". A plan created here is
  enabled but wired to nothing: it runs only when someone calls `run_mabl_plan`.
  Scheduling it, or attaching it to a deployment trigger, is done in the mabl
  app. Don't report a new plan as if it were wired up.
- **No concurrency change after creation.** Say it while choosing the value, not
  after. There is no edit operation — `set_concurrency` isn't in the enum, and
  sending it fails argument validation. Wrong concurrency means a new plan.
- **No stage rename, reorder, or move-test-between-stages.** Say it when someone
  asks to move a test. Moving one is a remove plus an add — two operations, and
  the first may collapse a stage, so mind the trap table above.
- **A stage appended by `add_test` doesn't inherit the first stage's
  concurrency.** Say it when you append. Only the stage made by `create` carries
  an explicit `concurrency`; every appended stage is created bare and takes the
  API's default (measured 2026-08-30, from both a `sequential` and a `parallel`
  create). So a plan whose stages deliberately differ — sequential, then
  parallel — cannot be built here at all. `get_mabl_plan` doesn't return
  `concurrency` either; `mabl plans describe <*-p> -o json` is the only way to
  read back what a stage actually got. So don't tell anyone how a stage will
  execute unless you read it back that way: report stage 0 as the value you sent
  at create, and an appended stage as taking the API default, unread (measured
  2026-08-30: a cold session reported an appended stage as running its tests in
  parallel, which nothing available to it could have shown).

## Running it

`run_mabl_plan({ planId, workspaceId })` triggers one cloud execution and can
take one-off overrides — `urlOverride`, `branch`, `browsers`, credentials —
without changing the plan. It returns the plan run id and the ids of the test
runs it created.

That's a real cloud execution: minutes of wall clock and a run per test per
browser. Say so before firing one for a large plan.

## Boundaries

**Requires `mabl-test-coverage-design`.** If that skill isn't there, stop and
say which skill is missing — don't design the suite yourself here, and don't
guess how to install it, because that depends on how this skill was installed.
This skill groups tests that already exist. When the real question is *which
tests should exist for this feature*, that's a coverage question and it gets
answered before a plan is worth building.

When a plan run comes back failing, this skill has nothing to say about it —
it builds plans, it doesn't read results.
