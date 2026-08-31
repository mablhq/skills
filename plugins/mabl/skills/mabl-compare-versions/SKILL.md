---
name: mabl-compare-versions
description: |
  Report what changed between two versions of a mabl test or reusable flow, or
  between two of them, separating changes that alter behaviour from ones that
  only reorganize: steps added / removed / changed / moved, assertion counts by
  type, strictness (exact match to substring, a check no longer gating), data
  bindings, date literals, and description rewrites. It expands the reusable
  flows each side calls and diffs those too, so an edit inside a shared flow is
  reported, not disclaimed. It states what changed and which way; the caller
  decides if that was wanted. Read-only.
  Fire when someone asks "what changed in this test", "diff these two versions",
  "compare these two tests", "what changed in this flow", "did that edit weaken
  the test", or "what did the heal attempt actually do", with a test id (`*-j`)
  or flow id (`*-f`). Takes the entity as given; it does not search for it.
  Standalone, and built to be called by other skills. To CHANGE a test use
  mabl-test-edit; for a FAILING run use mabl-debug.
allowed-tools: Bash, Read, Write, mcp__mabl__list_mabl_test_versions, mcp__mabl__compare_mabl_test_versions, mcp__mabl__list_mabl_flow_versions, mcp__mabl__compare_mabl_flow_versions, mcp__mabl__get_mabl_flow_steps, mcp__mabl__get_mabl_test_steps, mcp__mabl__list_mabl_tests
---

# mabl compare versions

Two versions of a test — or of a reusable flow — differ. This skill says **how**
they differ, in terms someone can act on. It does not say whether the difference
is good.

That split is the point. A diff is a fact; the verdict needs the intent, and the
intent lives with whoever asked for the change. So the output is a classification
and a set of counts — never an approval, a rejection, or a score.

The caller is owed two things, and they are the whole contract:

- **Completeness.** Every change is stated, whether or not this skill can put it
  on a named axis. An unrecognized change is reported as unclassified, never
  dropped and never forced into a class that nearly fits.
- **Fidelity.** What is stated is what actually changed. That is what the two
  normalization gates are for — the caller should never have to sift churn.

**Comparing a test includes the flows it calls.** An `EvaluateFlow` step names a
flow; it does not carry the flow's steps. A diff that stops at the test therefore
sees that a flow was invoked and nothing about what the flow did, so an edit
inside a shared flow reads as no change at all. That is a completeness failure,
not a scope choice. Expansion is part of the default comparison: step 4
enumerates the flows on both sides and diffs them, using the same payload, the
same gates, and the same classes as the test itself.

**The input is a test id or a flow id.** This skill takes the entity as given and
resolves what it needs from it. It does not search for the entity, and it cannot
tell you who made a change — no version carries an author. If someone needs an
entity found first, that is a different question.

Every grant here is read-only. Nothing edits, restores, re-runs, or merges.

## Two lanes

| | mabl MCP server | mabl CLI |
|---|---|---|
| Diff a test | `compare_mabl_test_versions` | `mabl tests compare --output json` |
| Diff a flow | `compare_mabl_flow_versions` | `mabl flows compare --output json` |
| Test version list | `list_mabl_test_versions` — **carries `created_time`** | `mabl tests versions` — version and branch only |
| Flow version list | `list_mabl_flow_versions` — **carries `created_time`**, and `branch` filters it | **no such command** |
| Read a flow's steps on a branch | `get_mabl_flow_steps` | `mabl flows export --mabl-branch` — but **without step ids** |
| Read a flow's steps at a **version** | neither tool does it directly — diff `<*-f>:<N-1>` against `<*-f>:<N>` and read the target side | same |

**The diff itself is identical on both lanes** — same engine, byte-for-byte the
same JSON — so no lane classifies better and classification applies either way. Judge
availability by what you can see: **the MCP lane is open when
`compare_mabl_test_versions` is in your tool list.**

They differ only in what you can *ask*:

- **MCP alone is enough for everything here**, including the flow reads that the
  relocation gate depends on and the flow expansion in step 4.
- **The CLI alone diffs tests and flows** but cannot date a version or list a
  flow's versions. It *can* read a flow on a branch
  (`mabl flows export --mabl-branch`), but **the export carries no step ids**: it
  shows the flow is non-empty and which types are in it, and cannot prove *these*
  removed steps are the ones inside. On that lane extraction is corroborated, not
  confirmed — and an unproven removal is never a deletion.
- **Flow expansion degrades on the CLI lane.** `mabl flows compare` takes
  `<*-f>:<N>` happily, so the CLI can diff two flow versions you already know the
  numbers of. What it cannot do is *discover* them: with no flow version list and
  no `created_time` on the test list, there is nothing to resolve a version from.
  Without those numbers, enumerate the flows each side calls, name them, and
  report them as **not expanded** with the reason. Never substitute a diff of the
  flows' latest versions and present it as the diff between these two test
  versions.
