---
name: mabl-workspace-audit
description: |
  Audit ONE mabl workspace for cleanliness, then stage a REVERSIBLE cleanup.
  Builds a complete inventory and reports what the workspace has stopped using
  or never governed: tests with no run in the window, tests in no plan, plans
  enabled with no trigger, failing and flaky tests, unused reusable flows, stale
  branches, naming and label drift, and entities whose owner has left. Ranks
  findings by cost, and on request quarantines them — a dated label plus
  disable, both undoable. Re-run it later and it diffs against the last report.
  It never deletes, runs, or creates anything. No surface an agent can reach
  deletes a test or undoes a delete, so removal stays a human action in the app.
  Fire on "audit my workspace", "workspace audit", "workspace cleanup", "which
  tests aren't running", "we have thousands of tests/flows we don't need", or
  "/mabl-workspace-audit".
  For ONE failing run use mabl-debug. To change ONE test use mabl-test-edit.
allowed-tools: Bash, Read, Write, mcp__mabl__list_mabl_tests, mcp__mabl__list_mabl_test_run_summaries, mcp__mabl__get_test_quality_report, mcp__mabl__list_mabl_tests_using_flow, mcp__mabl__get_mabl_test, mcp__mabl__edit_mabl_test_metadata, mcp__mabl__edit_mabl_plan
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
  test or a plan is MCP-only — the CLI's `edit-metadata` commands change labels
  and nothing else.

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
mabl tests list --help | grep -qw -- --output || echo "this CLI's tests list has no --output; stop and say so"
```

If the `mabl` MCP tools are absent from your tool list, the server is not
connected. Say which server is missing and stop — do not substitute the CLI for
the MCP-only steps, because it cannot perform them.

## What this skill will not do

**It never deletes anything, and it never asks to.**

That is not caution for its own sake. There is no delete for a test, plan, flow,
or DataTable on either the CLI or the MCP server, and there is no undelete on
either. `restore_mabl_test` restores a *version* of a test that still exists; it
does not bring back a deleted one. So an agent that deleted something could not
put it back, and neither could this skill.

**It never runs a test and never creates one.** An audit that starts cloud runs
changes the very activity data it is measuring, and bills the workspace for the
privilege. Read, report, and — when asked — label and disable. Nothing else.

It also cannot see a workspace's activity log. Who deleted what, and when, is
not readable from any surface here. If the audit is wrong about a test, the
record that would settle it is in the mabl app, not in anything this skill read.

The removal step therefore belongs to a person, in the mabl app, after the
quarantine window has passed. Report that as the hand-off. Never simulate it.

## Workflow

Steps 1–5 gather, 6–7 report, 8–9 act. Steps 8 and 9 only happen if the user
asks for them after reading the report.

Tell the user up front what the sweep costs: on a workspace of a few thousand
tests, steps 2–5 are several hundred to a few thousand API calls and take
minutes, not seconds. It is all read-only.

### 1. Fix the scope and the conventions

**The workspace id (`-w`) is input.** If the user has not given one, ask for it
and stop until they do — do not pick a default, and do not go looking for one.
An audit can end in tests being disabled; running it against a workspace nobody
named is the one mistake here that costs someone else time to undo. If the user
doesn't know their id, `mabl workspaces list` prints `name — id`.

Then agree two numbers with the user and record them in the report, because
every finding below is read against them:

- **The dormancy window** — how far back to look for runs. Default 90 days.
- **Today's date**, resolved to epoch milliseconds, as the window's end.

Both are stated, not implied. A test that last ran 100 days ago is dormant at a
90-day window and healthy at a 180-day one, and the reader cannot check the
finding without the number.

**Then ask for the workspace's own conventions**, because several findings are
meaningless without them. A naming violation is only a violation against a
naming rule, and every team has a different one.

If the user has these written down, ask for the path and read it. Otherwise ask
directly, and accept "we don't have one" for any of them — a convention nobody
agreed is not a finding:

| Ask | Used by |
|---|---|
| Test naming pattern, and any status prefix that means work-in-progress | naming drift; excluding WIP from pass-rate findings |
| Which labels are governance (team, suite, application) vs ad-hoc | label hygiene |
| Minimum labels a plan should carry | plan label coverage |
| Pass-rate floor, and any flake threshold they already use | severity banding |
| Anything already known to be exempt | every finding |

Save the answers to `.mabl/audit/conventions.md` and read that file first on the
next run, confirming it with the user rather than re-asking. Where the user has
no convention, record *that* — "no naming pattern agreed" is what stops the next
run inventing one.

**Check for a previous audit.** If `.mabl/audit/` already holds a report, read
its measurement header. That makes this a comparison run — see
`references/report-template.md` for how the deltas are computed and what may not
be compared.

### 2. Build the inventory (CLI)

```bash
mabl tests list    -w <workspaceId> -o json -l 100000
mabl plans list    -w <workspaceId> -o json -l 100000
mabl users list    -w <workspaceId> -o json -l 1000
mabl branches list -w <workspaceId> -o json -l 1000 -s open
mabl flows list    -w <workspaceId> -l 100000
```

`--limit` defaults to **10** on every one of these. A run without it silently
returns ten rows and every finding computed from it is wrong. Pass a limit
larger than the workspace could hold, then check the returned count against what
the user expects the workspace to contain, and say the number in the report.

For `mabl plans list`, `--limit` is the number of plans fetched *before* label
filtering, so never combine a `--labels` filter with a small limit.

Field notes, because the gaps drive later steps:

- **Tests** carry `id`, `name`, `enabled`, `created_time`, `last_updated_time`,
  `created_by_user`, `last_updated_by_user`. Not labels, type, application, or
  description.
- **Branches** carry `status`, `created_time`, `created_by_id`, and `entities[]`
  — the tests and flows stranded on the branch.
- **Flows** have **no `--output` flag**: the command prints a table and nothing
  else. Strip ANSI codes and read the `-f` ids out of it. If that parse yields
  no ids, or fewer than the row count, report the flow inventory as unavailable
  and skip every flow finding. Do not estimate it.

Then describe every plan, which is the only way to see its triggers and its
member tests:

```bash
mabl plans describe <planId> -o json
```

One call per plan. Run them in small batches with a short pause between batches
rather than all at once. If the API starts rejecting calls, stop, report how
many plans were described out of how many, and treat every plan-derived finding
as partial. A partial plan sweep makes "in no plan" unsafe — say so rather than
reporting it.

Keep from each plan: `enabled`, `triggers`, `test_invariant_ids`, `labels`,
`application_id`, `last_updated_time`.

**An empty or near-empty workspace is itself the finding.** Report it as one and
stop; do not pad a report to look thorough.

### 3. Build the activity index (MCP)

Page `list_mabl_test_run_summaries` across the whole window and collect, per
`testId`, the newest run start and the run durations.

- `workspaceId`, `startTimeMs` = window start, `endTimeMs` = now.
- `limit: 100`, then pass the returned `cursor` back unchanged.
- **`excludeDefaultTests: false`.** It defaults to `true`, and with the default
  the runs of mabl's own default tests never appear — so those tests look
  dormant when they are not. Include their *runs* here; exclude the tests
  themselves from pass-rate and naming findings, where they are noise.
- Treat `cursor` as opaque. It can come back looking like a small integer; it is
  not a page number or a remaining count.
- **Bound the paging at 200 pages.** If the cursor is still live at that point,
  stop, report how many runs were indexed and what period they actually span,
  and mark every dormancy finding partial. Do not keep paging silently.

This index is the only honest source for "did it run". Do not compute activity
from the quality report — that report counts *plan* runs only, so a test run on
demand or from CI outside a plan does not appear in it at all.

### 4. Read quality and labels (MCP)

**Quality.** Page `get_test_quality_report` with the same window (`limit: 100`
plus `cursor`). Take `pass_rate`, `flake_rate`, `breakage_rate`,
`quality_score`, and `total_plan_runs` per test.

Set `minPlanRuns` explicitly and report the value. It defaults to **5** on the
server and silently drops every test below the threshold — which is precisely
the dormant population this audit is about. `minPlanRuns: 1` includes them;
whatever you choose, the reader has to see the number to know who was excluded.

The report's numbers are the product's canonical formulas. Use them as returned;
do not re-derive a pass rate from raw runs.

**Labels.** `list_mabl_tests` returns labels but caps at **200 tests and has no
cursor**, so on a large workspace it cannot enumerate the catalog. Do not use it
as an inventory. Use it the way it works — ask a label question and get an
answer:

- `labels: ["<label>"]` to list the members of one label.
- `excludeLabels: [...]` to find tests carrying none of a known set.

If the workspace holds 200 tests or fewer, one call does give every test with
its labels, and it is worth making. Say which of the two cases applied. Plan
labels always come from step 2 and are never subject to this cap.

### 5. Flow usage and descriptions — costed, and optional

Both of these are one call per entity. Say what they cost before starting, and
let the user decline either.

**Flow usage.** For each flow id from step 2, call `list_mabl_tests_using_flow`
with `limit: 1`. An empty first page means no test on that branch references the
flow. That is the unused-flow finding, and on a workspace with a thousand flows
it is a thousand calls — quote that number to the user first.

The index is **per branch** and defaults to `master`. A flow used only by tests
on a feature branch reads as unused here. Say which branch was indexed.

**Descriptions.** `get_mabl_test` is the only source of a test's description,
one call per test. Do not sweep the whole catalog for it. Scope it to the tests
already flagged high in step 6 — a dormant test's missing description costs
nobody anything, while a live failing test's does. Report the scope you used.

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
| Missing description | `get_mabl_test`, on the flagged subset only |
| Owner no longer in the workspace | `created_by_user.id` against `users list` |
| Duplicate or near-duplicate names | inventory `name` |

Several of these are inferences, never verdicts, and must be labelled as such
wherever they appear: duplicate names are a prompt to look; an owner missing
from the user list may have changed workspaces rather than left; a "violation"
of a naming pattern nobody agreed is not a violation at all.

### 7. Write the report

Write to `.mabl/audit/<workspace-name>-<YYYY-MM-DD>/report.md`, with the
per-finding rows in sibling CSVs in the same directory so they can be sorted and
shared. Nowhere else, unless the user names a path.
`references/report-template.md` has the structure, the effort tags, and the
comparison rules.

Two things that section will insist on and that are easy to skip:

**Open with what was measured, before any finding** — the window and its epoch
bounds, the counts actually retrieved against the limits used, the
`minPlanRuns`, the branch the flow index covered, and **every partial sweep and
closed lane by name**, with the findings each one weakened.

**"Unverified" is a real outcome.** A finding whose lane was closed or whose
sweep was partial goes in its own section, never folded into the ranked list as
though it were established.

### 8. Quarantine, only when asked

Stop after step 7 and let the user read it. If they want a cleanup staged,
quarantine is the reversible half: **label, then disable.**

Confirm the exact set first. Show the count and the list, name the label, and
get an explicit yes. Nothing here runs off the back of the report alone.

Per test, one `edit_mabl_test_metadata` call carrying both operations, so they
save atomically:

- add label `audit-quarantine-<YYYY-MM>`
- set enabled `false`

Per plan, `edit_mabl_plan` with a disable operation. Removing a test from a plan
is also available there, but prefer disabling the test over editing plans:
emptying a plan's last stage is rejected outright, and a plan edit is harder for
the user to read back later than a label.

Pace the calls. This is a per-identity rate-limited server; run them in small
batches with a pause between batches. Stop on the first repeated rejection
rather than retrying a loop.

Read the result back before reporting success. A quarantine that reports done
without the label having landed is the failure this step exists to avoid:

- `list_mabl_tests` with `labels: ["audit-quarantine-<YYYY-MM>"]` returns the
  members. Compare that set against the set you intended.
- Report the difference explicitly. Every id you meant to quarantine and did
  not, listed by id, is part of the outcome — not a retry to bury.

Write the confirmed set to
`.mabl/audit/<workspace-name>-<YYYY-MM-DD>/quarantined.csv`. That file is what
makes the next two steps possible.

Flows and branches have no quarantine. There is no disable for either, so both
stay report-only and their disposition is entirely the user's.

### 9. Hand off the window and the removal

Say these three things and stop:

1. **The observation window is a real wait.** Nothing is proven until the
   workspace has run its normal schedule at least once — for most teams a
   release cycle, not a day. Give the user the date to come back on, computed
   from the cycle they describe.
2. **Undoing is one call per test**, using `quarantined.csv`: the same
   `edit_mabl_test_metadata` with enabled `true` and the label removed. Anything
   someone missed comes straight back.
3. **Deleting is theirs, in the mabl app.** Name the file that lists what to
   delete. Do not offer to do it, and do not describe a route that would let an
   agent do it.

---

## Signals that lie

- **"Never ran" is not observable.** The activity index is windowed. Every
  dormancy finding says *no run since `<date>`*, never *never run*.
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
- **An empty used-by page is per branch.** It means unused *on the branch you
  indexed*, which defaults to `master`.
- **A default limit is a silent truncation.** `10` on the CLI lists, `200` on
  `list_mabl_tests`, `100` on the paged MCP reports, `20` on
  `list_mabl_tests_using_flow`. A count that matches the limit exactly is the
  tell.
- **The inventory covers the default branch.** Tests that exist only on a mabl
  branch are outside it — the open-branch list from step 2 is what names them.
