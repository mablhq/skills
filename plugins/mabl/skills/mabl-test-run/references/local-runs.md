# Local runs: targets, gates, and the parallel recipe

Read this before dispatching through the local CLI. `SKILL.md` owns the rules (bands, canary, asks);
this file is how the CLI implements them. `mabl tests run --help` on your installed CLI is
authoritative over any command here.

## CLI defaults that mislead

- `tests run` has **no JSON output**: the exit code is the only pass/fail signal. Capture it
  immediately; a wrapper's own last command can mask it.
- **`--headless` defaults to `false`**, so every test opens a visible browser. Pass it.
- **`--allow-billable-features` defaults to `false`**, so a GenAI assertion fails with a message
  naming the flag. That test is not in the local wave (`SKILL.md`, **Hard gates**); a site note that
  permits the flag puts it on the command lines below.
- **Every test runs at its master version** unless you pass `--mabl-branch`. The recipe passes it
  whenever `MABL_BRANCH` is set; a test with no edits on that branch runs master anyway.
- The CLI runs its own test set **sequentially**. Parallelism means one process per test.
- **The artifacts directory is not your forensics.** On a failing local run it holds nothing useful;
  diagnose from the console output. `agent debug artifact` is keyed to a cloud run id, which a local
  run never produces.
- **The runner binds a fixed local port**, so concurrent runs race for it and the loser exits on
  `EADDRINUSE: address already in use :::8000` before any step. It can succeed twice and fail the
  third time, which reads like a flaky test. Run serially unless you confirmed your CLI doesn't share
  the port, and grep fan-out logs for `EADDRINUSE` before reading any failure as a regression.
- **`tests run --id <test>` bypasses the enabled check** (`singleTestRun: true`), so a disabled test
  runs with no warning. The disabled gate has to happen before dispatch.

**Screening with the CLI.** `mabl tests list` reports enabled state; its `--limit` **defaults to 10**.
`mabl tests get-runs <test-id>` lists recent runs with a failure category each, and needs the
`MIN_MABL_CLI_VERSION` floor. Don't substitute `mabl test-runs get-test`, which goes run → test. The
CLI can't give the server-computed aggregate, and it can't give the test's recorded target: `tests list
-o json` has no url, and `tests export --format json` has no `url`, `environmentId` or
`credentialsId`. `get_mabl_test` has the url.

## Which target a run resolves

`tests run` prints the target it resolved near the top of its output, in this order, interleaved with
a few other lines:

```
URL: <resolved url>
Environment: <name> - <environment-id>
Credentials: <name> - <credentials-id>
```

Read them against your intent before trusting the result. **`Environment:` is omitted entirely** when
nothing resolved, while `Credentials:` prints blank or `None`: a *missing* line is the signal. `URL:`
doesn't print at all for a mobile test.

- `--workspace-id` scopes where **results are reported**, not the account the test operates in. The
  browser signs in as whoever owns the **credential**.
- Without `--url` or `--run-id`, an `--environment-id`-only run and a bare `tests run --id <test>`
  both resolve **the test's own recorded url**; `--environment-id` alone doesn't change it. An unset
  url fails loudly (*"No default URL found on test"*). `runContext.defaults.urlSet: false` predicts
  that error. A set url says nothing about whether it's the host you want.
- `--run-id <test-run-id>` inherits url, environment and credentials **together** from a prior cloud
  run: the easy first move. Its target can be **stale or ephemeral** (a preview host that's gone), so
  read the header, and override with `--url`.
- Credentials marked `cloud_only` are rejected locally. `defaults.credentialCloudOnly` answers it per
  test, present only when the credential resolved; absent is unknown. `credentials list` warns without
  naming which credential; check with `-o json`.
- A test's real destination is in its **navigation** (`VisitUrl`) steps, not its selectors: every
  selector carries the url it was recorded on. `mabl tests export --format json` (with `--mabl-branch`
  when you dispatch with one) has the steps **nested under `flows[].steps`**, not at the top level. It
  writes `<test-id>-<n>.mabl.json` to your current directory; don't commit it.

## Local target gates

The certificate has to cover the hostname you use, and the identity provider's allowlist has to hold
the whole scheme-host-port origin. One tells you nothing about the other.

**Trust the certificate.** `tests run` has no flag to ignore certificate errors (a debug session takes
`--browser-ignore-certificate-errors` from CLI 2.128.4), so a local wave needs the certificate
trusted, or it fails with `ERR_CERT_AUTHORITY_INVALID`. Add it to the OS trust store: the System
keychain on macOS; `/usr/local/share/ca-certificates/` plus `update-ca-certificates` or `trust anchor`
on Linux, and Chrome's NSS store via `certutil -d sql:$HOME/.pki/nssdb`; *Trusted Root Certification
Authorities* on Windows. Those take `sudo`: propose the command, don't run it unattended. Verify it
succeeds **without** `-k`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "https://<host>:<port>/"
```

