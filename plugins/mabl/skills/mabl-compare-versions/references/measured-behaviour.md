# What these classes look like in real diffs

Every figure here was measured against live mabl workspaces, not inferred from
the data model. Read `SKILL.md` first — this is evidence behind its rules, and
the place to check when a diff in front of you looks like it contradicts one.

Two figures worth carrying: across 59 diffs from one workspace, **3 removals were
genuine moves and 15 were platform churn** presented as deletions. And in one
version, **17 of 22 `changed` steps differed only in `description`**.

## Extraction into a reusable flow

The most destructive-looking change that removes nothing. Measured on a test
whose seven verification steps were extracted by the authoring agent:

```json
{ "summary": { "added": 0, "removed": 7, "changed": 1, "unchanged": 2 } }
```

The seven removals were a `CreateVariable`, four `AssertPresent`, one
`AssertContains`, and one `AssertAIPrompt`. The single `changed` step is the
whole signal:

```json
{ "operation": "changed", "stepNumber": 3,
  "from": { "StepGroup": { "id": "2bfa8e61-6298-448c-8add-cff279a9f980",
            "actionCode": "step_group",
            "description": "Step Group: \"Verify mabl sandbox landing page\" (7 steps)" }},
  "to":   { "EvaluateFlow": { "id": "2bfa8e61-6298-448c-8add-cff279a9f980",
            "actionCode": "evaluate_flow",
            "flow": { "invariant_id": "iUtWHnDNNo4Y9rh8TuZqhA-f" },
            "description": "Start flow \"Verify sandbox landing page\"" }}}
```

Three things to take from it:

- **`added` is 0.** The group *became* the flow reference, keeping its step id, so
  extraction shows up as a `changed` step rather than an added one. Any rule that
  looks for a matching addition finds nothing and reports seven deletions.
- **Step identity survives extraction.** Reading the new flow returned all seven
  steps with their original ids unchanged — `7235b2bc-8840-4136-b336-ddc277bedec9`,
  `4488d5dc-d93d-4fa1-8a1f-6f58b1203108`, and so on. The id match against the
  removed set is exact, not heuristic.
- **Not every extraction reuses a group.** Where the removed steps were not
  already grouped, the same refactor appears as `removed: N` with **one added
  `EvaluateFlow`**. Check both shapes: any target-side `EvaluateFlow`, added or
  changed-into, is worth resolving.

### The empty-flow trap

The flow above was created on an agent-edit branch. Read on the default branch:

```
get_mabl_flow_steps({ flow_id: "iUtWHnDNNo4Y9rh8TuZqhA-f" })
  → { "reusable": true, "step_count": 0, "steps": [] }
```

Read on `created_on_branch`:

```
get_mabl_flow_steps({ flow_id: "iUtWHnDNNo4Y9rh8TuZqhA-f",
                      branch: "Agent edit session 694a10" })
  → { "step_count": 7, "steps": [ … all seven, original ids … ] }
```

This is the worst trap in the skill because **it does not fail open.** The
master-branch read looks like a confirmed catastrophe: seven assertions gone
*and* an empty replacement flow. Nothing about the response says "wrong branch."

Note the asymmetry that makes it easy to walk into: `compare_mabl_test_versions`
with `<id>:<N>` refs is branch-independent and resolves fine, while
`get_mabl_flow_steps` takes only a bare invariant id and defaults to master. The
same diff, two surfaces, different branch rules. Get the branch from
`list_mabl_flow_versions` → `created_on_branch`.

## Regrouping

Wrapping existing steps in a `StepGroup`, measured as an isolated change:

```json
{ "summary": { "added": 1, "removed": 0, "changed": 0, "unchanged": 6 } }
```

The one addition is the group header (`actionCode: "step_group"`). **The wrapped
children stay `unchanged`** — they are not re-emitted. So regrouping costs
exactly one step, and it is cheap to detect.

Two related facts:

- **The header embeds a step count** — `"Step Group: \"…\" (7 steps)"` — so any
  change to a group's contents also churns its header description. Budget one
  extra churned step per affected group.
- **The authoring agent wraps its own output in a group by default.** A freshly
  authored test came back as `SetViewport`, `VisitUrl`, then a single `StepGroup`
  holding every assertion. Group headers are in most agent-authored diffs, not an
  edge case.

## Commentary that contradicts its own step

`description` is server-rendered, and it drifts. These are not legacy artifacts —
the first was on a test authored minutes before it was read:

