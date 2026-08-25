# Reading the structured diff

Mechanics for step 3 of `SKILL.md`. Read that first — this is the detail
behind the classification, not a separate workflow.

## The envelope

Both surfaces that produce this diff run the same engine and emit the same
object — the CLI prints it, the MCP compare tool returns it as
`structuredContent`. Everything below applies to either. The `jq` recipes assume
you have it in a file, which is the CLI's form; from the MCP tool you already
have it parsed, so read the same paths directly.

The object:

```json
{
  "source": "<the reference you passed>",
  "target": "<the reference you passed>",
  "summary": { "added": 1, "removed": 2, "changed": 3, "unchanged": 40 },
  "steps": [ … ]
}
```

`summary` counts **steps**, not assertions. A diff whose summary is all zeros
except `unchanged` means the two versions have identical steps.

## One entry

```json
{ "operation": "changed", "stepNumber": 7,
  "from": { "AssertEquals":  { "id": "…", "description": "…", … } },
  "to":   { "AssertPresent": { "id": "…", "description": "…", … } } }
```

| Field | Reading |
|---|---|
| `operation` | `added` · `removed` · `changed` · `unchanged` |
| `stepNumber` | position **within its own version** — the target's for present/added/changed steps, the source's for removed ones. Not a stable identifier, and the two sides don't line up. |
| `from` | the source-version step. `null` on `added`. |
| `to` | the target-version step. `null` on `removed`, and **absent entirely** on `unchanged` (the step is identical, so it's carried once, in `from`). |

So the side that always exists is `.to // .from`. Use that whenever you want
"this step, whichever version it came from."

Each side is a **single-key object keyed by the step type** — the same shape
`mabl tests export --format json` produces:

```json
{ "AssertPresent": { "id": "…", "description": "Cart badge is visible", … } }
```

Two fields inside are worth naming:

- **`id`** — the step's identifier, present when the step has one. Older tests
  predate step ids and carry none.
- **`disabled`** — present **only when true**. An enabled step has no
  `disabled` key at all, so treat absent as enabled rather than looking for
  `false`.

## jq recipes

`DIFF=.mabl/compare/<file>.json` for all of these. Two helpers do most of the
work: `(.to // .from) | to_entries[0].key` is the step type, and
`.value.id` off the same entry is the step id.

### What step types are actually in this diff

Run this first. It grounds every filter below in the keys this diff really
uses, rather than a list someone wrote down elsewhere:

```bash
jq '[.steps[] | (.from, .to) | select(. != null) | to_entries[0].key] | unique' "$DIFF"
```

Read **both** sides. A type that only exists on the source side of a changed
step — the `AssertEquals` that became an `AssertPresent` — is invisible if you
take `.to // .from`.

### Assertion count per type, both sides

Assertions are the types starting with `Assert`, plus `AccessibilityCheck`.
`WaitUntil`, `If`, and `ElseIf` carry the same condition shape and are **not**
assertions — counting "has a condition" over-counts every wait in the test.

```bash
# target side: steps present in the target version
jq '[.steps[]
     | select(.operation == "added" or .operation == "changed" or .operation == "unchanged")
     | (.to // .from) | to_entries[0].key
     | select(startswith("Assert") or . == "AccessibilityCheck")]
    | group_by(.) | map({type: .[0], count: length})' "$DIFF"

# source side: steps present in the source version
jq '[.steps[]
     | select(.operation == "removed" or .operation == "changed" or .operation == "unchanged")
     | .from | to_entries[0].key
     | select(startswith("Assert") or . == "AccessibilityCheck")]
    | group_by(.) | map({type: .[0], count: length})' "$DIFF"
```

Report both columns and the net. A net of zero with a changed type breakdown
is the interesting case, and a bare total hides it.

### Moves, separated from deletions

A step that moved is rendered as a `removed` entry **plus** an `added` entry —
the same way the web app's Compare tab renders it. Pair them by id before
reporting anything as deleted:

```bash
jq '
  [ .steps[] | select(.operation == "added")
    | (.to | to_entries[0].value.id) | select(. != null) ] as $added
  | [ .steps[] | select(.operation == "removed")
      | { step: .stepNumber,
          type: (.from | to_entries[0].key),
          id:   (.from | to_entries[0].value.id) } ]
  | { moved:   [ .[] | . as $r | select($r.id != null and ($added | index($r.id)) != null) ],
      deleted: [ .[] | . as $r | select($r.id == null or  ($added | index($r.id)) == null) ] }
' "$DIFF"
```

Anything landing in `deleted` with `id: null` was matched by absence of an id,
not by evidence of deletion. For those, fall back to comparing the whole step
descriptor between the `removed` and `added` sets, and say in the report that
the pairing was by descriptor — that method cannot distinguish a move from a
delete plus an identical re-add.

### Type changes on a changed step

The strictness ladder is exact match → substring → existence. This lists every
step whose type changed; rank only the moves the ladder covers.

```bash
jq '[.steps[] | select(.operation == "changed")
     | { step: .stepNumber,
         from: (.from | to_entries[0].key),
         to:   (.to   | to_entries[0].key) }
     | select(.from != .to)]' "$DIFF"
```

An `Assert*` becoming a `WaitUntil` shows up here too. A wait proves nothing —
it is a removed check that keeps the step count intact.

### Enabled-state flips

```bash
jq '[.steps[] | select(.operation == "changed")
     | { step: .stepNumber,
         type: (.to | to_entries[0].key),
         was_disabled: ((.from | to_entries[0].value.disabled) // false),
         now_disabled: ((.to   | to_entries[0].value.disabled) // false) }
     | select(.was_disabled != .now_disabled)]' "$DIFF"
```

This is **step**-level. Whether the test itself is enabled is not in this diff
at all — read it from `mabl tests list --output json`.

### Control flow added

Filter the added steps to the control-flow types you saw in the first recipe:

```bash
jq '[.steps[] | select(.operation == "added")
     | { step: .stepNumber, type: (.to | to_entries[0].key) }
     | select(.type | test("^(If|ElseIf|Else|Loop)"))]' "$DIFF"
```

An added conditional means the checks after it **may** now be skippable. The
diff flattens step groups, so it cannot tell you which steps fell inside the
branch — report the conditional and say the test needs a look.

### Date literals introduced

```bash
jq --arg today "$(date +%Y-%m-%d)" '
  [ .steps[] | select(.operation == "added" or .operation == "changed")
    | { step: .stepNumber,
        was: (.from // {} | tostring),
        now: (.to   // {} | tostring) }
    | select((.now | test("[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}|January|February|March|April|May|June|July|August|September|October|November|December"))
             and (.was | test("[0-9]{4}-[0-9]{2}-[0-9]{2}|January|February|March|April|May|June|July|August|September|October|November|December") | not))
    | { step, now } ]' "$DIFF"
```

A date that reads as today's is the strongest signal — a test pinned to the
day it was edited passes once and fails tomorrow. Quote the literal and its
step number; don't rewrite the step.

## Without jq

`jq` isn't guaranteed. The file is ordinary JSON, so read it directly and
classify by eye — for a diff of a few dozen steps that is faster than
installing anything. Narrow it first:

```bash
grep -o '"operation": "[a-z]*"' "$DIFF" | sort | uniq -c   # the summary, recomputed
grep -o '"[A-Z][A-Za-z]*": {' "$DIFF" | sort | uniq -c     # rough step-type tally
```

Both are approximations — the second matches any capitalized key, so it
over-counts. Say the counts were read by hand when they were, and keep the
per-step evidence (step number, type, values) exact even when the totals are
eyeballed.

## Edge cases that make a naive count wrong

| Trap | What actually happens |
|---|---|
| A moved step read as a deletion | rendered as `removed` + `added`; pair by id first |
| `unchanged` entries missing `to` | the step is identical, carried once in `from`; `.to // .from` handles it |
| `stepNumber` compared across sides | numbered per version; a step at 7 in the source is not the step at 7 in the target |
| `disabled: false` looked for | the key exists only when true |
| Waits counted as assertions | `WaitUntil` / `If` / `ElseIf` share the condition shape; count by the type key |
| Step groups expanded | flattened — a group header carries no nested `steps`, so grouped steps appear as their own entries |
| A branch version passed as a reference on the CLI | `mabl tests compare` resolves both references against the **default branch** and can't be pointed elsewhere; a version created on a feature branch won't resolve, and that's not a missing version. The MCP compare tool takes a `branch` parameter instead |
| A test disabled wholesale | invisible here — `compare` diffs steps only |