**Confirm the port.** A dev server often falls through to the next free port, so a stale one can keep
answering on the expected port: `lsof -nP -iTCP -sTCP:LISTEN` on macOS or BSD, `ss -ltnp` on Linux.

**Use the registered origin.** Sign-in posts to the identity provider cross-origin, and it answers
only for allowlisted origins, usually a dedicated loopback hostname on a fixed port rather than
`https://localhost:<port>`. **The port is part of the origin:** a server that fell through to another
port breaks sign-in while serving the app fine, and so does `localhost` in place of the registered
name. The symptom is UI steps passing, no session, and the first post-login element never found. A
preflight request to the identity provider settles it before a run: read the response, not the exit
status. The origin must come back echoed exactly, and a credentialed sign-in needs allow-credentials,
which a wildcard satisfies on a presence check and still fails in the browser.

**Does step 1 navigate?** A test with no leading *Visit URL* starts on a blank page under the CLI and
fails step 1 in ~30 seconds, whatever the target. `--url` only supplies what *Visit URL* resolves
against. **A passing cloud run doesn't rule it out**: the cloud runner navigates first and the local one
doesn't. Check the export's `flows[].steps`. It is a test defect: pick another candidate or say so in
the row.

**`defaults.urlSet: false`** is a different failure: no default URL, so a run without `--url` or
`--run-id` fails at once. The recipe pins `--url`, which makes it survivable.

## Verify the served build

A correct URL is not a correct build. A dev server left running from earlier work passes every target
check while serving a tree without your change, and then the tests *pass* for the wrong reason.
Before trusting a local run, fetch the page and grep the bundle for a string your change introduced,
or confirm the branch and commit the server was started from. That evidence is the report's "what
ran" for a local run.

## The four dispatch rules

- **Pin the whole target** on every run: url, credentials, environment *and* reporting workspace.
  The CLI keeps its own workspace setting, which the MCP server never reads.
- **Default to serial**: the fixed port makes concurrent local runs a race.
- **Split by band**: read-only in a small pool (2–4) at most, contained and approved tests serially.
  A test whose side effects you couldn't establish is in neither list until someone approves it by id.
- **Capture each exit code immediately** into a per-dispatch results file. Any command after
  `tests run`, even an `echo`, becomes the status.

## Check your userland first

The script runs as one compound command, so it asks for approval once. It was written against BSD
`xargs`, `date` and `sed`; GNU `xargs` runs once on empty input where BSD does not, and exits 123
where BSD exits 1. `xargs --version` tells you which you have (GNU prints a banner, BSD errors);
Homebrew `findutils` ahead of `/usr/bin` makes a Mac behave the GNU way. Adapt the script, and verify
the adaptation on a case that should fail before trusting a green result.

## The canary

Take it from `READ_ONLY`, not from the whole set. An empty read-only band is an ask. Set up `RUN_DIR`
first so the canary lands in the same ledger, and pop it from the pool so it doesn't run twice. Define
the exports and arrays from **The recipe** before running this.

