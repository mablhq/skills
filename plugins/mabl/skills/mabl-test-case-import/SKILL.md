---
name: mabl-test-case-import
description: |
  Turn a backlog of WRITTEN test cases into mabl tests — Jira or Xray issues, a
  spreadsheet or CSV, a TestRail export. Sorts the backlog before generating
  anything: cases differing only by data collapse to one test, siblings copy
  from the first one built, cases too thin to automate get parked. Then rewrites
  each case as an authoring prompt, generates the batch under one label, and
  reconciles what landed against the cases it came from.
  Fire on "import our test cases", "we have test cases in Jira / Xray / a
  spreadsheet", "turn these tickets into mabl tests", "bulk create mabl tests
  from this CSV", or a pasted list of written cases.
  Every step has a mabl CLI form, so it runs with no MCP server.
  For tests that already exist AS CODE — Playwright, Selenium — use
  mabl-test-import. For ONE case use mabl-test-authoring. To design NEW coverage
  by exploring a running app use mabl-test-coverage-design.
allowed-tools: Bash, Read, Write, Glob, Grep, mcp__mabl__get_current_user, mcp__mabl__list_mabl_workspaces, mcp__mabl__list_mabl_applications, mcp__mabl__list_mabl_credentials, mcp__mabl__list_mabl_tests, mcp__mabl__create_mabl_data_table, mcp__mabl__mabl_authoring_initiate, mcp__mabl__mabl_authoring_status, mcp__mabl__mabl_authoring_answer, mcp__mabl__mabl_authoring_list, mcp__mabl__edit_mabl_test_metadata
---

# mabl test case import

A backlog of written test cases is not a list of tests. It is a list of
*intentions*, written for a person who already knows the app — which is why
feeding it straight into a generator produces tests that click through screens
and prove nothing.

So the work is in the middle. Getting cases out of a tracker is an export, and
generating a test from a good prompt is one command. Between them sits the step
that decides everything: sorting the backlog, and rewriting each case as
something an agent that has never seen your app can act on.

The batch is what this skill owns — the sort, the prompts, the schedule, the
ledger, and the reconciliation at the end. Generating and checking any one test
belongs to `mabl-test-authoring`, and Step 5 hands each test there.

**Nothing here writes back to your tracker.** The tests live in mabl; the issues
stay where they are. See "What this does not do".

## Prerequisites

Both surfaces drive the whole workflow, and the steps below give each command in
both forms. Pick one.

**The `mabl` MCP server**, which ships with this plugin. Every tool this skill
names is on it. If those tools are absent from the tool list the server is not
connected — say so and use the CLI lane instead of stopping.

