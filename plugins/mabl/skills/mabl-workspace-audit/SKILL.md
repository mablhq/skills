---
name: mabl-workspace-audit
description: |
  Audit ONE mabl workspace for cleanliness, then stage a REVERSIBLE cleanup.
  Builds a complete inventory and reports what a workspace has stopped using:
  tests with no run in the window, tests in no plan, enabled plans with no
  triggers, low pass-rate and flaky tests, and entities whose owner has left
  the workspace. Ranks findings high/medium/low, and on request quarantines
  them — a label plus disable, both undoable.
  It never deletes. No mabl surface an agent can reach deletes a test or undoes
  a delete, so the last step stays a human action in the mabl app.
  Fire on "audit my workspace", "workspace audit", "workspace cleanup", "clean
  up our mabl workspace", "which tests aren't running", "we have thousands of
  tests/flows we don't need", or "/mabl-workspace-audit".
  For ONE failing run use mabl-debug. To change ONE test use mabl-test-edit.
  For first-time project setup use mabl-init.
allowed-tools: Bash, Write, mcp__mabl__list_mabl_tests, mcp__mabl__list_mabl_test_run_summaries, mcp__mabl__get_test_quality_report, mcp__mabl__edit_mabl_test_metadata, mcp__mabl__edit_mabl_plan
---

# mabl workspace audit

Take a workspace id and report what it has stopped using, ranked by how much
the clutter costs. Then, only if asked, quarantine the agreed set reversibly so
the workspace can prove nothing broke before anyone removes anything.

The workspace is the input. This skill does not choose which workspace to audit.

## Prerequisites

This skill drives **two** surfaces, and needs both.

- The **`mabl` CLI**, for the inventory. It is the only surface that enumerates
  every test in a workspace and the only one that reports who created a test
  and when it was last touched.
- The hosted **`mabl` MCP server** (bundled with this plugin), for run activity,
  quality metrics, labels, and the quarantine edits. Disabling a test or a plan
  is MCP-only — the CLI's `edit-metadata` commands change labels and nothing
  else.

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

That is not caution for its own sake. There is no delete for a test, plan,
flow, or DataTable on either the CLI or the MCP server, and there is no undelete
on either. `restore_mabl_test` restores a *version* of a test that still exists;
it does not bring back a deleted one. So an agent that deleted something could
not put it back, and neither could this skill.

It also cannot see a workspace's activity log. Who deleted what, and when, is
not readable from any surface here. If the audit is wrong about a test, the
record that would settle it is in the mabl app, not in anything this skill read.

The removal step therefore belongs to a person, in the mabl app, after the
quarantine window has passed. Report that as the hand-off. Never simulate it.

## Workflow

Steps 1–4 gather, 5–6 report, 7–8 act. Steps 7 and 8 only happen if the user
asks for them after reading the report.

Tell the user up front what the sweep costs: on a workspace of a few thousand
tests, steps 2–4 are several hundred API calls and take a few minutes. It is all
read-only.

### 1. Fix the scope

**The workspace id (`-w`) is input.** If the user has not given one, ask for it
and stop until they do — do not pick a default, and do not go looking for one.
An audit can end in tests being disabled; running it against a workspace nobody
named is the one mistake here that costs someone else time to undo. If the user doesn't know their id,
`mabl workspaces list` prints `name — id` for the ones they can reach.

Then agree two numbers with the user and record them in the report, because
every finding below is read against them:

- **The dormancy window** — how far back to look for runs. Default 90 days.
- **Today's date**, resolved to epoch milliseconds, as the window's end.

Both are stated, not implied. A test that last ran 100 days ago is dormant at a
90-day window and healthy at a 180-day one, and the reader cannot check the
finding without the number.

### 2. Build the inventory (CLI)

```bash
mabl tests list -w <workspaceId> -o json -l 100000
mabl plans list -w <workspaceId> -o json -l 100000
mabl users list -w <workspaceId> -o json -l 1000
```

`--limit` defaults to **10** on every one of these. A run without it silently
returns ten rows and every finding computed from it is wrong. Pass a limit
larger than the workspace could hold, then check the returned count against what
the user expects the workspace to contain, and say the number in the report.

For `mabl plans list`, `--limit` is the number of plans fetched *before* label
filtering, so never combine a `--labels` filter with a small limit.

Each test row carries `id`, `name`, `enabled`, `created_time`,
`last_updated_time`, `created_by_user`, and `last_updated_by_user`. It does
**not** carry labels, type, or application — step 4 covers labels.

