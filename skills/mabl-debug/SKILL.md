---
name: mabl-debug
description: |
  Diagnose and fix failures detected by mabl end-to-end tests. Forensic
  inspection of an already-failed run (`mabl agent debug steps`,
  `mabl agent debug artifact`) plus an interactive live session that
  re-runs the test step-by-step in a real Chrome attached to the agent
  via CDP (`mabl agent debug session …`).
  Fire when the user mentions a mabl test failure, gives a test run ID
  (`*-jr`) or plan run ID (`*-pr`), asks to investigate / debug / fix /
  reproduce a failing test, or pairs "mabl" with words like "failing",
  "broken", "regression", "step through".
allowed-tools: Bash, mcp__mabl__*, mcp__chrome-for-mabl__*
---

# mabl agent debug

Investigate a failed mabl test, reproduce it locally, and verify the fix.

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.111.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth info    # verify you're logged in (run `mabl auth login --auto` if not)
```

> **Command + flag discovery.** Don't guess flag names — ask the CLI.
> Run `mabl agent debug command-list` for a single JSON tree of every
> subcommand, its full command path, positionals, and options. Add
> `--output yaml` for a human-readable form. At any group level the same
> command works on the subtree — e.g. `mabl agent debug session
> command-list` lists just the session subcommands.
>
> Use `mabl agent debug <subcommand> --help` when you want yargs'
> formatted text help for one specific command.

> **Output shape per command.** `artifact <type>` defaults to a
> `{step_run_id, type, file, size_bytes}` envelope so the agent can read
> `size_bytes` before slicing. `debug steps` and `list-steps` default to
> YAML for readability (override with `--output json` for tooling).
> Everything else (`get-variables`, `set-current-step`, `run-step`,
> `run-to-step`, `run-all`, `session start`) prints bare JSON to stdout.
> When you pipe to `jq`, check the command — `debug steps` and
> `list-steps` need `--output json` first.

## The fix loop

```
1. Triage      → debug steps + debug artifact
                 (what failed, on which step, with what state on the page)
2. Hypothesize → grep / git log against the failing endpoint, selector,
                 or stack-trace function name
3. Reproduce   → debug session start --run-id <jr-id> --url <your local url>
                 (real Chrome attached to the agent via CDP)
4. Verify      → re-run the failing step (or the rest of the test) against
                 the patched code; a green run-step is your check
```

Steps 1–2 are stateless and token-cheap. Step 3 is stateful and launches
a real browser the agent drives directly.

---

## 1. Triage — read the failed run

> **Browser tests only.** `debug steps` and `session start` both refuse
> API, performance, and mobile test runs up front. Performance tests
> don't expose per-step artifacts at all — for those, read the run
> report in the mabl UI. API and mobile runs use a different execution
> shape that this CLI surface doesn't cover.

```bash
# Step trace, default. Output is the failed steps and the steps that
# Runtime recovery recovered (plus the summary block). Pass --all if
# you need to see passed / skipped steps as well.
mabl agent debug steps <jr-id>
mabl agent debug steps <jr-id> --all   # full trace
```

When the default trace hides entries, it tells you so via a top-level
`note` field — the exact string is `"Filtered to failed/recovered
steps (N hidden). Pass --all to see the full trace."`. Treat that as
"the run executed more than the failed step, you just don't need to
see the noise yet."

Each entry has `index` (1-based), `step_run_id`, `flow`, `action`,
`description`, `status` (`passed` / `failed` / `skipped` /
`recovered`), `duration_ms`, `step_id` (per-flow — feed to live-session
commands), and `step_id_in_test` (per-test). The trace also carries a
top-level `summary` block on any failed-or-recovered run; on those it
also includes `summary.step_id` — that's the value to copy straight
into `debug session run-step` / `run-to-step` after triage. The
top-level summary is the one to scan first; the API-side
`failure_summary` payload (where `step_id_in_test` originates) is only
present on hard failures, not on TRA-recovered runs. `step_run_id` is
what every `artifact` call below takes.