- **`mabl tests export <id>:<N>` is not the shortcut it looks like.** It does take
  a version, and it does inline each nested flow's steps, which reads like flow
  expansion for free. The inlined bodies are the flows' **current latest**, not
  the versions contemporaneous with test version `N`: checked here, a v72 export
  carried flow text authored well after v72. The export also drops step ids and
  every field but the descriptions, and `--mabl-branch` was ignored on every
  branch name tried, including a bogus one that raised no error. Use it to see
  the shape of a test at a version; do not build a flow comparison on it.

Say which lane you used.

## Prerequisites

**The MCP lane needs nothing installed.** If `compare_mabl_test_versions` is in
your tool list, skip this section — everything below is the CLI lane's
requirement, and running it buys an MCP-only agent nothing.

For the CLI lane:

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.119.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth login --auto   # one-time OAuth in browser — required before any command
mabl auth info           # verify you're logged in and the token hasn't expired
```

**Probe for the command, don't trust the version.** These shipped together, so a
version check can pass on a build that predates them:

```bash
mabl tests compare --help 2>&1 | grep -qw -- --output \
  || echo "This mabl CLI cannot produce a structured diff — 'mabl tests compare --output json' is missing. Upgrade: npm install -g @mablhq/mabl-cli@latest"
```

If the probe fails and the MCP lane is closed too, say so and stop.

## 1. Pick the two references

A reference is `<id>` or `<id>:<N>`, and the difference is the easiest thing here
to get wrong.

**`<id>:<N>` is a specific version, and it is branch-independent.** Version
numbers are global per entity, so a version created on a feature branch resolves
from either lane with no branch parameter.

**A bare `<id>` is the *global latest* version — which may live on a branch.** It
is *not* "latest on master".

| Want | Use | Not |
|---|---|---|
| What did the last edit do? | `<id>:<N-1>` → `<id>:<N>` | `<id>:<N-1>` → `<id>` — the bare side may be a branch version you didn't mean |
| What changed since it last passed? | `<id>:<last-good>` → `<id>:<N>` | |
| How does our copy differ from theirs? | `<id-a>` → `<id-b>` | |

**Name both versions explicitly.** One extra call removes the whole class of
error. Two edges:

- `compare` rejects **literally identical** argument strings, but not `<id>` vs
  `<id>:<N>` resolving to the same version — that returns an all-`unchanged`
  diff, indistinguishable from "nothing changed".
- `mabl tests versions` **rejects `--output json`** (prints help, exits
  non-zero). Text is the only form.

### Listing versions

```
list_mabl_test_versions({ testId: "<*-j>" })                    // full history
list_mabl_test_versions({ testId: "<*-j>", branch: "<name>" })  // one branch
```

Newest first: `version`, `is_latest`, `created_on_branch`, `created_time`
(**Unix epoch milliseconds**), `change_description`.

Two fields to read carefully. **`created_on_branch` is needed later** — the
extraction check reads a flow on the branch it was created on. And
**`change_description` is almost always absent**; where populated it is
system-generated ("Merged master into …", "Restored version 8") and never names a
person. `created_time` answers dated questions; treat the description as a bonus.

The CLI's list gives `v<N>`, a `(latest)` marker, and the branch — no timestamps,
so date a version from other dated evidence and say you did it indirectly.

## 2. Get the diff

```
compare_mabl_test_versions({ source_test_id: "<*-j>:4", target_test_id: "<*-j>:5" })
```

```bash
mkdir -p .mabl/compare
printf '*\n' > .mabl/.gitignore   # idempotent; see below
mabl tests compare <source> <target> --output json > .mabl/compare/<id>-<a>-<b>.json
```

**Guarantee the ignore; don't assume it.** `.mabl/` is the CLI's own cache
directory, but the root `.gitignore` entry for it is written by `mabl agent
debug`. In a repo where only `compare` has run, `.mabl/` shows up as untracked.
A `.gitignore` of `*` inside `.mabl/` covers the whole tree including itself,
needs no edit to a tracked file, and coexists with the root entry if a debug
command adds it later.

`--output json` is the only structured form; `-a` affects the human view, not the
JSON. Diffs are large — every `unchanged` step carries its full descriptor — so
on the MCP lane the response often overflows and is written to a file. That is
convenient: **the `jq` recipes in `references/reading-the-diff.md` work on either
lane**, since both end as a file.

Each side is a **single-key object keyed by step type**, carrying the step's `id`
when it has one. Two things about that `id`, because the removal evidence depends on it:

- **A step may carry no `id`** — see the reference. Where ids are absent the
  evidence degrades to a body comparison, which cannot tell a move from a
  delete-plus-identical-add. Say which you used.
- **`mabl tests export --format json` drops step ids entirely**, so an export can
  count assertions but never resolve a removal. Wrong surface for this work.

**If either reference fails to resolve, report the comparison as *not run*** —
never substitute a single-version export and call it a diff.

## 3. Normalize before you count

Both run **before** classification. Skipping them produces wrong, confident numbers.

### Strip commentary, then re-compare

**`description` and `annotation` are server-rendered and drift from the step
body.** They are regenerated by the platform, so a version can change dozens of
descriptions while changing no behaviour.

For every `changed` step: **drop `description` and `annotation` from both sides
and re-compare.** Identical remainder ⇒ commentary only. Count it separately and
never fold it into "steps changed".

**Separate is not silent.** A changed description is a reported change — name the
step numbers and both texts. Callers ask about wording, and hiding it behind a
gate makes the skill look like it missed an edit it deliberately reclassified.

- **Never quote a description as evidence.** A description can disagree with its
  own step's body, and this is generated fresh, not legacy drift.
- **You cannot tell an authored description edit from renderer churn.** Both
  arrive as the same field differing with the body identical. Report the change
  and say the diff carries no signal for which it was.
- **An all-zeros summary is a finding.** "A version was created and it changed no
  steps" is real and common — usually a branch operation or a metadata save.

### A removed step is not a deleted step

`removed` at test level means *left this position*, which has six causes besides
deletion. Work them in order and stop at the first that matches:

| Evidence, in this order | Verdict |
|---|---|
| The removed step's `id` appears on an `added` step | **moved** — matched by step id |
| Bodies match with `id`, `description`, `annotation` excluded | **id regenerated** — matched by identical body; platform churn |
| Removed and added `EvaluateFlow` share a `flow.invariant_id` | **flow re-id** — matched by flow id; a migration, not a change |
| A target-side `EvaluateFlow` contains the removed step | **extracted** — found inside the new reusable flow; see below |
| Residue matches once commentary **and** find/target are stripped, **and** that residue carries an author-supplied value | **retargeted** — same requirement, different selector |
| The type's count dropped, or nothing of that type was added | **deleted** |
| Nothing matched, count flat, a same-type step was added | **unmatched removal** — name the candidate |

**Name the method you used** — a body or `flow.invariant_id` match is weaker than
an id match, since it can't distinguish a move from a delete-plus-identical-add.
**Order is load-bearing**: a moved step also matches on residue, and only the
precedence of the id match keeps it out of the retargeting class. Address the
rows by their evidence, never by position — inserting one renumbers the rest.

**The retargeted match needs a discriminating residue.** Stripping the
find/target subtree leaves `condition` and `extract` on an assertion or a wait,
and nothing at all on a `Hover` or a `Click`. Claim **retargeted** only if that residue holds
an author-supplied value — `comparatorValue`, `userPrompt`, `value`, `name`,
`generator.pattern`, `extract.attributeName`, or a `conditionType` other than
`presence`. Without one it matches every step of its type (`Hover` and `Click`
strip to `actionCode` alone): fall through to the count rows below. Report a real
match under Retargeting, with the selector before and after.

**"Deleted" has to be earned.** Count the type on both sides
first. A removed `WaitUntil` against `WaitUntil 2 → 2` means something replaced
it, not that a wait was dropped. Unchanged count plus a same-type addition is an
**unmatched removal**: name the candidate and say the evidence could not join them.

### The extraction case, and the trap in it

Extraction is the most destructive-looking change that removes nothing, and it
produces **no added step**: the existing `StepGroup` *becomes* the
`EvaluateFlow`, keeping its id. Signature: **`removed: N`, `added: 0`, one
`changed` step whose type became `EvaluateFlow`** — so checks 1–3 and 5 all fail,
and every removal falls through unless you read inside the flow.

Take `flow.invariant_id` from any target-side `EvaluateFlow`, get its branch from
`list_mabl_flow_versions`, then read it **on that branch**. Ids survive
extraction, so the match is exact. Recipes: `references/reading-the-diff.md`,
"Was it extracted into a reusable flow?".

**Pass the branch.** `get_mabl_flow_steps` takes a bare invariant id and defaults
to master, so a flow created on an agent-edit branch reads back `step_count: 0` —
indistinguishable from the steps having been deleted into an empty flow. The one
check here that does not fail safe.

No flow-read lane? Report those removals **unresolved**, never deleted.

## 4. Expand the flows

An `EvaluateFlow` descriptor holds `{actionCode, description, flow, id}`, plus
`config` when the caller configured one. It names a flow. It carries neither the
flow's steps nor a flow version, so this step is where a change made inside a
shared flow becomes visible.

### A test version does not pin a flow version

This is the fact the rest of the step is built on, so hold onto it. On a
reference to a saved flow, `flow` carries one key, `invariant_id`, and the step
schema (`mabl-schema://step/EvaluateFlow`) says of it: "The variant suffix ':N'
is not accepted — pass the bare invariant id only." A test version references
each flow by bare id. **Nothing in a test version records which flow version it
used**; which one applies is resolved when the flow is read or run.

