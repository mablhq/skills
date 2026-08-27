---
name: mabl-workspace-audit
description: |
  Audit ONE mabl workspace for cleanliness, then stage a REVERSIBLE cleanup.
  For ONE failing run use mabl-debug. To change ONE test use mabl-test-edit.
  Builds a complete inventory and reports what the workspace has stopped using
  or never governed: tests with no run in the window, tests in no plan, plans
  enabled with no trigger, failing and flaky tests, unused reusable flows, stale
  branches, naming and label drift, and tests whose owner is no longer a
  workspace member. Ranks findings by what the clutter costs. On request it
  quarantines the agreed set behind a dated label plus disable, both undoable.
  It never deletes, runs, or creates anything.
  Re-run it later and it diffs against the previous report.
  Fire on "audit my workspace", "workspace audit", "workspace cleanup", "which
  tests aren't running", "we have thousands of tests/flows we don't need", or
  "/mabl-workspace-audit".
allowed-tools: Bash, Read, Write, Edit, mcp__mabl__list_mabl_tests, mcp__mabl__list_mabl_test_run_summaries, mcp__mabl__get_test_quality_report, mcp__mabl__list_mabl_tests_using_flow, mcp__mabl__get_mabl_test, mcp__mabl__edit_mabl_test_metadata
---

# mabl workspace audit

Take a workspace id and report what it has stopped using, ranked by what the
clutter costs. Then, only if asked, quarantine the agreed set reversibly so the
workspace can prove nothing broke before anyone removes anything.

The workspace is the input. This skill does not choose which workspace to audit.

## Prerequisites

This skill drives **two** surfaces, and needs both.

- The **`mabl` CLI**, for the inventory. It is the only surface that enumerates
  every test in a workspace, the only one that reports who created a test and
  when it was last touched, and the only one that lists plans' triggers,
  branches, and flows.
