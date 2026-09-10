# Local-target prerequisites and stepping through a failure

Read this when a local run fails and the console output wasn't enough, when sign-in appears to
succeed but nothing after it works, or before pointing a run or debug session at a local server
for the first time.

## Two prerequisites, keyed to different things

A local target has two independent requirements, and satisfying one tells you nothing about the
other. **The certificate has to cover the hostname you use; the identity provider's allowlist has
to contain the whole scheme-host-port origin.** A session that starts, navigates, and steps
cleanly proves only the first. Check both before concluding a local run can't work.

### 1. Trust the certificate

**Trust the local certificate once, and stepping against a local HTTPS server works.** The debug
session attaches to a Chrome-created browser context, so Playwright's `ignoreHTTPSErrors` cannot
apply and there is no flag on `session start` to bypass certificate errors — the only way past a
self-signed local cert is to make it genuinely trusted. Add the dev server's certificate to your
OS trust store (on macOS, the System keychain) and a session against the local HTTPS server starts
and steps normally; verified end to end on CLI 2.124.5 against a dev server's own self-signed
certificate. If `curl` without `-k` returns a normal response for your dev-server URL, the trust
is in place. Until it is, expect the session to die on `ERR_CERT_AUTHORITY_INVALID` with nothing
you can pass to work around it.

Trust gets you *transport*, not *authentication*.

### 2. Address the server by its registered origin

**"The login steps passed" is not "I am logged in."** Entering the email, entering the password, and
clicking *Log in* can all return `passed` while the app stays unauthenticated — the next navigation
to an app route bounces straight back to the login page, and every step after that fails for reasons
that have nothing to do with your change. Those steps only assert that the *UI interaction*
succeeded; nothing in them checks that a session came back.

**The usual cause is the URL you ran against, and it is a one-line fix.** Sign-in posts the
credentials to the identity provider as a cross-origin XHR, and the provider answers it only for
origins on its trusted-origin allowlist. **Local development has a registered origin for exactly
this reason — use it.** In practice that is a dedicated loopback hostname on a specific port
(`app-local.<your domain>:3000` shape, mapped to `127.0.0.1` in `/etc/hosts`), *not*
`https://localhost:<port>`. Point the run at the registered origin and login works normally.

**The port is part of the origin, which is the trap.** An allowlist entry for `…:3000` does not
cover `…:3001`, so a dev server that fell through to the next free port — the thing that happens
whenever a stale server still holds 3000 — silently breaks authentication while serving the app
perfectly well. Same for using `localhost` when the registered name is the loopback hostname. Both
produce identical symptoms: UI steps pass, no session, and the first post-login element is never
found.

A preflight to the identity provider tells you whether an origin is registered before you spend a
run on it. Read the response rather than its exit status: the origin has to come back echoed
exactly, and a credentialed sign-in additionally needs allow-credentials — a wildcard satisfies a
presence check and still fails in the browser. The registered loopback origin and the deployed app
origin both pass; the same hostname on a neighbouring port and every `localhost`/`127.0.0.1`
variant do not.

## Stepping through it

Hand the debugger the position the run log just gave you:

```bash
mabl agent debug session start <test-id> --url "<same local url you ran against>" \
    --credentials-id <cred-id> --headless
# → {"sessionId":"mabl-debug-<ts>", "browserPort":9222, "stepCount":33, ...}

# Now navigate the session's page yourself; `start` does NOT. See below.

mabl agent debug session list-steps <session-id>            # positions, execution status
mabl agent debug session run-to-step <session-id> 3.1       # run to that step, inclusive
mabl agent debug session run-step <session-id>              # then advance one step
mabl agent debug session stop <session-id>                  # kill Chrome, delete session dir
```

`run-to-step` accepts the same dot-notation the run output prints, which is what makes the run log
and the debugger compose. Pass `--url` explicitly here too: `start` carries the same asymmetry as
`tests run` — `--environment-id` does not override the URL — so without it you'll debug against
the test's recorded target and wonder why the bug won't reproduce. Credentials usually need naming
explicitly on the test-id form as well. Always pass `--headless`; it defaults to false, and a CDP
attach inherits the session's headed state, so a headed `start` puts a window on someone's screen.

**Never run `agent debug session get-variables`.** It prints the whole variable context,
credentials included, into your terminal and transcript; `SKILL.md`'s **Diagnosing a failure**
section has the version-specific detail.

## A test that doesn't start by navigating

**A test that doesn't start by navigating cannot be run locally, and that is a defect in the
test.** Neither `tests run` nor `session start` navigates on your behalf — `--url` supplies the
target that the test's own *Visit URL* step resolves against, and nothing more. A well-formed test
opens by navigating, so it never notices. A test that opens straight into a login flow starts on
`about:blank`, and its first step fails `Element not found` after a full 30-second find timeout.

Recognize it, because it mimics the two failures you're actually hunting: it looks exactly like a
stale selector or a product bug, and it is neither. The signature is a **login step failing while
the login page renders perfectly well**. Three checks establish it, all verified on CLI 2.124.5:

- The same test fails identically against a **deployed** environment, so it is not about your local
  server.
- Supplying `--environment-id` does not change it.
- **A green cloud run does not predict local runnability.** The test used here had a passing cloud
  run and still failed on its first step locally — the cloud runner performs an initial navigation
  that the local runner does not. So screen for "does step 1 navigate," not for "does it pass in
  CI."

Treat such a test as incomplete and say so: the fix is a leading *Visit URL* step, which is
independently what other authors have already done — one test in the corpus carries the note
*"navigate to the login page first so login does not run on about:blank."* Then either pick a
different candidate or push past it to keep debugging.

To push past it, navigate the session's page yourself, then step. It must be **the page the session
already has open**, not an extra tab — opening a new tab over the CDP HTTP endpoint
(`PUT /json/new?<url>`) changed nothing, while navigating the existing `about:blank` page made the
same previously-failing step pass in 2.5 seconds, and the rest of the login flow with it. Two ways:

- **`chrome-for-mabl` MCP** — the intended mechanism, and the reason that server exists. Confirm
  it is actually in your MCP server list rather than assuming.
- **Any CDP client**, pointed at the `browserPort` from the `start` envelope —
  connect, take the first page of the first context, navigate it. The three operations are the
  point, not any particular library or install path.

## Two limits on stepping

**`run-to-step` cannot stop *inside* a nested flow or step group** — the runtime executes a wrapper
as a single unit, running every child, so a target inside one is reached by running the whole
wrapper past your step. Pause at top-level boundaries instead (`run-step` can still address an
individual child). And the debug session has no `--allow-billable-features`, so a
GenAI-assertion test can't be stepped past its first AI assert.

## For anything deeper

**Requires `mabl-debug`.** That skill owns this surface and covers step addressing, cursor and
retry semantics, `list-steps` filtering, and long-run progress in far more depth than belongs
here. One structural caveat worth knowing before you go looking: its forensic half (`agent debug
steps`, `agent debug artifact`, recovered-step lookups) is keyed to a **cloud test-run id**
(`*-jr`), which a local run never produces — so from a local failure, go straight to
`session start` with the test id rather than hunting for a run id. Don't have that skill? These
commands ship in the CLI itself:
`mabl agent debug session --help`, or `mabl agent debug command-list` for the full tree.
