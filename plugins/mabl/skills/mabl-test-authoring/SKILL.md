---
name: mabl-test-authoring
description: |
  Create a SINGLE mabl browser and API tests through conversational planning
  and cloud authoring. Plan one test with an AI agent, refine the plan
  iteratively, initiate cloud (or local) test generation, then validate that
  the test it built actually matches what you asked for and fix it if not.
  Fire when the user wants to create one mabl test, asks to "plan a test",
  "create a test for <one scenario>", "generate a mabl test", "author a
  test", or mentions testing a single URL / ticket with mabl.
  For broad coverage of a whole feature / page / flow with MULTIPLE tests,
  use mabl-test-coverage-design instead — it explores the feature, designs
  the suite, and calls THIS skill once per test.
allowed-tools: Bash
---

# mabl agent authoring

Create mabl browser or API tests through a plan-then-generate workflow.

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.124.30
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth login --auto   # one-time OAuth in browser — required before any command
mabl auth info    # verify you're logged in and the token hasn't expired
```

## Workflow

```
1. Plan     → mabl agent authoring plan --intent "..."
              (conversational — refine with --session-id + --changes)
2. Generate → mabl agent authoring initiate --planning-session-id <id>
              (kicks off cloud test authoring)
3. Poll     → mabl agent authoring status --session-id <id>
              (check until sessionStatus is terminal; if it pauses on
               needs_attention, answer it — see step 3.1)
4. Validate → check the built test against the intent you asked for
              (see step 4 — a completed session is not proof)
```

You can run multiple planning and authoring sessions concurrently —
just track the session IDs.

### After authoring completes

Read the terminal output carefully — two fields are easy to misread:

- **`sessionStatus`** is the status field (not `status`). Terminal values are
  `completed`, `failed`, and `terminated`.
- **`createdTestId` is NOT a success signal.** It is populated on `failed`
  sessions too, because a test can be saved by a session that then failed.
  Check `sessionStatus` for success, never the presence of a test id.

`reportedTestRunId` is the useful signal. When the agent's final validation
replay passes, it reports that replay to the cloud as a test run and links it
to the session; `status` surfaces its id plus a `viewTestRunUrl`. So:

- **`reportedTestRunId` present** → the agent ran the test end to end and it
  passed. You get a real step trace and a screenshot per step, for free — no
  need to re-run anything.
- **absent** → nothing proved the test works. Either the validation didn't
  pass, or the workspace can't report agent runs. Treat the test as unverified.

Other things you can do with the test:

- **Run the test in the cloud:** `mabl tests run-cloud --id <createdTestId>`
- **Run the test locally:** `mabl tests run --id <createdTestId>`
- **Export to Playwright (browser tests only):** `mabl tests export <createdTestId> --format playwright --file out.spec.ts`

---

## 1. Plan — describe the test

Start a planning conversation with the mabl AI agent. The planner
selects the right application, environment, and credentials, then
builds a detailed test outline.

### Writing a good intent

Be specific. The planner works best with concrete details:

```bash
# Bad — too vague, the planner has to guess everything
mabl agent authoring plan --intent "test login"

# Good — specific app, credentials, and what to verify
mabl agent authoring plan --intent "Test login on the staging app with valid credentials. After logging in, verify the dashboard loads and the user's name appears in the header."
```

Include: which app/URL, what credentials (if auth is needed), what
steps to perform, and what to verify at each step.

### Iterating on the plan

```bash
# Start a new planning session
mabl agent authoring plan --intent "Test the checkout flow on staging..."
```

Returns JSON with `planningSessionId`, `response`, and
`testInformation`. The planner may ask clarifying questions — answer
by passing the session ID back:

```bash
# Refine the plan
mabl agent authoring plan \
  --session-id <planningSessionId> \
  --changes "Also verify the order confirmation email is sent"
```

### When is planning done?

You decide. Review `testInformation` (name, URL, credentials) and
`planContent` (the step-by-step outline) after each call. If they
capture what you want to test, move to step 2. You don't need to wait
for the planner to say it's ready — one call is often enough if the
intent is specific. Call `--changes` only when the plan is missing
something.

You can run multiple planning sessions in parallel for different
tests — each has its own session ID.

---

## 2. Generate — start test authoring

Once the plan is ready, kick off cloud test generation:

```bash
# From a planning session (recommended)
mabl agent authoring initiate --planning-session-id <planningSessionId>