```bash
# Keep RUN_DIR outside any repo you might commit from.
export RUN_DIR="${TMPDIR:-/tmp}/test-run-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$RUN_DIR"

# `${READ_ONLY[@]:0:1}` on an empty array runs `--id ""`, which misreads as a bad target.
[ ${#READ_ONLY[@]} -gt 0 ] || { echo "read-only band is empty — a contained canary is an ask, not a dispatch" >&2; exit 2; }
CANARY="${READ_ONLY[@]:0:1}"                         # slice, not [0]: zsh arrays start at 1
READ_ONLY=( "${READ_ONLY[@]:1}" )

mabl tests run --id "$CANARY" --headless --url "$MABL_URL" \
  --credentials-id "$MABL_CRED" --environment-id "$MABL_ENV" \
  --workspace-id "$MABL_WS" ${MABL_BRANCH:+--mabl-branch "$MABL_BRANCH"} \
  > "$RUN_DIR/canary-$CANARY.log" 2>&1
s=$?; echo "$CANARY exit=$s (canary)" >> "$RUN_DIR/results.txt"
[ "$s" -ne 0 ] && { echo "canary failed — fix the target before fanning out" >&2; exit "$s"; }
```

Read its resolved-target header before continuing; in a twenty-test fan-out a wrong target reports
itself twenty times too late.

## The recipe

```bash
# Pin the whole target; every worker inherits it. Mind the scheme: an HTTPS dev server
# won't answer on http://.
export MABL_URL="https://<registered-local-origin>:PORT" MABL_CRED=<credentials-id> MABL_ENV=<environment-id>
export MABL_WS=<workspace-id>   # the tests' workspace; sets where results report, nothing else
export MABL_BRANCH=""           # the mabl branch the change names, if any

# One quoted id per element. Only three lists exist, because only these are dispatchable.
READ_ONLY=( "<id-1>" "<id-2>" )  # confirmed to only read
CONTAINED=( "<id-1>" "<id-2>" )  # verified teardown; EMPTY when the change is destructive
APPROVED=(  "<id-1>" "<id-2>" )  # approved individually, by id

# One directory per dispatch: results.txt is appended to, and a re-run after a fix
# would record the same test as both failing and passing.
: "${RUN_DIR:?run the canary step first, or set RUN_DIR yourself}"
agg=0                            # not `status`: read-only in zsh

# PARALLEL defaults to 1 (the fixed port).
if [ ${#READ_ONLY[@]} -gt 0 ]; then
  printf '%s\n' "${READ_ONLY[@]}" | xargs -P "${PARALLEL:-1}" -I{} sh -c \
    'mabl tests run --id "$1" --headless --url "$MABL_URL" \
       --credentials-id "$MABL_CRED" --environment-id "$MABL_ENV" \
       --workspace-id "$MABL_WS" ${MABL_BRANCH:+--mabl-branch "$MABL_BRANCH"} \
       > "$RUN_DIR/run-$1.log" 2>&1
     s=$?; echo "$1 exit=$s" >> "$RUN_DIR/results.txt"; exit $s' _ {}
  agg=$?
fi

# Everything that writes runs one at a time. Nothing awaiting approval is in this loop.
for t in "${CONTAINED[@]}" "${APPROVED[@]}"; do
  mabl tests run --id "$t" --headless --url "$MABL_URL" \
    --credentials-id "$MABL_CRED" --environment-id "$MABL_ENV" \
    --workspace-id "$MABL_WS" ${MABL_BRANCH:+--mabl-branch "$MABL_BRANCH"} \
    > "$RUN_DIR/run-$t.log" 2>&1
  s=$?; echo "$t exit=$s" >> "$RUN_DIR/results.txt"   # assign $? immediately
  [ "$s" -ne 0 ] && agg=$s
done

printf 'aggregate exit = %s (logs and results in %s)\n' "$agg" "$RUN_DIR" >&2
exit "$agg"                      # in a script; drop when running by hand
```

`--credentials-id`/`--creds` and `--environment-id`/`--env` are aliases.

## Reading the aggregate

Read the aggregate as a flag, not a code. `xargs` collapses any child failure to one value (1 with
BSD, 123 with GNU), so the parallel half can't return the failing test's own code; the serial half
can. The aggregate answers "do I need to look"; `$RUN_DIR/results.txt` answers "at which test, with
what code." Keep that file per dispatch.