Two corroborations, because a negative claim is worth more than one look. First,
the `EvaluateFlow` schema carries no version property in either of its two `flow`
shapes. Second, a version-scoped read of a test does not produce version-scoped
flows: `mabl tests export <id>:<N>` pins the test's own steps to version `N` and
still inlines each nested flow **at that flow's current latest**. That was caught
here by matching an inlined step's text against the flow's history — a v72 export
carried wording introduced by a flow version created weeks later.

That has a consequence you have to say out loud rather than paper over: the two
flow versions to diff are *chosen*, not looked up. Choose them like this:

**Resolve each flow to the newest version created at or before that test
version's `created_time`.** Both version lists report `created_time` in Unix
epoch milliseconds on the same clock, so the comparison is arithmetic. What that
reconstructs is the flow as it stood when the test version was saved.

Quote this wherever a flow was expanded, in the report and in the reply, in these
words:

> Flow versions are not pinned. A test version names each flow by bare invariant
> id, so nothing records which flow version it ran. The flow versions compared
> here are the newest created at or before each test version's `created_time`.
> That is an inference from timestamps, not a stored snapshot, and a given run
> may have resolved a different version.

### Enumerate the flows on each side

Take `flow.invariant_id` from every `EvaluateFlow` in the diff, per side:

- **source side** — `removed`, `changed` and `unchanged` entries, read from `.from`
- **target side** — `added`, `changed` and `unchanged` entries, read from `.to // .from`