Then describe every plan, which is the only way to see its triggers and its
member tests:

```bash
mabl plans describe <planId> -o json
```

That is one call per plan. Run them in small batches with a short pause between
batches rather than all at once, and if the API starts rejecting calls, stop,
report how many plans were described out of how many, and treat every
plan-derived finding below as partial. A partial plan sweep makes "in no plan"
unsafe — say so rather than reporting it.

Keep from each plan: `enabled`, `triggers`, `test_invariant_ids`, `labels`,
`application_id`, `last_updated_time`.

### 3. Build the activity index (MCP)

Page `list_mabl_test_run_summaries` across the whole window and collect the set
of `testId` values that appear, with the newest `startTime` for each.

- `workspaceId`, `startTimeMs` = window start, `endTimeMs` = now.
- `limit: 100`, then pass the returned `cursor` back unchanged.
- **`excludeDefaultTests: false`.** It defaults to `true`, and with the default
  the runs of mabl's own default tests never appear — so those tests look
  dormant when they are not.
- Treat `cursor` as opaque. It can come back looking like a small integer; it is
  not a page number or a remaining count.
- **Bound the paging at 200 pages.** If the cursor is still live at that point,
  stop, report how many runs were indexed and over what period they actually
  span, and mark every dormancy finding partial. Do not keep paging silently.

This index is the only honest source for "did it run". Do not compute activity
from the quality report — that report counts *plan* runs only, so a test run
on demand or from CI outside a plan does not appear in it at all.

### 4. Read quality and labels (MCP)

**Quality.** Page `get_test_quality_report` with the same window
(`limit: 100` plus `cursor`). Take `pass_rate`, `flake_rate`, `breakage_rate`,
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
its labels, and it is worth making. Say which of the two cases applied.

### 5. Derive the findings

Compute each finding from the sets above. `references/findings.md` holds the
exact derivation, the ranking rule, and what each signal cannot see — read it
before writing the report.

The findings, cheapest evidence first:

| Finding | Derived from |
|---|---|
| Plan enabled with no triggers | plan `enabled` and `triggers` |
| Plan disabled | plan `enabled` |
| Test in no plan | inventory ids minus the union of every plan's `test_invariant_ids` |
| Disabled test still in a plan | test `enabled` and plan membership |
| No run in the window | inventory ids minus the activity index |
| Low pass rate / flaky | quality report |
| Owner no longer in the workspace | test `created_by_user.id` against `users list` |
| Duplicate or near-duplicate names | inventory `name` |

Two of these are inferences and must be labelled as such wherever they appear:
duplicate names are a prompt to look, not a verdict, and an owner missing from
the user list may have changed workspaces rather than left.

### 6. Write the report

Write to `.mabl/audit/<workspace-name>-<YYYY-MM-DD>/report.md`, and put the
per-finding rows in sibling CSVs in the same directory so they can be sorted and
shared. Nowhere else, unless the user names a path.

Open the report with what was measured, before any finding:

- Workspace name and id; the date; the dormancy window in days and its two
  epoch bounds.
- Counts actually retrieved: tests, plans, plans successfully described, run
  rows indexed, pages fetched, users.
- The `minPlanRuns` used.
- **Every partial sweep and closed lane, named.** A step that hit its bound, a
  plan describe that failed, an MCP tool that was absent — each one, with the
  findings it weakened.

Then the findings, ranked high / medium / low, each row carrying the entity
name, its id, the evidence that produced it, and a suggested disposition. Rank
by what the clutter costs the workspace, not by how many rows a category has —
`references/findings.md` gives the rule.

Then, last, the questions the data cannot answer, as questions for the user. A
test in no plan that a person still runs by hand is not dead, and nothing this
skill read can tell the difference. Ask; do not guess.

**"Unverified" is a real outcome.** A finding whose lane was closed or whose
sweep was partial is reported as unverified, in its own section. It is never
folded into the ranked list as though it were established.

### 7. Quarantine, only when asked

Stop after step 6 and let the user read it. If they want a cleanup staged,
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

### 8. Hand off the window and the removal

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
- **A default limit is a silent truncation.** `10` on the CLI lists, `200` on
  `list_mabl_tests`, `100` on the paged MCP reports. A count that matches the
  limit exactly is the tell.
- **The inventory covers the default branch.** Tests that exist only on a mabl
  branch are outside it. Say so rather than reporting a branch's tests missing.
