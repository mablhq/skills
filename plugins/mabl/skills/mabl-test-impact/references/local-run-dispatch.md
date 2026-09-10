# Dispatching local runs: the headless parallel recipe

Read this before dispatching a wave. The **canary** section applies to any dispatch, cloud or
local; everything after it is the local-CLI path — the defaults that mislead, a worked dispatch
script, and how to read the exit codes it produces.

`SKILL.md`'s **Run it** carries the rules you must not break (canary before fan-out; pin the
target per group; split the set by band; capture every status). This file is how to implement
them.

## CLI defaults that will fool you

- `tests run` has **no JSON output** — the exit code is the only pass/fail signal. If you wrap
  it in a script, capture that exit code immediately; the wrapper's own last command can mask it.
- **`--headless` defaults to `false`.** A run you assumed was headless instead opens a visible
  browser window, once per test — which compounds the moment you fan out. Pass it explicitly.
- **Every test runs at its master version unless you say otherwise.** `tests run` takes
  `--mabl-branch`; without it a candidate authored on the branch for the change under review runs
  the version from before the change, and passes or fails for reasons that have nothing to do with
  it. The recipe below carries the branch on every dispatch when `MABL_BRANCH` is set, and a test
  with no edits on that branch still runs its master version, so setting it costs nothing for the
  rest of the wave.
- The CLI runs its own test set **sequentially**, one at a time. For real parallelism, fan out
  **one process per test**, not one CLI invocation with many.
- **The artifacts directory is not your failure forensics.** On three separate *failing* local
  runs it produced zero files — and note that the runner *prints* an artifacts path on startup and
  logs `Capture state of application after test` on the way down, so the directory looks like it
  should hold something. It doesn't. Plan to diagnose from the console output. Don't confuse this
  with `agent debug artifact`, a different and genuinely rich per-step forensic store — that one is
  keyed to a cloud test-run id, so it isn't reachable from a local run either.
- **The runner binds a fixed local port, so local parallelism is a race.** Two concurrent local
  runs contend for it and the loser exits on `EADDRINUSE: address already in use :::8000` — a Node
  listen failure, before any step executes. `tests run` exposes no flag to move it. Because it's a
  race rather than a hard conflict, a fan-out can succeed twice and fail the third time, which is
  the worst shape: an intermittent infrastructure error inside a parallel dispatch looks exactly
  like a flaky test. **Run local tests serially unless you have confirmed your CLI version doesn't
  share that port**, and if you do fan out, grep the logs for `EADDRINUSE` before reading any
  failure as a regression.

## Check your userland before trusting the script

**Treat the script below as a worked example, not a drop-in tool.** It was authored against BSD
`xargs`, `date`, and `sed`; the GNU versions differ in exactly the places this script is careful
about — GNU `xargs` runs once on empty input where BSD does not, and GNU exits 123 where BSD
exits 1.

**Check which userland you actually have rather than inferring it from the OS.** BSD-on-macOS and
GNU-on-Linux is only the common case: a macOS machine with Homebrew `findutils` or `coreutils` ahead
of `/usr/bin` on `PATH` runs the GNU versions, so the same machine can behave either way depending
on shell configuration. `xargs --version` answers it in one line — GNU prints a version banner, BSD
errors out. Read the script, adapt it to what you find, and verify the adaptation on a case you know
should fail before trusting a green result from it.

## Dispatch one before you dispatch twenty

`SKILL.md`'s **Canary before you fan out** requires one ahead of any fan-out. It is the same
command you're about to run N times, with the target you're about to pin.

**Take the canary out of `READ_ONLY`, not out of the whole set.** The canary is a dispatch like
any other, so it obeys the same bands — and a "cheap candidate you expect to pass" chosen without
that constraint tends to be the workspace-create test with a 98 quality score, which is a write
you never approved, made *before* the approval prompt even exists. Pick from `READ_ONLY`; if that
band is empty, a contained test is the fallback and the ask comes first. Set up `RUN_DIR` before
the canary so its log and exit code land in the same ledger as everything else, and pop it from
the pool afterward so it doesn't run twice.

```bash
# One dispatch directory for the whole wave, canary included. Keep it OUTSIDE any
# repo you might commit from — it fills with per-test logs, and a relative path
# lands wherever you happen to be standing.
export RUN_DIR="${TMPDIR:-/tmp}/tia-run-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$RUN_DIR"                                  # before the canary, not after
CANARY="${READ_ONLY[@]:0:1}"                         # first of the read-only band
READ_ONLY=( "${READ_ONLY[@]:1}" )                    # pop it so it can't run twice

mabl tests run --id "$CANARY" --headless --url "$MABL_URL" \
  --credentials-id "$MABL_CRED" --environment-id "$MABL_ENV" \
  --workspace-id "$MABL_WS" ${MABL_BRANCH:+--mabl-branch "$MABL_BRANCH"} \
  > "$RUN_DIR/canary-$CANARY.log" 2>&1
s=$?; echo "$CANARY exit=$s (canary)" >> "$RUN_DIR/results.txt"
[ "$s" -ne 0 ] && { echo "canary failed — fix the target before fanning out" >&2; exit "$s"; }
```