```bash
# Drill into one artifact for the failing step.
# Default output is a {step_run_id, type, file, size_bytes} envelope —
# read size_bytes BEFORE deciding how to consume the file.
mabl agent debug artifact <type> <jr-id> --step-run-id <sid>
```

> **Prefer this over the hosted MCP's `get_test_run_artifact`.** The CLI
> downloads once to `.mabl/debug/<jr-id>/`, slices locally with
> `--query` / `--text-only` / `--head/--tail/--bytes`, and reuses the
> cached file across calls. The MCP equivalent ships the full payload
> through the MCP transport every time — for a 15 MB HAR that's
> hostile to your context window. Reach for the MCP version only when
> you don't have shell access.

Artifact types and the right slicer for each:

| Artifact | Typical size | Best for | Use this flag |
|----------|-------------:|----------|---------------|
| `console` | 10–100 KB JSON | JS errors / page errors | `--query '[.console_logs[] \| select(.level == "error" or .level == "severe")] + .javascript_exceptions'` |
| `network` | 1–15 MB HAR | failed / slow requests | `--query '.log.entries[] \| select(.response.status >= 400) \| {url: .request.url, status: .response.status}'` |
| `dom` | 0.5–5 MB HTML | failing element + neighbors | `--text-only` (one line per role / name / id / data-testid) |
| `screenshot` | 100–500 KB PNG | visual / dialog / layout | open `file` from the envelope |

Flag picker:

- JSON artifacts (`console`, `network`) → `--query <jq-expr>` first. Always.
- `--head N` / `--tail N` are **line-oriented** — console / network are
  often a single long JSON line, so `--head 5` happily returns the
  whole blob. Use `--query` to slice JSON; reach for `--bytes` only
  when you specifically need a fixed-byte prefix.
- DOM → `--text-only`. The full HTML almost never fits in context.
  Page chrome (header, nav, footer) renders first in the listing, so
  on a big React app the top of `--text-only` is mostly framing. To
  find a specific component, pipe through grep:
  `... --text-only | grep -iE "modal|dialog|<your-feature>"`. Or read
  the cached `.html` directly when grep isn't precise enough.
- Need raw bytes? → check `size_bytes`. Under ~50 KB → `--print`.
  Otherwise `--bytes 8000` for a peek, or read the cached file directly.
- Screenshot → display the file path; `--print` is rejected for binary.
- `--before` (screenshot only) gives the pre-action snapshot. Runs
  without a pre-action capture return a soft envelope —
  `{step_run_id, type, before, note: "before-screenshot not available for step run <sid>"}` —
  not an error. Treat it as "the snapshot just doesn't exist for this
  step" and fall back to the post-action screenshot.

Example — full triage of a failing click:

```bash
SID=$(mabl agent debug steps abc123-jr --output json \
  | jq -r '.steps[] | select(.status == "failed" or .status == "recovered") | .step_run_id' | head -1)

# What did the network look like at the failing step?
mabl agent debug artifact network abc123-jr --step-run-id "$SID" \
  --query '.log.entries[] | select(.response.status >= 400) | {url: .request.url, status: .response.status}'

# What was on the page right before the click?
mabl agent debug artifact dom abc123-jr --step-run-id "$SID" --text-only | head -40

# Any uncaught JS errors?
mabl agent debug artifact console abc123-jr --step-run-id "$SID" \
  --query '[.console_logs[] | select(.level == "error" or .level == "severe")] + .javascript_exceptions'
```

Artifacts cache to `.mabl/debug/<jr-id>/` (gitignored) and are reused
across calls.

### Recovered steps

A step with `status: "recovered"` is a step that **failed**, then was
salvaged by Runtime recovery so the run could continue. The trace
shows it as `recovered` (not passed) precisely because it's still a
real bug — Runtime recovery papered over it for the run, but the
underlying cause stays.

