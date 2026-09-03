---
name: mabl-test-edit
description: |
  Change a mabl test that already exists — rename it, relabel it,
  enable/disable it, or edit its steps (replace, insert, delete, move). Reads the
  test, then routes to the cheapest lane that can make the change
  deterministically — a live browser agent only when it needs the running app.
  Fire when the user names an existing test (a `*-j` id or a test name) and wants
  to modify it: "rename this test", "add a label", "disable that test", "delete
  step 7", "make step 4 wait for the spinner to disappear", "change the URL that
  step 2 opens".
  For CREATING a new test use mabl-test-authoring; for debugging a FAILING test
  use mabl-debug.
  One boundary: if the test was just authored this session and its validation
  found a gap, mabl-test-authoring's validate-and-fix step owns that decision —
  it holds the authoring intent and the rule against converging by deleting
  coverage. Don't take the decision over. Do accept the specifiable fixes it
  routes here: a structured step edit is instant and cannot delete anything.
allowed-tools: Bash, mcp__mabl__*
---

# mabl test edit

Change an existing mabl test. Three lanes, cheapest first — the skill's real
job is picking the right one.

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.111.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth login --auto   # one-time OAuth in browser — required before any command
mabl auth info    # verify you're logged in and the token hasn't expired
```

The metadata and structured-step lanes run entirely on the hosted `mabl` MCP
server (no local browser). The step lanes are a preview, so they aren't enabled
in every workspace — see [Lane availability](#lane-availability) for what to do
when they're off.

## The router

Every edit starts by reading the test so you know what you're changing and
which lane can change it:

```
mcp__mabl__get_mabl_test_steps({ test_id: "<*-j>" })
```

That returns the test's `flows[]`, and **each flow is tagged with a `kind`** —
this tag is the whole routing decision for step edits:

| `kind` | What it is | Step edits go to |
|--------|------------|------------------|
| `structural` | steps that live directly in this test | `edit_mabl_test_steps` |
| `reusable` | a shared flow reused by other tests (carries a `used_by` sample) | `edit_mabl_flow_steps` |
| `legacy_unsupported` | a flow in an older format | neither — see [Legacy flows](#legacy-and-unsupported-flows) |

Pick the lane by the *kind of change*, then confirm the target:

| The change is… | Lane | Tool |
|----------------|------|------|
| name, description, a label, enabled/disabled | **Metadata** | `edit_mabl_test_metadata` |
| a step edit you can already name exactly (which step, what it becomes) | **Structured step** | `edit_mabl_test_steps` / `edit_mabl_flow_steps` |
| anything you can't specify without looking at the live app (pick a new selector, "make it work again", "add a check that the toast appears" where you don't know the DOM) | **Agent** | `mabl_authoring_edit` |

Rule of thumb: if you can write the exact JSON for the changed step, stay in
the structured lane — it's instant, branch-aware, pre-validated, and never
opens a browser. If the change is described in terms of *the running app*
rather than *the step definition*, it belongs in the agent lane.

---

## Lane 1 — Metadata

The always-available lane — every workspace has it. One atomic call; a list of
operations applied in order, saved in a single PATCH — if any operation is
invalid, nothing is saved.

```
mcp__mabl__edit_mabl_test_metadata({
  testId: "<*-j>",
  operations: [
    { op: "set_name", name: "Checkout — guest user" },
    { op: "add_label", label: "smoke" },
    { op: "set_enabled", enabled: false }
  ]
})
```

Operations and their required field:

| `op` | Field | Notes |
|------|-------|-------|
| `set_name` | `name` (non-empty) | empty name is rejected, saves nothing |
| `set_description` | `description` | empty string clears the description |
| `add_label` | `label` | |
| `remove_label` | `label` | |
| `set_enabled` | `enabled` (boolean) | |

Returns the updated `{ id, name, description, enabled, labels }`. There is no
branch parameter — metadata is edited on the test directly.

**Confirm before disabling.** `set_enabled: false` takes the test out of every
plan run — it silently stops running in CI, which is a coverage change, not a
cosmetic one. Tell the user that and get an explicit OK before sending it (the
rename/description/label ops are cheap and reversible, so they don't need it).

---

## Lane 2 — Structured steps

Deterministic step edits, no browser. You name the exact edit; the tool
validates against the flow's real steps, PATCHes the owning flow, verifies it
persisted, and rebinds the test to the new flow variant.

**Where the step goes depends on the flow's `kind` from the router:**

- steps in a `structural` flow → `edit_mabl_test_steps`
- steps in a `reusable` flow → `edit_mabl_flow_steps` (see [Reusable flows](#reusable-flows))

If you send a reusable-flow step through `edit_mabl_test_steps`, it refuses
with `reason: "wrong_authoring_boundary"` and hands you the redirect (the
flow id + `acknowledge_shared: true`) — that's a routing correction, not a
failure. Follow it.

### The four step operations

Same four verbs in both tools; only the field names differ (test-level ops
carry a `flow_id` and `step_index`; flow-level ops are already scoped to one
flow, so they use a bare `index`).

`edit_mabl_test_steps` — `mode: "edits"`, indices into each flow's **original**
step array:

```
mcp__mabl__edit_mabl_test_steps({
  test_id: "<*-j>",
  mode: "edits",
  edits: [
    { op: "replace",      flow_id: "<*-f>", step_index: 3, step: { /* new step */ } },
    { op: "insert_after", flow_id: "<*-f>", step_index: 3, step: { /* step */ } },   // step_index -1 prepends
    { op: "delete",       flow_id: "<*-f>", step_index: 5 },
    { op: "move",         flow_id: "<*-f>", from_step_index: 5, to_step_index: 2 }
  ]
})
```

`flow_id` is optional only when the test has exactly one editable flow (the
tool infers it); otherwise omitting it returns `reason: "no_editable_flow"` or
`"ambiguous_flow"` — pass the id from the router read. Use `mode: "whole"` with
`flows: [{ flow_id, steps: [...] }]` to replace a flow's steps wholesale (and
to seed the first flow of an empty test).

`edit_mabl_flow_steps` — same verbs, `index` / `from` / `to`:

```
mcp__mabl__edit_mabl_flow_steps({
  flow_id: "<*-f>",
  mode: "edits",
  edits: [
    { op: "replace", index: 2, step: { /* new step */ } },
    { op: "move",    from: 4, to: 1 }
  ]
})
```

This tool only edits **reusable** (shared) flows, so a behavior-changing save
needs `acknowledge_shared: true` — but **don't** add it to the first call. Send
the edit without it, read the blast radius the tool hands back, confirm with the
user, then resend with the flag (see [Reusable flows](#reusable-flows)).

### What a `step` object looks like

The `step` payload is the same JSON shape `get_mabl_test_steps` /
`get_mabl_flow_steps` return for existing steps. **Read the neighbours first
and mirror their shape** rather than inventing fields. For the authoritative
schema and the catalog of step types, ask the server:

```
# how steps/flows are structured (also: mabl-author://save-tool-mechanics, mabl-author://selector-fields)
mcp__mabl__mabl_get_authoring_guide({ uri: "mabl-author://authoring-patterns" })
# index of every step type; use mabl-schema://step/<TypeName> (e.g. .../Click) for one type's schema
mcp__mabl__mabl_get_schema_resource({ uri: "mabl-schema://step" })
```

(Both reference tools ship with the same preview as the step-edit tools, so
they're available exactly when Lane 2 is.)

Steps are canonicalized on save (e.g. variable aliases are normalized); the
response reports this under `canonicalization`.

### Reusable flows

A `reusable` flow is shared — editing it changes **every** test that uses it.
Before you write, know the blast radius:

```
mcp__mabl__list_mabl_tests_using_flow({ flow_id: "<*-f>" })
```

Then acknowledge it explicitly. `edit_mabl_flow_steps` refuses a
behavior-changing save without `acknowledge_shared: true`, returning
`reason: "shared_flow_requires_acknowledgement"` and a `used_by_sample[]` of
impacted tests. **Surface that list to the user and get their OK before
re-sending with `acknowledge_shared: true`.** Don't silently acknowledge on
the user's behalf — the point of the gate is that the user sees who else is
affected.

Two more reusable-flow guards worth knowing:

- **New required parameter** — adding a parameter with no default to a flow
  that already has callers returns `reason: "new_required_parameter"` +
  `blocked_parameters[]`. This is *not* bypassable with `acknowledge_shared`;
  give the parameter a default, or make the change in the agent lane.
- **Concurrent edit** — pass `if_match: "<version_token>"` (the token from
  `get_mabl_flow_steps`) for optimistic concurrency. If the flow changed since
  you read it, the save is rejected with `reason: "version_conflict"` and the
  current steps + a fresh token, instead of forking a variant. Re-read, reapply,
  retry.

`edit_mabl_flow_steps` can also edit flow **metadata** — omit `mode` and pass
`description` and/or `parameters` (note: `parameters` *replaces* the declared
list).

### Branches and confirming before the default branch

Both step tools take an optional `branch` **name** and default to `master`
(mabl's default branch; `main` is accepted as an alias). List branches with
`mcp__mabl__list_mabl_branches({ test_id: "<*-j>" })`.

**Confirm with the user before writing to the default branch.** When `branch`
is omitted, `master`, or `main`, the edit lands on the shared mainline that
plans run against — say so and get an explicit OK first. Writing to a named
non-default branch doesn't need that confirmation. (The agent lane manages its
own branching — don't apply this rule there.)

### When a multi-flow edit only partly succeeds

`edit_mabl_test_steps` is **not atomic across flows**. When one edit batch
touches several flows, each flow is PATCHed independently, so a mid-batch
failure can leave some flows saved and others not. The response is built for
recovery, not silence:

- `reason: "partial_save"` with `flows_persisted[]` **and** `flows_failed[]`
- `reason: "all_flows_failed"` when nothing landed

Report exactly which flows saved and which didn't, then retry only the failed
ones. Never describe a `partial_save` as "done." (A single-flow edit, or any
`edit_mabl_flow_steps` call, is one PATCH — atomic — so this only applies to
multi-flow test-level batches.) A `reason: "pre_validation_failed"` means the
tool rejected the batch *before* writing anything — safe to fix and resend.

---

## Lane 3 — Agent (edit in a live session)

When the change can't be pinned to exact step JSON — it needs the running app
to choose a selector, discover the DOM, or "just make it pass again" — hand it
to the cloud authoring agent, which opens the test in a real browser and edits
it the way a person would.

```
mcp__mabl__mabl_authoring_edit({
  workspaceId: "<workspace id>",
  testInformation: {
    test_id: "<*-j>",
    test_case: "On the search page, after step 4, wait until the results spinner disappears before asserting the row count.",
    deployment_id: "<optional — resolves url/app/env>",
    branch: "<optional — defaults to the workspace default>"
  }
})
```

This is the only lane that needs a `workspaceId` (the others key off the test or
flow id). Get it from `mcp__mabl__get_current_user` or
`mcp__mabl__list_mabl_workspaces` — or reuse the workspace already saved in your
agent memory.

Returns `{ sessionId, viewTaskUrl }`. It's an async cloud session (minutes, real
compute), not a deterministic edit — track it with
`mcp__mabl__mabl_authoring_status({ sessionId })` and, once it completes,
verify with `mcp__mabl__run_mabl_test_cloud`. Write the `test_case` the way you
would an authoring intent: concrete about what to change and what to verify.

The agent lane runs its **own** branch handling (a `branch` name in
`testInformation`, resolved server-side), so the Lane 2 confirmation mechanic
doesn't apply. The footgun is the same, though: omitting `branch` lands the edit
on the default branch. Don't spin up a mainline edit silently — tell the user a
no-branch agent edit targets the default branch before you start the session.

---

## Lane availability

The lanes are gated **independently**, so "just fall back to the agent lane"
isn't always possible — one lane being closed tells you nothing about the other.
Check what's actually available before promising a change:

| Lane | If unavailable |
|------|----------------|
| Metadata | always available |
| Structured step | the `edit_mabl_*_steps` tools aren't listed; calling one returns *"Mabl test authoring tools are not enabled for this workspace. Contact mabl support to join the preview."* |
| Agent | `mabl_authoring_edit` isn't listed / returns a not-enabled error |

Degrade honestly. You can't see which previews a workspace has — so judge a lane
by what you *can* see: **a lane is open when its tool is in your tool list**, and
closed when the tool is absent or returns the not-enabled error above.

1. Prefer the structured lane for nameable step edits.
2. If the `edit_mabl_*_steps` tools aren't in your tool list, the structured
   lane is closed — fall to the agent lane only if `mabl_authoring_edit` is
   present.
3. If no write lane is available for the change, **don't pretend it worked.**
   Tell the user the preview isn't enabled for their workspace (relay the
   "contact mabl support" message) and point them at the Trainer GUI escape
   hatch below. Metadata edits still work regardless.

---

## Legacy and unsupported flows

A flow tagged `legacy_unsupported` (an older flow format) can't be edited by
the structured lanes — `edit_mabl_test_steps` returns
`reason: "wrong_authoring_boundary"` and `edit_mabl_flow_steps` returns
`reason: "legacy_format_unsupported"`. Route these to the agent lane, or to the
Trainer GUI.

## Out of scope — the human escape hatch

`mabl tests edit` opens the test in the **Trainer GUI** — an interactive desktop
editor a person drives by hand. It isn't agent-drivable, so this skill doesn't
use it, but it's the right answer when every automated lane is closed (the
previews aren't enabled, a legacy flow, or a change too fiddly to describe).
Mention it to the user as the fallback; don't try to script it.
