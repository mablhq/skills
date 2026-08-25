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
allowed-tools: Bash, Read, mcp__mabl__*
---

# mabl compare versions

Two versions of a test — or of a reusable flow — differ. This skill says **how**
they differ, in terms someone can act on. It does not say whether the difference
is good.

That split is the point. A diff is a fact; the verdict needs the intent, and
the intent lives with whoever asked for the change. So the output here is a
classification and a set of counts — never an approval, a rejection, or a
score.

## Two lanes, and how to tell which you have

The same diff is reachable two ways, and they are not equivalent:

| | mabl MCP server | mabl CLI |
|---|---|---|
| Diff | `compare_mabl_test_versions` | `mabl tests compare --output json` |
| Version list | `list_mabl_test_versions` — **with creation time and change description** | `mabl tests versions` — version and branch only |
| Diff a branch's version | `branch` parameter | no — both references resolve on the default branch |
| Flow versions | `list_mabl_flow_versions` | no such command |

**Prefer the MCP lane.** It answers dated questions ("what changed since
Tuesday") that the CLI simply cannot, and it reads branches. Neither tool is
behind a feature flag, so judge the lane by what you can see: **the MCP lane is
open when `compare_mabl_test_versions` is in your tool list**, closed when it
isn't. Fall back to the CLI then, and say which lane you used — the two answer
different questions about branches and dates.

Both lanes run the **same diff engine** and return the same JSON, so everything
in step 3 applies either way.

## Prerequisites

The CLI lane needs the CLI:

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
this skill never calls either. If a rollback is what the user wants, say the
version number they'd restore and let them run it themselves.

## 1. Pick the two references

**MCP lane** — the version list that can answer a dated question:

```
list_mabl_test_versions({ testId: "<*-j>" })          // full history
list_mabl_test_versions({ testId: "<*-j>", branch: "<name>" })  // just that branch
```

Newest first, each entry carrying `version`, `is_latest`, `created_on_branch`,
`created_time` (**Unix epoch milliseconds**) and `change_description`. That is
what makes "what changed since Tuesday" answerable: bracket on `created_time`,
and quote the `change_description` of the versions you picked. Both fields are
optional in the response — when a version carries neither, fall back to the
dated-evidence method below rather than assuming an order beyond the version
numbers.

**CLI lane** — plain text, newest first, no `--output json`:

```
Versions for test <test-id>:
  v4 (latest) [master]
  v3 [agent-checkout-fix]
  v2 [master]
```

`v<N>` is the integer you pass to `compare`, then a `(latest)` marker and the
branch the version was **created on**. This list carries **no timestamp and no
change description** — the CLI drops both. So on this lane a dated question has
to be bracketed from something else that is dated (a failing run's start time,
a deployment, the workspace activity feed). Say which version you picked and
why, and say that you dated it indirectly.

A reference is `<id>` (latest) or `<id>:<N>` (that version). Common pairs:

| Question | Source | Target |
|---|---|---|
| What did the last edit do? | `<id>:<N-1>` | `<id>` |
| What changed since it last passed? | `<id>:<last-good>` | `<id>` |
| How does our copy differ from theirs? | `<id-a>` | `<id-b>` |

`compare` rejects identical source and target.

## 2. Get the structured diff

**MCP lane** — returns the diff as `structuredContent`, and takes a branch:

```
compare_mabl_test_versions({
  source_test_id: "<*-j>:2",
  target_test_id: "<*-j>",
  branch: "<name>"          // optional; defaults to master (mabl's default branch, not git's)
})
```

**CLI lane** — same JSON, written to a file to classify with `jq`:

```bash
mkdir -p .mabl/compare
mabl tests compare <source> <target> --output json > .mabl/compare/<test-id>-<source>-<target>.json
```

`--output json` is the only structured form; `-a` / `--show-all-properties`
affects the human-readable view, not the JSON. Either lane produces the same
shape:

```json
{ "source": "…:2", "target": "…:4",
  "summary": { "added": 1, "removed": 2, "changed": 3, "unchanged": 40 },
  "steps": [ { "operation": "changed", "stepNumber": 7,
               "from": { "AssertEquals": {…} }, "to": { "AssertPresent": {…} } } ] }
```

Each `from` / `to` is a **single-key object keyed by the step type** — the
same shape `mabl tests export --format json` produces — and carries the
step's `id` when it has one. `references/reading-the-diff.md` has the full
field-by-field reading, the jq recipes for every class below, and what to do
without jq.

**If either reference fails to resolve, report the comparison as *not run*.**
Don't substitute a single-version export and describe it as a diff — that
answers a different question and reads as if it answered this one.

## 3. Classify

Six classes. Each is computed from the diff, and each is a fact — the caller
supplies the judgment.

| Class | What it is | How you see it |
|---|---|---|
| **Structure** | steps added, removed, changed | `summary` |
| **Moved** | a step that relocated, not a deletion | a `removed` step id that reappears in an `added` step |
| **Assertion delta** | count per assertion type, source vs target | tally the step-type key across `from` / `to` |
| **Weakening** | same check, less proved | the table below |
| **Conditional** | `If` / `ElseIf` / `Loop` added — later checks may now be skippable | an added control-flow step |
| **Date literals** | a fixed date baked into a step | a month name, `YYYY-MM-DD`, or today's date in `to` and not `from` |

### Moved is not removed — check it before you report a deletion

`compare` renders a step that moved as a **`removed` entry plus an `added`
entry**, exactly the way the web app's Compare tab does. A rule that reads
`removed` alone reports every relocated assertion as deleted coverage.

So pair them first: a `removed` step whose `id` shows up on an `added` step is
a **move**. Report moves separately from removals, and take them out of the
removal count before anyone reasons about it.

Steps in older tests carry no `id`. When ids are absent, pair on the full step
descriptor being identical instead, and say you matched on descriptor — it
can't tell a move from a delete-plus-identical-re-add, and that limit belongs
in the report rather than in a footnote.

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

Two rules that keep this honest:

- **The strictness ladder is: exact match → substring → existence.** Report a
  step that moved down it. Don't rank changes the ladder doesn't cover (an
  assertion becoming an `AssertAIPrompt`, say) — describe what it was and what
  it is, and let the reader rank it.
- **`WaitUntil`, `If`, and `ElseIf` are not assertions**, even though they
  carry the same condition shape. Count assertions by the step-type key
  starting with `Assert`, plus `AccessibilityCheck`. Counting "has a
  condition" over-counts every wait in the test.

### What this diff cannot see

Say these out loud rather than implying the diff covered them:

- **Whether the *test* is enabled.** `compare` diffs steps. A test disabled
  wholesale looks identical here. Check it separately with
  `mabl tests list --output json` and read the test's `enabled` field.
- **Which steps fell inside an added `If`.** Step groups are flattened in the
  diff, so an added `If` tells you the branch exists, not what it wraps.
  Report it as *needs a look at the test*, not as a determination.
- **On the CLI lane, versions that only exist on another branch.** `mabl tests
  compare` resolves both references against the **default branch**, with no way
  to override it. A version created on a feature branch appears in `mabl tests
  versions` (that's what `[branch]` means) but will not resolve in the diff. If
  a reference from another branch fails there, say that's why — don't report it
  as a missing version, and don't conclude the version doesn't exist. The MCP
  lane takes a `branch` parameter and has no such limit; if this is the
  question, it's the lane to use.
- **Run results.** This is a definition diff. It says a step changed, never
  that the change is what broke the run.

## 4. Report

Write to `.mabl/compare/<test-id>-<source>-<target>.md`. Lead with the counts,
then the classes that fired, then the raw pairs for anything flagged:

- **Compared** — the two references, and why those two.
- **Structure** — added / removed / changed / moved, with moves excluded from
  removals.
- **Assertions** — per-type count, source → target, and the net.
- **Weakening** — one row per instance: step number, what it was, what it is.
  Empty is a real and common result — say "none found", not silence.
- **Conditional / date literals** — each occurrence, with its step number.
- **Not covered** — every item from the list above that applies here.

End with the classification and stop. **No verdict, no score, no
recommendation to restore or re-edit** — hand it to whoever holds the intent.
"Three assertions removed, two of them moves" is this skill's answer;
"this fix is bad" is the caller's.

## Comparing shared flows

When the change is in a reusable flow, the flow has its own version history and
its own diff — same references (`<flow-id>` or `<flow-id>:<version>`), same JSON
shape, same classification. Nested flows compare as `EvaluateFlow` steps rather
than being expanded, so a change one level down shows as a changed
`EvaluateFlow` step and needs its own comparison.

```
list_mabl_flow_versions({ flowId: "<*-f>" })            // MCP: version, branch, time, change description
compare_mabl_flow_versions({ source_flow_id: "<*-f>:2", target_flow_id: "<*-f>" })
```

```bash
mabl flows compare <source> <target> --output json      # CLI
```

**The CLI has no `flows versions` command** — flow version numbers are
discoverable only on the MCP lane. Without it, compare two flow ids rather than
guessing an integer, and say the version numbers weren't available.

A shared flow is used by other tests, so a change there is not scoped to the
test you started from. Say which flow changed and note the reach — this skill
doesn't enumerate callers.

## Boundaries

**Requires `mabl-test-authoring`.** If that skill isn't there, stop and say
which skill is missing — don't take over its validation decision, and don't
guess how to install it, because that depends on how this skill was installed.
When a test was authored or healed in the current session, that skill's
validation step holds the authoring intent and the rule against converging by
deleting coverage. Give it this classification as input. It rules.

For a standalone question — "what changed in this test", "how does ours differ
from theirs" — there is no intent to defer to and no verdict to give. Classify
and report.

Two things this skill deliberately never does. It doesn't change a test — not
a step, not a label, not the enabled flag, and never `mabl tests restore`. And
it doesn't open a failing run: it diffs test definitions, so it can say a step
changed but never that the change is what broke the run. When one of those is
what's actually needed, say so and stop rather than approximating it here.

## Additional resources

- `references/reading-the-diff.md` — the JSON field by field, jq recipes for
  every class, the no-jq fallback, and the edge cases that make a naive count
  wrong.
