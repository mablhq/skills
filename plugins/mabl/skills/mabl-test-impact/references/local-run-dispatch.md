# Dispatching local runs: the headless parallel recipe

Read this before dispatching a wave. The **canary** section applies to any dispatch, cloud or local;
everything after it is the local-CLI path — the defaults that mislead, a worked dispatch script, and
how to read the exit codes it produces.

`SKILL.md`'s **Run it** carries the rules you must not break (canary before fan-out; pin the whole
target; split the set by band; capture every status). This file is how to implement them.

## CLI defaults that will fool you

- `tests run` has **no JSON output** — the exit code is the only pass/fail signal, so capture it
  immediately; a wrapper's own last command can mask it.
- **`--headless` defaults to `false`**, so a run you assumed was headless opens a visible browser
  window, once per test. Pass it explicitly.
- **Every test runs at its master version unless you say otherwise.** `tests run` takes
  `--mabl-branch`; without it a candidate authored on the branch for the change under review runs the
  version from before the change. The recipe carries the branch on every dispatch when `MABL_BRANCH`
  is set, and a test with no edits on that branch still runs its master version, so setting it costs
  nothing for the rest of the wave.
- The CLI runs its own test set **sequentially**. For real parallelism, fan out one process per test,
  not one CLI invocation with many.
- **The artifacts directory is not your failure forensics.** The runner prints an artifacts path on
  startup and logs `Capture state of application after test` on the way down, so the directory looks
  like it should hold something; on a failing local run it does not. Plan to diagnose from the console
  output. Don't confuse it with `agent debug artifact`, a genuinely rich per-step forensic store keyed
  to a cloud test-run id, which a local run never produces.
- **The runner binds a fixed local port, so local parallelism is a race.** Two concurrent local runs
  contend for it and the loser exits on `EADDRINUSE: address already in use :::8000` — a Node listen
  failure, before any step executes — and `tests run` exposes no flag to move it. Because it is a race
  rather than a hard conflict, a fan-out can succeed twice and fail the third time, which is the worst
  shape: an intermittent infrastructure error inside a parallel dispatch looks exactly like a flaky
  test. **Run local tests serially unless you have confirmed your CLI version doesn't share that
  port**, and if you do fan out, grep the logs for `EADDRINUSE` before reading any failure as a
  regression.

## Check your userland before trusting the script

The script below runs as one compound command outside the skill's pre-approved `allowed-tools`, so it
asks for approval once. It is a worked example, not a drop-in tool: it was authored against BSD `xargs`, `date`
and `sed`, and the GNU versions differ in exactly the places it is careful about — GNU `xargs` runs
once on empty input where BSD does not, and GNU exits 123 where BSD exits 1. Check which userland you
have rather than inferring it from the OS, since Homebrew `findutils` or `coreutils` ahead of
`/usr/bin` makes a macOS machine behave the GNU way: `xargs --version` answers it in one line, GNU
printing a version banner and BSD erroring out. Adapt the script to what you find, and verify the
adaptation on a case you know should fail before trusting a green result from it.

## Dispatch one before you dispatch twenty

`SKILL.md`'s **Canary** requires one ahead of any fan-out. It is the same command you are about to run
N times, with the target you are about to pin.

**Take the canary out of `READ_ONLY`, not out of the whole set.** The canary is a dispatch like any
other, so it obeys the same bands — and a "cheap candidate you expect to pass" chosen without that
constraint tends to be a create-and-delete test with a high quality score, which is a write you never
approved, made *before* the approval prompt exists. If the read-only band is empty, a contained canary
is an ask, not a fallback you take yourself. Set up `RUN_DIR` before the canary so its log and exit
code land in the same ledger as everything else, and pop it from the pool afterward so it doesn't run
twice.

```bash
# One dispatch directory for the whole wave, canary included. Keep it OUTSIDE any
# repo you might commit from; a relative path lands wherever you are standing.
export RUN_DIR="${TMPDIR:-/tmp}/test-impact-run-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$RUN_DIR"                                  # before the canary, not after

# An empty read-only band is an ask, not a dispatch: `${READ_ONLY[@]:0:1}` on an
# empty array expands to nothing and runs `--id ""`, which misreads as a bad target.
# The exports and band arrays come from **The recipe** below; define them first, then run this.
[ ${#READ_ONLY[@]} -gt 0 ] || { echo "read-only band is empty — a contained canary is an ask, not a dispatch" >&2; exit 2; }
CANARY="${READ_ONLY[@]:0:1}"                         # slice, not [0]: zsh arrays start at 1
READ_ONLY=( "${READ_ONLY[@]:1}" )                    # pop it so it can't run twice

mabl tests run --id "$CANARY" --headless --url "$MABL_URL" \
  --credentials-id "$MABL_CRED" --environment-id "$MABL_ENV" \
  --workspace-id "$MABL_WS" ${MABL_BRANCH:+--mabl-branch "$MABL_BRANCH"} \
  > "$RUN_DIR/canary-$CANARY.log" 2>&1
s=$?; echo "$CANARY exit=$s (canary)" >> "$RUN_DIR/results.txt"
[ "$s" -ne 0 ] && { echo "canary failed — fix the target before fanning out" >&2; exit "$s"; }
```