Each recovered entry carries `recovery.session_id` (a `*-as` id). Feed
it to the hosted MCP's `get_runtime_recovery_session` to see what
Runtime recovery actually did — the action it took to advance the test:

```
mcp__mabl__get_runtime_recovery_session({ session_id: "<*-as>" })
```

The recovery action is your strongest signal for the user-facing fix.
It shows what the test needed in order to advance — which tells you
whether the *test* is wrong (a stale selector, a missing wait, an
assertion expecting the wrong value) or whether the *app under test*
regressed (a precondition that used to hold no longer holds).

---

## 2. Hypothesize — map the failure to code

The triage output gives you names that ground the search:

| Triage signal | Search pattern |
|---------------|----------------|
| stack-trace function | `grep -r "handleSubmit" src/` |
| failed API endpoint  | `grep -r "/api/v1/users" src/` |
| missing element / data-testid | `grep -r "register-submit" src/` |
| recent regression | `git log --oneline <last_passing_deploy>..HEAD` (deploy from `analyze_failure`) |

For higher-level analysis the hosted **`mabl` MCP server** exposes
`analyze_failure` (root-cause inference, related-tests, last-passing
deploy), `get_mabl_test_details`, `get_environments`, `get_credentials`.
Use these when the shell tools don't give enough context — same APIs,
no shell required. For recovered steps, `get_runtime_recovery_session`
is covered in the Triage section above.

### Is this a test bug or an app bug?

Most of the work in this phase is deciding who owns the fix. Quick
heuristic:

| Signal | Likely owner |
|---|---|
| Stack trace points into product source; failed network call to an app endpoint; new uncaught JS error after a recent deploy | **App** — `git log <last_passing_deploy>..HEAD` on the relevant repo, then file/fix in product code |
| `status: "recovered"` with a recovery action like "click a different selector" or "wait, then retry"; stale `data-testid`; assertion expects a value the app never produced | **Test** — update the step / selector / assertion in the mabl test |
| Test flakes on retry but app code, DOM, and network all look healthy | **Test** — usually a missing wait or a timing assumption |

When in doubt, run the live session (§3) and step through — a real
browser tells you faster than more triage.

---

## 3. Reproduce — live session

Launch a real Chrome attached to the agent via CDP and step through
the test.

```bash
# If you came from a failed test run (`*-jr`), pass --run-id and most
# flags are inferred: test id, browser, credentials, environment,
# locale, timezone. Recommended form when debugging an existing failure.
mabl agent debug session start --run-id <jr-id>

# If you only have the test definition id (`*-j`) — debugging a test
# that hasn't been executed yet — pass it as the positional. You'll
# likely need --credentials-id and --environment-id explicitly.
mabl agent debug session start <test-id> --credentials-id <cred-c> --environment-id <env-e>
```

Prefer `--run-id` whenever you have one — it pins the inputs to what
the failure actually saw. Re-running with different inputs is debugging
a different test. Explicit flags override the run-derived values when
you do need to vary one.

`--url <url>` overrides the test's target URL. Only add it when you've
confirmed the user wants to reproduce against a different host (a
local dev server, a preview deployment) — don't reach for it
reflexively. The default behavior, hitting whatever URL the run used,
is what matches the failure. **Swapping `--url` to a different host
can break login / credential steps even if the run-id is the same:**
the credentials, OAuth callback URLs, cookie domains, or
environment-specific auth flow may all differ between the recorded
host and the swapped one. If the test starts failing at the login
step after a `--url` swap, the new host's auth, not the bug under
investigation, is the cause.

The output JSON includes a `sessionId` (`mabl-debug-<timestamp>`); every
later session command takes it as the first arg. When you're done,
release it with `mabl agent debug session stop <sid>` — that kills the
detached Chrome, removes `~/.mabl/debug/<sid>/`, and returns
`{stopped: true, hadSessionFile: true}`. Sessions are cheap but they
do hold a live browser process and ~MB of disk per session; clean up
when iteration ends.

