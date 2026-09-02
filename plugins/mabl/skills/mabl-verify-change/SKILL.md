---
name: mabl-verify-change
description: |
  Prove that a change to an existing mabl test actually fixed it, without
  trusting the green run. Diffs the test against the version before the change
  to catch a pass bought by deleting coverage, re-runs it isolated on a branch
  when that version still needs a run, requires more than one clean run for a
  flaky test, and reports verified / not verified / verified-but-not-green. It never edits and never merges.
  Fire after a test was changed — by an agent, in the Trainer, by anyone — and
  someone asks "did that actually fix it", "verify this fix", "is this branch
  safe to merge", "prove the test is fixed", "re-run it and check", or hands
  over a branch with an edited test on it.
  It does NOT make the change: to edit a test use mabl-test-edit, to work out
  what's wrong in the first place use mabl-debug. This is the step after.
allowed-tools: mcp__mabl__get_mabl_test, mcp__mabl__list_mabl_test_versions, mcp__mabl__list_mabl_test_runs, mcp__mabl__run_mabl_test_cloud, mcp__mabl__get_mabl_test_run
---

# mabl verify change

Someone changed a failing test and it's green now. That is not yet evidence.
There are exactly two cheap ways to turn a red test green — fix the app
behaviour it checks, or stop checking — and a passing run cannot tell them
apart. This skill can.

Everything here is read-and-run. **It never edits a test and never merges a
branch.** The output is evidence and a state; the merge is a person's.

## Prerequisites

The **`mabl` MCP server**, which ships in this plugin. Every step here is an MCP
call, so **the mabl CLI is not used** — nothing to install, no login to complete.
The absence of a CLI guard block is deliberate, not an omission.

The server is what takes a branch and hands back the ids of the runs it started,
which is why the isolated lane runs there. **That lane is available when
`run_mabl_test_cloud` is in the tool list.** Absent, the server isn't connected:
name it and stop after the content gate, reporting the behaviour as not
verified — a real, reportable outcome, not a failure to be papered over. A tool
that is present can still refuse the call because the workspace isn't entitled
to it, and only the call reveals that: quote the error verbatim and take the
same fallback.

Workspace, environment, and application come from the caller. When the caller
gives only the workspace, they are recoverable rather than guessable: the
environment and branch of the run being verified are on its history entry
(`environmentId`, `branch`), and `get_mabl_test` carries the test's application,
credentials, labels, and the intent recorded on the test object.

## 1. Establish what changed, before running anything

The content gate comes first for a reason: **it can fail a change that passes
every run.** A test that got smaller passes faster and proves less.

**Requires `mabl-compare-versions`.** If that skill isn't there, stop and say
which skill is missing — don't hand-roll the diff, and don't guess how to
install it, because that depends on how this skill was installed.

### Which two versions

Getting this wrong is the quiet failure here: the diff comes back clean because
it compared the wrong pair, and the gate passes on nothing.

**Version numbers are global to the test, not to the branch.** `N-1` is the
previous *number*, which is very often a version somebody else created on an
unrelated branch. Read the branch, don't do arithmetic:

```
list_mabl_test_versions({ testId: "<*-j>" })   // newest first; carries created_on_branch
```

- **After** — the newest version whose `created_on_branch` is the change's
  branch. Name it explicitly as `<id>:<N>`; a bare `<id>` means the global latest
  and may be someone else's.
- **Before** — the newest version created on the branch this would merge *into*,
  usually master. Not `N-1`. That is the state a merge would replace, and it is
  the only baseline the verdict is about.

Say which two you picked, and why, in the report.

### One diff, or the whole walk

The endpoint diff — before to after — is what the verdict rests on. It is what a
merge actually lands, and it is never optional.

Walking the branch's own versions in sequence answers a different question: not
what the change is, but how it got there. Worth the extra calls when

- the branch carries several versions and this skill is running **once, at the
  end** — an assertion dropped in one version and restored in a later one nets
  out to nothing at the endpoints, and it still says something about how the edit
  was made; or
- the endpoint diff is clean and the runs disagree with it.

Skip it when this skill runs **per edit**, one new version at a time. There the
endpoint diff already is the walk, and re-diffing every pair spends calls to
learn nothing.

Either way the verdict comes from the endpoints. The walk is context, never the
gate.

### Reading the result

These stop the verification outright, whatever any run says. Address them by the
class `mabl-compare-versions` reports, not by re-deriving its matching — it
already separates a removal it could resolve from one it couldn't, and that
distinction is the whole difference between the first two rows.

