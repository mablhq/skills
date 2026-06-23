---
name: mabl-test-authoring
description: |
  Create a SINGLE mabl browser and API tests through conversational planning
  and cloud authoring. Plan one test with an AI agent, refine the plan
  iteratively, then initiate cloud (or local) test generation.
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
MIN_MABL_CLI_VERSION=2.111.0
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
              (check until completed, then the test is ready)
```

You can run multiple planning and authoring sessions concurrently —
just track the session IDs.

### After authoring completes

Once `status` returns `completed` with a `createdTestId`, you can:

- **Run the test in the cloud:** `mabl tests run-cloud --id <createdTestId>`
- **Run the test locally:** `mabl tests run --id <createdTestId>`
- **Export to Playwright (browser tests only):** `mabl tests export --id <createdTestId> --format playwright`

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
`createdTestId` and `viewTestUrl` so you can immediately run or
inspect the test.

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