Recipe: `references/reading-the-diff.md`, "Enumerating the flows on each side".

Two routes look like they would do this and do not:

- **`get_mabl_test_steps`'s `flows` array is not the enumeration.** On the test
  checked here it came back `flow_count: 1`, holding only the `structural` flow;
  the reusable flows the test invokes were not in it, at either version read.
  Enumerate from the `EvaluateFlow` steps instead, which holds either way.
- **`detail: "compact"` drops `flow.invariant_id` outright.** The step returns as
  `EvaluateFlow` with no `flow` key at all, so a compact read cannot name a single
  flow. Use the diff, or `detail: "full"`.

**Deduplicate.** A test can call one flow several times. Diff it once and
attribute the result to every call site.

**One shape the enumeration drops on its own.** The schema's other `flow` form is
an inline definition, `{name, parameters}`, whose steps ride on the
`EvaluateFlow` step itself and which carries no `invariant_id` at all. None
appeared in what was read here, so there is no example to describe, but keying on
`invariant_id` skips it without a word. Where `flow.invariant_id` is missing and
`flow.name` is present, that flow's body is already inside the diff: classify
those steps in place, and say that is what you did.

**A flow on one side only is a functional change to the test.** A removed and an
added `EvaluateFlow` carrying *different* `flow.invariant_id`s is one flow
swapped for another. The removal ladder's flow re-id row does not fire on it:
that row matches on a *shared* `invariant_id`. Report the swap as structure, then
report what each flow holds — the one that left and the one that arrived — so the
caller can see what coverage moved with them.

### Resolve the two versions

```
list_mabl_flow_versions({ flowId: "<*-f>" })
```

Same shape as the test list, newest first: `version`, `is_latest`,
`created_on_branch`, `created_time` (**Unix epoch milliseconds**). For each side,
take the newest `created_time` at or before that test version's `created_time`.

Four things about that list:

- **`created_on_branch` is absent on old versions, and a branch filter drops
  them.** Versions predating branching carry only `version`, `is_latest` and
  `created_time`. Asking `list_mabl_flow_versions({ branch: "master" })` for one
  flow here returned 4 of its 11 versions: it dropped the versions created on
  other branches, as asked, and also every undated version, which was not asked.
  Nothing in the response says anything was dropped. Resolve over the
  **unfiltered** list, then report the resolved version's `created_on_branch` and
  flag it when it differs from the test version's branch. A test version on one
  branch and a flow version on another never coexisted, and saying so is better
  than hiding it behind a filter.
- **Both sides resolving to the same version is the common case**, and it is an
  answer. Name the version and say the flow did not change between them. It
  settles that flow's own steps and nothing about the flows it calls, so read its
  steps at that version and carry on down. See "Flows inside flows".
- **Version numbers are global per flow**, so `<*-f>:<N>` is branch-independent,
  exactly like a test reference.
