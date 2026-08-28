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

### Reconciling the add/remove axis against the counts

Exclude moved pairs before counting — a move is one relocation, not a deletion
plus an addition — then the per-type arithmetic has to close.

```bash
jq '
  [ .steps[] | select(.operation == "added")
    | (.to   | to_entries[0].value.id) | select(. != null) ] as $a
  | [ .steps[] | select(.operation == "removed")
      | (.from | to_entries[0].value.id) | select(. != null) ] as $r
  | ($a - ($a - $r)) as $moved
  | { moved: ($moved | length),
      added_excl_moved:   ([ $a[] | . as $x | select(($moved | index($x)) == null) ] | length),
      removed_excl_moved: ([ $r[] | . as $x | select(($moved | index($x)) == null) ] | length) }
' "$DIFF"
```

Bind `$x` before the lookup. `$moved | index(.)` rebinds `.` to `$moved`, the
filter drops everything, and both totals come back `0` — the same scoping trap as
`select(.id == .id)` below.

Then per type: **`added == (target count − source count) + removed`.** A mismatch
is a reporting bug, not a number to publish. On a fixture with 24 source
assertions, 4 deleted and 3 added, the axis closes at 23; counting the moved step
as an addition gives 4 added and breaks it, which is exactly how a report ends up
claiming one more added assertion than it has.

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

### Renderer churn: is this `changed` step actually an edit?

Run this before reporting any count. `description` and `annotation` are
regenerated by the platform, so a step can be `changed` with no behavioural
difference at all. Strip both sides and re-compare:

```bash
jq '[.steps[] | select(.operation == "changed")
     | { step: .stepNumber,
         type: (.to | to_entries[0].key),
         churn_only: (
           ((.from | to_entries[0].value) | del(.description, .annotation))
           == ((.to | to_entries[0].value) | del(.description, .annotation)) ) }]
    | { churn: [.[] | select(.churn_only)] | length,
        real:  [.[] | select(.churn_only | not)] | length,
        detail: . }' "$DIFF"
```

`churn` is the count to report separately, never folded into "steps changed".
When `real` is 0, the version changed no behaviour — say that outright.

To see the churn for what it is, list the differing keys per step:

```bash
jq '[.steps[] | select(.operation == "changed")
     | { step: .stepNumber,
         differing: [ ((.from | to_entries[0].value) | to_entries[]) as $f
                      | select(($f.value) != ((.to | to_entries[0].value)[$f.key]))
                      | $f.key ] }]' "$DIFF"
```

A step whose `differing` list is exactly `["description"]`, or
`["description","annotation"]`, is churn.

### Gate B — pairing a removed step

An id match proves a move; an id mismatch proves nothing. Fall through to a body
comparison with commentary removed, give `EvaluateFlow` its own pairing on
`flow.invariant_id`, then try a **residue** match for retargeting, and only then
let the per-type counts decide between deleted and unmatched. This covers checks
1, 2, 3, 5, 6 and 7 — **extraction (check 4) needs a second call and is below.**

