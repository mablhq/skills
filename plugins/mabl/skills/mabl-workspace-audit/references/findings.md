# Finding derivations

The mechanics behind step 6 of `SKILL.md`: how each finding is computed, what it
cannot see, and how it is ranked.

## The sets

| Set | Source | Keyed by |
|---|---|---|
| `TESTS` | `mabl tests list -o json` | test id (`-j`) |
| `PLANS` | `mabl plans list` + `mabl plans describe` per plan | plan id (`-p`) |
| `USERS` | `mabl users list -o json` | user id |
| `BRANCHES` | `mabl branches list -o json -s open` | branch id (`-br`) |
| `FLOWS` | `mabl flows list`, ids parsed from the table | flow id (`-f`) |
| `RAN` | paged `list_mabl_test_run_summaries` | test id → newest start, durations |
| `QUALITY` | paged `get_test_quality_report` | test id → rates |

`PLAN_MEMBERS` is the union of every plan's `test_invariant_ids`. It is only
usable if **every** plan was described. If any describe failed, `PLAN_MEMBERS`
is a subset, and everything derived from it under-reports membership — which
means it over-reports "in no plan". Report those findings as unverified instead.

## Plan findings

### Plan enabled with no triggers

`PLANS` where `enabled == true` and `triggers` is empty.

The plan is on, so it reads as live in the app, but nothing starts it. Its tests
run only when someone presses a button. Usually the cheapest real finding in a
workspace and the one most likely to explain "why isn't this running".

Blind spot: a plan may be started by something the plan object does not carry —
a CI job hitting the API, a deployment event routed elsewhere. Check `RAN` for
its member tests before calling it dead; recent runs mean something starts it.

### Plan disabled

`PLANS` where `enabled == false`.

Interesting mainly for what it drags with it: every test whose only plan
membership is a disabled plan is dormant by construction. Compute that set and
report it *with the plan*, not as separate dormant tests. One disabled plan
explains all of them, and that is one decision for the user instead of many.

### Plan below the agreed label minimum

`PLANS` whose `labels` count is under the minimum from step 1.

Only a finding if the user gave a minimum. Without one, report the distribution
— how many plans carry 0, 1, 2, more — and let them set the bar. A plan with no
labels at all is worth naming either way: it cannot be found by any label filter,
which is how most teams select plans in bulk.

## Test findings

### Test in no plan

`TESTS` minus `PLAN_MEMBERS`.

A test no plan contains cannot be started by any trigger. Combined with "no run
in the window" this is the strongest evidence a test is unused.

Blind spot: on-demand and CI-invoked runs do not need plan membership. A test in
no plan that appears in `RAN` is in active use — report it as *run outside any
plan*, a different and much softer finding.

### Disabled test still in a plan

`TESTS` where `enabled == false`, intersected with `PLAN_MEMBERS`.

A disabled test in a live plan is a coverage gap wearing a plan's clothes: the
plan reports green while the test contributes nothing. Every one deserves a
named owner and a decision — re-enable, or remove from the plan and retire.

### No run in the window

`TESTS` minus the key set of `RAN`. Always phrased as *no run since `<window
start date>`*, never *never run*.

Blind spot: `excludeDefaultTests` defaults to `true` on the run query. If step 3
ran without setting it to `false`, mabl's default tests appear here wrongly.
That is a bug in the sweep, not a finding.

### Consistently failing vs flaky

Two distinct populations from `QUALITY`. Mixing them produces bad advice, so
report them as separate sections.

- **Low `pass_rate`, low `flake_rate`** — consistently failing. Either the app
  changed and nobody updated the test, or it is finding a real defect nobody has
  triaged. A fix-or-retire decision.
- **High `flake_rate`** — passing and failing over the same code. A reliability
  problem in the test. Deleting it deletes the coverage along with the noise.

Band the failing population by pass rate, and use the user's floor from step 1
if they gave one. Absent that, these bands are a reasonable default:

| Band | Pass rate |
|---|---|
| Broken | 0% |
| Critical | under 55% |
| High risk | 55–65% |
| Moderate | 65–75% |
| Watch | 75% up to the floor (default 80%) |

Report `total_plan_runs` beside every rate. A 0% pass rate over 3 runs and a 0%
pass rate over 300 are not the same finding, and the rate alone hides which one
you have. Exclude mabl's default tests, and exclude anything the user's status
convention marks work-in-progress — a WIP test failing is not a finding.

### Long-running tests

Durations from `RAN`. Report the distribution and the outliers against it — the
slowest few relative to this workspace's own median, not an absolute threshold,
because a five-minute test is normal in one suite and pathological in another.

Long tests matter for a reason worth stating in the report: they set the floor
on how fast a plan can gate a deploy, and they are the ones that time out first
under load.

### Missing description

`get_mabl_test` on the flagged subset only (step 5). One call per test, so never
swept across the catalog.

A missing description is not a defect. It is a cost paid by the next person who
has to decide whether the test still matters — which is exactly the decision
this audit is asking them to make. That is why the check is scoped to the tests
the report already flagged and to nothing else.

### Owner no longer in the workspace

`TESTS` where `created_by_user.id` is not a key of `USERS`.

Not evidence a test is unwanted — evidence nobody is going to speak for it. Its
use is routing: these need an owner assigned before any decision about them can
be made.

Blind spots, all of which make this an inference and never a verdict: `mabl
users list` defaults to a limit of 10, so an unraised limit invents departures
wholesale; it also rejects a limit that is too large, so an unhandled error
leaves you with no user list at all; and the list returns workspace *members*,
which is not everyone who can author in it — someone with account-level or
support access authors tests without appearing. Confirm before the word "former"
appears anywhere in the report.