Note what the command does **not** pass: `--allow-billable-features`. A test whose coverage lives in
GenAI assertions hard-fails without it, which makes it a terrible canary — a red result that means
neither "wrong target" nor "interesting test." Those tests are screened out of the local automatic
wave entirely, and the flag is never yours to add (`SKILL.md`, **Hard gates**).

Read three things out of the canary before you continue:

- **The resolved target** — the `URL:`/`Environment:`/`Credentials:` header for a CLI canary,
  `resolvedBinding` in the `run_mabl_test_cloud` response for a cloud one. This is the last moment
  reading it is cheap: it only reaches a log *after* a run has begun, so in a twenty-test fan-out it
  reports a wrong target twenty times too late.
- **Whether it passed at all.** Choosing a candidate you expect to pass is what makes a red canary
  mean *the target is wrong* rather than *this test is interesting*.
- **For cloud dispatches, what actually got deployed.** A cloud run exercises whatever is deployed to
  the target environment, not your working tree, and a merge can report green with every
  image-publishing job skipped, so the pipeline's own verdict proves nothing about which artifact
  exists.

A canary costs one run. The wave behind it costs N — and a mis-targeted wave costs N plus the hours
spent working out that its failures were environment artifacts.

## The recipe

```bash
# Pin the WHOLE target before dispatch and export it, so every worker inherits one.
# Credentials decide which account receives writes, and the resolved-target header
# only reaches a log after that run began. Note the scheme: a dev server serving
# HTTPS with a local self-signed certificate won't answer on http:// at all.
export MABL_URL="https://<registered-local-origin>:PORT" MABL_CRED=<credentials-id> MABL_ENV=<environment-id>

# Pin the reporting workspace to the SAME one the impact analysis ran against: the
# CLI keeps its own workspace setting the MCP server never reads, so the two can
# disagree and your run records land somewhere you won't think to look. This scopes
# REPORTING only -- the credential still decides where the browser operates.
export MABL_WS=<workspace-id>

# The mabl branch the change under review names, if any; empty otherwise.
# When set, every dispatch passes --mabl-branch, so a candidate authored on that
# branch runs its branch version instead of the master version that predates the
# change (SKILL.md, Hard gates). Tests with no edits on it run master regardless.
export MABL_BRANCH=""   # set to the branch name when the change names one

# Screened ids, split by side-effect band (SKILL.md, Side-effect bands). Only three
# lists exist because only three things are dispatchable: read-only, contained, and
# whatever a human approved BY ID. A shared-state or unverified candidate nobody
# approved belongs in no variable here -- it is reported as pending approval, not
# run serially as a compromise. One quoted id per element: several ids inside one
# pair of quotes is a legal one-element array that dispatches as a single malformed
# --id. A candidate with no run history is banded by reading its steps like any
# other, so it belongs in whichever list its steps put it in.
READ_ONLY=( "<id-1>" "<id-2>" )                      # confirmed to only read
CONTAINED=( "<id-1>" "<id-2>" )                      # teardown you verified — serial; EMPTY when the change is itself destructive (Side-effect bands override): those ids go to the ask
APPROVED=(  "<id-1>" "<id-2>" )                      # approved individually, BY ID

# RUN_DIR was set and created by the canary step above — reuse it so the canary's
# result sits in the same ledger as the wave it gated. One directory per dispatch:
# the results file is appended to, and re-running after a fix is the normal path, so
# a shared directory records the same test as both failing and passing.
: "${RUN_DIR:?run the canary step first, or set RUN_DIR yourself}"

agg=0                                        # not `status`: read-only in zsh

# Read-only tests. PARALLEL defaults to 1 because the local runner binds a fixed
# port and concurrent runs race for it; raise it only after confirming yours
# doesn't, and keep it low even then. Guard the empty case: `printf` with no
# arguments still sends one blank line down the pipe, which GNU xargs runs as an
# empty --id.
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
  # Assign $? immediately: any command after it, even an echo, becomes the status.
  s=$?; echo "$t exit=$s" >> "$RUN_DIR/results.txt"
  [ "$s" -ne 0 ] && agg=$s
done

printf 'aggregate exit = %s (logs and results in %s)\n' "$agg" "$RUN_DIR" >&2
exit "$agg"                                  # in a script; drop when running by hand
```

(`--credentials-id` and `--creds` are aliases for the same option, as are `--environment-id` and
`--env`; the long forms are spelled out here for readability.)

## Reading the aggregate

Read the aggregate as a flag, not as a code. `xargs` reports only *that* some child failed, collapsing
it to a single value — 1 with BSD, 123 with GNU — so the parallel half cannot hand back the failing
test's own exit code, while the serial half does. That is why every status also goes to
`$RUN_DIR/results.txt`: the aggregate answers "do I need to look," and the results file answers "at
which test, with what code." Keep that file per-dispatch, as the recipe does — it is appended to, and
you will re-run after a fix, so pointing two dispatches at one file leaves the same test recorded as
both failing and passing, and a record that says both is worse than no record.
