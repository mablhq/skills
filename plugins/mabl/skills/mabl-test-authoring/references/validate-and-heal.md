# Validating an authored test, and healing it

Mechanics for step 4 of `SKILL.md`. Read that first — this is the detail
behind it, not a separate workflow.

## Why a completed session isn't enough

The authoring agent reports `completed` when *it* is satisfied. Nothing in that
signal says the test matches the intent you gave it. The failures worth
catching are all "green but wrong":

| Failure | What you see | What catches it |
|---|---|---|
| Assertion the intent asked for is missing | Session completed, run passed | Step export (4.1) |
| Test asserts something adjacent (page title instead of the order number) | Everything green | Step export read against the intent |
| Assertion exists but never ran | Run passed, coverage is zero | `status: skipped` in the trace (4.2) |
| Test passed against the wrong screen | Green, plausible step names | Screenshot for that step (4.2) |
| Nothing proved the test works at all | `completed`, no run | `reportedTestRunId` absent |
| A heal attempt "fixed" it by deleting the assertion | Green, smaller test | Version diff (4.3) |

The last one is the one to design against. An agent asked to make a failing
test pass has an easy move available: remove whatever fails. That produces a
green run and a worthless test, so the version diff is not optional.

## Reading the exported test

```bash
mabl tests export <testId> --format json --file /tmp/built-test.json
```

Writes a file; prints nothing but `Created file: ...`. The shape is
`{id, name, description, steps: [...]}`, where every step is a **single-key
object keyed by its step type**:

```json
{"steps": [
  {"Navigate": {"description": "Visit the storefront"}},
  {"Click": {"description": "Click Add to cart"}},
  {"AssertPresent": {"description": "Cart badge is visible"}}
]}
```

So the step type is the key, not a field. Assertions are the keys starting
with `Assert` — `AssertPresent`, `AssertEquals`, `AssertContains`,
`AssertMatchesRegex`, `AssertAIPrompt`, and the rest.
`AccessibilityCheck` also verifies something without being an `Assert*`.

Two keys that look like assertions but are not: `WaitUntil`, and the `If` /
`ElseIf` control-flow steps. They share the same condition shape, so counting
by "has a condition" over-counts. Count by the key prefix.

Reusable flows appear as a nested container, so walk the tree rather than only
the top-level array. A quick count:

```bash
jq '[.. | objects | keys[] | select(startswith("Assert"))] | length' /tmp/built-test.json
```

Compare that against the number of things your intent asked to verify. If the
intent named three checks and the test has one assertion, you know what's
missing before you look at any run.

`export` refuses performance tests and tests that aren't mablscript-backed
("Default mabl tests can not be exported"). That is a real limit, not an error
to work around — skip 4.1 and say the structure was not checked.

## Reading the reported validation run

```bash
mabl agent debug steps <reportedTestRunId> --all --output json
```

Pass `--all`. Without it the output filters to failed and recovered steps,
which on a passing validation run means an empty `steps` array — correct, but
not what you want here.

The envelope carries `step_addressing: "index"`, which is how you know this is
an agent-reported run rather than an ordinary cloud run. Entries look like:

```json
{"index": 5, "flow": "Start flow \"abc-f\"", "description": "5. Click Log in",
 "status": "passed", "duration_ms": 5352, "artifacts": ["screenshot"]}
```

Notes on what is and isn't there:

- **No `step_run_id`, no action code.** These runs have no step-run records at
  all — the whole trace comes from one execution log attached to the run. That
  is why artifacts are addressed by `--step <index>`.
- **`flow` is the reporter's container title.** A flow container is titled by
  id (`Start flow "abc-f"`), not by name. Don't try to resolve those ids: an
  agent's test often lives on a branch you can't read, so the lookup usually
  just fails.
- **`error` has a message but no type.** Nothing in the log distinguishes an
  assertion failure from an exception.
- **Assertion steps are not identifiable from the trace.** Every step's
  category is the same, and only the description hints at what it does. Take
  assertion facts from the export (4.1), and join the two on the
  **description**, not on position.

  The join matters more than it looks. `index` counts **leaf steps only** — the
  trace has no entries for flows or step groups — while the export is a tree.
  So with one two-step flow, the export's second top-level step is `index: 3`.
  Matching by position there means checking the wrong step's status and
  reporting an assertion as passed when something else passed.

  Match on the description **text**. Newer runs also prefix it with the step's
  outline number from the test (`"1.1. Enter email"`, `"1.2. Click Log in"`,
  `"2. Assert heading"`), which makes the alignment exact — use it when present.
  It often isn't: a run authored by an older CLI carries plain descriptions with
  no number, and even a current run omits it for a step with no outline number.
  So treat the prefix as a bonus, never as the thing you depend on.

  If you can't align the two — the descriptions don't correspond, or several
  steps share one description and you can't tell which ran — report the test
  **unverified**. Guessing is worse than admitting you couldn't check.

  Note the same trap for fetching: `--step` takes `index`, not the outline
  number. `"2. Assert heading"` at `index: 3` is fetched with `--step 3`.

