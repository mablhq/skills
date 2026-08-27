---
name: mabl-test-import
description: |
  Migrate tests that ALREADY EXIST into mabl: a Playwright project
  (`mabl tests import playwright`), a Selenium suite in any language
  (`mabl tests import selenium`), or either one authored from its source code
  when a recording would lose the point of the test.
  Fire on "import", "migrate", "bring over", "convert to mabl", "we have
  Playwright/Selenium tests", or when the user points at a repo of tests they
  already have.
  Sorts the suite first, per test: convert the recording, author from the
  source, or leave it in Playwright with mabl Tools for Playwright.
  There is no importer for Cypress, Cucumber, or a spreadsheet of test cases;
  to build tests from written cases use mabl-test-authoring, and to design NEW
  coverage by exploring a running app use mabl-test-coverage-design.
allowed-tools: Bash, Read, Write, Glob, Grep, mcp__mabl__get_current_user,
  mcp__mabl__list_mabl_workspaces, mcp__mabl__list_mabl_applications,
  mcp__mabl__list_mabl_environments, mcp__mabl__create_mabl_environment,
  mcp__mabl__create_mabl_application, mcp__mabl__mabl_authoring_initiate,
  mcp__mabl__mabl_authoring_status, mcp__mabl__mabl_authoring_answer,
  mcp__mabl__get_mabl_test_steps, mcp__mabl__run_mabl_test_cloud
---

# mabl test import

Bring a Playwright or Selenium suite into mabl, then prove what actually made
it across. Three lanes, chosen per test: two convert a recording, one reads the
source. All three are lossy, in different directions, and all three can report
success while producing tests that assert nothing or fail on first run.

## Prerequisites

**The mabl MCP server (`mabl`)** — binds the target in Step 2 and verifies the
result in Step 6. If its tools are missing from the tool list, name the `mabl`
server as not connected and stop.