Note what the command does **not** pass: `--allow-billable-features`. A test whose coverage lives
in GenAI assertions hard-fails without it, which makes it a terrible canary — a red result that
means neither "wrong target" nor "interesting test." Screen those out of this local automatic wave
entirely (`SKILL.md`'s **Run it**): the flag bills, and spending is not inside the grant here. The
cloud path makes the opposite call on purpose (`SKILL.md`'s **Run it**), so this is a rule about
local dispatch, not a general one about GenAI assertions.

Read three things out of it before you continue:

- **The resolved-target header** (`URL:`, `Environment:`, `Credentials:`). This is the last
  moment reading it is cheap. It only reaches a log *after* a run has begun, so in a twenty-test
  fan-out it reports a wrong target twenty times too late.
- **Whether it passed at all.** Choosing a candidate you expect to pass is what makes a red
  canary mean *the target is wrong* rather than *this test is interesting*.
- **For cloud dispatches, what actually got deployed.** A cloud run exercises whatever is
  deployed to the target environment, not your working tree — so confirm the build you believe
  you're validating is the one that shipped. A merge can report green with every
  image-publishing job skipped, so the pipeline's own verdict proves nothing about which
  artifact exists.

A canary costs one run. The wave behind it costs N — and a mis-targeted wave costs N plus the
hours spent working out that ten of its "failures" were environment artifacts.

## The recipe

```bash
# Pin the WHOLE target before dispatch and export it, so every worker inherits the
# same one. Don't lean on defaults: credentials decide which workspace receives
# writes, and the resolved-target header only reaches a log after that run began.
# Note the scheme: a dev server serving HTTPS with a local self-signed certificate
# won't answer on http:// at all. Confirm yours before dispatching.
export MABL_URL="https://<registered-local-origin>:PORT" MABL_CRED=<credentials-id> MABL_ENV=<environment-id>

# Pin the reporting workspace too, to the SAME one the impact analysis ran against.
# The CLI keeps its own workspace setting that the MCP server never reads, so the
# two can disagree and your run records land somewhere you won't think to look.
# This scopes REPORTING only -- the credential still decides where the browser
# operates, and no flag changes that.
export MABL_WS=<workspace-id>

# The mabl branch the change under review names, if any. Leave it unset otherwise.
# When set, every dispatch below passes --mabl-branch, so a candidate authored on
# that branch runs its branch version instead of the master version that predates
# the change (SKILL.md, Screen before you run). Tests with no edits on the
# branch run master regardless.
export MABL_BRANCH=<mabl-branch-name>

# Screened ids, split by side-effect band (SKILL.md, Screen before you run,
# Kind C). Only three lists exist because only three things are dispatchable:
# read-only, contained, and whatever a human has actually approved BY ID. A
# shared-state or unverified candidate that nobody approved does not belong in
# any variable here — it is reported as pending approval, not run serially as a
# compromise. Unknown is not the same as safe, and "serially" is not a substitute
# for consent.
# One quoted id per element. Several ids inside one pair of quotes is a legal
# one-element array that dispatches as a single malformed --id.
# A candidate with no run history is banded by reading its steps like any other,
# so it belongs in whichever list its steps put it in — there is no fourth list
# for it, and "no history" is not a band.
READ_ONLY=( "<id-1>" "<id-2>" )                      # confirmed to only read
CONTAINED=( "<id-1>" "<id-2>" )                      # teardown you verified — serial
APPROVED=(  "<id-1>" "<id-2>" )                      # approved individually, BY ID

# RUN_DIR was already set and created by the canary step above — reuse it so the
# canary's result sits in the same ledger as the wave it gated. One directory per
# dispatch, because the results file is appended to and re-running after a fix is
# the normal path: in a shared directory the fixed test's pass lands next to its
# earlier failure and the record reads as both. Scoping also keeps the prior run
# to compare against, which is how you tell a flake from a real failure.
: "${RUN_DIR:?run the canary step first, or set RUN_DIR yourself}"

agg=0                                        # not `status`: read-only in zsh

# Read-only tests. PARALLEL defaults to 1 because the local runner binds a fixed
# port and concurrent runs race for it. Raise it only after confirming your CLI
# version doesn't, and keep it low even then — each worker is a real browser, and
# they share one local server and one backend. Guard the empty case: `printf` with
# no arguments still sends one blank line down the pipe -- going to an array does
# not save you from that -- and GNU xargs runs that blank line as an empty --id.
if [ ${#READ_ONLY[@]} -gt 0 ]; then
  printf '%s\n' "${READ_ONLY[@]}" | xargs -P "${PARALLEL:-1}" -I{} sh -c \
    'mabl tests run --id "$1" --headless --url "$MABL_URL" \
       --credentials-id "$MABL_CRED" --environment-id "$MABL_ENV" \
       --workspace-id "$MABL_WS" ${MABL_BRANCH:+--mabl-branch "$MABL_BRANCH"} \
       > "$RUN_DIR/run-$1.log" 2>&1
     s=$?; echo "$1 exit=$s" >> "$RUN_DIR/results.txt"; exit $s' _ {}
  agg=$?
fi

# Everything that writes: one at a time, so they cannot collide with each other.
# Note what is NOT in this loop — anything still awaiting approval.
for t in "${CONTAINED[@]}" "${APPROVED[@]}"; do
  mabl tests run --id "$t" --headless --url "$MABL_URL" \
    --credentials-id "$MABL_CRED" --environment-id "$MABL_ENV" \
    --workspace-id "$MABL_WS" ${MABL_BRANCH:+--mabl-branch "$MABL_BRANCH"} \
    > "$RUN_DIR/run-$t.log" 2>&1
  s=$?; echo "$t exit=$s" >> "$RUN_DIR/results.txt"
  [ "$s" -ne 0 ] && agg=$s
done

printf 'aggregate exit = %s (logs and results in %s)\n' "$agg" "$RUN_DIR" >&2
exit "$agg"                                  # in a script; drop when running by hand
```

(`--credentials-id` and `--creds` are aliases for the same option, as are `--environment-id` and
`--env`; the long forms are spelled out here for readability.)

## Why the recipe is shaped that way

**It pins the whole target before dispatch, not just the URL.** Settle credentials and environment
first and pass them explicitly, because the credential decides which workspace receives writes and
the resolved-target header only lands in a log *after* that run has started — by which point an
unintended workspace has already been written to. Confirming after dispatch isn't confirming. Pin
them even when you have a `--run-id` to work from: it inherits that run's url, environment, and
credentials together, which is how a run you believe is local ends up aimed wherever that one
pointed.

The reporting workspace is the fourth thing to pin, and the easiest to forget because nothing fails
when you get it wrong. The CLI has its own workspace setting that the MCP server never reads, so
the workspace your impact analysis ran against and the workspace your runs report into can differ
silently — leaving the records for a validation you did perform somewhere you won't think to look.
Pass the analyzed workspace explicitly. Note what this does and doesn't do: it scopes **reporting**
only. Where the browser actually operates still follows the credential, and no flag overrides that.

**It splits the set by side-effect band** — read-only tests in the bounded pool, everything that
writes serially — since writers are what collide, and the split is what makes the parallel half
safe.

**It has no bucket for "unconfirmed," and that is the point.** An earlier version of this recipe
swept unverified candidates into the serial list on the theory that serial is the harmless way to
be wrong. It isn't: serial protects those tests from *each other*, not the workspace from *them*.
A candidate whose side effects you couldn't establish is in the bottom band (`SKILL.md`'s
**Screen before you run**, Kind C) and needs approval like any other bottom-band test — so it
either appears in `APPROVED` because someone said yes to it by id, or it doesn't run and the
report says `pending approval`.

**It bounds the fan-out.** An impact set can reach ~50 tests, and starting 50 browsers at once
exhausts the workstation and makes them fight over the same backend — and, locally, over the
runner's fixed port. That's worse than slow: the resulting failures look exactly like regressions,
so an unbounded run doesn't just take longer, it corrupts the diagnosis you ran it for. Locally,
leave `PARALLEL` at 1; where concurrency is safe, 2–4 is the useful range.

**It captures each status and re-exits nonzero, at every level.** This is the subtlest thing here
and it bites twice. A status is only readable until the next command runs, so any command you
append — even an `echo` reporting the status — *becomes* the status. Leave the `echo` last inside
the worker and the worker exits 0; leave `echo "aggregate exit = $?"` last in the script and the
script exits 0. Either way **the run reports success while tests were failing**, which is worse
than no gate at all, because it looks like a green validation. Both failure modes, and the fix,
were verified by execution. The rule that prevents it: assign `$?` to a variable immediately, print
the variable, and `exit` it — never let a reporting command be the last thing that ran.

## Reading the aggregate

Read the aggregate as a flag, not as a code. `xargs` reports only *that* some child failed,
collapsing it to a single value — 1 with BSD, 123 with GNU — so the parallel half cannot hand back
the failing test's own exit code, while the serial half does. That's why every status also goes to
`$RUN_DIR/results.txt`: the aggregate answers "do I need to look," and the results file answers "at
which test, with what code." Keep that file per-dispatch, as the recipe does. It's appended to, and
you will re-run after a fix — pointing two dispatches at one file leaves the same test recorded as
both failing and passing, and a record that says both is worse than no record.
