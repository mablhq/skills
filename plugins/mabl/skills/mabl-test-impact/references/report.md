# The report

Read this when you're writing the report that closes a pass (`SKILL.md`'s **Report the validation**),
re-validating after a follow-up commit, or running this workflow inside CI rather than beside a
person.

The report exists because the natural output of this workflow — a list of test names and a pile of run
links — isn't reviewable. Whoever reads the PR needs to know what was checked, what wasn't, and why,
without re-deriving any of it from run history.

## The template

````markdown
## Test impact analysis

**Scope** — storefront web app · storefront-qa workspace · shop.qa.example.com · deployed build `9f4c1ab` (release 2026.09.02-3) · PR #482 @ `9f4c1ab` · scope: plan *Nightly regression* (15/19 in scope)
**Analysis** — 19 candidates, 2 gaps · `more_may_exist: false` · `run_context_incomplete: false`

**Validated (13)**
- [Account - Saved addresses - Edit](view_test_url) — passed
- [Account - Sign in - Shadow DOM host](view_test_url) — failed · pre-existing · quality 4 across 38 runs
- [Checkout - Place order](view_test_url) — failed · died in shared setup, never reached the change
- [Account - Sign in](view_test_url) — passed · `[critical]` label `smoke`

**Previously validated (1)** — not in this commit's impacted set, not counted above
- [Catalog - Search results](view_test_url) — passed · carried from `a1b2c3d`

**Not run (7)**
- [Checkout - Guest express pay](view_test_url) — disabled
- [Account - Saved addresses - Bulk delete](view_test_url) — pending approval · shared-state
- [Catalog - Bulk archive](view_test_url) — pending approval · unverified
- [Catalog - Facet counts](view_test_url) — out of scope · plan *Nightly regression*

**Gaps (2)**
- Postal-code error clears on correct re-entry — authored [`<new-test-id>`](view_test_url)
- Saved-address editor validates on keystroke — deferred
````

Keep it this short. The report competes for attention with the diff itself, and a reviewer who skips
it because it's long is worse off than one who never got it. Short does **not** mean dropping the
links: every test and every authored gap carries its `view_test_url`, the same rule `SKILL.md`'s
**Read the results as judgment** applies everywhere else, because a name alone makes the reader
re-find the test by hand.

## Row reasons

One spelling per reason, in the run plan and the report alike (`SKILL.md`, **Run it**). The separator
is ` · `, never parentheses.

| Reason | Spelling | When |
|---|---|---|
| Disabled | `disabled` | `enabled: false` |
| No steps | `no executable steps` | `step_count: 0` |
| Not dispatchable | `outside what this workflow can dispatch` | mobile, api, or performance `test_type` |
| Unreliable | `quality <score> across <n> runs` | a score you are quoting, always with its sample |
| Awaiting approval | `pending approval · shared-state` / `pending approval · unverified` | the bottom two bands |
| Needs the billable flag | `pending approval · needs --allow-billable-features` | a GenAI assertion on the local path |
| Out of scope | `out of scope · plan <name>` / `out of scope · label <label>` / `out of scope · excluded` | the run scope narrowed it away |
| Budget exhausted | `timed out` | the wall-clock budget ran out mid-wave |
| Screen incomplete | `unknown · <field>` | a field that never resolved, named |

## What each field is load-bearing for