**The mabl CLI** — lanes A and B only. Nothing else can read a Playwright
trace or proxy a WebDriver session. **Lane C needs no CLI**, so a reader whose
tests all sort to lane C can skip this block; don't stop a lane C import
because the CLI isn't installed or logged in.

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.113.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest
```

2.113.0 is the floor because Selenium import changed shape there: it stopped
translating actions one at a time and started handing a detailed recording to
the cloud test authoring agent. An older CLI silently gives the old, worse
import. The Selenium Java Agent has the same split — recommend its latest
version for the same reason.

A version number is not proof the command is there. Probe what this run needs:

```bash
mabl tests import --help 2>&1 | grep -qw playwright                     # lane A
mabl tests import selenium --help 2>&1 | grep -qw -- --credentialsId    # lane B
```

If a probe fails after the upgrade, say which command is missing — and offer
lane C, which does not go through the CLI at all, before stopping.

For lanes A and B the CLI must be logged in (`mabl auth login --auto`). That
opens a browser and needs a human; never attempt it unattended.

## Step 1 — Decide how each test comes across

Read the source tests before importing anything. Each one takes one of three
routes, and choosing per test is the most valuable thing this skill does. Show
the user the split before acting on it.

| The test is | Route |
|---|---|
| Linear and action-based — navigate, click, type, select, wait, basic assertions | **Lane A or B.** The recording carries the whole test, and these are the only lanes that batch. |
| Action-based, but written so a recording would lose the point — a page object model, helper functions, chained or `getByTestId` locators, regex assertions, Selenium in-process assertions | **Lane C.** Read the source and hand its intent to the cloud authoring agent. One session per test, minutes each. |
| Not really a UI test — it mocks the network with `page.route`, drives the API to set up state, or loops a data set to exercise code paths | **Don't import it.** Keep it in Playwright and layer mabl on top with mabl Tools for Playwright. |

"Put the whole suite through lane A" is the common failure. So is sending
everything to lane C, which costs a cloud authoring session per test.

Lanes A and B need the source suite to actually run here — dependencies
installed, a driver present, the app reachable. Lane C does not; it needs the
source readable and the app reachable. So when a recording lane's suite will
not run, say which piece is missing **and** that lane C is still open.

## Step 2 — Bind the target before importing

1. `get_current_user` for the default workspace; `list_mabl_workspaces` when
   the user names a different one.
2. `list_mabl_applications` and `list_mabl_environments`.
3. Match the application by URL against the host the source tests drive.

If the workspace has no application or environment yet, create them —
`create_mabl_environment` first, then `create_mabl_application` (it needs an
environment id and returns a `deploymentId`). Say which URL was used.

Pass `--workspace-id` on every import command. Both import commands accept it;
without it they use the CLI's active workspace, which is often not this one.

## Step 3 — Import ONE test first

Never start with the whole suite. Import a single test, run Step 6 on it, and
show the user what survived before importing the rest.

Pick the first test to make the lane's own weakness visible: for lane A, one
that uses the locator APIs `references/lane-a-playwright.md` §A4 lists; for
lane B, one whose intent is in assertions; for lane C, one whose source needs
following into a page object. The gate is the user's, not this skill's — show
them the source test beside the mabl test and let them say go, adjust the
split, or stop.

---

---

## The three lanes

Each lane's mechanics live in its own reference. Read only the one this test
sorted to in Step 1.

| Lane | Works from | Read | Costs |
|---|---|---|---|
| **A — Playwright** | Playwright trace files, converted locally. No AI, no cloud session. | `references/lane-a-playwright.md` | Nothing per test; converts a directory in one command |
| **B — Selenium** | A live WebDriver session, proxied and handed to the cloud authoring agent. | `references/lane-b-selenium.md` | One cloud authoring session per capture |
| **C — Author from source** | The test's source code, read and handed to the same authoring agent. No recording. | `references/lane-c-authoring.md` | One cloud authoring session per test |

Lanes A and B need the source suite to run on this machine. Lane C does not,
and does not use the CLI.

Their failure modes are not the same. Lane A degrades what it cannot convert
into `Echo` steps; lane B cannot see anything that never crossed the WebDriver
wire; lane C captures the element it saw rather than the rule the source used.
Step 6 verifies all three, and sends you back to the lane's own reference for
the checks only that lane needs.

## Step 4 — Keep a ledger

Past a handful of tests, write one row per source test to
`.mabl/import/<batch>.csv` as it goes: source file and title, lane, session id,
test id, status, and what was reported missing. Nothing is written outside
`.mabl/`.

A batch interrupted halfway is otherwise unrecoverable — session ids are not
derivable from the source, and re-importing produces duplicate tests that
cannot be deleted from here.

## Step 5 — Poll the authoring sessions (lanes B and C)

Lane A is synchronous and done when the CLI prints a saved test id. Lanes B and
C both return a session that runs for minutes.

Poll `mabl_authoring_status` with the session id — or `mabl agent authoring
status --session-id <id> --verbose` — **every 30 seconds, for at most 20
minutes per session**. Authoring typically takes 2–10 minutes. Polling faster
is a correctness problem: the MCP server rate-limits each tool to 10 calls per
10 seconds per identity and answers 429 with `Retry-After`. With several
sessions in flight, poll them in one pass per interval.

Act on the status string as returned:

- `completed` — read `createdTestId` from the verbose response. That id is the
  only proof a test exists.
- `queued` / `running` — keep polling.
- `needs_attention` — the agent asked a question and is paused. Relay it to
  the user and answer with `mabl_authoring_answer` using only what the user or
  the source test actually says. Never invent an answer to unblock a batch.
- anything else, including a status not listed here — quote it verbatim and
  treat the session as not done.

At the bound, stop polling and report that session as **unverified**, with its
id and last status. Unverified is a result; never report it as imported.

Keep at most 5 sessions in flight. Cloud authoring is capped at 10 concurrent
per workspace by default, and a batch that saturates the cap queues behind
itself while making a partial failure much harder to reason about.

## Step 6 — Verify what actually landed

Do this for every imported test, in every lane, before calling the import done.
A test id is not evidence.

**Read the steps.** `get_mabl_test_steps` with `detail: "full"`. Ignore the
`step_count` field: it counts top-level entries, and an agent-authored test may
wrap its work in one `StepGroup`, so a five-step test reports `step_count: 3`.
Compact detail drops the nested steps and every selector, so it cannot answer
the find-shape question below.

**Diff the source test against the mabl test, in both directions.** Every lane
both drops and adds, and no lane says so. List what the source test did that
the mabl test does not, and what the mabl test asserts that the source never
asked for. Never fix a failing imported test by deleting the step that fails —
show the difference and let the user rule.

**Run it.** `run_mabl_test_cloud` against the bound environment is the only
check that the steps work against the live app, and the agent's own report that
its validation run passed is not that check. A cloud run consumes credits; say
so before starting a batch.

**Report the find shape, per lane — it is not the same shape.** Measured:

| Lane | Find shape | Consequence |
|---|---|---|
| A | legacy raw CSS, `findTarget: {css_query: "..."}` | resolved by literal query only: no auto-heal, no visual fallback, no Intelligent Wait |
| B, C | captured element — `xpath`, `relative_xpath`, bounding box, attributes, a stable `uuid` | resolves like a trained find, and accumulates heal data against that `uuid` |

So the rewrite into the canonical wrapped selector shape is a **lane A** job,
and it is the same repair as the `getByTestId` breakage in
`references/lane-a-playwright.md` §A4. Say which tests are in that shape and
how many steps each. Don't apply it to a lane B or C test: those selectors were
captured against the running page, and hand-editing them throws that away.

Then run the checks specific to the lane this test came through:

| Lane | Also check | Where |
|---|---|---|
| A | every `Echo` step (the converter's way of dropping an assertion *or* an action), the unsupported-API list the CLI logged, whether a Visit URL step exists at all, and the trace-title test name | `references/lane-a-playwright.md` §A4 and the Echo table below |
| B | what never crossed the WebDriver wire — in-process assertions, uploads, hover, iframes — and the assertions the agent inferred | `references/lane-b-selenium.md` §B4 |
| C | source locators that were deliberately dynamic and came back as fixed captures, and assertions the agent added from context | `references/lane-c-authoring.md` §C3 |

### Lane A — the Echo table

The converter degrades anything it cannot express into an `Echo` step, for
actions as well as assertions — a click whose selector it could not read
becomes `Echo Selector on click not found`. Match on `step_type: "Echo"`
generally rather than on one string; the message varies:

| Echo text | Means |
|---|---|
| `Assertion <expr> not supported` | the expression ends in `.array` — the only family rejected by name |
| `Assertion with regex are not supported` | the expected value was a regex, e.g. `toHaveURL(/x/)` |
| `Selector on assertion not found` | the assertion carried no selector |
| `Selector on click/hover/enter text/... not found` | an **action** was dropped, not an assertion |

A test whose only assertions were regex matchers imports cleanly, saves
cleanly, prints `Import complete.` — and verifies nothing. A customer has
called that a hard blocker, so report every Echo explicitly, per test, as
something the source test did and the mabl test does not.

Do not restate the documented limitation as the measured one. The docs say
array assertions are unsupported; measured, `toHaveCount(1)` converts to an
`AssertEquals`, `toBeVisible`/`toBeHidden` convert to presence steps, and
`toHaveURL` with a regex is what actually drops. Report what the converter did
to *these* tests.

The converter also logs the Playwright APIs it had no equivalent for
(`browsercontext.newPage`, `frame.waitForSelector`, `frame.innerText` and
similar). Capture that list from the CLI output; it does not survive anywhere
else.

Two more lane A checks. **The URL binding** is two separate things: the test's
application URL metadata, taken from the Playwright `baseURL`, and the Visit
URL step, which uses `{{@web.defaults.url}}` plus whatever path the source
navigated to. Read both — a test whose source only ever hit `baseURL` may have
no navigation step at all. **The name** comes from the trace title
(`example.spec.ts:14 › New Todo › should allow me to add todo items`); offer to
rename.

**Requires `mabl-test-edit`.** The lane A selector rewrite belongs there, as do
renaming, relabelling, and disabling an imported test. If that skill isn't
installed, say which skill is missing and hand the user the test URL — don't
guess at the edit here, and don't guess how to install it, because that depends
on how this skill was installed.

**Requires `mabl-debug`.** When a verification run fails and the cause is not
obvious from the diff, that skill owns the investigation. If it isn't
installed, report the failing run id and stop there.

## Step 7 — Report, then scale

Report per test: source file and title → lane → mabl test id, and what did not
come across (dropped assertions, unsupported APIs, actions the proxy could not
see, dynamic locators that became fixed captures, assertions the agent added).
Give batch totals per lane: imported, unverified, and left in Playwright by the
Step 1 split.

Only then import the rest, in batches, with the same verification on each.
Lanes A and B batch; lane C does not — it is one cloud session per test, so a
large lane C group is a schedule, not a command, and Step 5's cap of 5 sessions
in flight applies. For a large Playwright suite, `--grep` on a tag the user adds
to the tests they want in mabl scales better than importing everything.

Never import twice to "fix" a bad import. mabl tests cannot be deleted from
here, so a re-import leaves the broken copy behind. Fix forward, or ask.