- **A busy flow's history is long** — 355 versions on one of the flows here. Ask
  for the list once per flow and resolve from what you have.

### Diff each flow, and classify it exactly as you classify a test

```
compare_mabl_flow_versions({ source_flow_id: "<*-f>:3", target_flow_id: "<*-f>:4" })
```

```bash
mabl flows compare <*-f>:3 <*-f>:4 --output json > .mabl/compare/<flow>-<a>-<b>.json
```

**A flow diff is the same object as a test diff**: a `summary` plus a `steps`
array of `{operation, stepNumber, from, to}`, each side a single-key object keyed
by step type carrying the full descriptor. So everything above applies unchanged —
both normalization gates, the removal ladder, every functional and nonfunctional
class, the absent-default table, the counting rules. Do not invent a second
vocabulary for flows.

**Reading one flow version on its own is not available.** `get_mabl_flow_steps`
takes a bare invariant id and refuses a versioned one outright: passing `<*-f>:3`
errors with *"contains a variant suffix (\":N\"). Pass the bare invariant id"*. It
returns the latest on a branch, plus a `version_token` that is an opaque string
and not a version number. To see what a flow held at version `N`, diff
`<*-f>:<N-1>` against `<*-f>:<N>` and read the target side (`.to // .from`,
skipping `removed`). Where `N` is 0 there is no earlier version: fall back to
`get_mabl_flow_steps` and say the steps shown are the latest, not the resolved
version.

**Flow diffs are large** — every `unchanged` step carries its full descriptor, and
you are now fetching one per flow. Capture each to `.mabl/compare/` and work it
with `jq` rather than holding them all at once.

### The call site changes too

`config` on an `EvaluateFlow` is how the caller drives the flow, and it moves
independently of the flow's own steps:

| `config` field | What a change means |
|---|---|
| `parameters` | different values passed in, read inside the flow as `{{@flow.<name>}}` |
| `iterations` | the flow now runs a different number of times, or over a different collection. `iteration_type` is one of `fixed`, `variable`, `list`, `elements`, `variable_array`, `condition`, `none` |
| `role` | `teardown` runs the flow at the end of the test even after an earlier step failed; `normal` does not |

`config` is absent when nothing was configured, and it arrives inside the full
descriptor like any other field, so the "report every field that differs" rule
already finds it. This table is for saying what it means once found.

Apply the absent-default rule here too. Absent says no overrides and no
iteration, and `role` defaults to `normal`, so absent against an explicit
`iteration_type: "none"` or `role: "normal"` is serialization churn. Absent
against anything else is a real change.

### The structural flow needs no expansion

`get_mabl_test_steps` reports a test's own steps as a `structural` flow with its
own `-f` id, and it is tempting to treat that as another flow to expand. Don't.
The test-level diff **is** that flow's steps: the structural flow's `step_count`
and the step count the test diff covers are the same number, checked here on two
different version pairs. Its id is not stable across a test's life either — the
test checked here reported one structural flow id at version 72 and a different
one at version 79 — so there is nothing to map a test version onto. Expansion
means the reusable flows the test calls.

### Flows inside flows

A flow can call a flow. `create_mabl_flow` accepts an `EvaluateFlow` step among
its `steps`, `get_mabl_flow_steps` reads it back unchanged, and the step appears
in a flow diff under the same type name it carries in a test. Nesting is a shape
to handle, not a hypothetical. `compare_mabl_flow_versions` states that it
compares nested flows as `EvaluateFlow` steps and does not expand them, so the
expansion is this skill's job at every level, not only the first.

**Enumerate a flow's nested flows from its steps at the resolved version, never
from its diff.** A flow that resolves to the same version on both sides has no
diff at all, so enumerating from diffs stops dead there and never reads the flows
it calls. A nested flow changes independently of its parent, so that omission
drops real behavioural changes and reports zero with no sign anything was
skipped.

Resolution is against the **test version's** `created_time` at every depth. Each
nested flow gets its own two versions resolved exactly as its parent's were, so a
parent holding still says nothing about its children.

Reading a flow's steps at a resolved version `N`:

| Case | Route |
|---|---|
| `N` is the flow's latest | `get_mabl_flow_steps` returns that version |
| `N > 0` | diff `<*-f>:<N-1>` against `<*-f>:<N>` and read the target side (`.to // .from`, skipping `removed`) |
| `N` is 0 and not the latest | diff `<*-f>:0` against `<*-f>:1` and read the **source** side (`.from`, skipping `added`) |

