---
name: mabl-compare-versions
description: |
  Report what changed between two versions of a mabl test or reusable flow — or
  between two of them — separating changes that alter behaviour from ones that
  only reorganize: steps added / removed / changed / moved, assertion counts by
  type, strictness (exact match to substring, a value emptied, a check no longer
  gating), data bindings, date literals, and description rewrites. It states
  what changed and which way; the caller decides if that was wanted. Read-only.
  Fire when someone asks "what changed in this test", "diff these two versions",
  "compare these two tests", "what changed in this flow", "did that edit weaken
  the test", or "what did the heal attempt actually do", with a test id (`*-j`)
  or flow id (`*-f`). Takes the entity as given; it does not search for it.
  Standalone, and built to be called by other skills: it reports the changes,
  and whoever holds the intent behind the edit rules on it. To CHANGE a test use
  mabl-test-edit; for a FAILING run use mabl-debug.
allowed-tools: Bash, Read, mcp__mabl__list_mabl_test_versions, mcp__mabl__compare_mabl_test_versions, mcp__mabl__list_mabl_flow_versions, mcp__mabl__compare_mabl_flow_versions, mcp__mabl__get_mabl_flow_steps, mcp__mabl__get_mabl_test_steps, mcp__mabl__list_mabl_tests
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
| Flow version list | `list_mabl_flow_versions` | **no such command** |
| Read a flow's steps on a branch | `get_mabl_flow_steps` | `mabl flows export --mabl-branch` — but **without step ids** |

**The diff itself is identical on both lanes** — same engine, byte-for-byte the
same JSON — so no lane classifies better and classification applies either way. Judge
availability by what you can see: **the MCP lane is open when
`compare_mabl_test_versions` is in your tool list.**

They differ only in what you can *ask*:

- **MCP alone is enough for everything here**, including the flow reads that
  the relocation gate depends on.
- **The CLI alone diffs tests and flows** but cannot date a version or list a
  flow's versions. It *can* read a flow on a branch
  (`mabl flows export --mabl-branch`), but **the export carries no step ids**: it
  shows the flow is non-empty and which types are in it, and cannot prove *these*
  removed steps are the ones inside. On that lane extraction is corroborated, not
  confirmed — and an unproven removal is never a deletion.

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

## 4. Classify

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
- **What a nested flow's steps did.** An `EvaluateFlow` carries only
  `{actionCode, description, flow.invariant_id}`. A change *inside* a reusable
  flow is invisible in the test diff and needs its own comparison.
- **Which steps fell inside an added `If`.** Groups are flattened, so an added
  conditional tells you the branch exists, not what it wraps.
- **Run results.** This is a definition diff. A step changed; it never says the
  change is what broke the run.

## 5. Report

Write to `.mabl/compare/<id>-<source>-<target>.md` — the same ignored cache as
the captured diff, so a read-only comparison leaves nothing in `git status`.

- **Compared** — the two versions as integers, which lane, and why those two.
- **Behavioural summary first** — *N functional, M nonfunctional*, carrying
  explicit zeros for unclassified and unresolved so a section omitted for being
  empty still reads as looked-at. If nothing survived the gates, say so.
  **Both numbers count steps**, and a step belonging to two classes is counted
  once, under the more consequential one. Each must equal the sum of the class
  counts reported below it — a headline that disagrees with its own list is a
  reporting bug, so add it up before printing.
- **Nonfunctional** — one line per class that fired, with counts. Commentary
  rewrites get their step numbers and their before/after text, not just a count.
- **Functional** — structure (added / deleted, naming the evidence each verdict
  rests on), assertions per type source → target with the net, one row per changed
  binding field with its direction, then data bindings, dates, conditionals.
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
(*N functional, M nonfunctional*), one line per functional change — step, class,
direction — every Unresolved and Not-covered caveat verbatim, and the report
path. Per-step evidence chains, added-step inventories, commentary before/after
text, and the class-by-class nonfunctional detail stay in the file; whoever
wants them opens it. Two rules survive the compression: counts come from the
type table, never re-derived in prose, and the loss must not land on the
caveats — an unresolved removal or a not-covered item is never summarized away.

**No verdict, no score, no recommendation to restore or re-edit** — and no
valence in the vocabulary either. "Step 28's match went from exact to substring"
is this skill's answer; "step 28 was weakened" is the caller's, because only they
know whether it was asked for. Same for "seven steps left the test; all seven are
in the extracted flow" versus "this refactor was fine".

## Comparing flows

A reusable flow has its own history and its own diff — same reference forms, same
JSON, same classification. `get_mabl_test_steps` tags a test's flows
`structural`, `reusable`, or `legacy_unsupported`, which is how you find them.

```
list_mabl_flow_versions({ flowId: "<*-f>" })
compare_mabl_flow_versions({ source_flow_id: "<*-f>:57", target_flow_id: "<*-f>:58" })
```

```bash
mabl flows compare <source> <target> --output json
```

- **There is no `mabl flows versions`**, and `mabl flows list` has no `--output`
  at all. Flow version numbers are discoverable only on the MCP lane; without it,
  compare two flow ids and say the versions weren't available.
- **A shared flow's blast radius is not the test you started from.** Say which
  flow changed and note the reach; `list_mabl_tests_using_flow` enumerates
  callers and this skill doesn't call it for you.
- **A flow read defaults to master.** Pass the branch from
  `created_on_branch` — the same trap as the extraction check.

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
  every gate and class, the no-jq fallback, and the traps that make a naive count
  wrong.