**The mabl CLI**, which is the whole skill for a reader with no MCP access. That
is a real configuration, not a fallback: an organization can permit the CLI and
not an MCP server.

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.124.30
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth login --auto   # one-time OAuth in a browser — needs a human
```

`mabl auth activate-key $MABL_API_KEY` authenticates without a browser, for an
unattended run.

A version number is not proof a command is there. Probe what this run needs:

```bash
mabl agent authoring initiate --help 2>&1 | grep -qw -- --test-information
```

If that fails after the upgrade, say which command is missing and stop — the
batch lane in Step 4 is built on `--test-information`.

**An application and environment** configured in the target workspace, and
credentials saved in mabl for anything behind a login. Step 4 binds them.

## What this costs

Say this before starting a batch, in these units:

- **Generating a test consumes no credits.** GenAI test creation is not a
  credit-consuming activity. The cost of a large batch is *time and
  concurrency*, not spend.
- **Running one in the cloud does.** A browser cloud run is 1 credit, or **1.5
  with visual assertions** — so the one-visual-assertion-per-test rule in Step 3
  adds half a credit to every cloud run of every test in the batch, for as long
  as the batch exists. Local and CI runs are 0.
- **A large import re-categorizes whoever runs it.** Creating a test counts as a
  test authoring activity, and 30 or more in a single workspace in a month makes
  that user an *automator* for that month, which is a billing category. A
  200-case import crosses that line on its own. Editing names, descriptions and
  labels does not count.

Numbers from mabl's usage documentation; check the current figures against your
plan before quoting them to a customer.

## Step 1 — Get every case into one table

mabl cannot open a tracker link, and nothing in mabl reads an issue tracker on
its own. Get the cases into a table this session can read, by whichever route
fits the size of the backlog:

| Cases | Route |
|---|---|
| A handful, and the tickets keep changing | Read them through whatever issue-tracker MCP server the user has connected. **Name that server explicitly in the request** — nothing in this skill reaches for it, and it is not among this skill's granted tools, so expect a permission prompt. This is the only route where the source stays live. |
| Tens to hundreds | **Export CSV.** A JQL search in Jira, exported with the summary and description columns. No setup. |
| Repeatable, scripted | **Query the tracker's REST API** and keep the JSON. Same fields. |

Whichever route, the backlog reduces to one row per case with at least these
four things. Anything missing here is a gap you fill in Step 3, not something
the generator invents:

| Column | Why it has to be there |
|---|---|
| **Source key** | `PROJ-572`, `C4471`. The only durable link back — see Step 4's traceability note. |
| **Summary** | Becomes part of the test name, which is length-capped. |
| **Steps / description** | The body of the prompt. |
| **Grouping** | Component, feature area, epic, or label. Step 2 sorts on it and Step 4 schedules on it. |

**Read one exported case before exporting a thousand.** Open a row and check the
detail you expect is actually in it. The failure that costs most is silent: if
the steps live in Xray's Manual Test Steps grid rather than in the Jira
description, a Jira export returns the title and an empty description, and a
thousand rows of *title only* look like a successful export. Export from Xray
instead so the step rows come with it.

`references/extracting-cases.md` has the per-source detail: the Jira CSV and
REST shapes, the Xray step-grid trap, TestRail's export columns and how they map
onto the four above, and what to do with a plain spreadsheet nobody designed for
this.

## Step 2 — Sort the backlog before generating anything

This is the step that saves the most, and the one most likely to be skipped. A
backlog sorts into four piles. Show the user the split and let them correct it
before anything is generated.

| The cases | Pile | What happens in Step 4 |
|---|---|---|
| Same journey, different input — a country, a plan tier, a day of the week | **Collapse** | One test, driven by a data source. Fifteen cases become one thing to maintain. |
| Different behaviour, same route through the app | **Copy** | Build the first one, then copy from it with `source_test_id` and describe only the difference. |
| Genuinely distinct journeys | **Build** | One test each, from its own prompt. |
| Too thin to automate — "verify the reports page loads" | **Park** | Either rewrite it against the real screen (Step 3) or set it aside. Automating a vague case produces a test that passes forever and tells you nothing. |

A backlog import is a good moment to notice that some of the cases were never
test cases. Park them out loud, by key, so the count reconciles at the end.

### The Collapse pile: what the surfaces actually do

Creating the data source is one command on either surface:

```bash
mabl datatables create ./variants.csv --name "PROJ guest checkout variants" \
  --workspace-id <workspaceId>
