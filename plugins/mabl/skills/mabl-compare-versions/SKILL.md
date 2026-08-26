---
name: mabl-compare-versions
description: |
  Report what changed between two versions of a mabl test or reusable flow —
  or between two of them — as a structured classification with NO verdict
  attached: steps added / removed / changed / moved, assertion counts by type,
  weakening (a strict assertion swapped for a looser one, a value emptied, a
  step disabled), and date literals introduced. It classifies; the caller
  decides. Read-only — never edits, restores, or runs anything.
  Fire when someone asks "what changed in this test", "diff these two
  versions", "compare these two tests", "what changed in this flow", "did that
  edit weaken the test", or "what did the heal attempt actually do", with a
  test id (`*-j`) or flow id (`*-f`).
  If a test was authored or healed THIS session, mabl-test-authoring's
  validation step owns the verdict — give it the classification, don't rule
  in its place. To CHANGE a test use mabl-test-edit; for a FAILING run use
  mabl-debug.
allowed-tools: Bash, Read, mcp__mabl__list_mabl_test_versions, mcp__mabl__compare_mabl_test_versions, mcp__mabl__list_mabl_flow_versions, mcp__mabl__compare_mabl_flow_versions, mcp__mabl__get_mabl_test_steps, mcp__mabl__list_mabl_tests, mcp__mabl__list_mabl_branches, mcp__mabl__list_mabl_users, mcp__mabl__list_authoring_sessions
---

# mabl compare versions

Two versions of a test — or of a reusable flow — differ. This skill says **how**
they differ, in terms someone can act on. It does not say whether the difference
is good.

That split is the point. A diff is a fact; the verdict needs the intent, and
the intent lives with whoever asked for the change. So the output here is a
classification and a set of counts — never an approval, a rejection, or a
score.

The grants here are read-only on purpose. Nothing in this skill edits, restores,
re-runs, or merges.

## Two lanes, and which question each answers

| | mabl MCP server | mabl CLI |
|---|---|---|
| Diff | `compare_mabl_test_versions` | `mabl tests compare --output json` |
| Version list | `list_mabl_test_versions` — **carries `created_time`** | `mabl tests versions` — version and branch only, no timestamp |
| Diff a version born on a branch | yes | **yes** — a `<id>:<N>` reference is branch-independent |
| Flow versions | `list_mabl_flow_versions` | no such command |
| Who edited it | nothing | `mabl tests list -o json` → `last_updated_by_user` |

**The comparison itself is identical on both lanes.** They call the same diff
engine and the JSON comes back byte-for-byte the same, so no lane produces a
better classification and everything in step 3 applies either way. Judge
availability by what you can see: **the MCP lane is open when
`compare_mabl_test_versions` is in your tool list.**

The lanes differ only in what they let you *ask*, and the MCP lane is the more
complete one for this skill:

- **MCP alone is enough for everything here.** Test diffs, flow diffs, dated
  questions, branch-scoped history.
- **The CLI alone covers test and flow diffs** but cannot date a version and
  cannot list a flow's versions — there is no `mabl flows versions` command. With
  the CLI only, say that flow version numbers weren't discoverable rather than
  guessing an integer.
