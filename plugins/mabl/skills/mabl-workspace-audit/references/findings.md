# Finding derivations

The mechanics behind step 5 of `SKILL.md`: how each finding is computed from
the four sets gathered in steps 2–4, what it cannot see, and how the ranking is
decided.

## The four sets

| Set | Source | Keyed by |
|---|---|---|
| `TESTS` | `mabl tests list -o json` | test id (`-j`) |
| `PLANS` | `mabl plans list` + `mabl plans describe` per plan | plan id (`-p`) |
| `RAN` | paged `list_mabl_test_run_summaries` | test id → newest run start |
| `QUALITY` | paged `get_test_quality_report` | test id → rates |

Plus `USERS` from `mabl users list -o json`, keyed by user id.

`PLAN_MEMBERS` is the union of every plan's `test_invariant_ids`. It is only
usable if **every** plan was described. If any describe failed, `PLAN_MEMBERS`
is a subset, and everything derived from it under-reports membership — which
means it over-reports "in no plan". Report those findings as unverified instead.

## Derivations

### Plan enabled with no triggers

`PLANS` where `enabled == true` and `triggers` is empty.

The plan is on, so it reads as live in the mabl app, but nothing starts it. Its
tests run only when someone presses a button. This is usually the cheapest real
finding in a workspace and the one most likely to explain "why isn't this
running".

Blind spot: a plan may be started by an external trigger the plan object does
not carry — a CI job hitting the API, a deployment event routed elsewhere.
Check `RAN` for its member tests before calling it dead; recent runs of a
no-trigger plan's tests mean something is starting it.

### Plan disabled

`PLANS` where `enabled == false`.

Interesting mainly for what it drags with it: every test whose only plan
membership is a disabled plan is dormant by construction. Compute that set and
report it with the plan, not as separate dormant tests — one disabled plan
explains all of them, and that is one decision for the user instead of many.

### Test in no plan

`TESTS` minus `PLAN_MEMBERS`.

A test that no plan contains cannot be started by any trigger. Combined with
"no run in the window" this is the strongest evidence a test is unused.

Blind spot: on-demand and CI-invoked runs do not need plan membership. A test in
no plan that appears in `RAN` is in active use — report it as *run outside any
plan*, which is a different and much softer finding.

### Disabled test still in a plan

`TESTS` where `enabled == false`, intersected with `PLAN_MEMBERS`.

A disabled test sitting in a live plan is a coverage gap wearing a plan's
clothes: the plan reports green while the test contributes nothing. Every one of
these deserves a named owner and a decision — re-enable, or remove from the plan
and retire.

### No run in the window

`TESTS` minus the key set of `RAN`.

Always phrased as *no run since `<window start date>`*. See the paging bound in
step 3: if it was hit, this finding is partial and belongs in the unverified
section.

Blind spot: `excludeDefaultTests` defaults to `true`. If step 3 ran without
setting it to `false`, mabl's default tests appear here wrongly. That is a bug
in the sweep, not a finding.

### Low pass rate / flaky

`QUALITY`, sorted. Two distinct populations, and mixing them produces bad advice:

- **Low `pass_rate`, low `flake_rate`** — consistently failing. Either the app
  changed and the test was never updated, or it is finding a real defect nobody
  has triaged. This is a fix-or-retire decision.
- **High `flake_rate`** — passing and failing over the same code. This is a
  reliability problem in the test, and deleting it deletes the coverage along
  with the noise.

Report `total_plan_runs` beside every rate. A 0% pass rate over 3 runs and a 0%
pass rate over 300 are not the same finding, and the rate alone hides which one
you have.

### Owner no longer in the workspace

`TESTS` where `created_by_user.id` is not a key of `USERS`.

Not evidence a test is unwanted — evidence nobody is going to speak for it.
Its use is routing: these are the tests that need an owner assigned before any
decision about them can be made.

Blind spots, both of which make this an inference and never a verdict:
`mabl users list` defaults to a limit of 10, so an unraised limit invents
departures wholesale; and a user may have moved workspaces rather than left the
company. Confirm before the word "former" appears anywhere in the report.

### Duplicate or near-duplicate names

`TESTS` grouped by name, and by name after stripping a trailing
`Copy of` / `(1)` / ` - copy` / date suffix.

A prompt to look, never a finding on its own. Two tests with the same name may
cover different applications or environments. Report the group and let the user
open them.

## Ranking

High, medium and low describe **what the clutter costs the workspace**, not how
many rows a category has. A category with three rows can outrank one with four
hundred.

**High** — something believed to be covered is not, or something is actively
burning time or money:

- a disabled test inside a live plan;
- a test that fails every run and is still in a triggered plan (it is spending
  execution capacity to produce a known red);
- a plan enabled with no triggers whose tests are the workspace's only coverage
  of an application.

**Medium** — real clutter with a real decision behind it, but nothing is
currently mis-reporting:

- tests with no run in the window and no plan membership;
- disabled plans and the tests they strand;
- flaky tests above the workspace's own threshold.

**Low** — worth tidying, no consequence if it waits:

- duplicate names;
- tests with no run in the window that are still in a live triggered plan (they
  will run again; the window was simply quiet);
- ownerless tests that are otherwise healthy.

One entity can satisfy several findings. Rank it once, at its highest, and list
the other findings as supporting evidence on the same row. A test appearing in
four sections reads as four problems and inflates every count in the report.

## The quarantine label

`audit-quarantine-<YYYY-MM>` — dated, so a second audit does not collide with an
un-reviewed set from the first, and so the label itself records when the window
opened.

Check the label is unused before applying it:
`list_mabl_tests` with `labels: ["audit-quarantine-<YYYY-MM>"]`. A non-empty
result means an earlier audit already used this month's label — resolve that
with the user rather than merging two sets under one name, because the two are
undone on different dates.