| Step | Body | Description says |
|---|---|---|
| `VisitUrl` | `url: "{{@web.defaults.url}}"` | `Visit URL assigned to variable "app.url"` |
| `EnterText` | `text.name: "web.defaults.credentials.username"` | `…variable "app.defaults.username"` |
| `CreateVariable` | `generator.pattern` identical both sides | gains a `user.` namespace |
| `VisitUrl` | `url` identical both sides | changes to name `app.url` |

Each reads as a real change and is not one. Classify from the body; if you
mention a description, say it is the rendered label.

### Churn at scale

One version reported `added 4, removed 2, changed 22`. Stripping `description`
and `annotation` from both sides left **17 of the 22 byte-identical** — a
renderer changing its quoting style at a branch-to-master boundary:

```
from  Assert that innerText of the <div> element … starts with Auto-heal
to    Assert "innerText" of the <div> element … starts with "Auto-heal"
```

Across all 59 diffs, **19 of 116 `changed` steps differed only in the
`annotation` object**, which exists in seven distinct key shapes including a
camelCase → snake_case migration.

## Identity churn

Two shapes, both reported as remove-plus-add:

**Ids regenerated, bodies identical.** Seven occurrences in one flow's history:

```
removed  step 3  AssertContains  id 6bf8b4f9-eeea-403d-ac64-965f3147577a
added    step 3  AssertContains  id 62d5e802-737f-4d95-b82b-d40879ff1ba9
```

Excluding `id`, the bodies match exactly. Note the fallback that *doesn't* fire:
a descriptor comparison gated on ids being absent never runs here, because both
sides have ids — they just differ.

**Flow invocations assigned ids.** Eight in one diff, at identical step numbers:

```
removed  { flow: {invariant_id: "BOV9aml0…-f"}, description: "App - Login", id: null }
added    { flow: {invariant_id: "BOV9aml0…-f"}, description: "Start flow \"App - Login\"",
           id: "49c39284-2218-41c8-b76b-7ae8f6cf24ac" }
```

Ids fail (one side null), descriptors fail (the migration reformatted them).
`flow.invariant_id` pairs them. Reconstructed totals were 89 steps on both sides
— zero net change — and the old rule would have reported eight deletions
including the login flow, on an RBAC test.

## A move

Rarer than the churn above, and the case the id rule exists for:

```
removed  stepNumber 7   AssertEquals  id LDy7Znjkdq9hbo2Vkz-0Hw
added    stepNumber 24  AssertEquals  id LDy7Znjkdq9hbo2Vkz-0Hw
```

Step ids come in two encodings (uuid and base64url); both pair fine as opaque
strings.

## Steps without ids

Steps written by hand through the step-edit tools come back with **no `id` field
at all**. That silently degrades Gate B to the body comparison for those steps —
worth saying in the report, because it cannot distinguish a move from a
delete-plus-identical-add. Agent-authored steps do carry ids.

Related: **`mabl tests export --format json` drops step ids entirely** — the only
`"id"` in the file is the test's own. An export can count assertions but can
never tell a move from a deletion, so it is the wrong surface for Gate B.

## Weakening, as it actually appears

Six instances across 59 diffs — rarer than churn, which is why the counts have to
be normalized before anyone reads them:

| Instance | Shape |
|---|---|
| Assertion loosened | `AssertEquals "View CLI info Export as PDF Export test run artifacts"` → `AssertContains "Export as PDF"` |
| Check disabled ×4 | `AssertAIPrompt` and `WaitUntil` steps gaining `"disabled": true` |

Three `AssertStartsWith` ↔ `AssertContains` flips also turned up. Those are
**lateral** — both are substring-class — so they are reported as changed and
explicitly not ranked as weaker.

`disabled` is present **only when true**: 74 occurrences, none of them `false`.
Watch for a projection artifact — a `jq` projection like `{disabled, description}`
synthesizes `disabled: null` for absent keys, which is the projection talking,
not the data.

## Versions that changed nothing

All-zero summaries are common, not anomalous. One test had two consecutive
versions with `added 0, removed 0, changed 0`, and five of ten consecutive
version pairs on a shared login flow were the same. Usually a branch operation or
a metadata save. Report it as a finding.

Separately: a **metadata-only edit creates no version at all.** Thirteen tests in
one corpus were touched inside a six-minute window with their newest versions
months old — renames, relabels, and disables leave version history untouched and
give `compare` nothing to show.