The `stepCount` field on the session-start envelope is the size of the
fully-expanded runtime step list (top-level + every nested
EvaluateFlow / StepGroup child). The forensic `debug steps` trace
reports `total_steps` for the steps the run actually executed — which
is normally smaller because branches, recovered shortcuts, or early
failures stop the walk before every nested step runs. The two numbers
describing the same test will disagree by design; don't try to
reconcile them.

### The agent loop

Dump the runtime step tree first so you have addressable `step_id`s and
`index`es to work with:

```bash
mabl agent debug session list-steps <sid>
```

For a long test (50+ steps) the full dump is noisy — `list-steps` has
four window / filter flags that cut it down without `| grep`:

| Flag | What it does |
|---|---|
| `--filter "<substring>"` | Case-insensitive substring match against each step's description. |
| `--around <step-id>` | Show only the steps around `<step-id>`. Default window is 5 before / 5 after. |
| `--context <n>` | Widen the `--around` window to `<n>` steps before and after. |
| `--from <step-id> [--limit <n>]` | Forward window starting at `<step-id>`, optionally capped at `<n>` entries. |

So a typical "show me the failure neighborhood" is
`list-steps <sid> --around <failing-step-id> --context 3` — three
before, three after, instead of dumping all 59 entries.

Then loop:

1. **Advance** to the step before the failure:
   ```bash
   mabl agent debug session run-to-step <sid> <step-id-before-failure>
   ```
