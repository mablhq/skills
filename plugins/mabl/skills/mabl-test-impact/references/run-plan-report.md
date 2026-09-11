# The run-plan report

Read this when you're writing the report that closes a pass
(`SKILL.md`'s **Report the validation**), re-validating after a follow-up commit, or running this
workflow inside CI rather than beside a person.

The report exists because the natural output of this workflow — a list of test names and a pile
of run links — isn't reviewable. Whoever reads the PR needs to know what was checked, what
wasn't, and why, without re-deriving any of it from run history.

## The template

Placeholders are in angle brackets. Each `Validated` and `Not run` row carries exactly one
annotation, drawn from the shapes below; the one-line skeleton in `SKILL.md`'s **Report the
validation** is this same report compressed.

````markdown
## Test impact analysis

**Scope** — <application> · <workspace> · <deployment or local URL> · <what ran: deployed build `<sha>` | local server @ `<sha>`> · PR #<n> @ `<sha>` · scope: <plan *<name>* | label `<label>` | all impacted> (<in-scope>/<impacted> in scope)
**Analysis** — <N> candidates, <N> gaps · `more_may_exist: <bool>` · `run_context_incomplete: <bool>`

**Validated (<N>)**
- [<test>](<view_test_url>) — passed
- [<test>](<view_test_url>) — passed · `[critical]` label `<label>`
- [<test>](<view_test_url>) — failed · pre-existing (quality <n> across <m> runs)
- [<test>](<view_test_url>) — failed · died in shared setup, never reached the change
- [<test>](<view_test_url>) — failed · <cause, from the failure-cause table>

**Previously validated (<N>)** — not in this commit's impacted set, not counted above
- [<test>](<view_test_url>) — passed · carried from `<sha>`

**Not run (<N>)**
- [<test>](<view_test_url>) — disabled
- [<test>](<view_test_url>) — quality <n> across <m> runs
- [<test>](<view_test_url>) — pending approval · shared-state
- [<test>](<view_test_url>) — pending approval · cleanup unverified
- [<test>](<view_test_url>) — out of scope · plan *<name>*

**Gaps (<N>)**
- <gap, one line> — authored [`<new-test-id>`](<view_test_url>)
- <gap, one line> — deferred
````

Keep it this short. The report competes for attention with the diff itself, and a reviewer who
skips it because it's long is worse off than one who never got it. Short does **not** mean
dropping the links: every test and every authored gap carries its `view_test_url`, the same rule
`SKILL.md`'s **Read the results as judgment** applies everywhere else, because a name alone makes
the reader re-find the test by hand.

## What each field is load-bearing for

| Field | Why it's in there |
|---|---|
| **Application + workspace** | The two values that can silently scope an analysis to the wrong product. Printed, they become a claim someone can check in a second. |
| **Deployment** | Which host the runs actually hit — the difference between a hosted dev deployment and a local one that was also on offer. |
| **Deployed build** | For a cloud run, the identity of the build that was deployed to the target when the canary ran — the version, commit, or deployment revision your pipeline recorded — and that it contains the change. For a local run, the served-build evidence from `SKILL.md`'s **Report the validation**. This is what separates *the tests passed* from *the tests passed on a build that contains the change*; omit it and the whole report can be true and worthless. The run's `execution_runtime_version` is the mabl runtime, not your build; if you record it, label it as such. |
| **PR and commit SHA** | Ties the report to the exact diff it validated. The SHA, not just the PR number — the ledger below compares against it. |
| **`Previously validated` + `carried from <sha>`** | Inherited rows live in their own block and carry the commit they were run on. They are never counted in `Validated`, because retrieval variance (`SKILL.md`'s **Read the results as judgment**) means a test can leave the impacted set without ceasing to be impacted — see the ledger section. Without both the block and the tag, a second push produces a report that can't tell a fresh result from an inherited one. |
| **`view_test_url` on every row** | The reader opens tests from the report; a bare name makes them go find it. |
| **Candidate count + `more_may_exist`** | Whether the set hit the result ceiling. "19, exhaustive" and "19 of possibly more" support different conclusions about coverage. |
| **`run_context_incomplete`** | The response's own flag that some per-test enrichment failed or was cut off. Report it, but **read it as a prompt, not a verdict**: it can be true on `plans_truncated` alone — a statement about plan membership, not about anything screening uses — and it stays true after you close a gap with a fallback lookup. What the reader needs is the residue: which candidates you still could not settle *after* those fallbacks, and on which field, named on their own rows. Quoting reliability data without saying which of it was partial reads more confident than the pass actually was. |
| **A cause on every failure** | An unsorted failure list reads as *your change broke five things* when four were already red. The cause is what makes red actionable. |
| **A reason on every not-run** | A test that's absent with no reason is indistinguishable from one you forgot. Skipping is fine; silent skipping isn't. |
| **Run scope + in-scope counts** | What the user asked you to run, and how much of the impacted set that left. `12/19 in scope` is the difference between *seven tests were not impacted* and *seven were impacted and deliberately not run* — without it, a narrowed pass reads as a complete one. Name the plan or the labels, and say when a label scope was any-of. |
| **`[critical]` on always-run rows** | Marks the rows that are in the wave by label convention rather than by impact, since mabl has no criticality field. A reader who doesn't know why a test is there assumes the analysis returned it. |
| **A disposition on every gap** | `authored <id>` or `deferred`. Deferring is a legitimate answer; leaving it unstated is how a known gap becomes nobody's. |

## Re-validating a follow-up commit

The report is a ledger. It does **not** make the second pass cheap — see the honesty note at the
end of this section — it makes the second pass *legible*:

1. **Re-run `analyze_test_impact` against the new commit. Always.** Mapping a diff to impacted
   tests is the one thing you cannot infer from the previous report — a later push can add a
   screen, touch a new flow, or reach an area of the same application the first analysis never
   saw. Reusing the earlier set is exactly how a report comes out looking exhaustive while
   silently missing everything the follow-up commit introduced. The analysis is one call; the
   wave is N runs, and the wave is the expensive half.
2. **Resolve the run scope again, then diff the new final run set against the prior report**, by
   `test_invariant_id`. The scope's *words* are the same as on the first pass; the ids they
   resolve to are not, because the impacted set moved and a label or plan set can move too. So
   intersect the fresh impacted set with the scope, add the critical set, subtract explicit
   excludes (`SKILL.md`'s **Screen before you run**) — every commit, not only when the scope
   changed. The analysis result is never the run set by itself once a scope is in play.
3. **Screen the candidates that are new to this commit**, then **run everything in the fresh final
   run set that screening cleared** — plus the canary whenever the runtime could have moved. Two
   halves, both load-bearing. *Run everything*, because a test lands in the impacted set precisely
   when shared code or an indirect dependency reached it — the case where nothing about the test
   *looks* touched and the analysis knows better than you do; deciding reuse by eyeballing the
   diff re-introduces the judgment this skill exists to replace. *That screening cleared*, because
   a candidate new to this commit has never been through **Screen before you run** — it may be
   disabled (and `tests run --id` bypasses the enabled check, so it will run anyway and land in
   **Validated** as false evidence), or shared-state, or unbanded. **A band is a fact about the
   version you read, not about the invariant id.** Reuse a band only for a test whose
   `lastUpdatedTime` — from `list_mabl_tests`, queried on the same branch you dispatch — has not
   moved since the pass that banded it, and re-read and re-band anything that has: a branch
   version can gain a create or a delete between two pushes with its id unchanged, and the
   read-only clearance from the first pass would walk it straight into the wave. An approval
   covers the steps that were approved and expires with them the same way. Record the branch and
   `lastUpdatedTime` beside each band so the next pass can make this comparison without re-reading
   everything.
4. **Carry nothing into `Validated`.** Rows from an earlier report go in their own
   **`Previously validated`** block, tagged `carried from <sha>`, and they do **not** count
   toward this commit's validated total.

**Why carried rows can't sit in `Validated`:** the obvious rule — "carry forward the tests that
dropped out of the impacted set" — assumes dropping out is a fact about the code. It isn't
reliably. `SKILL.md`'s **Read the results as judgment** measures this endpoint returning **13
candidates versus 3** for the same `changeDescription`, so on any given push a test can leave the
set as pure retrieval variance while remaining every bit as impacted. Put that row in `Validated`
and the report states it was validated against a commit it never ran on — which is exactly the lie
the ledger exists to prevent, arriving through the one door the deterministic rule leaves open. A
separate block costs a heading and makes the claim honest: *this passed once, on an earlier
commit, and is not in today's set.*

**Be honest about what this saves.** It is not "a cheap second pass": if the fresh analysis
returns the same 19 candidates, you run 19 again. What you skip is re-screening tests you've
already banded *and whose version has not moved* (step 3), re-authoring coverage you already
wrote, and re-running the tests the change no
longer touches — and what you gain is a report that says which commit each row belongs to. A
carried-forward pass on a still-impacted test would be the one thing that makes the report lie.

**Replay in full when the scope block moved** — a different deployment, runtime, workspace, or
application invalidates every carried-forward row, because those rows were true about a target
you are no longer testing. **A changed run scope moves it too**, in both directions: a widened
scope has rows that were never run, and a narrowed one has carried rows that today's pass would
not have run at all. Carrying either one silently is how a narrower pass inherits a wider pass's
green.

## Running in CI

Same workflow. Four differences change what you do:

- **Nobody is there to approve.** Run the read-only and contained bands — unless the job is
  advisory-only (below), which dispatches nothing — and record everything else as
  `not run · pending approval`. **Never promote a test across bands because the job
  would otherwise look incomplete** — an unattended agent writing to a shared workspace is the
  failure mode the bands exist to prevent.
- **An incomplete validation must not report as a passing one — and that has to be mechanical.**
  "Everything I was allowed to run passed" and "this change is validated" are different claims,
  and a job that collapses them is worse than no job: a change whose impacted set is *entirely*
  approval-gated goes green having validated nothing, and merge automation keying off that green
  reads pending approval as a pass. The contract is therefore a single behavior, not a menu:
  **exit nonzero whenever any test in the final run set is pending approval** — the impacted tests
  in scope *and* any critical set the user asked for by label
  (`SKILL.md`'s **Screen before you run**), since a requested test left unrun is the same
  incomplete validation whether or not the analysis returned it — and name those tests in the
  report. A distinction that lives only in report prose is not a gate — nobody's branch
  protection reads prose. If a repo would rather gate on a dedicated status check than on the exit
  code, that check has to be one branch protection actually *requires*; wiring that up is part of
  adopting this path, because an unrequired status is decoration. Advisory mode is the one
  exception, and only because it gates nothing — see below.
- **There's no debug path.** `run_mabl_test_local` hands back a launcher link for a human to
  click, and CI has no human; `references/local-debugging.md` doesn't apply. Cloud runs only,
  diagnosed from the run record.
- **The report is the artifact.** Nobody watched the job, so whatever the report doesn't say
  didn't happen as far as any reader is concerned. Emit it into the job output or a PR comment
  every run, pass or fail.

The canary (`SKILL.md`'s **Canary before you fan out**) matters more here, not less: a CI job that
fans out against a build that never deployed burns its whole run quota to tell you nothing, and
there's no one watching who'd notice in time to stop it.

### Advisory mode (analysis only)

A CI job may run the analysis and dispatch **nothing** — telling reviewers which existing tests the
change reaches and what nothing covers, while a separate suite runs the tests. Five changes:

- **Say which mode you're in** on the scope line: `Run mode: CI advisory (analysis only)`.
- **`Impacted (N)` replaces `Validated` and `Not run`** — every test the analysis returned, each
  with the reason it surfaced (its `context`) and its `view_test_url`, and with `role`
  (validates / uses) when it's present. Nothing was run, so there is nothing to sort into those
  two blocks. Keep `Gaps (N)`, each with its basis text but **no disposition** — nobody is
  present to author or defer, so the gap is recorded for follow-up rather than owned — and keep
  `more_may_exist` and `run_context_incomplete` on the `Analysis` line.
- **The exit-code contract above does not apply here**, because nothing was gated: nothing was
  run, so nothing is pending approval and there is no incomplete validation to keep from reading
  as a pass. The commit status is informational — `success` with a count, or `error` when the
  analysis itself failed (the tool wasn't there, or the call failed twice). Never `failure` — and
  the status must stay **unrequired**: GitHub counts `error` toward the combined failure state, so
  a required advisory check would block exactly like a gate. A comment in the workflow is a
  reminder, not enforcement — confirm the status context is absent from the repo's required
  checks when you adopt it.
- **Screening (`references/screening.md`) doesn't apply either.** There is no run to screen for,
  so the reader sees the impacted set as the analysis returned it.
- **Say in the report that nothing ran.** A page of test names reads as a run unless you tell the
  reader otherwise.
- **When the CI job renders the comment itself, the report is not yours to write.** The job
  validates your analysis output and renders the template below from it, so that file is where
  your work ends; the only prose of yours a reader sees is the change description you ran the
  analysis with. The template stays here because it is what that renderer owes the reader, and
  because a person running this mode by hand still writes it themselves.

````markdown
## Test impact analysis (advisory)

**Scope** — storefront web app · acme-qa workspace · `https://9f4c1ab-preview.qa.example.com` · PR #482 @ `9f4c1ab` · Run mode: CI advisory (analysis only)
**Analysis** — 19 impacted, 2 gaps · `more_may_exist: false` · `run_context_incomplete: false`

**Impacted (19)**
- [App - Applications - Settings form persists](view_test_url) — validates · asserts the settings form save path the change edits
- [App - Applications - Create](view_test_url) — uses · creates an application on the way to its own assertion

**Gaps (2)**
- Setting persists across save and reload — no test reloads after saving

Advisory mode: nothing was run; the smoke gate runs the tests.
````