```bash
jq '
def residue: del(.id, .description, .annotation, .target, .find);
def discriminating:
  ([ .condition.comparatorValue, .condition.userPrompt, .value, .name,
     .generator.pattern, .extract.attributeName ]
   | map(select(. != null)) | length > 0)
  or ((.condition.conditionType // "presence") != "presence");

( [ .steps[] | select(.operation != "added")   | (.from | to_entries[0].key) ]
  | group_by(.) | map({ (.[0]): length }) | add ) as $src
| ( [ .steps[] | select(.operation != "removed") | ((.to // .from) | to_entries[0].key) ]
    | group_by(.) | map({ (.[0]): length }) | add ) as $tgt
| [ .steps[] | select(.operation == "added")
    | (.to | to_entries[0]) as $e
    | { step: .stepNumber, type: $e.key, id: $e.value.id,
        flow: $e.value.flow.invariant_id,
        body: ($e.value | del(.id, .description, .annotation)),
        res:  ($e.value | residue) } ] as $added
| [ .steps[] | select(.operation == "removed")
    | (.from | to_entries[0]) as $e
    | { step: .stepNumber, type: $e.key, id: $e.value.id,
        flow: $e.value.flow.invariant_id,
        body: ($e.value | del(.id, .description, .annotation)),
        res:  ($e.value | residue),
        disc: ($e.value | discriminating) } ]
| map(. as $r
      | ($added | map(select(.type == $r.type))) as $same
      | $r + { verdict:
      (if   ($r.id != null) and ([$added[] | select(.id == $r.id)] | length) > 0
       then "moved (id match)"
       elif ([$added[] | select(.body == $r.body)] | length) > 0
       then "regenerated id (body match)"
       elif ($r.flow != null) and ([$added[] | select(.flow == $r.flow)] | length) > 0
       then "flow re-id (invariant match)"
       elif $r.disc and ([$same[] | select(.res == $r.res)] | length) > 0
       then "retargeted (requirement match; selector differs)"
       elif (($same | length) == 0) or (($src[$r.type] // 0) > ($tgt[$r.type] // 0))
       then "deleted (type count dropped or no same-type addition)"
       else "unmatched removal (candidates: "
            + ([$same[].step | tostring] | join(", ")) + ")"
       end) })
| map({step, type, disc, verdict})
' "$DIFF"
```

Verified against a real diff: on a six-removal fixture this returns `moved` for
the reordered step, `deleted` for four assertions whose type counts dropped, and
`unmatched removal (candidates: 39)` for a retargeted presence wait — never
`deleted` for that wait, and never `retargeted` on a residue that cannot carry
the claim.

**`discriminating` is the guard, and it is not optional.** `residue` strips
`target` and `find`, so a step whose whole meaning is its target strips to
`{actionCode}` alone: every `Hover` matches every other `Hover`, every `Click`
every other `Click`. A presence wait strips to `{actionCode, condition:
{presence, present}, onFailure}` and matches every other presence wait in the
test. Without the `disc` gate, check 5 calls those `retargeted`, which is a
functional claim about a step surviving that the data cannot support.

**Do not add `condition` or `extract` to the strip list.** They are siblings of
`target`, not children, which is the only reason they survive and the only reason
check 5 discriminates at all — the real deletions above differ on
`condition.comparatorValue` and `extract.attributeName`. Folding either into the
strip, on the reasonable-sounding grounds that extraction is part of locating a
value, makes check 5 vacuous for every assertion at once.

**Order is load-bearing.** The reordered step satisfies check 5 as well as
check 1; only check 1's precedence keeps it out of the retargeting class. Reorder
the ladder for readability and a move silently becomes a retarget.

Bind the removed entry to `$r` before comparing. A bare `select(.id == .id)`
inside the `$added` filter compares each added step's id to itself — always
true, so every removal reports as a move.

Report the counts per verdict, and name the method — a body or `flow.invariant_id`
match cannot distinguish a move from a delete-plus-identical-add.

Anything still `deleted` after this needs the extraction check before you believe
it.

### Gate B check 4 — was it extracted into a reusable flow?

First, does this diff even have an extraction to resolve? Any target-side
`EvaluateFlow` — `added`, or `changed` into one — is a candidate:

```bash
jq -c '[.steps[]
        | select(.operation == "added" or .operation == "changed")
        | select((.to | to_entries[0].key) == "EvaluateFlow")
        | { step: .stepNumber, op: .operation,
            was: (.from | if . == null then null else to_entries[0].key end),
            flow: (.to | to_entries[0].value.flow.invariant_id) }]' "$DIFF"
```

A hit with `op: "changed"` and `was: "StepGroup"` is the classic extraction
signature — and note that shape has **no added steps at all**, so the recipe
above will have classified every removal as `deleted`.

Then, for each flow id it returns, two calls — the branch first:

```
list_mabl_flow_versions({ flowId: "<*-f>" })        # take created_on_branch
get_mabl_flow_steps({ flow_id: "<*-f>", branch: "<that branch>" })
```

