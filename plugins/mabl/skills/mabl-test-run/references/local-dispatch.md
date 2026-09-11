# Dispatching a set locally

The worked dispatch behind `SKILL.md`'s **Dispatching a set**. That section
carries the rules — canary first, serial locally, a budget on the wave, capture
each status immediately. This is one way to implement them.

**Treat this as a worked example, not a drop-in tool.** It was written against
BSD `xargs`; the GNU version differs in the two places the script is careful
about — GNU runs once on empty input where BSD does not, and the two report a
failed child with different exit values.

## Check the userland before trusting the script

Check which one is installed rather than inferring it from the operating system.
A macOS machine with GNU `findutils` or `coreutils` ahead of `/usr/bin` on the
path runs the GNU versions, so the same machine behaves either way depending on
shell configuration.

```bash
xargs --version    # GNU prints a version banner; BSD errors out
```

Read the script, adapt it to what is installed, and verify the adaptation on a
case known to fail before trusting a green result from it.

## Pin the target, then canary

```bash
# One dispatch directory for the whole wave, canary included. Keep it outside any
# repository that might be committed from — it fills with per-test logs, and a
# relative path lands wherever the shell happens to be standing.
export RUN_DIR="${TMPDIR:-/tmp}/mabl-run-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$RUN_DIR"

# Pin the whole target and export it, so every dispatch inherits the same one.
# The scheme matters: a development server serving HTTPS with a self-signed
# certificate does not answer on http:// at all.
export MABL_URL="https://<host>:<port>" MABL_CRED=<credentials-id> MABL_ENV=<environment-id>

# Pin the reporting workspace too. This scopes reporting only — where the browser
# operates still follows the credentials, and no flag changes that.
export MABL_WS=<workspace-id>

# The mabl branch the caller named, if any. Leave unset otherwise.
export MABL_BRANCH=<branch-name>

# The ids the caller handed over, in the grouping the caller gave. No id is
# invented here and none is reclassified: an id the caller did not hand over does
# not appear, and one they did is not moved between groups.
WAVE=( "<id-1>" "<id-2>" )

# One quoted id per element. Several ids inside one pair of quotes is a legal
# one-element array that dispatches as a single malformed --id.
CANARY="${WAVE[@]:0:1}"        # offset form: bash indexes arrays from 0, zsh from 1
WAVE=( "${WAVE[@]:1}" )        # pop it so it cannot run twice

mabl tests run --id "$CANARY" --headless --allow-billable-features \
  --url "$MABL_URL" --credentials-id "$MABL_CRED" --environment-id "$MABL_ENV" \
  --workspace-id "$MABL_WS" ${MABL_BRANCH:+--mabl-branch "$MABL_BRANCH"} \
  > "$RUN_DIR/canary-$CANARY.log" 2>&1
s=$?; echo "$CANARY exit=$s (canary)" >> "$RUN_DIR/results.txt"
[ "$s" -ne 0 ] && { echo "canary failed; fix the target before dispatching the rest" >&2; exit "$s"; }
```

Read three things out of the canary before continuing: the resolved-target header
(`URL:`, `Environment:`, `Credentials:`), which only reaches a log after a run has
begun and so reports a wrong target once rather than twenty times; whether it
passed at all; and, for a cloud dispatch, which application build is actually
deployed to the target environment.

## The wave

```bash
: "${RUN_DIR:?run the canary step first, or set RUN_DIR}"

agg=0                          # not `status`: that name is read-only in zsh

for t in "${WAVE[@]}"; do
  mabl tests run --id "$t" --headless --allow-billable-features \
    --url "$MABL_URL" --credentials-id "$MABL_CRED" --environment-id "$MABL_ENV" \
    --workspace-id "$MABL_WS" ${MABL_BRANCH:+--mabl-branch "$MABL_BRANCH"} \
    > "$RUN_DIR/run-$t.log" 2>&1
  s=$?; echo "$t exit=$s" >> "$RUN_DIR/results.txt"
  [ "$s" -ne 0 ] && agg=$s
done

printf 'aggregate exit = %s (logs and results in %s)\n' "$agg" "$RUN_DIR" >&2
exit "$agg"                    # in a script; drop when running by hand
```

Serial is the shape locally, because local and CI execution is sequential and a
second local run started alongside the first fails with `EADDRINUSE: address
already in use` before any step executes.

Where a caller has asked for concurrency and accepted that, the same body goes
through `xargs` with a small pool. Each worker is a real browser sharing one
machine and one backend, so 2 to 4 is the useful range. Guard the empty case:
`printf` with no arguments still sends one blank line down the pipe, and GNU
`xargs` runs that blank line as an empty `--id`.

```bash
if [ ${#WAVE[@]} -gt 0 ]; then
  printf '%s\n' "${WAVE[@]}" | xargs -P "${PARALLEL:-1}" -I{} sh -c \
    'mabl tests run --id "$1" --headless --allow-billable-features \
       --url "$MABL_URL" --credentials-id "$MABL_CRED" --environment-id "$MABL_ENV" \
       --workspace-id "$MABL_WS" ${MABL_BRANCH:+--mabl-branch "$MABL_BRANCH"} \
       > "$RUN_DIR/run-$1.log" 2>&1
     s=$?; echo "$1 exit=$s" >> "$RUN_DIR/results.txt"; exit $s' _ {}
  agg=$?
fi
```

## Why it is shaped that way

**The status is captured on the next line, every time.** `mabl tests run` prints
no machine format, so the exit status is the only pass or fail it gives, and a
status is readable only until the next command runs. Any command appended after
it — including an `echo` reporting the status — *becomes* the status. Leave the
`echo` last inside the worker and the worker exits 0; leave a reporting command
last in the script and the script exits 0. Either way the dispatch reports
success while tests were failing, which is worse than no gate at all, because it
looks like a green validation. Assign the status to a variable immediately, print
the variable, and exit it.

**The results file is per dispatch.** It is appended to, and re-running after a
fix is the normal path. Two dispatches pointed at one file leave the same test
recorded as both failing and passing, and a record that says both is worse than
no record.

**The aggregate is a flag, not a code.** `xargs` reports only that some child
failed, collapsing it to one value, so the parallel form cannot hand back the
failing test's own status while the serial form does. That is why every status
also goes to the results file: the aggregate answers whether to look, and the
results file answers at which test and with what status.

## Publishing the wave's results

Adding `--reporter mabl` to each dispatch publishes the results to the app. They
publish after every test in that invocation has completed, so an invocation
stopped partway publishes none of its results — one invocation per test, as
above, keeps each result independent of the rest of the wave.