- The hosted **`mabl` MCP server** (bundled with this plugin), for run activity,
  quality metrics, labels, flow usage, and the quarantine edits. Disabling a
  test is MCP-only — the CLI's `edit-metadata` commands change labels and
  nothing else.

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.111.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth info    # verify you're logged in (run `mabl auth login --auto` if not)
```

A version number is not proof a command exists. Before relying on a flag, grep
the command's own help for it as a whole word:

```bash
mabl tests list --help | grep -qw -- --output || echo "no --output on tests list; stop and say so"
mabl flows list --help | grep -qw -- --output && echo "flows list has --output; use it, not the table parse"
```

**The two surfaces fail in two different ways, and they need different
handling.**

- **The server is not connected** — the `mabl` tools are absent from your tool
  list. Name the missing server and stop. Do not substitute the CLI for the
  MCP-only steps; it cannot perform them.
- **The tool is present but the call is refused** — an entitlement or a
  permission, which only the call reveals. **Quote the server's error text
  verbatim**, name the findings that lane was going to establish, put them in
  the report's Unverified section, and carry on with the rest. A refusal is not
  an absent server, and a refusal on one tool says nothing about another.

A refused call and a rate-limit rejection are not the same thing. Retry a
rejection once; a second identical refusal is the lane closing, and it gets
reported, not retried.

## Rate limiting

Every MCP loop here runs against a server rate-limited **per identity**, and one
number governs all of them: **at most 10 calls, then pause 10 seconds.** Steps
2, 3, 5, 6 and 8 all fan out and none is exempt for being read-only.

## What this skill will not do

**It never deletes anything, and it never asks to.**

There is no delete for a test, plan, flow, or DataTable on either the CLI or the
MCP server, and no undelete either. `restore_mabl_test` restores a *version* of
a test that still exists; it does not bring back a deleted one. An agent that
deleted something could not put it back, and neither could this skill.

**It never runs a test and never creates one.** An audit that starts cloud runs
changes the activity data it is measuring, and bills the workspace for it. Read,
report, and — when asked — label and disable tests. Nothing else.

**It does not edit plans.** Disabling a plan is a change with no label on it, so
it cannot be read back and it cannot be listed for undo the way a test can. The
report says which plans want attention; the person decides them in the app.

It also cannot see a workspace's activity log. Who deleted what, and when, is
not readable from any surface here — if the audit is wrong about a test, the
record that would settle it is in the app. So the removal belongs to a person,
in the app, after the quarantine window. Report that as the hand-off, and never
simulate it.

## Workflow

Steps 1–5 gather, 6–7 report, 8–9 act. Steps 8 and 9 only happen if step 1
established that they may.

**Say what the sweep costs before starting it**, as a sum the user can evaluate
against their own workspace rather than a vague "a few minutes":

    plans + tests + flows + (flagged tests)  API calls

One per plan (step 2), one per test if step 3 takes Lane B, one per flow (step
5), one per flagged test (step 6). At the pacing above that is roughly **one
second per call**, so a thousand-entity workspace is tens of minutes. All of it
is read-only.

### 1. Fix the scope and the conventions

**The workspace id (`-w`) is input.** If the user has not given one, ask for it
and stop until they do — do not pick a default, and do not go looking for one.
An audit can end in tests being disabled; running it against a workspace nobody
named is the one mistake here that costs someone else time to undo. A user who
does not know their id can get it from `mabl workspaces list`; tell them that,
rather than running it for them.

Then agree these with the user and record them in the report, because every
finding below is read against them:

| Ask | Used by |
|---|---|
| **The dormancy window** — how far back to look for runs. Default 90 days | every dormancy finding |
| **Today's date**, resolved to epoch milliseconds, as the window's end | every dormancy finding |
| **How old an open branch has to be to count as stale.** Default 4 months | stale branches |
| **Roughly how many tests they expect the workspace to hold** | catching a silently truncated inventory |
| Test naming pattern, and any status prefix that means work-in-progress | naming drift; excluding WIP from pass-rate findings |
| Which labels are governance (team, suite, application) vs ad-hoc | label hygiene |
| Minimum labels a plan should carry | plan label coverage |
| Pass-rate floor, and any flake threshold they already use | severity banding |
| Anything already known to be exempt | every finding |
| **Whether a retirement convention already exists** — a label, a name prefix, a disabled-and-kept habit | the disposition in step 8 |
| **What this audit is allowed to do at the end** — report only, or also stage a quarantine | whether step 8 happens at all |
| **What to call the label**, if a quarantine is on the table | the naming in step 8 |

Every number here is stated in the report, not implied. A test that last ran 100
days ago is dormant at a 90-day window and healthy at a 180-day one, and the
reader cannot check the finding without the number — same for the staleness bar,
where the report says whether 4 months was agreed or defaulted.

Accept "we don't have one" for any convention — one nobody agreed is not a
finding. Record *that*; "no naming pattern agreed" is what stops the next run
inventing one.

**Ask the last three at the start, not at step 8.** A user who learns only at the
end that the skill wanted to disable a hundred tests has been asked at the worst
possible moment — after the work that would have to be redone if the answer is
no.

**Never adopt an existing convention unless told to.** Most workspaces that have
been audited before carry the traces — a `quarantine` label, an `(old) ` name
prefix, a disabled-but-kept cohort. Report what you find and ask. Reusing a
label somebody else's process owns silently merges two sets that get undone on
different days, by different people, for different reasons, and neither owner
can tell afterwards which entity belonged to which pass.

**Check the label the moment it is agreed**, not at step 8. Call
`list_mabl_tests` with `labels: ["<the agreed label>"]`; any result at all means
the name is taken, and that is a question for the user *now*, before the sweep,
for the same reason the disposition is. Step 8 re-checks immediately before
writing, because time will have passed.

On the label name, offer the default in step 8 and take whatever the user
prefers instead. It is their workspace and their vocabulary; the one property
worth arguing for is that the name be unique to this run, and the reason for
that is in step 8.

**Check for a previous audit** in `.mabl/audit/<workspace-name>/`. If one is
there, read its measurement header — that makes this a comparison run, and
`references/report-template.md` has the rules for what may and may not be
compared.

### 2. Build the inventory (CLI)

```bash
mabl tests list    -w <workspaceId> -o json -l 100000
mabl plans list    -w <workspaceId> -o json -l 100000
mabl users list    -w <workspaceId> -o json -l 200
mabl branches list -w <workspaceId> -o json -l 100000 -s open
mabl flows list    -w <workspaceId> -l 100000
```

`--limit` defaults to **10** on every one of these. A run without it silently
returns ten rows and every finding computed from it is wrong. Pass a limit
larger than the workspace could hold, check the returned count against the size
the user gave in step 1, and say both numbers in the report.

**`mabl users list` rejects a limit that is too large.** Measured 2026-08-27:
`-l 500` returns `Bad Request`, `-l 200` works. If 200 also fails, halve until it
succeeds and report the limit that worked — and if the returned count equals the
limit, the list is truncated, which invalidates the ownership finding rather
than producing departures from it.

Field notes, because the gaps drive later steps:

- **Tests** carry `id`, `name`, `enabled`, `created_time`, `last_updated_time`,
  `created_by_user`, `last_updated_by_user`. Not labels, type, application, or
  description.
- **Branches** carry `status`, `created_time`, `created_by_id`, and sometimes
  `entities[]` — the tests and flows stranded on the branch. The key is often
  **absent entirely**, and absent is not empty: report "no entities reported",
  never "nothing stranded", and say how many records carried the key at all.
- **Flows**: probe `--output` as shown in Prerequisites. Where the flag exists,
  use JSON. Where it does not, the command prints a table and nothing else —
  strip ANSI codes and read the `-f` ids out of it, and if that parse yields
  fewer ids than the table has rows, report the flow inventory as unavailable
  and skip every flow finding. Do not estimate it.

Then describe every plan, which is the only way to see its triggers and its
member tests:

```bash
mabl plans describe <planId> -o json
```

One call per plan, at the pacing above. If the API starts rejecting calls, stop,
report how many plans were described out of how many, and treat every
plan-derived finding as partial. A partial plan sweep makes "in no plan" unsafe
— say so rather than reporting it.

Keep from each plan: `enabled`, `triggers`, `test_invariant_ids`, `labels`,
`application_id`, `last_updated_time`.

**Two plan fields are omitted rather than falsey, and they behave oppositely
(verified 2026-08-27).** `enabled` is absent from `plans list` and present in
`plans describe` — read the list's silence as `false` and every plan reports as
disabled, so take it from the describe. `triggers` is absent from the describe
when a plan has none, so there **absent is the finding**, not a gap to file
unverified. Settle any absent field this way: find one entity that has the thing
and confirm the key appears for it.

**An empty or near-empty workspace is itself the finding.** Report it as one and
stop; do not pad a report to look thorough.

### 3. Build the activity index (MCP)

You need, per test, the newest run in the window and the run durations. There are
two lanes, and the workspace's run volume decides which one works. **Start Lane A
and let it choose for you** — there is no way to sample the middle of the result
set, because the cursor is opaque and cannot be treated as an offset.

**Lane A — page the whole window.**

- `workspaceId`, `startTimeMs` = window start, `endTimeMs` = now, `limit: 100`,
  then pass the returned `cursor` back unchanged.
- Treat `cursor` as opaque. It can come back looking like a small integer; it is
  not a page number and not a remaining count.
- **Bound the paging at 200 pages — 20,000 runs.** If the cursor is still live
  there, this workspace is Lane B. Discard the partial index, switch, and say in
  the report that the switch happened and at what point.

**Lane B — one call per test.** One `list_mabl_test_run_summaries` per test id,
`testId` set, the same window, and `limit: 1` — you want that test's newest run
in the window and nothing else. It costs one call per test; quote that number
before starting.

Lane B is not a reduction — it establishes the newest run for **every** test,
where a truncated Lane A establishes it for none. A 200-page sweep of a
workspace holding half a million runs covers the most recent day or two and
marks nearly everything dormant, which reads as a finding rather than the
failure it is.

Whichever lane ran, on every call:

- **`excludeDefaultTests: false`.** It defaults to `true`, and with the default
  the runs of mabl's own default tests never appear — so those tests look
  dormant when they are not. Include their *runs*; exclude the tests themselves
  from pass-rate and naming findings, where they are noise.
- Pace at the rate above.

**Durations differ by lane, and the report records which lane ran.** Lane A gives
many runs per test, so a real per-test distribution. Lane B at `limit: 1` gives
**one sample per test** — the ranking of outliers survives that, an individual
test's exact seconds does not.

This index is the only honest source for "did it run". Do not compute activity
from the quality report — that report counts *plan* runs only, so a test run on
demand or from CI outside a plan does not appear in it at all.

### 4. Read quality and labels (MCP)

**Quality.** Page `get_test_quality_report` with the same window, `limit: 100`
plus `cursor`, at the pacing above. Take `pass_rate`, `flake_rate`,
`breakage_rate`, `quality_score`, and `total_plan_runs` per test. **Bound this
paging at 50 pages — 5,000 tests.** If the cursor is still live there, stop and
report quality as a partial sweep in the Unverified section; a quality report
covering part of a catalogue cannot be ranked against the whole of it.

Set `minPlanRuns` explicitly and report the value. It defaults to **5** on the
server and silently drops every test below the threshold — which is precisely
the dormant population this audit is about. `minPlanRuns: 1` includes them;
whatever you choose, the reader has to see the number to know who was excluded.

The report's numbers are the product's canonical formulas. Use them as returned;
do not re-derive a pass rate from raw runs.

**Labels.** `list_mabl_tests` returns labels but **caps at 200 tests, and the cap
cannot be raised — there is no cursor.** Do not use it as an inventory. Use it
the way it works — ask a label question and get an answer:

- `labels: ["<label>"]` to list the members of one label.
- `excludeLabels: [...]` to find tests carrying none of a known set.

If the workspace holds 200 tests or fewer, one call does give every test with
its labels, and it is worth making. Say which of the two cases applied. Plan
labels always come from step 2 and are never subject to this cap.

### 5. Flow usage — costed, and optional

One call per flow. Say what that costs before starting, and let the user decline.

For each flow id from step 2, call `list_mabl_tests_using_flow` with `limit: 1`,
at the pacing above. An empty first page means no test on that branch references
the flow. That is the unused-flow finding, and on a workspace with a thousand
flows it is a thousand calls — quote that number to the user first.

The index is **per branch** and defaults to `master`. A flow used only by tests
on a feature branch reads as unused here. Say which branch was indexed.

### 6. Derive the findings

`references/findings.md` holds the exact derivation for each one, the severity
bands, the escalation triggers, and what each signal cannot see. Read it before
writing the report.

| Finding | Derived from |
|---|---|
| Plan enabled with no triggers | plan `enabled` and `triggers` |
| Plan disabled | plan `enabled` |
| Plan below the agreed label minimum | plan `labels` |
| Test in no plan | inventory ids minus every plan's `test_invariant_ids` |
| Disabled test still in a plan | test `enabled` and plan membership |
| No run in the window | inventory ids minus the activity index |
| Consistently failing vs flaky | quality report, as two separate populations |
| Long-running tests | run durations from the activity index |
| Unused flow | empty `list_mabl_tests_using_flow` first page |
| Stale open branch | branch `status` and `created_time` |
| Naming drift | test `name` against the agreed pattern |
| Label hygiene | plan and test labels: blanks, casing collisions, near-duplicates |
| Owner no longer a workspace member | `created_by_user.id` against `users list` |
| Duplicate or near-duplicate names | inventory `name` |

Several of these are inferences, never verdicts, and must be labelled as such
wherever they appear: duplicate names are a prompt to look; an owner missing
from the user list may have changed workspaces rather than left; a "violation"
of a naming pattern nobody agreed is not a violation at all.

**Then, after the ranking, and only for the tests it ranked High:** call
`get_mabl_test` per test to check for a description, at the pacing above. This
comes after the ranking because it is scoped *by* the ranking — a dormant test's
missing description costs nobody anything, while a live failing test's does.
One call per flagged test; say the scope you used, and let the user decline it.

### 7. Write the report

Write to `.mabl/audit/<workspace-name>/<YYYY-MM-DD>/report.md`, with the rows in
CSVs beside it. Nowhere else, unless the user names a path.
`references/report-template.md` owns the file list, the header fields, the
effort tags, and the comparison rules — follow it, because a comparison run
reads those files back by name.

Two things that file will insist on and that are easy to skip:

**Open with what was measured, before any finding** — the window and its epoch
bounds, the counts actually retrieved against the limits used and against the
size the user expected, the `minPlanRuns`, which activity lane ran, the branch
the flow index covered, and **every partial sweep and closed lane by name**,
with the findings each one weakened.

**"Unverified" is a real outcome.** A finding whose lane was closed or whose
sweep was partial goes in its own section, never folded into the ranked list as
though it were established.

### 8. Quarantine, only when asked

Stop after step 7 and let the user read it. If step 1 established that a cleanup
may be staged, quarantine is the reversible half: **label, then disable.**

Confirm the exact set first. Show the count and the list, name the label, and
get an explicit yes. Nothing here runs off the back of the report alone, and
nothing runs off an instruction given before the report existed either — the set
is only nameable once the findings are.

**Use the name the user chose in step 1.** Where they had no preference, the
default is a label unique to the run that wrote it:

    <disposition>-audit-<YYYY-MM-DD>        e.g. quarantine-audit-2026-08-27

The disposition says what was decided, the date says which pass decided it. That
pairing is what makes the label undoable months later by someone who was not
there: it selects exactly one audit's set and nothing else. A bare `quarantine`
does not — it accumulates every pass anyone ever ran, and once two sets share a
label there is no query that separates them again.

If the user names something else, use theirs. Say the uniqueness argument once,
apply their answer either way, and record the label in the report so the undo
instruction in step 9 names the right thing.

A label is cheap to add and cheap to remove, which is exactly why the naming has
to be disciplined: the cost of a bad one is never the writing, it is that the
set it named can no longer be recovered.

**Re-check the label is unused** with `list_mabl_tests` and
`labels: ["<the label>"]`, even though step 1 already did — time has passed and
another pass may have taken the name. Any result at all means stop and ask. Do
not merge into it, and do not silently pick the next date.

**Write the ledger before the first edit, not after.** Put the whole intended set
in `.mabl/audit/<workspace-name>/<YYYY-MM-DD>/quarantined.csv` with a `status`
column reading `intended`, then update each row to `confirmed` or `unconfirmed`
as the read-back resolves it. A run interrupted halfway has then left a complete
list of what it attempted — which is the only thing that makes step 9's undo
possible from the outside. A ledger written at the end exists exactly when it is
no longer needed.

Per test, one `edit_mabl_test_metadata` call carrying both operations, so they
save atomically:

- add label `<the agreed label>`
- set enabled `false`

Pace at the rate above. Stop on the first repeated refusal rather than retrying
a loop.

Read the result back before reporting success. A quarantine that reports done
without the label having landed is the failure this step exists to avoid:

- `list_mabl_tests` with `labels: ["<the label>"]` returns the members. Compare
  that set against the set you intended.
- **That read-back caps at 200, same as every other `list_mabl_tests` call.** If
  it returns 200 it is saturated and has confirmed nothing about the rest — do
  **not** report the remainder as failed. Confirm the tail with `get_mabl_test`
  per test, one call each, and say what that costs. Better still, keep a
  quarantine set under 200 so one query settles it; a larger set is usually two
  decisions wearing one label.
- Report the difference explicitly. Every id you meant to quarantine and did
  not, listed by id, is part of the outcome — not a retry to bury.

Plans, flows and branches have no quarantine here. Flows and branches have no
disable at all, and this skill does not edit plans — all three stay report-only
and their disposition is entirely the user's.

### 9. Hand off the window and the removal

Say these three things and stop:

1. **The observation window is a real wait.** Nothing is proven until the
   workspace has run its normal schedule at least once — for most teams a
   release cycle, not a day. Give the user the date to come back on, computed
   from the cycle they describe.
2. **Undoing is one call per test**, using `quarantined.csv`: the same
   `edit_mabl_test_metadata` with enabled `true` and the label removed. Anything
   someone missed comes straight back. Give them the label verbatim — dated to
   this run, it selects this audit's set and no other, which is what lets
   somebody who wasn't here undo it cleanly months from now.
3. **Deleting is theirs, in the mabl app.** The list to work from is
   `quarantined.csv`, filtered to rows marked `confirmed` whose observation
   window has passed and which nobody re-enabled. Name that file and that
   filter. Do not offer to do it, and do not describe a route that would let an
   agent do it.

---

## Signals that lie

- **"Never ran" is not observable.** The activity index is windowed. Every
  dormancy finding says *no run since `<date>`*, never *never run*.
- **A truncated run sweep looks exactly like a dormant workspace.** Both produce
  "no run found". Only the page count tells them apart, which is why Lane A has
  a bound and announces when it hits one.
- **A quality report absence is not a dormancy signal.** `minPlanRuns` excludes
  low-run tests, and the report only counts plan runs. A test missing from it
  may have run a hundred times outside a plan.
- **`enabled: true` does not mean it runs.** A test enabled but in no plan, or
  in a plan with no triggers, runs only when someone presses a button.
- **`enabled: false` does not mean it is dead.** Teams disable tests as a
  temporary pause. A disabled test that is otherwise healthy is a question, not
  a finding.
- **`last_updated_time` is not usage.** It moves on a rename or a label change,
  and an auto-heal moves it without anyone deciding anything.
- **An absent field means whatever that field means, and you have to check.**
  A branch with no `entities` key has not been shown to strand nothing. A plan
  with no `triggers` key has no triggers. Same shape, opposite answers, and
  guessing either way invents a finding or discards a real one.
- **An empty used-by page is per branch.** It means unused *on the branch you
  indexed*, which defaults to `master`.
- **A refused call is not an absent server**, and a lane closing on one tool
  says nothing about another.
- **Raisable defaults and a hard cap look alike, and are not.** `10` on the CLI
  lists, `100` on the paged MCP reports and `20` on `list_mabl_tests_using_flow`
  are defaults — raise them. The `200` on `list_mabl_tests` is a **cap** with no
  cursor: a returned count of exactly 200 is a truncation to work around, not a
  limit you forgot to set.
- **The inventory covers the default branch.** Tests that exist only on a mabl
  branch are outside it — the open-branch list from step 2 is what names them.