The cheapest check that this finding is sound: **look for your own account in
it.** If the identity running the audit shows up as an unknown owner, the list
is measuring membership, not employment, and the finding is routing information
only.

### Naming drift

`TESTS` names against the pattern the user gave in step 1.

**With no agreed pattern there is no finding.** Do not import a convention from
another workspace and do not invent one. What you can do without a pattern is
describe: group the names by their observable shape (a bracketed prefix, a
separator character, a team token) and report the families and their sizes. A
team looking at "412 names use `:` and 58 use `|`" can decide whether that
matters; a team told they have "58 violations" of a rule they never set cannot.

With a pattern, report the non-matching names and the compliance rate, and pair
the rate with both absolute numbers.

### Duplicate or near-duplicate names

`TESTS` grouped by name, and by name after stripping a leading `Copy of` or a
trailing `(1)` / ` - copy` / date suffix.

A prompt to look, never a finding on its own. Two tests with the same name may
cover different applications or environments.

## Flow and branch findings

### Unused flow

`FLOWS` whose `list_mabl_tests_using_flow` first page is empty.

Reusable flows are where a workspace's real duplication hides, and an unused one
costs nothing to keep except the confusion of finding it in a search.

Blind spots: the used-by index is **per branch** and defaults to `master`, so a
flow used only from a feature branch reads as unused — name the branch you
indexed. And if the flow-id parse in step 2 came up short, there is no flow
inventory at all; report that rather than a partial list, because "unused" from
an incomplete inventory is indistinguishable from "not looked at".

### Stale open branch

`BRANCHES` with `status == "open"` and `created_time` older than the user's
staleness bar (default 4 months).

Report each with its `entities[]` where the API returned one, and count how many
branch records carried the key at all — it is frequently absent, and an absent
key means nothing was reported, not that nothing is stranded.

Before listing branches individually, group them by `created_by_id`. A single
API-key identity holding most of them is CI churn and one pipeline question, not
a per-branch decision list — say that instead of printing the list.

Where entities are reported, they are the part that matters: That is
the part that matters — a stale branch on its own is tidy-up, a stale branch
holding the only copy of somebody's work is a conversation.

## Label hygiene

Across plan labels always, and test labels when step 4 could enumerate them.
Group into three kinds, because the fixes differ:

- **Collisions** — same label differing only by case or spacing (`Mobile` /
  `mobile`, `smoke ` / `smoke`). These split a filter silently: a query for one
  misses the other.
- **Probable typos** — near-identical strings, one of which is rare.
- **Uninformative** — blank, or a label that carries no selection value
  (`test`, `tmp`, `component1`). Report; do not rename.

Suggest a merge target for each collision. Never apply one — a label rename is
an edit to every entity carrying it, and this skill's only writes are the
quarantine in step 8.

## Ranking

High, medium and low describe **what the clutter costs the workspace**, not how
many rows a category has. A category with three rows can outrank one with four
hundred.

**High** — something believed to be covered is not, or something is actively
burning time or money:

- a disabled test inside a live plan;
- a test that fails every run and is still in a triggered plan (it spends
  execution capacity to produce a known red);
- a plan enabled with no triggers whose tests are the only coverage of an app.

**Medium** — real clutter with a real decision behind it, but nothing is
currently mis-reporting:

- tests with no run in the window and no plan membership;
- disabled plans and the tests they strand;
- flaky tests above the workspace's own threshold;
- unused flows;
- stale branches holding entities.

**Low** — worth tidying, no consequence if it waits:

- duplicate names, naming drift, label collisions;
- tests with no run in the window that are still in a live triggered plan (they
  will run again; the window was simply quiet);
- ownerless tests that are otherwise healthy;
- long-running tests that are not gating anything.

One entity can satisfy several findings. Rank it once, at its highest, and list
the others as supporting evidence on the same row. A test appearing in four
sections reads as four problems and inflates every count in the report.

### Escalation triggers

These are not extra findings. They are conditions that change what the report
*recommends*, and each one is stated as an observation with its number attached:

| Condition | What it changes |
|---|---|
| Any test under 60% pass rate still in a triggered plan | Recommend triage before any cleanup — the suite is currently lying about the product |
| More than half of flows unused | Stop listing flows individually; the finding is the flow architecture, not the flows |
| A plan carrying no labels at all | Recommend label governance before bulk plan work, since bulk selection is label-driven |
| More stale branches than the user expected to exist | Recommend a branch policy conversation rather than a per-branch decision list |

## The quarantine label

    <disposition>-audit-<YYYY-MM-DD>        e.g. quarantine-audit-2026-08-27

The default, used where the user expressed no preference in step 1. Where they
named a scheme, theirs wins — the argument below is worth making once, not
worth overriding them with.

Two parts, each doing work. The **disposition** records what was decided, so a
later reader knows whether they are looking at a set someone meant to retire or
one someone meant to re-examine. The **date** makes the label unique to one
audit pass, which is the property the whole undo story rests on: months later,
one label query returns exactly the set one audit staged, and nothing else.

Date to the day, not the month. Two passes in one month is normal — a first
audit and a follow-up after triage — and a month-granular label merges them.

**Never reuse a label this skill did not write, and never write one twice.**
Check with `list_mabl_tests` and `labels: ["<the label>"]` before applying it.
Any result means stop and ask the user, whether it came from an earlier run of
this skill or from a convention the team already had. Do not merge, and do not
quietly roll to the next date — a label that already has members belongs to
whoever put them there, and merging two sets under one name is not reversible by
any query afterwards.

The same rule covers the conventions a workspace already carries: a `quarantine`
label, an `(old) ` name prefix, a cohort that is disabled but deliberately kept.
Step 1 asks about these. Report what you find, and adopt none of it unless the
user says to — an audit that quietly joins an existing retirement convention has
made its work indistinguishable from somebody else's.