# Or skip planning and provide test info directly
mabl agent authoring initiate \
  --test-information '{"name": "Login test", "test_case": "...", "url_override": "https://..."}'
```

### Test types

**Browser tests** (default) are agentic — an AI agent drives a real
browser, building the test step by step. The session runs
asynchronously and typically takes **5–20 minutes**. Track progress
via `status`:

```bash
mabl agent authoring initiate --planning-session-id <id>
# returns sessionId — poll with: mabl agent authoring status --session-id <sessionId>
```

**API tests** are one-shot — the test is generated in a single pass
from the API spec, with no interactive agent session. Completes in
under a minute:

```bash
mabl agent authoring initiate \
  --test-type api \
  --test-information '{"name": "Health check", "test_case": "GET /health returns 200", "url_override": "https://api.example.com"}' \
  --api-spec "$(cat openapi.yaml)"
```

### Execution mode

**Cloud** (default, recommended) runs the authoring agent in the mabl
cloud. Parallelizable, no local browser needed:

```bash
mabl agent authoring initiate --planning-session-id <id>
# equivalent to: --mode cloud
```

**Local** runs the authoring agent loop in this CLI process, driving a
browser on your machine (not the desktop trainer). Only use when testing
a locally running app (e.g. localhost) that the cloud cannot reach:

```bash
mabl agent authoring initiate --planning-session-id <id> --mode local
```

---

## 3. Poll — check progress

Browser cloud sessions typically take **5–20 minutes**. Poll every
**30–60 seconds**. Status will sit on `running` with no sub-step
detail — this is normal.

```bash
# Fast status (minimal output, good for polling loops)
mabl agent authoring status --session-id <sessionId>

# Full details (includes latest agent message and test URL when complete)
mabl agent authoring status --session-id <sessionId> --verbose
```

When the session reaches a terminal state (`completed`, `failed`, or
`terminated`), both verbose and non-verbose output include
`createdTestId` and `viewTestUrl`, plus `reportedTestRunId` and
`viewTestRunUrl` when the agent's validation replay passed.

**`running` is the only status that waiting fixes.** Read `sessionStatus` on
every poll and act on what it says — never infer progress from elapsed time.
In particular `needs_attention` means the session stopped to ask you
something, and no amount of polling will move it.

### 3.1 `needs_attention` — the session is waiting on you

This is not a slow `running`. The agent hit something it can't decide alone —
most often which credential to use — and **it will never move again on its
own.** No timeout resolves it. A loop that only watches for
`completed`/`failed`/`terminated` polls until you give up, while the question
sits unanswered in the web app where nobody is looking.

On `needs_attention`, and on no other status, `status` adds these fields:

| Field | Always there | What it is |
|-------|--------------|------------|
| `question` | no | What the agent is asking. If it's absent the session paused without a resolvable question — re-check the session instead of answering blind. |
| `reClarification` | yes | `true` when this follows up an answer you already gave. |
| `loopNumber` | yes | Which question this is. You pass it back. |
| `planDiffSummary` | no | How the agent proposes to change the plan. |
| `notesForAuthoringAgent` | no | Context the agent recorded for itself. |

**`loopNumber` counts from zero, so the first pause reports `loopNumber: 0`.**
That's a real value, not a missing one — and the first pause is the one you're
most likely to hit, so code that reads `0` as "no loop number" drops the
safety check below exactly when it matters.

**Answer only what you already know.** Answer when the answer is something
you're already holding: which credential, which application or environment, or
what the intent you launched with asked for. Everything else goes to the user.

Don't guess. A guessed credential sends the agent authoring against the wrong
account and hands you a confident `completed` session that tested the wrong
thing. Surfacing a question costs one message; guessing costs a bad test that
nobody knows is bad.

| The agent asks | Grounded? |
|----------------|-----------|
| "which credential should I use?" — and your intent named one | yes, answer it |
| "which environment?" — and you launched from a `deployment_id` | yes, answer it |
| "should it also verify the confirmation email?" | no — your intent never said. Ask. |
| "the login page looks different than expected, continue?" | no — you can't see it. Ask. |

To answer and resume:

```bash
# Note the shapes differ: status takes --session-id, answer takes a positional.
mabl agent authoring answer <sessionId> "Use the 'Webapp user' credential" \
  --expected-loop-number <loopNumber>