| What the diff reports | Verdict |
|---|---|
| **Coverage deleted** — an assertion gone, and nobody asked to remove it | **Not verified.** Coverage was deleted. |
| **Unmatched removal** — a removal it could not join to any added step | **Not verified.** Neither proof of deletion nor proof against it. Name the candidate it named, and say that resolving the pair is what would settle it. |
| **Strictness** loosened — exact match to substring to existence, a value emptied, a step disabled, a check now behind an added `If` | **Not verified.** Same shape, less proved. |
| **Date literal** introduced | **Not verified.** It passes today and fails tomorrow. |

"Loosened" is this skill's word, not the diff's. The diff reports the change in
what the assertion requires and leaves the valence alone, because only the
intent says which direction was wanted.

Deleting a check is legitimate in exactly one case: the behaviour it checked
genuinely went away, and the person who asked for the change said so. That has
to come from the intent, never from the change's own convenience.

State the gate's result before any run result. A reader who sees "passed"
first will stop reading.

## Dry run

A real mode, not a courtesy. Ask for it whenever the runs are the expensive or
irreversible half: an unattended session, someone else's workspace, a first look
at what this would cost.

The content gate is read-only and still happens. So does reading the run
history. **What stops is the isolated run.**

Report, then stop:

- the two versions picked and the content gate's verdict — a dry run that fails
  the gate is a complete answer, not a partial one;
- what the run history says the test was doing, and therefore how many clean runs
  the gate would require;
- whether the target version already has clean runs, and so whether a run is
  needed at all — sometimes the honest dry-run answer is that nothing would be
  started;
- otherwise the exact call that would be made, lane and every parameter filled
  in;
- the cost: runs times browsers, each one minutes of real cloud execution.

Never estimate a result. A dry run says what would be run and what the read-only
half already found. The moment it says anything about whether the test would
pass, it has stopped being a dry run.

**Having the tool is not permission to use it.** If `run_mabl_test_cloud` is in
the tool list and a dry run was asked for, it stays uncalled.

## 2. Run it isolated

### First: has this version already run?

A version that already has terminal runs may already carry its own evidence.
Firing another one spends minutes, and in the cloud credits, to re-learn it.
Step 3 says how many clean runs the gate needs; read it before deciding.

```
list_mabl_test_runs({ testId: "<*-j>", workspaceId })
```

**Runs are version-qualified.** Each carries its `testId` as `<*-j>:<N>`, so a
run can be attributed to the exact version under verification — and a run on any
other version is not evidence about this one.

Count the runs on the target version that are `terminal`, `success: true` and
`attemptCount: 1`.

| Runs already on the target version | Do |
|---|---|
| Enough clean ones for the gate | **Start nothing.** Report them, go to step 4 |
| Fewer than the gate needs | Run the difference, not the whole gate again |
| Non-terminal, or needed recovery | Run — those are not clean |
| None | Run |

**Say what a pre-existing run cannot tell you.** The run object carries the
version, the outcome and the attempt count. It does **not** carry the branch,
environment, deployment or credentials it used, so a pass on the right version
may have been a pass against a different URL. State that caveat. It is not on
its own a reason to discard the evidence and re-run by reflex — but if the
reader needs the branch pinned, say so and run one.

### Which lane

**When the mabl CLI is installed, run locally.** Faster, no credits — only cloud
runs consume them — and the artifacts land on the machine.

Configuration is the whole risk: a run under different credentials, a different
environment or a different URL is not a comparable result. Don't assemble it by
hand. Seed it from a run that already happened:

```bash
mabl tests run --run-id <*-jr> --mabl-branch <branch> --headless
```

`--run-id` pulls the test id, browser, credentials and environment from that
run. Point it at **the last failing run of the version before the change** —
that is the exact configuration the test was failing under, which is what makes
the comparison mean anything. `--mabl-branch` then moves it onto the branch.

Two things the seed does not settle:

- **A data-table-driven test.** Pass `--data-table-id` (or `--scenario-id`)
  explicitly rather than assuming the seed carried it.
- **Reachability.** Local and cloud execution sit on different networks, so a
  URL one reaches the other may not. A `localhost` binding runs locally and never
  in the cloud; an internal host can be the reverse.

**Say which lane produced the result**, and say the other is unconfirmed. They
are not interchangeable when the change is about anything environment-specific.

### The cloud lane

Run the changed version, on its branch, so nothing else can be mistaken for it:

