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
allowed-tools: Bash, mcp__chrome-devtools__*
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
MIN_MABL_CLI_VERSION=2.124.30
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth login --auto   # one-time OAuth in browser — required before any command
```

You also need the **`chrome-devtools` MCP**, which drives its own real Chrome
instance, to explore the app during the design phase. Don't use
`chrome-for-mabl` here — that server is reserved for `mabl-debug`, where it
attaches to the specific Chrome instance `mabl agent debug session` launches.

## The two constraints — fix these before anything else

### 1. Black-box. Discover the feature by USING the app, never by reading source.

Drive the app with the `chrome-devtools` MCP (a real Chrome). Everything you choose to test
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

1. **Navigate to find it.** Drive the app click-by-click with the `chrome-devtools`
   MCP until you reach the target view. Note the path — each intent starts from it.
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
   the strategy (default `serial`). Order the intents so the central happy-path
   test is authored first — it seeds every test after it. Every test after the
   first gets sibling context, never none: **copy** from one prior test when
   this one walks the same path, **reference** all prior siblings when it walks
   a different one. Within a feature area most tests walk the same path, so
   expect to copy more often than you reference — see *Referencing vs copying*.
   Report each `createdTestId` + `viewTestUrl`.
9. **Validate what got built.** A finished authoring run is not proof the test
   is right. Check each authored test against the intent it came from, then
   report the suite in the three states below. A suite of links to tests that
   do the wrong thing is worse than a smaller suite you actually verified.

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

## Suite strategy — serial or parallel

How the tests get authored relative to each other. **Use `serial` unless the
user asked for `parallel` in words.** Speed alone is not a reason to switch —
you will always be able to argue the suite would finish faster, which is why
that judgement isn't yours to make here. And don't change mode part-way: a run
that starts serial finishes serial.

| Mode | Behavior | Wall-clock | Use when |
|---|---|---|---|
| `serial` (default) | author sequentially, central happy-path first; each test then copies from one prior test or references **all** of them (plus any existing team tests) | ~N tests, less for copies | default — the first test seeds the rest and every test after it builds on what already worked |
| `parallel` | author all intents at once, independently | ~1 test | **only when the user asks for it** — no sibling has finished, so nothing can copy or reference; consistency has to come from existing team tests |

`serial` is the default because it *is* the seed: the central happy-path test
is authored first, and every test after it builds on the siblings already
created, so the suite converges on one shape. Each cloud authoring run takes
5–20 min, so `serial` of N tests ≈ N× the wall-clock of `parallel`. That gap is
what makes `parallel` tempting, and it is mostly an illusion: firing several
authoring sessions at once gets them **rate-limited and killed**, so you pay the
wall-clock anyway and lose tests doing it. Launch the next test only after the
previous one reaches a terminal status.

Don't default the whole fan-out to references just because `serial` says
"references" — decide per test, using the rule in *Referencing vs copying*.

**Degrade gracefully — these runs are slow and can fail or time out.** One
failed authoring run must not abort the rest: keep going and report which tests
succeeded (with `createdTestId`) and which failed, so the run is resumable. In
`serial`, if one test fails, don't block the suite — continue to the next test,
referencing the siblings that did succeed (skip the failed one's ID).

## Validating each authored test

`sessionStatus: completed` means the agent finished, not that it built the test
you asked for. It can miss an assertion the intent called for, assert on
something adjacent, or go green because it never checked the thing that
mattered. Across a fan-out this compounds: five confident links, and nobody has
looked at any of them. So validate each test against **the intent you authored
it from** — you already have that text, no need to write it down anywhere.

Validate every test. Then **ask before healing**: each fix is another 5–20
minute cloud run, so report the mismatches and let the user decide whether to
spend that. Never heal automatically across a whole suite.

First confirm once, before the loop, that this CLI can validate at all. Probe
for the flag rather than trusting the version — these commands shipped
together, so a version check can pass on a build that predates them, and you'd
rather learn that once than N times:

```bash
# Match --step as a whole word: a plain substring search also matches the
# older --step-run-id flag, so it would pass on a CLI that can't do this.
mabl agent debug artifact --help 2>&1 | grep -qE '(^|[[:space:]])--step([[:space:]]|$)' \
  || echo "This mabl CLI cannot validate authored tests — 'mabl agent debug artifact --step' is missing. Upgrade: npm install -g @mablhq/mabl-cli@latest"