- **Attribution is adjunct, not the comparison.** Nobody's version list carries
  an author. If someone asks *who* changed a test, that is a separate lookup with
  its own limits — see [Attribution](#attribution-who-changed-it) — and it is the
  one place the CLI reaches something the MCP lane doesn't.

Say which lane you used.

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.119.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth login --auto   # one-time OAuth in browser — required before any command
mabl auth info           # verify you're logged in and the token hasn't expired
```

**Probe for the command, don't trust the version.** These shipped together, so
a version check can pass on a build that predates them:

```bash
mabl tests compare --help 2>&1 | grep -qw -- --output \
  || echo "This mabl CLI cannot produce a structured diff — 'mabl tests compare --output json' is missing. Upgrade: npm install -g @mablhq/mabl-cli@latest"
```

If the probe fails and the MCP lane is closed too, say so and stop. There is no
third way to get this diff.

Everything here is a **read**. The one nearby write is a restore —
`restore_mabl_test` on the MCP server, `mabl tests restore` on the CLI — and
neither is granted to this skill. If a rollback is what the user wants, say the
version number they'd restore and let them run it themselves.

## 1. Pick the two references

A reference is `<id>` or `<id>:<N>`, and the difference between them is the
single easiest thing to get wrong here.

**`<id>:<N>` is a specific version, and it is branch-independent.** Version
numbers are global per test, so a version created on a feature branch resolves
from either lane with no branch parameter. Passing `branch` changes nothing for
a versioned reference.

**A bare `<id>` is the *global latest* version — which may live on a branch.**
It is *not* "the latest on master". A test whose newest version was created on
`some-fix-branch` resolves a bare id to that branch's version. So the obvious
pair for "what did the last edit do" is a trap:

| Want | Use | Not |
|---|---|---|
| What did the last edit do? | `<id>:<N-1>` → `<id>:<N>` | `<id>:<N-1>` → `<id>` — the bare side may be a branch version you didn't mean |
| What changed since it last passed? | `<id>:<last-good>` → `<id>:<N>` | |
| How does our copy differ from theirs? | `<id-a>` → `<id-b>` | |

**Name both versions explicitly.** Read the version list, take the two integers,
and pass both. It costs one extra call and removes the whole class of error.

Two more edges worth knowing:

- `compare` rejects **literally identical** argument strings. It does **not**
  reject `<id>` vs `<id>:<N>` when they happen to resolve to the same version —
  that returns an all-`unchanged` diff, which is indistinguishable from "nothing
  changed between these two things". Another reason to name both versions.
- `mabl tests versions` **rejects `--output json`** (it prints yargs help and
  exits non-zero). Text is the only form; parse the lines.

### Listing the versions

**MCP lane** — the only lane that can date a version:

```
list_mabl_test_versions({ testId: "<*-j>" })                    // full history
list_mabl_test_versions({ testId: "<*-j>", branch: "<name>" })  // just that branch
```

Newest first: `version`, `is_latest`, `created_on_branch`, `created_time`
(**Unix epoch milliseconds**), `change_description`.

**`change_description` is almost always absent.** Don't build the report around
it. Where it is populated it tends to be system-generated ("Merged master
into …", "Restored version 8") and it never names a person. `created_time` is
the field that answers a dated question; treat `change_description` as a bonus
and say nothing about it when it's empty.

**CLI lane** — plain text, newest first:

```
Versions for test <test-id>:
  v75 (latest) [rca-fix/view-insights-20260826]
  v74 [master]
  v73 [master]
```

`v<N>`, a `(latest)` marker, and the branch the version was **created on**.
Note what that first line demonstrates: the latest version is on a branch, so a
bare id here would resolve to the branch version. No timestamps on this lane, so
a dated question has to be bracketed from something else that is dated (a failing
run's start time, a deployment) — and say you dated it indirectly.

## Attribution — who changed it

This is an **adjunct to the comparison, not part of it** — the skill's job is the
diff. Reach for it only when someone actually asks who changed something, and
skip it otherwise.

**No version list carries an author, on either lane.** The best available lookup
is on the CLI:

```bash
mabl tests list -w <workspace-id> -o json --limit 2000
```

Each test carries `created_by_user` and `last_updated_by_user` as
`{id, name, email}` — already resolved, no second call. `--limit` defaults to
**10**, so pass it explicitly or you'll silently see a handful of tests; and pass
`-w` unless you know the CLI's configured workspace is the one you mean.

**With the MCP lane only, attribution is partial, and say so.**
`list_mabl_tests` returns an `authorId`, but that is the test's *creator*, not
its last editor. `list_mabl_authored_tests` does carry an enriched
`lastUpdatedBy`, but it orders by creation time and caps well below a full
workspace, so it answers "who created these recent tests", not "who last edited
this one". Report what you could establish and what you couldn't — don't
substitute creator for editor without flagging it.

Three limits to state rather than paper over:

- **`last_updated_by_user` is the test record's last editor, not the author of
  any particular version.** The last person to touch a test is frequently not
  who wrote its latest version. Don't present it as version authorship.
- **A metadata-only edit creates no version.** Renaming, relabelling, or
  disabling a test updates `last_updated_time` and leaves the version history
  untouched — so a test can be "edited today" with its newest version months
  old, and `compare` has nothing to show. Say that rather than reporting an
  empty diff as if nothing happened. On a real corpus this was the single most
  common shape of "edit".
- **Branch creators may be API keys.** `list_mabl_branches` gives each branch a
  `created_by`, but an id ending `-k` is an API key (CI, automation), and
  `list_mabl_users` **silently omits ids it can't resolve** — an absent name is
  not an absent branch. Report the raw id and call it automation.

For **agent vs human**, an authoring session is the evidence:

```
list_authoring_sessions({ workspaceId, branchId: "<*-br>" })
```

Query it **by `branchId`**, not by `testId`. The `testId` filter returns no
sessions for tests that demonstrably have versions on agent branches, so a
`testId` query coming back empty is not evidence that no agent touched it. Agent
edits land on branches named `Agent edit: <name> (<hash>)` or
`Agent edit session <hash>`, which is the cheaper first signal. Note that an
agent-edit branch's creator is the **human who started the session**, so "edited
by an agent" and "edited by a human" are not exclusive.

## 2. Get the structured diff

**MCP lane:**

```
compare_mabl_test_versions({ source_test_id: "<*-j>:74", target_test_id: "<*-j>:75" })
```

**CLI lane** — same JSON:

```bash
mkdir -p .mabl/compare
mabl tests compare <source> <target> --output json > .mabl/compare/<test-id>-<source>-<target>.json
```

`--output json` is the only structured form; `-a` / `--show-all-properties`
affects the human-readable view, not the JSON.

A real diff is large — tens of kilobytes for a 40-step test, because every
`unchanged` step carries its full descriptor. On the MCP lane the response
routinely overflows the token limit and gets written to a file instead, which is
good news: **the `jq` recipes in `references/reading-the-diff.md` apply to either
lane**, since both end up as a file on disk.

The shape:

```json
{ "source": "…:74", "target": "…:75",
  "summary": { "added": 0, "removed": 0, "changed": 4, "unchanged": 37 },
  "steps": [ { "operation": "changed", "stepNumber": 37,
               "from": { "AssertEquals": {…} }, "to": { "AssertEquals": {…} } } ] }
```

Each `from` / `to` is a **single-key object keyed by the step type** — the same
shape `mabl tests export --format json` produces — carrying the step's `id` when
it has one. `references/reading-the-diff.md` has the field-by-field reading, the
jq recipes for every class below, and the no-jq fallback.

**If either reference fails to resolve, report the comparison as *not run*.**
Don't substitute a single-version export and describe it as a diff.

## 3. Classify

### First: is this an authored edit at all?

Run this before counting anything, because on a real corpus it is the most common
finding and the counts lie without it.

**`description` and `annotation` are server-rendered commentary, not the step.**
They are regenerated by the platform, and a version can change dozens of
descriptions while changing no behaviour — one real test showed 17 of 22
"changed" steps differing only in quoting style ("Assert that innerText … starts
with Auto-heal" → `Assert "innerText" … starts with "Auto-heal"`). Reporting "22
steps changed" there is technically true and completely misleading.

So for every `changed` step: **drop `description` and `annotation` from both
sides and re-compare.** If the remainder is identical, it is renderer churn, not
an edit. Count it separately and say so.

The same applies to whole diffs. An all-zeros summary (`added 0, removed 0,
changed 0`) is a real and frequent result: **a new version exists and it changed
no steps.** Report that as its own finding — it usually means a branch operation
or a metadata save — rather than leaving the reader to infer something happened.

### Second: never quote a description as evidence

The corollary, and the sharpest trap in this skill. A step's `description` can
disagree with the step's own body, because the description was rendered at a
different time:

- a `VisitUrl` whose `url` is `{{@web.defaults.url}}` on **both** sides, while its
  description changes to name `app.url`
- an `EnterText` whose description says `app.defaults.username` while its own
  `text.name` says `web.defaults.credentials.username`
- a `CreateVariable` whose `generator.pattern` is identical on both sides while
  its description gains a namespace

Each of those reads as a real change and is not one. **Classify from the body** —
`condition`, `extract`, `target`, `url`, `text`, `generator` — and quote the body
in the report. When you mention a description at all, say it's the rendered label.

### The classes

| Class | What it is | How you see it |
|---|---|---|
| **Structure** | steps added, removed, changed | `summary`, after the churn filter above |
| **Moved** | a step that relocated, not a deletion | see below — this needs real care |
| **Assertion delta** | count per assertion type, source vs target | tally the step-type key across `from` / `to` |
| **Weakening** | same check, less proved | the table below |
| **Conditional** | `If` / `ElseIf` / `Loop` added — later checks may now be skippable | an added control-flow step |
| **Date literals** | a fixed date baked into a step | a month name, `YYYY-MM-DD`, or today's date in `to` and not `from` |
| **Data binding** | a value became variable-driven, or stopped being | a `{{@…}}` token appearing or disappearing in a body field |

A data-binding change is worth its own line because it cuts both ways and the
counts never show it. A hardcoded literal replaced by `{{@user.some.var}}` is
usually a fix; the reverse pins a test to one input. Two cases to distinguish and
report differently:

- **The bound value changed** — a different variable, or a literal where a
  variable was. A real change.
- **Only the binding's representation changed** — e.g. a structured
  `{name, tokens}` object becoming an inline `"{{@web.defaults.credentials.username}}"`
  string that resolves to the same variable. That is a schema migration, not a
  credential edit, and calling it one is alarming and wrong.

Read this from the body field (`text`, `condition.comparatorValue`,
`generator.pattern`, `url`), never from the description — a real diff carried a
step whose description named `app.defaults.username` while its own `text.name`
said `web.defaults.credentials.username`.

### Moved is not removed — and an id match is not the whole story

`compare` renders a step that moved as a **`removed` entry plus an `added`
entry**, the way the web app's Compare tab does. A rule that reads `removed`
alone reports every relocated assertion as deleted coverage. This is real: a
live diff showed an `AssertEquals` with id `LDy7Znjkdq9hbo2Vkz-0Hw` leaving step
7 and arriving at step 24 — one move, zero deletions, and a naive read calls it
a deleted assertion.

So pair before you report. But **an id match is sufficient to prove a move; an id
mismatch proves nothing**, and that second half is where the real errors live:

1. **Ids match across a `removed` / `added` pair → it moved.** Report it as a
   move and take it out of the removal count.
2. **Ids differ, or are missing → compare the bodies with `id` excluded.**
   Identical bodies mean the step's identity was regenerated by the platform, not
   that a step was deleted and a different one added. On one flow's history this
   happened seven times; every instance would otherwise be reported as a deleted
   assertion.
3. **`EvaluateFlow` steps need their own pairing.** A platform migration that
   assigns step ids renders every flow invocation as remove + add: the removed
   side has `id: null`, the added side has a fresh id, **and the descriptions
   differ too** (`"App - Login"` → `"Start flow \"App - Login\""`), so a
   descriptor comparison also fails. Pair these on `flow.invariant_id` plus
   `stepNumber`. One real diff produced eight false deletions this way, including
   the login flow — which reads as someone ripping authentication out of a test.
4. **Only after all three** is a `removed` step a deletion.

State the method you used. Pairing by body or by `flow.invariant_id` is weaker
than pairing by id — it can't distinguish a move from a delete-plus-identical-add
— and that belongs in the report, not in a footnote.

### The weakening table

Same step count, less proved. This is what a count-based check misses entirely.

| Weakening | Source | Target |
|---|---|---|
| Assertion loosened | `AssertEquals` / regex assertion | `AssertContains`, then `AssertPresent` |
| Expected value emptied | a non-empty expected value | empty, absent, or a wildcard-only pattern |
| Pattern widened | a specific regex | one that also matches the old failure |
| Check disabled | no `disabled` key | `"disabled": true` |
| Check made conditional | assertion runs unconditionally | an `If` / `ElseIf` added above it |
| Assertion → wait | `Assert*` | `WaitUntil` (waits, proves nothing) |

Three rules that keep this honest:

- **The strictness ladder is: exact match → substring → existence.**
  `AssertEquals` → `AssertContains` → `AssertPresent` is a descent; a
  `disabled: true` on any check is the bottom of it.
- **The ladder does not cover every step type, and that's fine.**
  `AssertStartsWith` / `AssertEndsWith` flipping to or from `AssertContains`,
  an assertion becoming an `AssertAIPrompt`, `AssertNotPresent`, the numeric
  comparators — describe what it was and what it is, and let the reader rank it.
  Inventing a ranking is worse than declining to give one.
- **`WaitUntil`, `If`, and `ElseIf` are not assertions**, even though they carry
  the same condition shape. Count assertions by the step-type key starting with
  `Assert`, plus `AccessibilityCheck`. Counting "has a condition" over-counts
  every wait in the test.

### What this diff cannot see

Say these out loud rather than implying the diff covered them:

- **Whether the *test* is enabled.** `compare` diffs steps; a test disabled
  wholesale looks identical here. Read the `enabled` field from
  `list_mabl_tests` / `mabl tests list -o json`. This matters more than it
  sounds: disabling is one of the most common "edits" a test receives, and it
  never shows up in a diff.
- **What a nested flow's steps did.** A flow invocation appears as an
  `EvaluateFlow` step carrying only `{actionCode, description, flow.invariant_id}`
  — never the flow's contents. A change *inside* a reusable flow is invisible in
  the test diff and needs its own comparison.
- **Which steps fell inside an added `If`.** Step groups are flattened, so an
  added `If` tells you the branch exists, not what it wraps. Report it as needing
  a look at the test, not as a determination.
- **Run results.** This is a definition diff. It says a step changed, never that
  the change is what broke the run.

## 4. Report

Write to `.mabl/compare/<test-id>-<source>-<target>.md`:

- **Compared** — the two references as version integers, which lane, and why
  those two.
- **Authored change, or churn** — the structural counts *after* the
  description/annotation filter, with the churn counted separately. If nothing
  survived the filter, say the version changed no behaviour.
- **Structure** — added / removed / changed / moved, with moves excluded from
  removals and the pairing method named.
- **Assertions** — per-type count, source → target, and the net.
- **Weakening** — one row per instance: step number, what it was, what it is.
  Empty is a real and common result — say "none found", not silence.
- **Conditional / date literals** — each occurrence, with its step number.
- **Not covered** — every item from the list above that applies here.

End with the classification and stop. **No verdict, no score, no recommendation
to restore or re-edit** — hand it to whoever holds the intent. "Three assertions
removed, two of them moves" is this skill's answer; "this fix is bad" is the
caller's.

## Comparing shared flows

When the change is in a reusable flow, the flow has its own version history and
its own diff — same reference forms, same JSON shape, same classification.
`get_mabl_test_steps` tags each of a test's flows `structural`, `reusable`, or
`legacy_unsupported`, which is how you find the reusable ones.

```
list_mabl_flow_versions({ flowId: "<*-f>" })
compare_mabl_flow_versions({ source_flow_id: "<*-f>:57", target_flow_id: "<*-f>:58" })
```

```bash
mabl flows compare <source> <target> --output json      # CLI
```

Three flow-specific facts:

- **There is no `mabl flows versions`.** Flow version numbers are discoverable
  only on the MCP lane. Without it, compare two flow ids rather than guessing an
  integer, and say the version numbers weren't available.
- **`mabl flows list` has no `--output` option at all**, so there is no CLI route
  to flow metadata either.
- **A shared flow's blast radius is not the test you started from.** Say which
  flow changed and note the reach; `list_mabl_tests_using_flow` enumerates
  callers, and this skill doesn't call it for you.

## Boundaries

Two things this skill deliberately never does. It doesn't change a test — not a
step, not a label, not the enabled flag, and never a restore. And it doesn't open
a failing run: it diffs definitions, so it can say a step changed but never that
the change is what broke the run. When one of those is what's needed, say so and
stop rather than approximating it here.

One hand-off. When a test was authored or healed **in the current session**, the
verdict on its diff belongs to the skill that holds the authoring intent and the
rule against converging by deleting coverage — give it this classification as
input rather than ruling in its place.

**Requires `mabl-test-authoring`.** If that skill isn't there, say which skill is
missing and hand the classification to the user instead — don't take over its
validation decision, and don't guess how to install it, because that depends on
how this skill was installed. This applies only to that hand-off: a standalone
"what changed in this test" has no authoring intent to defer to, and needs
nothing beyond this skill.

## Additional resources

- `references/reading-the-diff.md` — the JSON field by field, jq recipes for
  every class, the no-jq fallback, and the edge cases that make a naive count
  wrong.