```
run_mabl_test_cloud({
  testId: "<*-j>", workspaceId, environmentId, applicationId,
  browsers: ["chrome"],
  branch: "<the branch the change is on>",
  credentialsId, deploymentId          // as the original run used
})
```

**A call that returns no run ids did not start a run.** When the environment
binds more than one URL for the application, the tool answers with the candidate
deployments instead of starting — and it delivers them **as a tool error**, with
the candidate list in the error payload. Nothing is running, and the call is not
retryable: retrying re-asks the same question. The candidates carry no marker
saying which is canonical, and the list can include URLs unusable from cloud
execution (a localhost binding, say). Ask which URL and re-invoke with that
`deploymentId`; the test's own `url` from `get_mabl_test` says which candidate
the test actually targets. Never pick one blind: the wrong URL verifies the
change against the wrong app and reads as a clean result.

**Otherwise, use the run ids it returns.** The tool hands back the ids of the
runs it created — that is the only reliable way to know which runs are yours. A
workspace has other plans on other schedules, and picking runs by "most recent"
will eventually attribute someone else's execution to your change.

Then poll each returned id:

```
get_mabl_test_run({ testRunId: "<*-jr>", workspaceId })
```

- Poll while `terminal` is false, about every 30 seconds; a cloud test run is
  usually minutes. **Give up after 30 minutes** and report the run as still
  running rather than as a result.
- `lastAttemptError` on a **non-terminal** run is a retry, not a verdict. Don't
  read it as failure.
- Only once `terminal` is true are `success` and `failureSummary` trustworthy.

Each run is real cloud execution — minutes of wall clock, one run per browser.
Say that before starting a multi-run gate. If a dry run was asked for, this is
the step that does not happen.

## 3. How many clean runs are enough

One pass is enough evidence for a test that failed **consistently**. It is no
evidence at all for one that failed **intermittently** — an intermittent test
passes sometimes by definition, so a single green run is the outcome you'd
expect from changing nothing.

| The test was | Clean runs required |
|---|---|
| Failing every time | **1** |
| Failing intermittently | **3**, all clean |
| Unknown which | Treat as intermittent — **3** |

Check the history rather than assuming:

```
list_mabl_test_runs({ testId: "<*-j>", workspaceId })
```

The first page carries a `history` block — streaks, per-browser and
per-environment pass rates — which answers alternating-versus-solidly-failing
outright. Read that rather than eyeballing statuses. It returns **10 runs by
default**, so say how many were looked at: "failed every time" over ten runs and
over fifty are different claims.

And for an intermittent test, ask what the change actually did. A longer wait
around a race is not the same as fixing the race, and three green runs can't
tell you which one you got.

## 4. The three outcomes

Report exactly one. The middle one is the one that usually gets collapsed, and
collapsing it is how an unproven fix reaches a merge.

- **Verified** — content gate passed, and the required number of clean runs
  passed. Quote the run ids.
- **Not verified** — the gate failed, the runs failed, or they never finished.
  Say which, and say what would settle it.
- **Verified but not green** — the gate passed and the change is demonstrably
  working, but the run still can't come back clean because it now fails
  *somewhere else*: earlier in the test, or inside a shared flow this change
  never touched. This is not a failed fix and not a reason to change more. Quote
  the run that got through the changed step as the evidence, and report the new
  failure as its own separate thing.

## What counts as clean

- **`success` on a terminal run is the pass signal.** Nothing else is.
- **One trigger can produce more than one run** — a browser each, for instance.
  All of them have to pass. One green sibling is not a green result.
- **A `terminated` run is not a failed run.** It is terminal with
  `success: false`, so it reads as a failure and isn't one — the run was stopped,
  not beaten by the test. It proves nothing either way: don't count it toward the
  clean runs, and don't report it as evidence the change didn't work. Re-run to
  replace it, and say how many runs were terminated rather than folding them into
  a pass rate.

## What this skill does not do

- **It does not edit.** If the change is wrong, it says so and stops. Making a
  different change is a separate decision by whoever holds the intent.
- **It does not merge**, and it doesn't recommend merging. It reports a state
  and the evidence behind it; a person reads the diff and decides.
- **It does not re-verify forever.** Two failed rounds is where to stop and hand
  back what you learned. A third round of the same gate on the same change is
  not new information.
- **Verified is not the same as fixed.** It means the change held up under the
  runs described here. A test that has been failing intermittently for weeks
  deserves watching across the next few real runs before anyone calls it solved,
  and saying so costs nothing.
