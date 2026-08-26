---
name: mabl-verify-change
description: |
  Prove that a change to an existing mabl test actually fixed it, without
  trusting the green run. Diffs the test against the version before the change
  to catch a pass bought by deleting coverage, re-runs it isolated on a branch,
  requires more than one clean run for a flaky test, and reports verified /
  not verified / verified-but-not-green. It never edits and never merges.
  Fire after a test was changed — by an agent, in the Trainer, by anyone — and
  someone asks "did that actually fix it", "verify this fix", "is this branch
  safe to merge", "prove the test is fixed", "re-run it and check", or hands
  over a branch with an edited test on it.
  It does NOT make the change: to edit a test use mabl-test-edit, to work out
  what's wrong in the first place use mabl-debug. This is the step after.
allowed-tools: mcp__mabl__*, Bash, Read
---

# mabl verify change

Someone changed a failing test and it's green now. That is not yet evidence.
There are exactly two cheap ways to turn a red test green — fix the app
behaviour it checks, or stop checking — and a passing run cannot tell them
apart. This skill can.

Everything here is read-and-run. **It never edits a test and never merges a
branch.** The output is evidence and a state; the merge is a person's.

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.119.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth login --auto   # one-time OAuth in browser
mabl auth info           # verify you're logged in and the token hasn't expired
```

Isolated verification runs on the mabl MCP server, because that's what takes a
branch and hands back the ids of the runs it started. **The isolated lane is
available when `run_mabl_test_cloud` is in your tool list.** Without it you can
still do the content gate below and then say the behaviour was not verified —
which is a real, reportable outcome, not a failure to be papered over.

## 1. Establish what changed, before running anything

The content gate comes first for a reason: **it can fail a change that passes
every run.** A test that got smaller passes faster and proves less.

**Requires `mabl-compare-versions`.** If that skill isn't there, stop and say
which skill is missing — don't hand-roll the diff, and don't guess how to
install it, because that depends on how this skill was installed.

Give it the version before the change and the version after, and read the
classification it returns. Three results stop the verification outright,
whatever any run says:

| In the diff | Verdict |
|---|---|
| An assertion **removed** that nobody asked to remove (and it isn't a move) | **Not verified.** Coverage was deleted. |
| An assertion **weakened** — exact match to substring to existence, a value emptied, a step disabled, a check now behind an added `If` | **Not verified.** Same shape, less proved. |
| A **date literal** introduced | **Not verified.** It passes today and fails tomorrow. |

Deleting a check is legitimate in exactly one case: the behaviour it checked
genuinely went away, and the person who asked for the change said so. That has
to come from the intent, never from the change's own convenience.

State the gate's result before any run result. A reader who sees "passed"
first will stop reading.

## 2. Run it isolated

Run the changed version, on its branch, so nothing else can be mistaken for it:

```
run_mabl_test_cloud({
  testId: "<*-j>", workspaceId, environmentId, applicationId,
  browsers: ["chrome"],
  branch: "<the branch the change is on>",
  credentialsId, deploymentId          // as the original run used
})
```

**Use the run ids it returns.** The tool hands back the ids of the runs it
created — that is the only reliable way to know which runs are yours. A
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
Say that before starting a multi-run gate.

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

Check the history rather than assuming: `list_mabl_test_runs({ testId })` shows
whether it was alternating or solidly failing.

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
- **A run that needed recovery is not clean here.** Something on the page still
  isn't what the test expects; it just got past it. For a fix you're about to
  merge, that's a partial result, not a pass.
- **One trigger can produce more than one run** — a browser each, for instance.
  All of them have to pass. One green sibling is not a green result.

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