So recurse, and bound it. **The test is depth 0 and the flows it calls directly
are depth 1. Expand through depth 3, and refuse anything at depth 4.** Also
**stop on a flow id already expanded on this path**, which closes a cycle. Both
bounds are load-bearing: the authoring surface accepts a flow that calls back
into one of its own callers, with no error and no warning, so a cycle is
reachable and an unbounded walk does not terminate. At either stop, list the
flows left unexpanded by id and say which stop you hit. Report the depth you
actually reached rather than implying you went all the way down.

## 5. Classify

Report the primary split first, then the detail. Two tiers.

### Nonfunctional — the step array changed, behaviour didn't

| Class | How you see it |
|---|---|
| Commentary rewrite | only `description` / `annotation` differ once both are stripped |
| Identity churn | matched by identical body, or by flow id |
| Reordering | matched by step id **and** it crossed only markers — the order of effective steps held |
| Extraction / inlining | found inside the new reusable flow |
| Regrouping | an added or removed `StepGroup` (`actionCode: "step_group"`) with its leaves unchanged — costs exactly one step |
| Marker step | an `Echo` added or changed — it logs, it asserts nothing |
| Binding representation | a binding whose resolved variable is the same on both sides (e.g. a `{name, tokens}` object becoming an inline `{{@…}}` token string) |

**A move is not automatically nonfunctional.** An id match proves the step is the
same step, not that behaviour held. Split on what it crossed: a marker moving, or
an effective step crossing only markers, changes nothing. An effective step
crossing another — a click past a click, an assertion past a flow invocation —
changes the order things run in, so it is functional. Effective means it acts or
asserts; `Echo` does not.

Two asymmetries not to flatten. **An added `Echo` is noise; removed `Echo`s are
evidence** — it is used as a section marker, so a drop in Echo count can mean
whole sections went; report the direction. And **a group header embeds its step
count** (`"Step Group: \"…\" (7 steps)"`), so any change inside a group churns its
header — expect one extra churned step per affected group, not a second finding.

### Functional — behaviour changed

| Class | How you see it |
|---|---|
| Coverage added | new `Assert*` / `AccessibilityCheck` steps |
| Resequencing | a step that acts or asserts crossed another one — name what it crossed |
| Coverage deleted | no match, and the type's count dropped or nothing of that type was added |
| Unmatched removal | no match, count flat, a same-type step added — report under Unresolved with the candidate named |
| Strictness | a change in what the assertion requires — see the binding fields below |
| Retargeting | same check, different selector — a `findTarget` swapped for a `locator`, a class chain for a `role=` |
| Data binding | a `{{@…}}` token appearing or disappearing in a body field |
| Date literal | a month name, `YYYY-MM-DD`, or today's date in `to` and not `from` |
| Conditional added | an `If` / `ElseIf` / `Loop` — later checks may now be skippable |
| Flow called / dropped | an `EvaluateFlow` added or removed whose `flow.invariant_id` has no counterpart on the other side — the test now calls a different flow, so say which and what it holds |
| Flow invocation changed | `config` on an `EvaluateFlow` differs — parameters, iteration, or `role` — the flow itself is untouched but what the caller asks of it is not |
| Flow internals changed | the flow is called on both sides and its two resolved versions differ — classify the flow diff by these same rows and attribute each finding to its flow |

A data-binding change cuts both ways and the counts never show it: a hardcoded
literal replaced by `{{@user.some.var}}` is usually a fix, the reverse pins the
test to one input. Read it from the body field (`text`,
`condition.comparatorValue`, `generator.pattern`, `url`), never the description.

### Report every field that differs

Don't work from a list of fields worth checking. **Both full step descriptors are
already in the diff, so compare them and report every field that differs**, minus
a short exclusion list. That is complete by construction — it covers step types
and condition types this skill has never heard of, which an enumeration cannot.

Exclude only these, each for a stated reason:

| Excluded | Why |
|---|---|
| `description`, `annotation` | server-rendered commentary — the commentary strip already covers it |
| `id` | identity, not behaviour — the removal evidence handles it |
| `condition.attribute` | execution-inert on a presence condition; it round-trips the UI selection and never affects the run |
| absent ↔ its explicit default | serialization churn, not a change — see below |

**The absent-default trap.** Several fields mean something specific when missing,
so a diff showing absent → the default value is churn:

| Field | Absent means |
|---|---|
| `onFailure` | `terminate` |
| `observationScope` | `page` |
| `caseInsensitive` | case-sensitive |
| `disabled` | the step runs |

Treat absent and the explicit default as equal. **The asymmetry is the point** —
absent → `terminate` is nothing, absent → `continue` is an assertion that stopped
failing the test.

### Two effects that are easy to under-read

Everything else you can read straight off the field names. These two you can't:

**`onFailure` decides whether a failure gates the run at all** — `terminate`
stops the test, `failAtEnd` runs on and fails at the end, `continue` **does not
fail the test**. Switched to `continue`, an assertion still appears, still
executes, and stops mattering, with nothing about its type or value changed. It
is the least visible way an assertion stops binding, so name it whenever it moves.