If you pass `--step-run-id` for one of these runs, the CLI tells you to use
`--step` instead. If you pass `--step` for an ordinary cloud run, it tells you
the opposite.

## Screenshots

```bash
mabl agent debug artifact screenshot <reportedTestRunId> --step <index>
```

Prints `{step, type, file, size_bytes}`; read the file at that path. One
screenshot per step that captured one, taken after the step's action. There is
no before-action snapshot for these runs, so `--before` is rejected.

Pull screenshots for the steps you actually doubt — the assertion steps, and
any step whose description doesn't match what you expected. Reading all of
them for a 40-step test is a waste.

## The heal loop

### Route the fix before you spend a session

A cloud authoring session costs 5–20 minutes and is the one thing here that can
delete a step. A named structured edit costs seconds and cannot. So decide which
you need before reaching for the agent.

The test for "can I name it" is whether you could write the changed step's JSON
without looking at the running app. Two things make that possible more often
than it first seems:

- **Non-element targets need no lookup.** An assertion on a variable, the current
  URL, or the viewport is fully specifiable from the intent alone.
- **The export already contains find descriptors.** If the intent says "verify
  the order number appears" and the test *clicks* or *reads* that element
  somewhere, that step carries the descriptor you need — copy it onto the
  assertion. You are not limited to elements you can see live.

Note what you do *not* have: these runs capture screenshots only, no DOM
snapshot. So a descriptor for an element the test never touched has to come from
a live session — that is the case the agent lane exists for.

When the edit is nameable, hand it to the `mabl-test-edit` skill's
structured-step lane (`insert_after` / `replace` / `move`). Keep the decision —
what is missing, and whether a fix weakened the test — in this loop.

### The agent lane

For a fix that genuinely needs the live app, edit the existing test rather than
authoring a new one, by putting `test_id` in `--test-information`:

```bash
mabl agent authoring initiate --test-information '{
  "test_id": "<testId>",
  "test_case": "<what is missing or wrong>. Edit in place; do not remove existing steps."
}'
```

With `test_id` set, `name` and `deployment_id` / `url_override` are not
required — the agent is editing, not creating.

Write the `test_case` as the *delta*, not the whole test. "Add an assertion
that the confirmation number appears after checkout" works. Re-describing the
entire test invites a rebuild, and a rebuild is how coverage gets lost.

Always include the "edit in place; do not remove existing steps" instruction.
The default strategy leans toward delete-and-rebuild, which on a bounded time
budget can delete the broken part and run out of time before rebuilding it.

Bound at **3 attempts**. Between attempts, re-validate from 4.1 — including
the version diff below. If the workspace doesn't have agentic test editing,
the initiate call fails; stop and report rather than retrying.

## The no-weakening gate

```bash
mabl tests versions <testId>
mabl tests compare <testId>:<before> <testId>:<after> --output json
```

`compare` only accepts `--output json`. You get
`summary {added, removed, changed, unchanged}` and per-step `from` / `to`
descriptors, so you can see exactly which steps a heal attempt touched.

The rule: **any `Assert*` step in `removed` that you did not explicitly ask to
remove means the attempt failed**, regardless of the run result. Same for a
drop in total assertion count. Re-prompt with an explicit "add the assertion;
do not remove any steps" and count the attempt.

Deleting steps is legitimate in exactly one case: the intent asked for it —
the behavior under test genuinely went away. That has to come from the intent,
not from the agent's judgment about what was blocking a green run.

## What not to do

- **Don't run `mabl tests run-cloud` to verify.** The agent already ran it and
  reported the result. A fresh run costs minutes and gives you less: an
  ordinary cloud run's trace won't line up with the validation the agent
  actually performed.
- **Don't treat `createdTestId` as success.** It is set on failed sessions too.
- **Don't loop silently.** Every attempt costs the user 5–20 minutes; ask
  first, and report the final state either way.
- **Don't accept a green run as proof on its own.** Green plus a skipped
  assertion is the exact failure this whole step exists to catch.