| Field | Why it's in there |
|---|---|
| **Application + workspace** | The two values that can silently scope an analysis to the wrong product. Printed, they become a claim someone can check in a second. |
| **Deployment** | Which host the runs actually hit — the difference between a hosted dev deployment and a local one that was also on offer. |
| **Deployed build** | For a cloud run, the identity of the build deployed to the target when the canary ran — the version, commit, or deployment revision your pipeline recorded — and that it contains the change. For a local run, the served-build evidence from `SKILL.md`'s **Report the validation**. This is what separates *the tests passed* from *the tests passed on a build that contains the change*; omit it and the whole report can be true and worthless. The run's `execution_runtime_version` is the mabl runtime, not your build; if you record it, label it as such. |
| **PR and commit SHA** | Ties the report to the exact diff it validated. The SHA, not just the PR number — the ledger below compares against it. |
| **`Previously validated` + `carried from <sha>`** | Inherited rows live in their own block and carry the commit they were run on. They are never counted in `Validated`, because retrieval variance (`SKILL.md`'s **Read the results as judgment**) means a test can leave the impacted set without ceasing to be impacted. Without both the block and the tag, a second push produces a report that can't tell a fresh result from an inherited one. |
| **`view_test_url` on every row** | The reader opens tests from the report; a bare name makes them go find it. |
| **Candidate count + `more_may_exist`** | Whether the set hit the result ceiling. "19, exhaustive" and "19 of possibly more" support different conclusions about coverage. |
| **`run_context_incomplete`** | The response's own flag that some per-test enrichment failed or was cut off. Report it, but **read it as a prompt, not a verdict**: it can be true on `plans_truncated` alone — a statement about plan membership, not about anything screening uses — and it stays true after you close a gap with a fallback lookup. What the reader needs is the residue: which candidates you still could not settle *after* those fallbacks, and on which field, named on their own rows. |
| **A cause on every failure** | An unsorted failure list reads as *your change broke five things* when four were already red. The cause is what makes red actionable. |
| **A reason on every not-run** | A test that's absent with no reason is indistinguishable from one you forgot. Skipping is fine; silent skipping isn't. |
| **Run scope + in-scope counts** | What the user asked you to run, and how much of the impacted set that left. `12/19 in scope` is the difference between *seven tests were not impacted* and *seven were impacted and deliberately not run*. Name the plan or the labels, and say when a label scope was any-of. |
| **`[critical]` on always-run rows** | Marks the rows in the wave by label convention rather than by impact, since mabl has no criticality field. A reader who doesn't know why a test is there assumes the analysis returned it. |
| **A disposition on every gap** | `authored <id>` or `deferred`. Deferring is a legitimate answer; leaving it unstated is how a known gap becomes nobody's. |

## Re-validating a follow-up commit

The report is a ledger. It does **not** make the second pass cheap — see the honesty note at the end
of this section — it makes the second pass *legible*:

1. **Re-run `analyze_test_impact` against the new commit. Always.** Mapping a diff to impacted tests
   is the one thing you cannot infer from the previous report: a later push can add a screen, touch a
   new flow, or reach an area of the same application the first analysis never saw. Reusing the
   earlier set is exactly how a report comes out looking exhaustive while silently missing everything
   the follow-up commit introduced. The analysis is one call; the wave is N runs, and the wave is the
   expensive half.
2. **Resolve the run scope again, then diff the new final run set against the prior report**, by
   `test_invariant_id`. The scope's *words* are the same as on the first pass; the ids they resolve to
   are not, because the impacted set moved and a label or plan set can move too. So intersect the
   fresh impacted set with the scope, add the critical set, subtract explicit excludes (`SKILL.md`'s
   **Run scope**) — every commit, not only when the scope changed. The analysis result is never the
   run set by itself once a scope is in play.
3. **Screen the candidates that are new to this commit**, then **run everything in the fresh final run
   set that screening cleared**, the canary first as for any wave (`SKILL.md`, **Canary**). Two halves,
   both load-bearing. *Run everything*, because a test lands in the impacted set precisely when shared
   code or an indirect dependency reached it, which is the case where nothing about the test *looks*
   touched and the analysis knows better than you do. *That screening cleared*, because a candidate
   new to this commit has never been through **Screen before you run** — it may be disabled (and
   `tests run --id` bypasses the enabled check, so it will run anyway and land in **Validated** as
   false evidence), or shared-state, or unbanded.

   **A band is a fact about the version you read, not about the invariant id.** Reuse a band only for
   a test whose `lastUpdatedTime` — from `list_mabl_tests`, queried on the same branch you dispatch —
   has not moved since the pass that banded it, and re-read and re-band anything that has: a branch
   version can gain a create or a delete between two pushes with its id unchanged, and the read-only
   clearance from the first pass would walk it straight into the wave. Record the branch and
   `lastUpdatedTime` beside each band so the next pass can make this comparison without re-reading
   everything.

   **A band is reusable; the dispatch decision is not.** Auto-dispatch is the band **and** the change
   kind (`SKILL.md`'s **Side-effect bands**, the destructive-change override): a contained test cleared
   under a form change joins the ask when the follow-up commit touches a cascade, a permission model, a
   bulk delete or a data lifecycle, with its band and `lastUpdatedTime` unchanged. Re-derive that
   override from the new commit every time, before reusing anything.

   An approval covers the steps that were approved **against the target they were approved for** —
   test version and (environment, credential, deployment) together — and expires when either moves.
   Record both beside the approval. A moved scope block re-asks every approval, not only the carried
   rows.
4. **Carry nothing into `Validated`.** Rows from an earlier report go in their own **`Previously
   validated`** block, tagged `carried from <sha>`, and they do **not** count toward this commit's
   validated total.

**Why carried rows can't sit in `Validated`:** the obvious rule — "carry forward the tests that
dropped out of the impacted set" — assumes dropping out is a fact about the code. It isn't reliably.
Retrieval varies between calls (`SKILL.md`'s **Read the results as judgment**), so on any given push a
test can leave the set as pure variance while remaining every bit as impacted. Put that row in
`Validated` and the report states it was validated against a commit it never ran on — exactly the lie
the ledger exists to prevent, arriving through the one door the deterministic rule leaves open. A
separate block costs a heading and makes the claim honest: *this passed once, on an earlier commit,
and is not in today's set.*

**Be honest about what this saves.** It is not "a cheap second pass": if the fresh analysis returns
the same 19 candidates, you run 19 again. What you skip is re-screening tests you've already banded
*and whose version has not moved*, re-authoring coverage you already wrote, and re-running the tests
the change no longer touches — and what you gain is a report that says which commit each row belongs
to.

**Replay in full when the scope block moved** — a different deployment, runtime, workspace, or
application invalidates every carried-forward row, because those rows were true about a target you are
no longer testing. **A changed run scope moves it too**, in both directions: a widened scope has rows
that were never run, and a narrowed one has carried rows that today's pass would not have run at all.
Carrying either one silently is how a narrower pass inherits a wider pass's green.

## Running in CI

**Advisory mode is the CI mode this skill ships** — one analysis call, nothing dispatched, nothing
screened, nobody approving anything. **→ `references/ci-advisory.md`**, which is self-contained and is
the only file a CI workflow prompt needs to name.

A CI job that *dispatches* runs is follow-up work. When it exists, its contract is that an incomplete
validation must never report as a pass: "everything I was allowed to run passed" and "this change is
validated" are different claims, and a change whose impacted set is entirely approval-gated has
validated nothing. That has to be enforced by a machine-readable verdict the job fails on — branch
protection does not read prose — and never by the wording of the report. The bands do not bend to make
a job look complete, in CI least of all: an unattended agent writing to a shared account is the
failure mode they exist to prevent.
