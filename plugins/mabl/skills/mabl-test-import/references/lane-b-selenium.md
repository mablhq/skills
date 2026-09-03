# Lane B — Selenium

The CLI runs an HTTP proxy between the user's Selenium test and their Selenium
server, captures the WebDriver session, and hands the capture to the cloud
test authoring agent, which writes the mabl test asynchronously. The Selenium
Java Agent takes the same route without a code change.

## B1. Start the proxy

```bash
mabl tests import selenium \
  --workspace-id "$WORKSPACE_ID" \
  --name "the test name in mabl" \
  --credentialsId "$CREDENTIALS_ID" \
  --auto-save
```

It prints `Configure your test to use a selenium proxy at localhost:8889 and
run the test now.` and blocks. Here `--auto-save` only skips a confirm prompt
that needs a TTY — unlike lane A it costs nothing. `--multi` captures several
tests and ends only on CTRL+C.

## B2. Point the suite's WebDriver traffic at the proxy

The change is in the user's test code. It is an HTTP proxy in front of the
existing remote WebDriver URL — the driver or grid endpoint stays as it is:

| Framework | Change |
|---|---|
| Protractor | `webDriverProxy: 'http://localhost:8889'` in the config |
| selenium-webdriver (JS) | `new Builder().usingServer(driverUrl).usingWebDriverProxy('http://localhost:8889')` |
| Python | proxy the client's HTTP connection to `http://localhost:8889` |
| C# | `commandExecutor.Proxy = new WebProxy("http://localhost:8889/")` |
| Ruby | `client.proxy = Selenium::WebDriver::Proxy.new(http: "http://localhost:8889")` |
| Java | a `RemoteWebDriver` with an `HttpClientFactory` for the proxy, or the Selenium Java Agent (no code change) |

mablhq/selenium-import-examples holds working versions of each.

A driver whose major version does not match the installed browser fails at
session creation, before mabl sees anything. That error is the user's driver,
not the import.

## B3. Run the test, then read the real outcome

Capture ends when the WebDriver session closes (`driver.quit()`) or on CTRL+C:

```
Captured 1 test.
Submitting session to mabl for test generation (planning enabled)...
Test authoring session initiated: session=BKA1INU7mBP4QtaMM4KNsw-as instance=...-aci
```

**The CLI exiting 0 means submitted, not authored.** No test exists yet. The
session id (`-as`) is the only thing worth carrying forward — poll it in
`SKILL.md` Step 5.

`--no-plan` skips the planning agent: faster, but the authoring agent picks
the application and environment with less workspace context. Prefer the
default.

## B4. What the proxy cannot see

The capture is WebDriver traffic only. These are invisible and will be missing
from the authored test: in-process assertions, file uploads and downloads,
drag and drop, hover, steps inside an iframe, cookie inspection.

Read the source test and say which of these it uses — do not guess. If its
intent lives in in-process assertions, the Selenium Java Agent is the right
route instead of the proxy.

The agent also works the other way: it infers intent from the captured actions
and writes assertions the source test never made, including GenAI assertions.
That is often an improvement, but it is not what the source test checked. List
the added assertions alongside the missing ones and let the user rule.

## B5. Credentials

The capture contains the literal username and password the test typed, and
that payload goes to mabl. Pass `--credentialsId` so the authored test binds
to a mabl credential and uses `{{@app.defaults.username}}` /
`{{@app.defaults.password}}` instead of the captured literals. Name the
credential; never echo, log, or write its contents.