```

Pass `--expected-loop-number` with the `loopNumber` from **the same `status`
read you based the answer on**. The flag is optional, and skipping it is how an
answer lands on a question you never read: if the session moved on in between —
say a dropped response on an earlier retry already committed a
re-clarification — your answer silently rebinds to whatever question is
current now. With the flag it fails loudly instead.

`answer` prints one of two outcomes:

- `{"outcome":"resumed","sessionStatus":"..."}` — running again. Go back to
  polling.
- `{"outcome":"re_clarification","question":"..."}` — the agent asked something
  else. **Re-read `status` before answering again**, because `loopNumber` has
  advanced and the one you're holding will now be rejected.

A mismatch exits 1, names both loop numbers, and submits nothing. That's the
check doing its job: re-read `status`, look at the question that's actually
pending, and answer that one. **Never re-send the same answer with the number
bumped** — that defeats the whole point of the flag.

**Bound the round-trips at 3.** A session asking a fourth question isn't
converging, and answering again is worse than stopping. Report what it keeps
asking and let the user take it. `mabl agent authoring terminate --session-id
<sessionId>` ends one that's no longer worth finishing.

When you can't answer, say so plainly — the session id, the question verbatim,
and `viewTestUrl` if you have one — and let the user either answer in the web
app or tell you what to send. **A paused session is not a failure.** It's a
question with nobody reading it, and reporting it is the whole fix.

---

## 4. Validate — check what was actually built

**A completed session does not mean you got the test you asked for.** The
agent can build a test that misses an assertion the intent asked for, verifies
something adjacent to what you wanted, or passes because it never checked the
thing that matters. So read the test back and compare it to the intent you
launched with. You already have that intent — no need to write it down
anywhere.

Always validate. Then **ask before healing**: each fix attempt is another
5–20 minute cloud session, so report what doesn't match and let the user
decide whether to spend that.

First confirm this CLI can do it. Probe for the flag rather than trusting a
version number — the commands this step needs all shipped together, and a
version check can pass on a build that predates them:

```bash
# Match --step as a whole word: a plain substring search also matches the
# older --step-run-id flag, so it would pass on a CLI that can't do this.
mabl agent debug artifact --help 2>&1 | grep -qE '(^|[[:space:]])--step([[:space:]]|$)' \
  || echo "This mabl CLI cannot validate an authored test — 'mabl agent debug artifact --step' is missing. Upgrade: npm install -g @mablhq/mabl-cli@latest"