2. **Inspect** the live page via the `chrome-for-mabl` MCP tools (already
   attached to the session's Chrome via CDP):
   - `mcp__chrome-for-mabl__take_snapshot` — accessibility tree
   - `mcp__chrome-for-mabl__take_screenshot` — PNG
   - `mcp__chrome-for-mabl__list_console_messages` — page errors
3. **Patch** the page in-flight if a precondition is missing, using
   `mcp__chrome-for-mabl__fill` / `click` / `type_text` / etc.
4. **Re-run** the failing step against the patched state:
   ```bash
   mabl agent debug session run-step <sid> <step-id>
   ```

`run-step` returns `{status, stepId, durationMs, error?,
currentStepIndex, remainingSteps, conditionResult?}`. For
`If`/`ElseIf` steps, `conditionResult` is the boolean the runtime
evaluated (`true` = branch executed, `false` = skipped to the matching
`Else` / `EndIf`); for non-conditional steps the field is omitted and
`status: "failed"` is a real failure.

**Cursor behavior on failure.** On `status: "passed"` the cursor
advances past the step (or wrapper subtree) so the next `run-step`
runs the following step. On `status: "failed"` the cursor stays on
the failing step — the user almost certainly wants to fix something
and retry the same step, not skip past it. So the fix-then-verify
loop is just: edit code / test → `run-step` (no positional, uses
cursor) → green check. Use `set-current-step` only to **rewind** to
an earlier step. `If` / `ElseIf` with a false condition reports
`status: "passed"` (the runtime semantic for "branch skipped"), so
the cursor moves on as expected for conditionals.

`run-to-step` and `run-all` emit two lines per step as it executes —
a timestamped runtime line on stderr ("HH:MM:SS - <description>") and a
structured progress line on stdout. Relay the stdout line; the stderr
one is the runtime's normal step-execution log and stays out of the
JSON / YAML envelope the wrapping agent reads.

The stdout format:

```
[1/12] PASS  click  "Click on the Login button"  450ms
[2/12] PASS  enter_text  "Type the email …"  320ms
[3/12] FAIL  assert  "Verify title equals 'Home'"  5200ms  Element not found
```

The sequence stops on the first `FAIL`; exit code is 0 when every step
passed and 1 otherwise. Tell the user what just ran by relaying these
lines as they come.

**Live progress for long runs.** `run-all` against a 30+ step test
can take minutes, and stdout is pipe-buffered when the agent captures
with `$(...)` — by the time stdout lands, the run is over. Every
`[i/N]` line is also written to
`~/.mabl/debug/<sid>/run-progress.jsonl` (one JSON event per step,
flushed per step) so a wrapping agent can poll it for live progress
without waiting for the command to finish. Typical workflow: kick
`run-all` off in the background, `Read` the file every few seconds,
relay each new line to the user. The file is truncated at the start
of every `run-all` / `run-to-step` so it only ever holds the current
run's events.

Each event has `{step, total, stepId, action, description, status,
durationMs, error?}` — the same fields as the stdout `[i/N]` line, in
machine-readable shape.

**Nested-flow note.** When `list-steps` shows an `EvaluateFlow` (or
`StepGroup`) wrapper followed by its inlined children, those children
will NOT appear as separate progress lines from `run-all` /
`run-to-step` — running the wrapper executes the whole nested flow as
one unit, so the cursor advances past the wrapper's subtree. The
children are still addressable individually with `run-step` if you
want to step *into* a specific child after rewinding with
`set-current-step`.

### Session commands

For the full list of session subcommands together with their flags,
run `mabl agent debug session command-list`. Use
`mabl agent debug session <subcommand> --help` for the yargs-formatted
text help on any individual command.

For live screenshots use `mcp__chrome-for-mabl__take_screenshot` — it's
already attached to the session's Chrome via CDP, no separate CLI.

---

## 4. Verify — confirm the fix

After applying the fix (code change in the app under test, or step /
selector change in the mabl test), prove it sticks:

```bash
# Rewind to just before the failing step…
mabl agent debug session set-current-step <sid> <step-id-before-failure>

# …then replay the previously-failing step on the patched state.
mabl agent debug session run-step <sid> <failing-step-id>
```

A `status: "passed"` on the previously-failing `step_id` is the
minimum bar. If the failure was deep in a flow, follow it with
`run-all` to confirm nothing downstream broke:

```bash
mabl agent debug session run-all <sid>
```

Exit code 0 from `run-all` (and a clean tail of `PASS` lines on
stdout) is your green check.

**Reuse vs. restart.** Keep using the same `<sid>` while iterating —
the session holds the browser, cookies, and state from earlier steps,
which is what you want. Start a fresh `session start --run-id <jr-id>`
only when (a) the fix changed code the runtime loads at startup (a CLI
rebuild, an executor change), (b) the browser is in a bad state you
can't unstick, or (c) you want a clean reproduction to attach to the
PR.

For app-code fixes, the productive cycle is: edit → rebuild CLI (see
`build:local` in CLAUDE.md) → fresh `session start` → `run-to-step` →
`run-step` on the failing id. For test-only fixes (selector, wait,
assertion), no rebuild is needed — update the test definition and
`run-step` directly.

---

## ID formats and auth

Test / run / plan ids:

```
*-jr   test run        forensic input         abc123-jr
*-pr   plan run        group of test runs     abc123-pr
*-j    test definition live-session input     abc123-j
*-p    plan definition                        abc123-p
*-as   agent session   Runtime recovery       abc123-as
mabl-debug-<ts>        live session ID (returned by `session start`)
```

**Step ids — there are two, and they are NOT interchangeable:**

| Field | Scope | Use it for |
|---|---|---|
| `step_id` | per-flow | `debug session run-step` / `run-to-step` / `set-current-step`. This is what the live session addresses. |
| `step_id_in_test` | per-test (across all flows) | Cross-referencing `failure_summary.step_id_in_test`. **Do NOT pass it to live-session commands; you'll get "Step not found".** |

The forensic `debug steps` trace surfaces both per entry. When you go
from triage to a `run-to-step`, copy `step_id` (not `step_id_in_test`).
`debug session list-steps` shows `step_id` under the `id` field.

**`step_id` is *usually* stable across the two surfaces — but not
always.** When flows have persisted `json_steps` ids, the `step_id`
string `debug steps` prints is the same one `list-steps` shows under
`id` and the same one `run-step` / `run-to-step` / `set-current-step`
accept. Direct copy, no translation.

For flows whose `json_steps` lack ids (older tests, freshly imported
flows, some training paths), the two surfaces address the same step
through different ids: `debug steps` prints whatever runtime stepId
the trace recorded, and `list-steps` falls back to a synthetic
`<flow-id>:<flat-index>` shape. Those strings won't match each other.
**When you can't copy `step_id` straight through, address the live
step by `position` instead** — `list-steps` always emits one
(`"3"`, `"3.2"`) and every live command accepts it.

`set-current-step`'s JSON response includes a `stepId` field that's
always the addressable form (canonical or synthetic) — safe to feed
back into `run-step` directly.

**Step numbers diverge too.** `failure_summary.step_number` (mirrored
as `step_number_in_flow` in the trace and summary) is the step's
position **within its flow**, the way a user sees it in the editor.
`list-steps` exposes a different number — `index` — which is the
**global position** in the fully-expanded runtime list, including
nested EvaluateFlow / StepGroup children. They diverge once the test
has nested flows: a failure summary might say "step 14" while the
matching `list-steps` entry shows `index: 27`. Don't try to reconcile
them by counting — copy the `step_id` and pass that. The numbers are
for humans to scan; `step_id` is the address.

**Position / index / path on `list-steps` entries.** Each `list-steps`
entry carries three positional fields plus `isCursor`, alongside `id`.
They describe the same step from different angles — pick the one that
matches the input the next command takes:

| Field | Shape | What it is | Use it for |
|---|---|---|---|
| `position` | `"3.2"` | 1-based dot-notation walk through the step tree (flows / step groups descend into the next segment) | `set-current-step` / `run-step` / `run-to-step` all accept it as the step reference. Humans scanning the list match this against what the editor shows. |
| `index` | `0` | 0-based global offset in the flattened runtime list — wrappers and their children share consecutive indices | Stable address for tooling iterating over the YAML output. Do NOT mix with `failure_summary.step_number` (per-flow, 1-based). |
| `path` | `[2, 1]` | The same descent as `position`, but as a structured 0-based array (one less than each `position` segment — so `"3.2"` is `[2, 1]`). Matches `state.nextStepIndex` directly. | Programmatic walks (compare segment-by-segment, slice off the tail). Convert to a `position` string by adding 1 to each segment and joining with `.`. |
| `isCursor` | `true` / `false` | Marks the entry the live cursor currently points at | The step `run-step` will execute when called with no `step_id`. |

`run-step` and `run-to-step` accept any of: the canonical step `id`,
the 1-based `position` (bare integer like `"14"` or dot-notation like
`"3.2"`), the synthetic `<flow-id>:<idx>` fallback id, or even the
0-based `index` rendered as a 1-based position (`String(index + 1)`).
Pass whichever the previous output handed you — no translation needed.

**Nested dot-notation requires a wrapper.** `"3.2"` only resolves when
step 3 is a step-group or reusable-flow wrapper (i.e. an entry with
nested children expanded inline beneath it). For a leaf step, only the
bare `"3"` form works — `"3.1"` will fail with "no group or flow at 3"
because step 3 has no children to descend into. Use `list-steps` to
see the actual position field for the step you want.

`position`, `path`, `isCursor` are always populated, even when
`state.json` hasn't been seeded or its tree drifted from the
snapshot — `list-steps` falls back to a flat 1-based position so the
field is never useful-but-missing, and `isCursor` falls back to
`session.currentStepIndex` so the cursor marker is always visible.

```bash
mabl auth login --auto   # one-time OAuth in browser
mabl auth info    # check current auth
```

Live sessions re-fetch credentials from the API on every `run-step` so
the in-memory execution context always has fresh values; the resolved
values also end up in `~/.mabl/debug/<sid>/session.json`'s variable
namespace once a step that uses them has run. The directory shares the
same trust boundary as the detached Chrome's `userDataDir` (cookies,
localStorage, in-flight sessions) — don't share it.

If your token expires, `run-step` tells you to re-login.