**A prose condition has no operator and no axis.** An `ai_prompt` condition holds
its entire requirement in `userPrompt` (plus `criteria` and `metaPrompt`), and
`truthy` holds none at all — so a `comparison` → `truthy` flip drops the
comparator outright. Reword a prompt and everything it verifies can change while
every other field stays put. Quote both texts verbatim and let the caller read
them.

### Saying which way it moved

State the direction as a fact. There is one defined axis:

**exact match → substring → existence.** `AssertEquals` → `AssertContains` →
`AssertPresent` moves down it; `disabled: true` is off the end of it. Say "less
strict" or "more strict" and name the two states.

Movements that are **not** on that axis get said plainly rather than forced onto
it:

| Change | State it as |
|---|---|
| A positive operator becomes its negation (`contains` → `does_not_contain`, `present` → `not_present`) | **inverted** — it now requires the opposite, which is neither looser nor tighter |
| `AssertStartsWith` ↔ `AssertContains` | **lateral** — both are substring-class |
| A different `target` — element to viewport, element to variable | **rescoped**, and say from what to what |
| `extract` changes | **asserting on a different value**, and name both |
| `Assert*` → `WaitUntil` | the step now waits for the condition instead of requiring it |
| Anything else | **changed, direction not on a defined axis** — give the field, the old value, and the new one |

That last row is not a gap to apologize for. A stated change the caller can read
is the deliverable; a rank this skill invented would be the caller's job done
badly.

One counting rule, because it is easy to get wrong: **`WaitUntil`, `If`, and
`ElseIf` are not assertions** despite sharing the condition shape. Count
assertions by the type key beginning with `Assert`, plus `AccessibilityCheck`.
Counting "has a condition" over-counts every wait in the test.

### What this diff cannot see

Say these rather than implying they were covered:

- **Who changed it.** No version carries an author, on either lane.
- **Whether the test is enabled.** `compare` diffs steps; a test disabled
  wholesale looks identical. Read `enabled` from `list_mabl_tests`. This matters
  — a metadata-only edit creates no version at all, so a test can be "edited
  today" with its newest version months old and nothing for `compare` to show.
- **Which flow version each side actually used.** Nothing records it, so step 4
  resolves it from `created_time` and the caveat there is quoted verbatim wherever
  a flow was expanded. What is reconstructed is the flow as it stood when the test
  version was saved, which a run need not have used.
- **What a flow held below the depth you expanded.** Nesting is bounded at depth
  3 and at any flow already expanded on the path. Name the flows you stopped at
  rather than letting the report imply the expansion was exhaustive.
- **Which steps fell inside an added `If`.** Groups are flattened, so an added
  conditional tells you the branch exists, not what it wraps.
- **Run results.** This is a definition diff. A step changed; it never says the
  change is what broke the run.

## 6. Report

Write to `.mabl/compare/<id>-<source>-<target>.md` — the same ignored cache as
the captured diff, so a read-only comparison leaves nothing in `git status`.

- **Compared** — the two versions as integers, which lane, and why those two.
- **Behavioural summary first** — *N functional, M nonfunctional in the test*,
  then *P functional, Q nonfunctional across the R flows it calls*, carrying
  explicit zeros for unclassified and unresolved so a section omitted for being
  empty still reads as looked-at. If nothing survived the gates, say so.
  **Every number counts steps**, and a step belonging to two classes is counted
  once, under the more consequential one. Each must equal the sum of the class
  counts reported below it — a headline that disagrees with its own list is a
  reporting bug, so add it up before printing.
  **Keep the two levels apart.** A step inside a shared flow is not a step in
  this test, and one total covering both would say neither. Give both pairs.
- **Nonfunctional** — one line per class that fired, with counts. Commentary
  rewrites get their step numbers and their before/after text, not just a count.
- **Functional** — structure (added / deleted, naming the evidence each verdict
  rests on), assertions per type source → target with the net, one row per changed
  binding field with its direction, then data bindings, dates, conditionals.
- **Flows** — one subsection per flow enumerated, whether or not it changed, so
  the set the caller can see matches the set that was looked at. Each gives: the
  flow name and invariant id, which side or sides call it and at which steps, the
  two resolved versions with their `created_on_branch` and `created_time`, and
  then either its own functional / nonfunctional breakdown in the same vocabulary,
  or one line saying both sides resolved to the same version and nothing was
  compared, which still leaves whatever its own nested flows produced. Flows on one side only are named as called or dropped, with what they
  hold. Flows left unexpanded are listed by id with the reason — depth cap, cycle,
  or no version list on this lane. The verbatim flow-version caveat from step 4
  goes at the head of this section.