```

If that prints the warning, stop here and report the test **unverified**, naming
the missing capability. Don't fall back to re-running the test — that answers a
different question.

### 4.1 Does the test contain what you asked for?

Export the built test and read its steps. Each step is a single-key object
keyed by its step type, so assertions are the keys beginning with `Assert`:

```bash
mabl tests export <createdTestId> --format json --file /tmp/built-test.json
```

Then check, against your own intent:

- Every "verify / check / assert that ..." in the intent has a matching
  `Assert*` step. A test that only navigates and clicks proves nothing.
- **Zero assertion steps is always a failure**, whatever the run said.
- The actions the intent asked for are present.

`mabl tests export` writes a **file** — it prints nothing to stdout. It also
refuses some tests ("Default mabl tests can not be exported") and performance
tests; if it refuses, say so and validate behavior only.

### 4.2 Did it actually run, and pass for the right reason?

Use the run the agent already reported — do not fire a new one:

```bash
mabl agent debug steps <reportedTestRunId> --all --output json
```

You get one entry per step with `status` (`passed` / `failed` / `skipped`),
`duration_ms`, any `error`, and the artifacts it captured.

**Match steps by their `description`, never by position.** The trace lists only
leaf steps, while the export is a tree — so the third assertion in the export is
*not* `index: 3` in the trace for any test with a flow or step group. Match the
trace's `description` against the exported step's description text.

Newer runs prefix each `description` with the step's outline number
(`"3.1. Click Sign in"`), which makes the match unambiguous — use it when it's
there. **Don't require it:** runs authored by an older CLI have plain
descriptions with no number, so a rule that depends on the prefix will fail on
them.

Then check that:

- every step carrying an assertion is `passed`, **not `skipped`** — a skipped
  assertion is a test that proved nothing while looking green;
- every assertion you found in 4.1 appears in the trace.

**If you cannot line the two up, the test is unverified — say so.** Do not fall
back to position and do not guess: a wrong match makes you report "the assertion
passed" about a different step, which is the exact failure this step exists to
catch.

These runs have no step-run ids, so artifacts are addressed by position — and
`--step` takes the trace's `index` field, *not* the outline number in
`description`. The two diverge as soon as a flow is involved.
To look at what the browser actually showed on any step:

```bash
mabl agent debug artifact screenshot <reportedTestRunId> --step <index>
```

That writes a PNG and prints its path. Read the image for the steps you
doubt — it is the cheapest way to catch a test that passed against the wrong
screen.

### 4.3 Fixing a mismatch — ask first, and never weaken the test

Report the mismatch and ask before spending a heal attempt. On a yes, **pick the
cheapest way to make the fix** — that decision matters more than it looks:

**Can you name the exact edit?** Then don't open a browser. Hand the change to
the `mabl-test-edit` skill's structured-step lane, which applies a named
`insert_after` / `replace` / `move` in seconds. You can name it when:

- the intent asked to verify a variable, the URL, or the viewport — no element
  lookup needed;
- the element is one the test already interacts with, so the find descriptor is
  already sitting on that step in the export you read in 4.1 — copy it into the
  assertion;
- an assertion exists but ran in the wrong place, and the fix is to move it.

That lane is not just faster. **A structured insert cannot delete anything**, so
it removes the whole risk this section is guarding against.

**Otherwise** — the fix needs the live app, e.g. "verify the toast appears" for
an element nothing in the test has ever touched — edit through the authoring
agent by passing `test_id` (this edits rather than creates; `name` and URL are
not needed):

```bash
mabl agent authoring initiate --test-information '{
  "test_id": "<createdTestId>",
  "test_case": "Add an assertion that the cart badge shows 2 after adding an item. Edit in place; do not remove existing steps."
}'
```

Poll it like any other session, then re-validate from 4.1. **Bound the agent
lane at 3 attempts**, then stop and report.

Keep the decision here, in this loop: it holds the authoring intent and the
obligation not to converge by deleting coverage, which a general-purpose editor
has no way to know. Delegate only the mechanism. And for any change that isn't a
validation fix at all — a rename, a label, a deliberate step edit — the user
should be pointed at `mabl-test-edit` directly.

Before accepting any attempt, prove the fix didn't just delete the problem:

```bash
mabl tests versions <createdTestId>
mabl tests compare <createdTestId>:<previousVersion> <createdTestId>:<newVersion> --output json
```

The diff summarizes `added` / `removed` / `changed` steps. **Any `Assert*`
step in `removed` that you did not explicitly ask to remove is a failure, not
a fix** — an edit that turns a run green by dropping coverage is worse than the
mismatch you started with. Re-prompt with "add the assertion; do not remove
steps", and count it as one of the three attempts. Run this after a structured
edit too: it should show a clean single insert, and if it doesn't, something
other than your edit changed the test.

If neither lane is open — the workspace has neither the structured edit tools nor
agentic test editing — stop looping and report the mismatch unverified. Don't
re-run the test hoping for a different answer.

### 4.4 Report

Whether you succeeded or gave up, end with:

- what you checked, and what did or didn't match the intent;
- how many heal attempts you used;
- every id: planning session, each authoring session, `createdTestId`,
  each `reportedTestRunId`, and the versions you compared.

Never report a test as verified when `reportedTestRunId` was absent or an
assertion was skipped. Say it is unverified and why.

`references/validate-and-heal.md` has the detail: how to read the export,
what the trace looks like, and the failure modes worth knowing.

---

## Direct test information format

When skipping the planning phase, `--test-information` takes a JSON
object with these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Human-readable test name |
| `test_case` | yes | Free-text description of what the test should do. Be detailed: list the steps, what to click, what to verify. The more specific, the better the generated test. |
| `url_override` | one of these | Direct URL to test against. Use for arbitrary URLs not configured in mabl. |
| `deployment_id` | one of these | Deployment ID from mabl. Resolves to the correct URL + app + environment automatically. Preferred when the URL is already configured. |
| `application_id` | no | Application ID. The planner picks this automatically when using `deployment_id`. Only needed with `url_override` if you want the test scoped to a specific app. |
| `environment_id` | no | Environment ID. Same as above — automatic with `deployment_id`. |
| `credentials_id` | no | Credentials ID for authenticated tests. Omit if the test doesn't require login. |

Example:

```json
{
  "name": "Checkout flow - guest user",
  "test_case": "Navigate to the product page, add an item to cart, proceed to checkout as a guest, fill in shipping details, and verify the order confirmation page shows a confirmation number.",
  "url_override": "https://staging.shop.example.com"
}
```
