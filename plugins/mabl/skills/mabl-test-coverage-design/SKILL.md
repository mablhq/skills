---
name: mabl-test-coverage-design
description: >
  Use when asked to create MULTIPLE mabl tests / a whole suite for a feature
  area — "add mabl coverage for X", "cover the X page/feature with mabl tests",
  "design a mabl test suite for X", "let's create tests for X", "explore X and
  create tests", or "/mabl-test-coverage-design". For testing a page, screen,
  form, flow, or feature broadly, not one specific scenario. This skill explores
  the feature, designs the set of tests, then authors each one in the mabl cloud.
  For a SINGLE test, use mabl-test-authoring directly.
---

# mabl test coverage design

Turn "add coverage for <feature>" into a focused **suite** of mabl tests.
You explore the live app to decide *what* to test; the mabl cloud authoring
agent figures out *how* to perform each test. This skill owns the design and
fan-out; it authors each test with `mabl agent authoring` (the companion
`mabl-test-authoring` skill documents that command in depth).

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.111.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth login --auto   # one-time OAuth in browser — required before any command
```

You also need a **browser MCP that drives a real Chrome** (e.g. a Chrome
DevTools MCP) to explore the app during the design phase.

## The two constraints — fix these before anything else

### 1. Black-box. Discover the feature by USING the app, never by reading source.

Drive the app with a browser MCP (a real Chrome). Everything you choose to test
must come from what is visible on screen. **Do not open the app's source code to
learn how the feature works or to build the test list.**

This is the constraint agents break first. You are exploring to design
*coverage* — not to find selectors. The cloud agent finds selectors itself, so
reading source buys you nothing and quietly couples your tests to internal
structure a user can't see.

**Violating the letter of this rule is violating the spirit.** Reading the
component "just to find the field names," "just to confirm the route," or "just
to see what tabs exist" is reading source. Navigate to it instead.

| Rationalization | Reality |
|---|---|
| "I'll just grep the route/component to find the page faster" | The navigation path IS part of the design. Click your way there; that path becomes how each test starts. |
| "Reading the source tells me every field, so coverage is more complete" | It tells you fields a user can't see or assert on. Black-box coverage = what the surface exposes. Source-derived tests assert on the wrong things. |
| "Feature flags / gating — I need the code to know what renders" | Then it renders or it doesn't *for this account*. Test what you actually see logged in as the test user. |
| "It's faster than exploring" | Speed isn't the goal; designing the *right* tests is. Take the slow path on purpose. |

**Red flags — STOP, you're about to break black-box:**
- Opening, grepping, or reading any file in the app's source repo
- Listing tabs/fields/routes from a component instead of from a screenshot
- Asking "what does the code do here?" instead of "what happens when I click this?"

### 2. Self-isolating tests. Each test brings its own subject and cleans up.

It's a live workspace with real data. Every test you design must create its own
subject, act on it, and delete it (create → act → assert → delete). Bake this
into each test's intent so the generated test does not pollute or depend on
shared state. This is the **default**, not a question to ask the user — only
deviate if the user says otherwise.

**Fail closed on teardown:** a test may delete **only** the subject it created
itself, identified by the exact name/id it just created — never pre-existing or
shared data, and never a broad query that could match more than its own subject.
If a test can't create its own subject, it must not delete anything.

## The workflow

1. **Navigate to find it.** Drive the app click-by-click with the browser MCP
   until you reach the target view. Note the path — each intent starts from it.
2. **Read the surface.** Take a snapshot of the interactive elements + a
   screenshot. That list is the spec you design against.
3. **Overlay a coverage pattern.** Match the surface to a UI pattern below;
   instantiate each generic question against what you actually saw. This is *how
   you know what to test*.
4. **Write one intent per behavior.** Each becomes a detailed `test_case`: the
   steps, the self-isolation (create/delete own subject), and the safe inputs
   that avoid side effects.
5. **Verify on observables only.** Each assertion must be something a user can
   see: a reopened field value, a control going disabled, a validation error
   appearing, a row appearing/disappearing.
6. **Scope deliberately.** Pick how many tests on purpose. State what you left
   out and why (lower value, or not visible black-box). The count is a choice,
   not a discovery.
7. **Write the design record.** Emit a short doc capturing the reasoning:
   constraints → navigation path → observed surface → pattern overlay → chosen
   tests + what was dropped.
8. **Fan out.** Author each intent with `mabl agent authoring` (below), using
   the strategy (default `seed`). Report each `createdTestId` + `viewTestUrl`.

## Authoring each test

For each intent, drive the mabl cloud authoring agent:

```bash
# 1. Plan (refine with --session-id + --changes if the outline misses something)
mabl agent authoring plan --intent "<the test_case: steps + self-isolation + safe inputs>"
# 2. Generate from the planning session
mabl agent authoring initiate --planning-session-id <planningSessionId>
# 3. Poll (every 30–60s) until terminal — completed/failed/terminated.
#    The result carries createdTestId + viewTestUrl.
mabl agent authoring status --session-id <sessionId>
```

The `mabl-test-authoring` skill covers this command in depth (the
`--test-information` fields, API tests, local mode). Use it for the per-test
detail; this skill owns deciding *which* tests to author and *in what order*.

## Suite strategy — parallel, seed, or chain

How the tests get authored relative to each other. Pick a mode; default to
`seed`. The user may override ("author them in parallel", "chain them").

| Mode | Behavior | Wall-clock | Use when |
|---|---|---|---|
| `parallel` | author all intents at once, independently | ~1 test | speed matters; consistency comes from existing team tests (reference those) |
| `seed` (default) | author the anchor test first (the central happy-path), wait for it, then fan out the rest **concurrently**, each referencing the anchor | ~2 tests | greenfield suite; want a consistency anchor without paying full serialization |
| `chain` | author sequentially; each test references **all** prior siblings | ~N tests | max consistency, order matters, no existing references to anchor on |

Each cloud authoring run takes 5–20 min, so `chain` of N tests ≈ N× the
wall-clock of `parallel`. Prefer `seed` unless the user asks otherwise.

**Degrade gracefully — these runs are slow and can fail or time out.** One
failed authoring run must not abort the rest: keep going and report which tests
succeeded (with `createdTestId`) and which failed, so the run is resumable. If
the `seed` anchor fails, don't block the suite — fall back to `parallel` for the
remaining tests (they just author without an anchor reference).

### How a test references another

The planning agent has no structured "reference test" parameter — it reads
references from the **intent text** and fetches them itself. To reference one or
more existing tests (siblings you just authored, or existing team tests), append
this block to that test's `--intent` (new session) or `--changes` (follow-up),
verbatim except the IDs:

```
[Reference test context]
The following tests are related references. Use get_test_definition to study
them and match their flows, structure, and conventions.
Reference test IDs: <testId1>, <testId2>
```

The planner calls `get_test_definition` on each ID and studies the real test
definition — the same mechanism the mabl web app's "Add reference tests" uses.

- **Prefer existing team tests as references** whenever the workspace has good
  related ones — they're higher-signal than a freshly-generated sibling. Include
  their IDs in the block in any mode, even `parallel`.
- In `seed`/`chain`, collect each `createdTestId` as authoring completes and feed
  it into the reference block of the tests authored after it.

## Coverage patterns (the question sets)

Match the observed surface to a pattern and instantiate every applicable row.
Ignore rows the surface doesn't expose.

**Edit form**
- loads pre-populated with current data
- save persists (reopen → values stuck) ← the central promise
- required-field validation blocks save
- the most app-specific widget works
- cancel/discard discards changes

**Create form**
- required fields gate submission
- happy-path create → the entity appears in the list
- the safe minimal input (avoid side effects)
- cancel abandons without creating

**List / table**
- the expected row is present
- search/filter narrows correctly
- a row action reaches the right place
- empty state when nothing matches

**Detail / read page**
- shows the entity's real data
- each action button routes correctly

**Multi-step / wizard**
- can't advance past an invalid step
- back preserves entered data
- finish persists the whole thing

The domain spark is spotting the one genuinely app-specific control worth its
own test — and the user-visible signal that proves it worked (a value that
sticks on reopen, a control that flips to disabled once configured, a status
badge that changes). Prefer signals a user can see over internal state.

## Notes that bite

- Specify in each `test_case` the safe inputs that avoid side effects — choose
  inputs that don't trigger downstream automation, notifications, billing
  events, or auto-created entities that would pollute the workspace.
- Tell the planner which app / environment / credentials to target so every
  test in the suite lands in the same place.

## A quick illustration

Say the request is "add coverage for the profile settings page." You navigate
there (you don't read the code), screenshot the surface, and see: a name field
(required), a bio field, an avatar picker, and Save / Cancel. That's an **edit
form**, so you overlay that pattern: loads pre-populated → save persists (reopen,
value stuck) → clearing the required name blocks save → the avatar picker (the
app-specific widget) works → Cancel discards. Five behaviors, each a
self-isolating test that creates its own throwaway profile and deletes it, each
asserting only on what the screen shows. You'd note you deliberately skipped,
say, a rarely-used theme toggle to keep the first cut focused.