```

If that prints the warning, stop validating and report every authored test as
**unverified**, naming the missing capability once for the whole suite. Don't
re-run the tests instead — that answers a different question.

Per test, two checks:

**Does it contain what you asked for?** Export it and read the steps back.
Each step is a single-key object keyed by its step type, so assertions are the
keys starting with `Assert`:

```bash
mabl tests export <createdTestId> --format json --file /tmp/built-<createdTestId>.json
jq '[.. | objects | keys[] | select(startswith("Assert"))] | length' /tmp/built-<createdTestId>.json
```

Every "verify / check / assert that ..." in the intent needs a matching
`Assert*` step, and the actions the intent asked for must be present. **Zero
assertions is always a failure**, whatever the run reported. (`mabl tests
export` writes a file and prints nothing; it refuses default and performance
tests — if it refuses, say so and validate behavior only.)

**Did it run, and pass for the right reason?** Use the run the agent already
reported — don't fire a new one:

```bash
mabl agent debug steps <reportedTestRunId> --all --output json
```

Match steps by their `description`, never by position — the trace lists only
leaf steps while the export is a tree, so the third assertion in the export is
not `index: 3` in the trace for any test with a flow or step group. Then check
every assertion step is `passed` and **not `skipped`** (a skipped assertion is
a test that proved nothing while looking green), and that every assertion you
found in the export shows up in the trace. If you can't line the two up, the
test is **unverified** — say so rather than guessing.

To see what the browser actually showed on a step you doubt:

```bash
mabl agent debug artifact screenshot <reportedTestRunId> --step <index>
```

`--step` takes the trace's `index`, not the outline number in `description`.

**`reportedTestRunId` absent means unverified**, full stop — nothing proved the
test works. Don't fall back to `mabl tests run-cloud`; a fresh run answers a
different question than the validation the agent performed.

The `mabl-test-authoring` skill owns this lane in depth (the heal routing, the
no-weakening version diff, the full failure-mode table). Use it when a single
test needs fixing; this skill owns validating the suite and reporting it.

### Report the suite in three states

One test's validation failing must not abort the others — same degrade-gracefully
stance as authoring. Validate them all, then report every test in exactly one
state:

| State | Means | Report |
|---|---|---|
| **Authored + validated** | assertions present, ran, passed for the right reason | `createdTestId` + `viewTestUrl` |
| **Authored, not validated** | test exists but the check failed or couldn't run — missing assertion, skipped assertion, no `reportedTestRunId`, steps that wouldn't line up | id + url + **what specifically didn't match** |
| **Authoring failed** | no usable test — `sessionStatus` `failed`/`terminated`, or timed out | what failed, so the run is resumable |

That three-state report is the deliverable. Never collapse the middle state
into the first: "authored" and "verified" are different claims, and a suite
that quietly reports unverified tests as done is the exact failure this step
exists to prevent.

### How a test references another

The planning agent has no structured "reference test" parameter — it reads
references from the **intent text** and fetches them itself. To reference one or
more existing tests (siblings you just authored, or existing team tests), append
this block to that test's `--intent` (new session) or `--changes` (follow-up),
verbatim except the IDs:

```
[Reference test context]
The following tests are related references. Use get_test_definition to study
them and match their flows, structure, and conventions. Trust that structure:
start from it and change or add only the steps that make THIS test different.
Reference test IDs: <testId1>, <testId2>
```

The planner calls `get_test_definition` on each ID and studies the real test
definition — the same mechanism the mabl web app's "Add reference tests" uses.

- **Prefer existing team tests as references** whenever the workspace has good
  related ones — they're higher-signal than a freshly-generated sibling. Include
  their IDs in the block in any mode, even `parallel`.
- In `serial`, collect each `createdTestId` as authoring completes and feed all
  the prior created IDs into the reference block of the next test, so each test
  sees every sibling built before it.

### Referencing vs copying — two different asks

A reference says *"match this test's conventions."* A copy says *"start from
this test's actual steps."* They solve different problems and you can use both
at once:

| | Reference block | Copy |
|---|---|---|
| What the planner does | studies N tests, plans fresh steps | plans a **diff** against one test's real steps |
| Good for | consistency across a suite | a new test that repeats an existing one's steps |
| How many | several | exactly one source |

**Which one, per test: does this test walk the same path as one already
authored?** Same entry point, same subject created the same way, same teardown
— then **copy** it, even though the behavior it proves is different. Reference
only when the path genuinely diverges: a different page, a different entity, a
different way in.

Within one feature area most of a suite walks the same path, so **most of a
suite copies from the anchor** and only the first test is authored cold.

Don't let reusable flows talk you out of it. It is tempting to reason "login and
navigation are already flows, so there's nothing to inherit" — open the anchor
with `get_test_definition` and count. The flows cover the walking about; the
steps *between* them are inline, and they are the ones you actually want:

- the variable setup that names and shapes the subject
  (`Generate a string "editapp-{{digit:6}}"` → `appName`)
- every assertion, with its trained element find and its exact wording — the
  `GenAI Assert` phrasings especially
- the waits and one-off clicks that no flow owns

Re-authoring those means the agent rediscovers the same elements and reinvents
the same phrasings, slower and weaker each time. A copy inherits them and you
edit the few that differ.

When the rule above says copy, say it plainly in the `--intent`, naming the
test and its id:

```
Start from an exact copy of the "Guest Checkout" test (<testId>), then change
only the payment step to use PayPal. Keep every other step and assertion as-is.
```

The planner resolves that to a structured copy on the test information, and the
authoring agent imports the source's real steps — with their trained element
finds — instead of re-deriving them. That is both faster and closer to the
original than re-authoring from a reference. The source test is only read; it
is never modified.

Two things to keep in mind:

- **Still say what's different.** A copy with a vague "and adjust as needed"
  produces a duplicate. Name the step to change and what it becomes, and say
  which steps must stay untouched.
- **It changes the strategy calculus.** A copy-seeded test skips most of the
  exploration an authoring run does, so it lands much faster than a normal
  5–20 minute run. Where the rule says copy for most of a suite, author the
  anchor first and copy from it — you get `serial`'s consistency without paying
  `serial`'s full wall-clock for every test after the first.

If the workspace's planner doesn't support copying yet, nothing breaks — it
just plans the test normally from the intent text, and the reference block is
still doing its job.

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