- **Unclassified** — every real change that fits no class above, with its field,
  old value and new value.
- **Unresolved** — removals you could not disprove, and what was missing.
- **Not covered** — every applicable item from the list above.

**Omit empty sections**, in the file and the reply alike. No "Unresolved: none",
no zero rows, no heading with nothing under it.

**Reconcile before printing.** Exclude check-1 (moved) pairs from added and
removed counts — a move is one relocation, not a delete plus an add — then assert
in aggregate that `added == net + removed`. **Not per type** — a `changed` step
can change type, moving one count between two types while appearing in neither
`added` nor `removed`, so the per-type form false-alarms on a correct diff. A
mismatch in the aggregate is a reporting bug: find it.

**The reply is terse; the report is complete.** The file carries the evidence;
the reply carries only what the caller acts on: the behavioural headline
(*N functional, M nonfunctional in the test; P functional, Q nonfunctional across
R flows*), one line per functional change — step, class, direction — every
Unresolved and Not-covered caveat verbatim, and the report path. Per-step
evidence chains, added-step inventories, commentary before/after text, and the
class-by-class nonfunctional detail stay in the file; whoever wants them opens
it. Two rules survive the compression: counts come from the
type table, never re-derived in prose, and the loss must not land on the
caveats — an unresolved removal or a not-covered item is never summarized away.

**Flow findings compress the same way, and they do not get demoted.** A
functional change inside a flow earns a line in the reply exactly as a
test-level one does, prefixed with the flow it lives in and the version pair it
came from: *`App - Login` v348 → v349: …*. What stays in the file is the rest of
that flow's diff — its nonfunctional classes, its unchanged inventory, its
per-step evidence. Two things never compress away: the verbatim flow-version
caveat wherever a flow was expanded, and the id of any flow left unexpanded.
When every flow resolved to the same version on both sides, say that in one line
rather than dropping the subject — "expanded 4 flows, none changed between these
versions" is the finding, and silence reads as never having looked.

**No verdict, no score, no recommendation to restore or re-edit** — and no
valence in the vocabulary either. "Step 28's match went from exact to substring"
is this skill's answer; "step 28 was weakened" is the caller's, because only they
know whether it was asked for. Same for "seven steps left the test; all seven are
in the extracted flow" versus "this refactor was fine".

## Comparing a flow on its own

A reusable flow has its own history and its own diff — same reference forms, same
JSON, same classification. When the *input* is a flow id, this is the whole job;
when the input is a test id, step 4 has already done it for every flow the test
calls.

```
list_mabl_flow_versions({ flowId: "<*-f>" })
compare_mabl_flow_versions({ source_flow_id: "<*-f>:57", target_flow_id: "<*-f>:58" })
```

```bash
mabl flows compare <source> <target> --output json
```

- **Two flow versions are pinned when you name them**, so a flow-to-flow
  comparison carries none of step 4's resolution caveat. The inference only
  enters when a *test* version has to be turned into a flow version.
- **There is no `mabl flows versions`**, and `mabl flows list` has no `--output`
  at all. Flow version numbers are discoverable only on the MCP lane; without it,
  compare two flow ids and say the versions weren't available.
- **A shared flow's blast radius is not the test you started from.** Say which
  flow changed and note the reach; `list_mabl_tests_using_flow` enumerates
  callers and this skill doesn't call it for you.
- **A flow read defaults to master.** Pass the branch from
  `created_on_branch` — the same trap as the extraction check.
- **Find a test's flows from its `EvaluateFlow` steps**, not from
  `get_mabl_test_steps`'s `flows` array: on the test checked here that array held
  only the `structural` flow. See step 4.

## Boundaries

Two things this skill never does. It doesn't change a test — not a step, a label,
the enabled flag, or a restore. And it doesn't open a failing run: it diffs
definitions, so it can say a step changed but never that the change broke a run.
When one of those is what's needed, say so and stop.

**Not doing a rollback is not the same as not enabling one.** The report names
both versions as integers and every change between them, which is exactly what
`restore_mabl_test` / `mabl tests restore` takes as an argument, and exactly
what a person needs to decide whether to run it. Hand over the version number
and what changed; the decision and the command are theirs.

**This skill stands alone and requires no other.** Give it two references and it
answers. It is also built to be called: when the caller holds the intent behind
the edit — an authoring or healing skill, a review, a person who asked for a
specific change — this classification is its input, and the judgment of whether
the edit was right stays with them. Nothing here needs installing beyond this
skill.

## Additional resources

- `references/reading-the-diff.md` — the JSON field by field, jq recipes for
  every gate and class, the flow recipes step 4 needs (enumerating each side,
  resolving a version from a timestamp, reconstructing a flow at one version),
  and the traps that make a naive count wrong.
