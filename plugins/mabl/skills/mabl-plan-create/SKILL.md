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

Two things shape everything below. The API **silently drops test ids it doesn't
recognise**, so what you asked for and what got saved are different questions.
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

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.111.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth login --auto   # one-time OAuth in browser
mabl auth info           # verify you're logged in and the token hasn't expired
```

The CLI is how you read plans (`mabl plans list`, `mabl plans describe <*-p>`)
and label them; the writes below run on the mabl MCP server.

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
candidates — ask the user which one, and re-invoke. Don't pick for them: the
choice decides what URL the whole plan runs against.

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

## 3. Read back what was actually saved — always

**Test ids that aren't valid tests in this workspace are silently dropped by
the API.** No error, no warning. The plan comes back smaller than you asked for
and nothing says so.

So compare the returned `execution_stages` against the `testIds` you sent, and
**name any id that didn't land**. A plan quietly missing two of its nine tests
is worse than a failed call, because it looks finished.

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
stage count. Any higher index is out of bounds and rejected.

**Clear a credential** by passing an empty string, not by omitting the field —
an omitted field leaves the old one attached.

### The five traps

None of these announce themselves. They are the reason this skill exists rather
than a bare tool call.

| Trap | What actually happens |
|---|---|
| **Stage indices shift mid-batch** | Removing the last test in a stage deletes the stage. Later operations in the **same batch** are applied against the shortened list, so indices you computed from the original plan now point at the wrong stage. Order removals last, or apply them one batch at a time and re-read between. |
| **`stage_index` defaults to 0** | On both add and remove. A remove without it looks only in the first stage and fails with "not found in stage 0" even though the test is sitting in stage 2. Always pass it. |
| **Adding the same test twice succeeds** | There is no duplicate check. The test lands in the stage twice and runs twice, burning a run each time. Check the stage's contents before adding. |
| **Emptying the plan is rejected** | Removing the last test of the last stage fails the whole batch and saves nothing. That's the guard working — a plan needs at least one stage with at least one test. |
| **412 means someone else edited it** | The plan changed between read and write, so nothing was saved. Re-read with `get_mabl_plan` and re-apply on top of the current version. Don't retry the same payload blind — you'd be overwriting their change. |

### Confirm before you shrink coverage

Two operations quietly stop tests from running in CI:

- **`set_enabled: false`** pauses the whole plan. Every test in it stops running
  on schedule and on trigger.
- **`remove_test`** takes one test out of the suite.

Both are coverage changes, not cosmetic ones. Say which tests stop running and
get an explicit OK first. Renames, descriptions, and labels are cheap and
reversible — those don't need it.

## What this skill cannot do

Say these plainly instead of leaving the user to discover them:

- **No schedule and no trigger.** A plan created here is enabled but wired to
  nothing: it runs only when someone calls `run_mabl_plan`. Scheduling it, or
  attaching it to a deployment trigger, is done in the mabl app. A plan that
  "exists" is not a plan that runs.
- **No concurrency change after creation.** There is no edit operation for it.
  Wrong concurrency means creating a new plan.
- **No stage rename, reorder, or move-test-between-stages.** Moving a test is a
  remove plus an add — two operations, and the first one may collapse a stage,
  so mind the trap table above.
- **A stage appended by `add_test` doesn't inherit the first stage's
  concurrency.** It's created bare and takes the API's default. If that matters,
  check the plan in the app after appending.

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