**Pass the branch.** `get_mabl_flow_steps` accepts only a bare invariant id and
defaults to master, so a flow created on an agent-edit branch reads back as
`step_count: 0` — which looks exactly like the assertions having been deleted
into an empty flow. Nothing in that response says "wrong branch", so this is the
one check here that does not fail safe.

Finally, match the removed ids against the flow's step ids:

```bash
# $FLOW = the get_mabl_flow_steps response saved to a file
jq -n --slurpfile d "$DIFF" --slurpfile f "$FLOW" '
  [ $f[0].steps[].id ] as $inflow
  | [ $d[0].steps[] | select(.operation == "removed")
      | { step: .stepNumber,
          type: (.from | to_entries[0].key),
          id:   (.from | to_entries[0].value.id) } ]
  | map(. as $r | $r + { verdict:
        (if ($r.id != null) and ($inflow | index($r.id)) != null
         then "extracted (in flow)" else "still unresolved" end) })'
```

Ids survive extraction unchanged, so this match is exact. Anything left
`still unresolved` is either a genuine deletion or a step with no id — say which,
and never report an unresolved removal as a deletion.

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

### Whether the test itself is enabled

Not in this diff at all, and one of the most common real "edits". Read it
separately:

```bash
mabl tests list -o json --limit 2000 | jq -r '.[] | select(.id == "<test-id>-j") | {id, name, enabled, last_updated_time, last_updated_by_user}'
```

That payload also carries `created_by_user` and `last_updated_by_user` as
resolved `{id, name, email}` objects — the only reliable attribution route, and
it is the test record's last editor rather than the author of any one version.

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
DATE_RE='[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}|January|February|March|April|May|June|July|August|September|October|November|December'

jq --arg today "$(date +%Y-%m-%d)" --arg date_re "$DATE_RE" '
  [ .steps[] | select(.operation == "added" or .operation == "changed")
    | { step: .stepNumber,
        was: (.from // {} | tostring),
        now: (.to   // {} | tostring) }
    | select((.now | test($date_re)) and ((.was | test($date_re)) | not))
    | { step, now, matches_today: (.now | test($today)) } ]' "$DIFF"
```

Both sides test the **same** `$date_re`, so a reformat (`01/02/2026` →
`2026-01-02`) is not reported as a newly introduced date. `matches_today` carries
the case the prose below calls strongest, rather than leaving `$today` unused.

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
| A moved step counted on the add/remove axis | same `removed` + `added` pair; exclude moved pairs before counting or the added total reads one too high |
| Check 5 run without the `disc` guard | `Hover`/`Click` strip to `{actionCode}` and every presence wait strips alike, so any same-type pair reports `retargeted` |
| A flat type count read as "something replaced it" | a `changed` step can morph *into* that type, so the count holds with nothing added. Check 6 asks whether anything of the type was **added**, not only whether the count dropped |
| `unchanged` entries missing `to` | the step is identical, carried once in `from`; `.to // .from` handles it |
| `stepNumber` compared across sides | numbered per version; a step at 7 in the source is not the step at 7 in the target |
| `disabled: false` looked for | the key exists only when true |
| Waits counted as assertions | `WaitUntil` / `If` / `ElseIf` share the condition shape; count by the type key |
| Step groups expanded | flattened — a group header carries no nested `steps`, so grouped steps appear as their own entries |
| A bare `<id>` assumed to mean "latest on master" | a bare reference resolves to the **global latest version**, which may have been created on a branch. Name both versions as `<id>:<N>` — a versioned reference is branch-independent on both lanes |
| `description` or `annotation` read as the step | both are server-rendered commentary and drift from the body. Strip them before comparing, and classify from `condition` / `extract` / `target` / `url` / `text` / `generator` |
| An id mismatch read as a deletion | an id match proves a move; a mismatch proves nothing. Compare bodies with `id` excluded — a regenerated id is not a deleted step |
| `EvaluateFlow` remove+add read as a dropped flow | an id-assignment migration nulls the removed side's id AND changes the description, so both id and descriptor pairing fail. Pair on `flow.invariant_id` + `stepNumber` |
| A test disabled wholesale | invisible here — `compare` diffs steps only |