```

or `create_mabl_data_table` with the rows inline. The CSV you exported in Step 1
is often already the right shape — one column per varying input, one row per
case.

**Associating that table with a test is not something these surfaces expose.**
No CLI command and no MCP tool takes a data table id and attaches it to a test
or a plan — the association is made in the web app, either in the test creation
form under **Optional configurations** or, for a test that already exists, in
the test Information modal's **DataTables** dropdown.

So a collapse finishes in two places. Here: build the one test with its varying
values written as data-driven variables, and create the table. There: the user
associates the two. Name the table and the test, say which dropdown, and **do
not report a collapsed group as done until they confirm it**. Never quietly
generate fifteen separate tests instead — that is the failure this pile exists
to prevent, and it is unrecoverable, because the fourteen extra tests cannot be
deleted from these surfaces.

## Step 3 — Rewrite each case as a prompt

The authoring agent drives a real browser and builds the test from what it is
told, so the description *is* the test. A case written for a colleague leans on
everything that colleague already knows: which site, which product, what data is
safe, what "verify confirmation" looks like on screen. The agent knows none of
it, guesses, and produces a test that navigates and proves nothing.

Every prompt carries five things, in whatever order reads naturally:

| | What it settles |
|---|---|
| **Where it runs** | A URL, or the application and environment. Without it the agent picks among your environments. |
| **Who it runs as** | The name of a credential saved in mabl, or an explicit "runs signed out". Omit it and the session stops partway and waits — see Step 4's stall note. **Never paste a password into a prompt.** |
| **What to do, with real values** | "Fill shipping with Test Guest, 100 Main St, Boston MA 02110" — not "fill in the shipping form". Concrete values make the same test every time. |
| **What to verify, as something visible on screen** | A badge showing a number, a button becoming disabled, a validation message appearing, a row leaving a table. This is the whole difference between a test and a click-through. |
| **At least one visual assertion** | Ask for it in those words. Functional checks confirm the values; a visual assertion catches the layout breaking, which no text assertion notices. **Asking is not getting** — see below. Cost is in "What this costs". |

**Asking for a visual assertion does not guarantee one.** Measured on a local
authoring run whose prompt said "Take a visual assertion of the dropdown
examples page": the built test contained two `AssertEquals` steps and two
`AssertAIPrompt` steps, and **no visual assertion step at all**. The second
`AssertAIPrompt` described the whole page in prose, which reads like a visual
check and is not one — it is a model reading the DOM, not a rendered-pixel
comparison, and it does not catch a layout break.

So treat the visual assertion as something to **verify per test**, not something
the prompt settles. Step 5 is where it gets checked, and a batch generated on the
assumption it landed is a batch whose visual coverage is imaginary. One run on
one lane is not a rule about every lane — check, rather than assuming either way.

Two more that are cheap to write and expensive to discover later:

- **What the test must not do.** "Do not sign in." "Do not use the saved card."
  "Do not accept the cookie banner." If the flow has a path you never want
  taken, write it down.
- **Cleanup, for anything that creates data.** Onboarding usually points at a
  shared environment with real data in it. A test that creates something should
  create its own subject with a findable name — a fixed prefix plus a
  timestamp — act on it, and delete only that. A test that deletes by broad
  search eventually deletes something a colleague was using.

**The name is capped and the prompt is not.** A test name is limited to 15 words
and 200 characters, and a longer one is **rejected rather than truncated** — the
error names the count, e.g. `name must be 15 words or fewer (was 17)`. So the
name is the source key plus a short label — `PROJ-572 Guest checkout` — and the
entire case goes in the prompt, which has no length limit. The first line of a
ticket description is not a name.

**A collapsed group has more keys than fit.** Fifteen cases become one test, and
fifteen keys will not fit in fifteen words. Name it after the *representative*
case and the behaviour — `PROJ-572 Guest checkout by country` — and put every
key it covers in the **ledger** and in the test description, which allows 90
words. The ledger is what answers "which case does this test cover", not the
name.

To name a credential you need its id or name: `list_mabl_credentials`, or
`mabl credentials list --workspace-id <id>`. Name it; never send its contents.

`references/case-to-prompt.md` works three real cases through this — a Jira
case, an Xray case whose steps came across as a grid, and a TestRail row —
alongside the thin case that should be parked instead.

## Step 4 — Generate the batch

### 4.1 Bind the target once

`get_current_user` for the default workspace, `list_mabl_workspaces` when the
user names another, then `list_mabl_applications` — it returns each
application's environments and their URLs in one call, so no separate
environment lookup is needed. The CLI forms are `mabl applications list
--workspace-id <id>` and `mabl environments list --workspace-id <id>`.

**On the CLI, set the active workspace before the batch — do not rely on
`--workspace-id`.** The flag does not exist on every command that needs it.
`mabl tests list`, `mabl applications list`, `mabl environments list`,
`mabl datatables create` and `mabl agent authoring list` all take
`--workspace-id`; **`mabl agent authoring initiate` and `mabl tests
edit-metadata` do not** — passing it there exits non-zero with `Unknown
arguments: workspace-id`, before anything is created. Those two use the CLI's
configured workspace, so set it once:

```bash
mabl config get workspace              # what the CLI will write to
mabl config set workspace <workspaceId>
```

This is machine-wide CLI state, not per-session. Check it before a batch, and
say which workspace the batch is going into.

Over MCP the equivalent is per call: every tool here takes `workspaceId`, except
`mabl_authoring_list` and `mabl_authoring_status`, which derive it from the
session.

**Pass every id verbatim, exactly as it came back.** Never derive one id from
another: the suffixed form encodes the same bytes, so a computed id looks right
and authenticates as a different workspace, which surfaces as a 403 and never as
"wrong id".

### 4.2 Build the first test of a feature area, alone

Generate one test, check it (Step 5), and show the user before generating the
rest of that area. Order matters here more than it looks — 4.3 depends on having
a built test to copy from.

For a backlog, skip planning and send the prompt you wrote in Step 3 straight
through. Planning is a conversation for one test whose shape is still in doubt;
you have already done that work per case.

```bash
mabl agent authoring initiate --test-information '{
  "name": "PROJ-572 Guest checkout",
  "test_case": "<the prompt from Step 3>",
  "deployment_id": "<deployment-id>",
  "credentials_id": "<credentials-id>",
  "labels": ["jira-import-2026-08"]
}'
```

or `mabl_authoring_initiate` with the same object as `testInformation`.

**`--planning-session-id` and `--test-information` are mutually exclusive, and
`labels` and `source_test_id` live only inside `--test-information`.** So a test
initiated from a planning session cannot carry either one. Labels can be added
afterwards; a copy cannot. That is the concrete reason the batch lane writes its
own prompts.

**Label every test in the import with the same label.** One filter then returns
the whole batch — to review it, to run it, to build a plan from it. Adding a
label after the fact is `edit_mabl_test_metadata` with `add_label`, or:

```bash
mabl tests edit-metadata <testId> --add-labels jira-import-2026-08
```

`labels` inside `--test-information` is **not listed in the CLI's `--help`**, so
there is no probe for it. Check the first test of the batch for the label rather
than assuming the field took, and if it is missing, relabel with the command
above and keep doing that for the rest of the batch.

*Traceability.* There is no link from the mabl test back to the issue, so it has
to be carried in what the test holds: the **source key in the name**, the
**batch label** on every test, and the **ledger** in 4.5 mapping key to test id.
A description set with `edit_mabl_test_metadata` can hold the issue URL as well
(capped at 90 words and 1000 characters). Metadata edits are free — they do not
count as test authoring activity.

**If the app only runs on localhost** and the mabl cloud cannot reach it, add
`--mode local`: the agent loop runs in the CLI process against a browser on this
machine. Everything else is the same, except that `source_test_id` is a cloud
capability — a local session cannot copy from an existing test.

### 4.3 Copy the siblings instead of rediscovering the path

Cases in the same feature area walk the same route. Once the first is built,
pass its id as `source_test_id` and describe only what differs. Its steps are
imported and the prompt applied on top; **the source test is never modified**.
Browser tests only.

```bash
mabl agent authoring initiate --test-information '{
  "name": "PROJ-573 Guest checkout rejects invalid ZIP",
  "source_test_id": "<the PROJ-572 test id>",
  "test_case": "Same as the source test, but enter 000 as the ZIP on the shipping form. Verify a validation message appears under the ZIP field and Continue stays disabled. Take a visual assertion of the form in its error state.",
  "labels": ["jira-import-2026-08"]
}'
```

Use a fresh session only when the new case has to look at a page the first test
never visited. When it differs by data, or by an assertion on a page the first
test already reached, copying is the right call.

### 4.4 Pace the batch

Cloud authoring sessions take **5–20 minutes each**, and a workspace caps how
many run at once. That cap is the thing to plan around.

**Do not launch one session per case.** Firing a hundred at once exhausts the
concurrency quota, and near-identical prompts launched together are reported to
be skipped as duplicates, which would leave no test behind at all. Treat the
second as a reason not to fan out rather than a rule you can predict — what is
certain is that the quota is finite and a saturated batch is far harder to
reason about when part of it fails. Work one feature area at a
time: build the representative test, check it, then copy from it for the rest.
**Keep at most 5 sessions in flight.**

Poll each session with `mabl_authoring_status`, or `mabl agent authoring status
--session-id <id> --verbose`, **every 30–60 seconds**. With several in flight,
poll them in one pass per interval: the MCP server rate-limits each tool to 10
calls per 10 seconds per identity and answers 429 with `Retry-After`, so a
tighter loop is a correctness problem and not just impatience.

Three statuses decide what a batch does, and two of them are misread constantly:

- **`rate_limited` means queued, not broken.** A sweep admits queued sessions as
  slots free, so one can sit there well past twenty minutes and still start.
  Keep polling it. **Never re-launch it** — mabl tests cannot be deleted from
  these surfaces, so re-firing a queued session is how a batch ends up with two
  copies of the same test and no way to remove either. This is the single most
  expensive mistake available here.
- **`needs_attention` means stopped, and it waits forever.** The agent hit a
  question — almost always which credential to use — and nothing times it out.
  In a backlog run this is what silently strands work. Sweep for it regularly:
  `mabl_authoring_list`, or `mabl agent authoring list`, which defaults to
  exactly this status. Answer with a credential's *name*, never its contents,
  and only when the answer is something you already hold. Naming the credential
  in the prompt up front prevents most of these.
- **`completed` is not proof of anything.** Step 5.

Everything else keeps polling, with a bound: **give up after 20 minutes on the
same status** and report where it stopped, naming the status. A wedged session
reported is worth more than one waited on.

**Expect failures and keep going.** One stalled session should not stop the rest.
Note which cases produced no test and re-run those on their own at the end.

`mabl-test-authoring` documents the session lifecycle in full — every terminal
status, the `needs_attention` round-trip bound, and which fields lie.
**Requires `mabl-test-authoring`.** If that skill isn't there, say which skill is
missing and treat the statuses above as the whole rule — don't guess how to
install it, because that depends on how this skill was installed.

### 4.5 Keep a ledger

Past a handful of cases, write one row per source case as it goes, to
`.mabl/test-case-import/<batch>.csv`: source key, pile from Step 2, session id,
test id, status, and what was reported missing. Nothing is written outside
`.mabl/`.

A batch interrupted halfway is otherwise unrecoverable. Session ids are not
derivable from the cases, and re-generating produces duplicate tests that cannot
be deleted from here.

## Step 5 — Check what you got, per test and per batch

**A completed session does not mean you got the test the case asked for.** The
common failure is a test with zero assertion steps: it runs, it goes green, and
it proves nothing.

**Requires `mabl-test-authoring`.** Its validate step owns this check for one
test — reading the built steps back, matching each "verify" in the prompt to an
`Assert*` step, using the run the agent already reported rather than firing a
new one, and fixing a mismatch without deleting coverage. Hand each test there.
If that skill isn't there, say which skill is missing and report every test in
the batch as **unverified** — don't improvise the check, and don't guess how to
install it, because that depends on how this skill was installed.

Two checks belong to this skill rather than to any one test.

**Did the visual assertions land?** Step 3 asks for one per test and the agent
does not reliably build one. Read the exported steps and count the visual
assertion steps — an `AssertAIPrompt` describing the page is not one. Report the
count against the number of tests in the batch; a batch where they are all
missing is a batch with no visual coverage, whatever each prompt asked for.
Adding one afterwards is a per-test edit, not something to re-generate for.

**Count what landed against the ledger.**

```bash
mabl tests list --workspace-id <id> --labels jira-import-2026-08 --limit 200 -o json
```

`list_mabl_tests` with `labels` does the same. **Pass a limit.** The CLI returns
10 by default and the API 50 — so a 40-test batch looks like 10 tests and a
successful import looks like a partial one.

Reconcile three numbers and report all three: cases in, tests out, cases parked.
A case that is in none of those columns is the one that went missing, and the
ledger is where its session id is.

Then, against the original case — not against the prompt — ask whether the test
verifies what the case meant. An agent will sometimes verify something adjacent,
which looks green and covers nothing. This is the check only a person holding the
intent can make; put the case and the built steps side by side and ask.

## Report

End the batch with:

- **cases in / tests out / cases parked**, and the source key of anything in
  none of those;
- per test: source key → test id, and whether it is verified or **unverified**,
  which is a result and never rounded up to done;
- collapsed groups still waiting on their data-table binding;
- sessions left in `needs_attention` or wedged, with ids and last status;
- the batch label and the ledger path.

## What this does not do

- **It does not link the test back to the issue, and results do not appear in
  your tracker.** Publishing results back into Xray as Test Executions is a
  separate integration, and it can be added to tests that already exist.
- **It does not keep the two in sync.** Edit the ticket after the test is
  generated and the test does not change. An import is a starting point for
  coverage, not a mirror of the tracker.
- **It does not delete anything.** Tests created here cannot be removed from
  these surfaces. Generate sparingly and fix forward.
