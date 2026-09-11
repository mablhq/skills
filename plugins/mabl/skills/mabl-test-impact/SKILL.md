---
name: mabl-test-impact
allowed-tools: Bash, Read, mcp__mabl__*
description: >-
  Find, screen, run, and report on the EXISTING mabl end-to-end tests covering a product-code change, after unit tests pass and before opening a PR, or check what already covers an area. For designing NEW coverage for an area use mabl-test-coverage-design; for a test your change intentionally broke use mabl-test-edit. Surfaces coverage gaps; authors against them only as an opt-in handoff to mabl-test-authoring. Triggers on "which mabl tests should I run for this change", "what mabl tests are impacted by this change", "validate this change against mabl", "what covers this area before I add tests". Also fires on first-time setup and missing prerequisites: "set up test impact analysis", "check my test impact setup", "is test impact analysis working", "analyze_test_impact is missing", "TIA is not enabled". It cannot install itself — these verify and wire up prerequisites for an already-installed skill. Not for docs, config, or pure refactors.
---

# Validating your change against the mabl tests that cover it

You just changed product code. Unit and integration tests check the code in isolation;
mabl tests check the **product from the user's side** — real flows through the running app,
catching user-visible regressions the isolated tests miss. `analyze_test_impact` does the
retrieval. Your job is the three things it cannot: **name every user-facing area your change
reaches** (including surfaces the diff never mentions), **turn its results into runs that
actually happen**, and **hand back a validation someone else can read.**

## Prerequisites

**The analysis needs no CLI.** Naming the tests that cover a change — the preflight through
screening — runs entirely through the `mabl` MCP server. Don't install anything to answer *"which
tests cover this change."*

**Running one does need the CLI**, and the **Run it** section assumes it. Check this before your
first `mabl` command, not before the workflow:

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.123.4
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest
```

`2.123.4` is the floor because screening uses `mabl tests get-runs`, which landed there. On an
older CLI it fails as an unknown command, which reads like a broken recipe rather than a stale
install. Authentication is separate and expires on its own schedule: `mabl auth login --auto` once, and
`mabl auth info` when runs start failing while the MCP tools still work.

**Deeper detail lives in six reference files.** Read the one that matches what you're doing:

| File | Read it when |
|---|---|
| `references/setup.md` | Two entries, and they behave differently. **The user asked you to set this up or check it** — walk its checklist and report each row. **Something failed mid-workflow** (`analyze_test_impact` absent, a `mabl` command not found, a debug session that can't reach the local app) — jump to the matching row only. Never open it to reassure yourself a working setup works |
| `references/screening.md` | Screening more than a couple of candidates: quality-score bands, side-effect bands, what a bulk query's silence means, which target a run will resolve |
| `references/local-run-dispatch.md` | Local CLI path only. Dispatching a wave: the canary that precedes any fan-out (cloud or local), then the local-CLI specifics — the defaults that mislead, a worked parallel script, reading its exit codes |
| `references/local-debugging.md` | A local failure the console output didn't explain, sign-in that "passes" but leaves you logged out, or pointing at a local server for the first time |
| `references/run-plan-report.md` | Writing the report, re-validating on a follow-up commit, or running this inside CI rather than beside a human |
| `references/customizing.md` | Recording site notes after a first pass — what's worth pinning in project memory so the next pass doesn't re-ask, and the precedence rule those notes follow |

## 1. The default workflow

Unless the request says otherwise, run this loop end to end. Each step has its own section
below; what this section adds is the order, and — more importantly — **where you are and
aren't expected to stop.**

1. **Preflight.** Resolve and state the six values every later step depends on:
   workspace, application, deployment/URL, credentials, run mode, run scope. Before you promise
   a result, not after.
2. **Analyze.** One `analyze_test_impact` call per application, unioned across
   applications, and read what comes back as judgment rather than re-curating it.
3. **Screen.** Hard gates, side-effect band, reliability read with its sample context.
4. **Run.** Canary one test, read what it tells you, then dispatch the read-only and
   contained tests **yourself**. Ask about the shared-state and unverified-cleanup bands.
5. **Diagnose.** Sort every failure by cause before you report it. An unsorted failure
   list reads as "your change broke five things" when four of them were already red.
6. **Report.** Emit the run-plan report. **That report is the deliverable** — a list of
   test names is not.
7. **Offer.** Surface each coverage gap *together with* an offer to author against it.
   Authoring is opt-in; staying silent about the gap is not an option.

**Decide these yourself — but only once the preflight's six scope values are resolved and stated.
Until then you have none of this:**

- Retry one transient 5xx from `analyze_test_impact` (**Read the results as judgment**).
- Resolve a deployment ambiguity from the stated validation target (**Scope the call**).
- Read a candidate's steps and run history to band its side effects (**Screen before you run**).
- Keep polling a slow run inside the escalation policy (**When a run runs long**).
- Canary one read-only test, then dispatch the read-only and contained subset
  (**Canary before you fan out**).

The precondition is the whole safety story. No human approves the run before it starts; the canary
is the backstop for a workspace that resolved somewhere unexpected, and the canary reads its
binding *after* it ran. So an unresolved scope value costs a real run somewhere you didn't intend,
which is why the preflight comes before any of this and why the canary comes from the read-only
band.

**Do not do these on your own,** however reasonable each looks in the moment: dispatch a CI
workflow or GitHub Actions run, author or edit a test, run anything in the shared-state or
unverified-cleanup bands, **start a plan run** (**Run it**), or widen a run past the set you
screened.

## 2. When to reach for it

- **After your unit/integration tests pass, before you call the change done or open a PR.**
  Green unit tests do not mean no user-visible regression.
- When the change touches **user-facing behavior, a page/screen, a workflow, or shared
  UI/components many flows pass through** (shared code has the widest blast radius).
- When you want to know **what already covers an area before writing new tests.**
- **Skip it** for changes with no runtime user surface (docs, build config, pure internal
  refactors with no behavior change). When unsure, still call it — the pass is cheap and
  tells you whether there is anything to find.

## 3. Preflight: settle scope before you promise anything

**State these six in one block before your first analysis call**, resolved rather than assumed:

| | Resolve it with | If you get it wrong |
|---|---|---|
| **Workspace** | The one you pass to `list_mabl_applications` — the analysis inherits it from the application you pick there, so these two are one decision (**Scope the call**) | The analysis answers about a different product, confidently and without an error |
| **Application** | `list_mabl_applications`; ask when more than one is plausible | Same: a well-formed set for the wrong surface |
| **Deployment / URL** | Name the one that matches the stated validation target (**Scope the call**). A deployment *resolves to* a url — they are one slot under two names, not two values | Runs land on a host that doesn't serve your change |
| **Credentials** | **Provisional here, pinned when you scope the call.** State your intended credential now; the authoritative one comes from the candidates' run history, which doesn't exist until the analysis returns | The browser signs in as someone else and writes to their workspace |
| **Run mode** | local CLI · cloud · CI (**Run it**) | You validate deployed code while believing you validated your branch |
| **Run scope** | What the user asked you to run: whole impacted set (default) · plan(s) by id or name · a label set (any-of) · explicit include/exclude ids. Resolve it in **Screen before you run** | You run tests nobody asked about, or skip the ones they did ask for |

Every one of these fails the same way — not with an error, but with a plausible answer about
something you didn't mean. That is why they come first and why you say them out loud: a scope
value you correct three steps later invalidates every step before it.

**Credentials you cannot fully resolve up front, and saying so is the point.** You can't read a
candidate's credential before you have candidates. State your intention, label it provisional, and
pin it for real when you scope the call — what this row exists to prevent is the other failure,
where a guess gets stated as resolved and nobody revisits it. **Run scope has the same shape:**
the user's words are settled here, the ids they resolve to in **Screen before you run**.

**Two mabl surfaces are in play throughout:** the `mabl` CLI and the tools of the `mabl` MCP
server. Tools are named below without a client-specific prefix; your agent may display them
namespaced. Which of *your* environments a run targets is a separate decision, pinned per group in
**Scope the call**.

**If project memory carries notes for this skill, honor them.** A team that has run this
workflow before may keep a short section in its project memory (CLAUDE.md, AGENTS.md, or a doc
it points to) pinning the values this preflight would otherwise re-derive — which application
maps to which repo, which environment and credential a run uses, which label marks a critical
set, local-server quirks. Read it as the first source for the preflight, then confirm anything
load-bearing the usual way. Notes refine scope resolution and add local pitfalls; **they never
demote a safety gate** — the ask-first bands, the canary, and the plan-run prohibition hold
even when a note says otherwise. To record notes for your own project:
**→ `references/customizing.md`**.

**Don't preflight the install.** Start the workflow; a broken setup announces itself within a
step or two, and only then is `references/setup.md` worth opening. Checking first costs every
correctly-configured user a detour, and there is no way to tell a first run from a hundredth.

**Unless the user asked.** *"Set up test impact analysis for me"*, *"check my setup"*, *"is this
working?"* — that's a request to verify, not a request to analyze a change. Go to
**`references/setup.md`**, walk the checklist, and report every row with its status. Don't start
the workflow to find out.

**Access is gated twice — on test impact analysis being enabled for the account, and on GenAI
features being enabled for the workspace.** Only mabl can grant the first; the second is a
workspace setting. The two gates check different things, and only one involves your default
workspace:

- **Seeing the tool** — `tools/list` is filtered server-side on whether test impact
  analysis is enabled for the account behind your *default* workspace. When it isn't, the tool is
  never advertised and there is nothing to call, so **the symptom is a missing tool, not a
  refusal** — don't go hunting for a workspace switch. The same filter drops every flag-gated
  tool if the flag lookup itself fails, which includes having no default workspace set or one you
  can't reach: an unusable default reads as *not entitled*, not as an error.
- **Running the call** — the handler checks **both** gates against the workspace that owns the
  `applicationId` you passed, which need not be your default one. Missing either returns a plain
  message rather than a raw `403`: *"Test impact analysis is not enabled for workspace `<id>`,
  which owns application `<id>` — retrying with another application in the same workspace will
  fail the same way."* Take that last clause literally — a different application in the same
  workspace is not a workaround.

The two checks are independent, so they can disagree: you can see the tool and still be told it
isn't enabled. Two causes, in the order worth checking. **Stale access first** — your tool
list is fixed at connect time and the flags sit behind a 60-second cache (below), so a flag flipped
mid-session leaves the tool advertised from the old list while the handler reads the new state. Wait
a minute and reconnect before concluding anything. **Then a genuine account mismatch** — your
default workspace and the target application in different accounts, which a CI key or a second org
can produce. Reaching for that explanation first, during a rollout or a revocation, sends you
hunting an org boundary that isn't the problem.

Either way, don't stop: `search_mabl_tests` with a few phrasings of the change is the fallback for
finding candidates, and everything downstream here — screening, running, diagnosing — works the
same on a set found that way. It just arrives unranked and without the per-test reasoning, so you
do that reading yourself. The rest of this skill assumes `analyze_test_impact` is available.

**Report the fallback as a fallback.** A searched set has no `role`, no per-test `context`, no
`coverage_gaps`, and no `more_may_exist` — four fields **Run it** and **Report the validation**
otherwise ask you for. Leave them out rather than filling them in from your own reading: omit the
`Analysis` line and record `Gaps: not analyzed (impact analysis unavailable)`. An invented gap
list is worse than an absent one, because a reader can act on it. It also has no `run_context`,
so screening (**Screen before you run**) reverts to explicit lookups — `list_mabl_tests` for
enabled state, `get_test_quality_report` for reliability, `get_mabl_test` for the recorded
target — which is more calls and a slower pass, not a weaker standard.

**Once a flag is switched on, reconnect your MCP client — and wait ~60s before you do.** The
server declares `listChanged: false`, so it never tells an already-connected client that the tool
list changed, and flags sit behind a 60-second cache. Reconnect inside that window and you re-read
the stale list and stay tool-less for the rest of the session. Wait a minute, then reconnect.

**The workspace comes from the application, not from you** — `analyze_test_impact` takes no
workspace parameter and derives one from the `applicationId`. That makes the application choice
carry more weight than it looks. See **Scope the call**.

**It is slow by design.** Expect single-digit minutes; there is a hard server-side cap around
five minutes and a heartbeat built specifically because a call this long would otherwise sit
silent. Slow is normal, not a hang.

## 4. Scope the call and name every area the change reaches

First resolve the target application with `list_mabl_applications` — `analyze_test_impact`
requires an `applicationId` and scopes the analysis to one application. A change spanning
multiple applications is one call per `applicationId`; **union the run plans** across them.

Match the application to the code you changed by name, and **if more than one is plausible, ask
rather than guess.** A wrong-but-valid `applicationId` doesn't error — it returns a confident,
well-formed set of tests for the wrong product surface, which reads exactly like a correct
answer. This is the cheapest mistake to prevent and among the most expensive to notice — and it
costs you the workspace along with the application.

**The application decides the workspace.** The server reads the application and runs the analysis
in the workspace that owns it. Nothing else feeds that decision — not the `workspaceId` you passed
to `list_mabl_applications`, not your default-workspace preference, not the workspace your API key
was created for. Look the application up in the workspace you mean and the analysis follows it there.

**You still need that workspace id in hand**, because the dispatch in **Run it** and the fallback
search in **Honest limits** both take one explicitly. Two ways to have it, and they should agree:
it's the id you passed to `list_mabl_applications` to find the application, and it's readable
straight off the response — every `view_test_url` is
`/workspaces/<workspace-id>/train/tests/<test-id>/current`.
Read one and you have the workspace the analysis actually resolved, confirmed rather than assumed.
If it isn't the workspace you passed, you analyzed an application from somewhere else — stop and
fix the application, not the workspace.

So the workspace isn't a separate thing to get right. **The only workspace mistake left is picking
the wrong application** — the silent failure above. Two consequences:

- **Authentication decides access, not scope.** Reading the application *is* the permission check,
  and an id you can't reach — wrong workspace, wrong key, or simply gone — returns one deliberately
  vague message: *"No application matches `<id>`, or it is not accessible to you."* That one
  message covers both "doesn't exist" and "not yours", so read it as *go find a valid id*, not as
  *this application was deleted*. An application genuinely detached from any workspace gets its own
  message and is a data problem, not a scoping one.
- **No workspace switch steers this tool.** Not the web app's switcher, not the CLI's
  `config set-workspace`, not a different key. Your default workspace decides whether the tool is
  *visible* (**Preflight**) — never which workspace it analyzes.

**Not every workspace has a knowledge graph, and that changes what comes back.** Graph-backed
analysis is enabled per workspace; assume search-only unless `role` appears in the results.
Without a graph the call still succeeds, but falls back to search alone — no modeled relationships, so `role` is
absent throughout and the set arrives thinner and without that ordering signal. Nothing in the
response says this happened.

**Graph coverage is a property of the application's workspace, so it isn't a knob you can turn.**
No default, key, or web-app switch moves an analysis into a graph-backed workspace — only analyzing
an application that lives in one does. If yours does, you get the graph; if it doesn't, expect
search-only results and read them as such, rather than rewriting the description to chase depth
that was never on offer. When results look shallow, check which application you passed and where it
lives before you assume the description was at fault.

### The run target lives in run history, not in test metadata

A candidate's *runnable* target is the `(environment, credential, deployment)` triple its
recent **passing** plan runs used. What the analysis hands you is the neighbouring thing, not
that: `run_context.defaults` carries the `environment_id`, `credentials_id`, and `url_set`
recorded on the test at authoring time — what a bare run would resolve, which is not what the
test's plans necessarily use at run time. The two routinely disagree, and when they do it is run
history that decides. So read `defaults` first, because it is free and it groups the set (below),
then confirm the triple you actually dispatch against `list_mabl_test_runs`.

Getting it wrong is expensive and doesn't look like an error. On one real wave, a set
dispatched against a plausible-but-wrong environment/credential pair produced
**ten-plus failures that were pure environment artifacts** — a navigation test reading the wrong
workspace out of a dropdown, a shadow-DOM test marooned on the login page — every one of which
reads exactly like the change breaking something.

**Pin the triple per group, not globally.** `defaults.credentials_id` gives you the first cut for
free: candidates recording different credentials are different targets, visible before you fetch
anything. Establish the triple from run history, then group candidates that share one — and give
any candidate whose history shows a *different* credential its own group. An absent
`credentials_id` means the test records none of its own, which is not the same as running without
one: its plans can supply theirs, so run history still decides. One triple pinned across a
heterogeneous set is how you manufacture the wave described
above: the credential decides which workspace receives writes and whose account state the
assertions read, so a test trained under a different credential is a different target, not the
same target with noise. `--run-id` is the cheap way to inherit all three at once, with the
caveats in **→ `references/screening.md`**. A candidate with no run history has no triple to
read; the no-history rule in **Screen before you run** says where its target comes from instead.

**When a deployment is ambiguous, don't hand back a bare list.** An environment routinely binds
several deployments — a hosted one and a locally-registered one, or an app URL and an api URL.
Name which is which, say which one matches the stated validation target, and pick it. Validating
a deployed dev build means the *hosted* dev deployment even when a local deployment is also on
offer. Ask only when the stated target genuinely doesn't disambiguate — and expect resolution to
succeed silently as often as it stops you, so a silent resolution is not a signal that you
skipped a step.

Then describe the change. This is the half only you can do: name **every user-facing area
your change reaches — including surfaces the diff never mentions.** The dominant failure is
an incomplete description — shared code reaches the user where the change is framed *and*
where it isn't; omit a surface and its tests never surface. A pre-PR safety pass is a
broad-coverage intent — say so in `guidance`.

Worked example — say you reworked a shared field-validation module (the code that formats
and checks postal codes, card numbers, and expiry dates as the user types), switching it
from validating on blur to validating on each keystroke. Name every place a *user* meets
that validation: entering a shipping address during checkout; entering card details and
seeing card/expiry errors at checkout; **and editing a saved address or payment method in
account settings.** That third area is the one that pays off — the change is framed around
checkout, but the *same* validator runs in account settings, a surface the diff never names.
Reasoning about every place the changed code reaches the user, not just the one the change is
framed around, is the work the tool cannot do for you.

Describe behavior in **product vocabulary**, not implementation detail. "Validation now fires
on each keystroke instead of on blur, so error text appears while the user is still typing"
retrieves better than a file list or a diff summary. The corpus being searched is test content —
step descriptions, assertions, page names — so a class name or file path has no counterpart in
it. *"Refactored `ProductList.tsx` to memoize the `useProduct` hook"* retrieves nothing at all.
Internal jargon *in addition* is fine; alone it does not.

## 5. Read the results as judgment — don't re-curate

### First, the two ways the call itself misleads you

**Retry a 5xx once, and only once.** A server error can arrive late, well into a long call, so
a 500 after a minute is not evidence your call was malformed. Retry it once without asking.
Never answer a 500 by fanning out duplicate calls — you pay the full cost twice and can still
get two different sets back.

**Repeat calls genuinely differ.** Retrieval blends keyword and semantic search, so the *same*
`changeDescription` can return materially different sets — 6 tests versus 0 on one measured
ticket, 13 versus 3 on another. Two consequences: don't re-run a call to "confirm" a set, and
when a follow-up call comes back thinner, read it as variance rather than as proof the first
set was wrong.

The returned set is already retrieved, verified, and prioritized server-side. Don't drop
tests to look tidy; read the fields and act:

- **`summary`** — read this first. It states what was searched and how the set was
  prioritized, and it is where caveats about the analysis itself appear.
- **`role`** is for ordering, not culling: `validates` tests assert the changed behavior
  directly, `uses` tests exercise it incidentally en route to something else. It tells you
  which to run first (**Run it**), never which to discard. It is **optional** — absent when the
  test was found by text/semantic search rather than a modeled relationship, which is not a
  mark against the test.
- **`context`** — the per-test reason it surfaced, including provenance and caveats. This is
  what makes your run plan reviewable by someone else; carry it through rather than
  re-describing the test yourself.
- **`coverage_gaps`** — surface these as candidate targets for new tests, each with an offer to
  author it (**Report the validation**). Absence from this list is not proof of coverage — see
  **Honest limits**. **An empty `coverage_gaps` on a brand-new surface is the expected reading,
  not a clean bill:** the tool cannot index a surface no test could have touched yet, so for
  anything you just added — a new setting, a new control, a new screen — expect the list to be
  empty and reason about the gap yourself.
- **`more_may_exist`** true means the set hit the result ceiling (~50), not that nothing else
  is relevant. Don't present it as exhaustive; `more_may_exist_note` carries the hint for
  narrowing a follow-up call. A refined `changeDescription` or `guidance` surfaces more when
  the set looks thin.
- **`run_context`** — the screening facts for that test: state, reliability history, and the run
  configuration recorded on it. This is most of **Screen before you run** arriving with the
  analysis instead of after it. Read it there.

Each result also carries **`test_invariant_id`** and **`view_test_url`**. Include the url when
you surface a test (or a coverage gap) so the reader can open it; carry the id through, because
it's what every screening and run mechanism downstream takes as its key. A very large set is
itself a signal your change is broad — group and order it (**Run it**) rather than trimming
keep-worthy tests.

Treat the call as **conversational**: a follow-up call with narrower `guidance` or a refined
`changeDescription` is the intended way to sharpen a set that came back too broad or too
thin, not a sign the first call failed.

## 6. Screen before you run

The results are candidates, not runnable tests. Screen the set before you present it as a plan.
Before running, ask: what about *this* workspace and *this* workflow would make a run
**uninformative** (gate it), **mis-targeted** (confirm it), or **messy** (disclose it)? That
question is the actual check; treat what follows as examples of each kind, not an exhaustive
list.

### Apply the run scope before you screen

The impacted set is what your change reaches. The **run scope** (**Preflight**) is what the user
asked you to run. Resolve the scope into ids, intersect it with the impacted set, and screen what
survives. The default — `all impacted` — resolves to everything and changes nothing, so a request
that names no scope behaves exactly as it did before.

| Scope | Resolve it with |
|---|---|
| **All impacted** (default) | Nothing to resolve; the impacted set is the scope |
| **Plan(s), by id or name** | A name resolves first: page `list_mabl_plans` for the workspace and match the exact name; zero or more than one match is a question for the user, not a guess. Then `get_mabl_plan` per id; the union of `execution_stages[].tests[].journey_id` is the scope set, with any trailing `:N` version suffix stripped so the ids compare with `test_invariant_id`. Pass `includePlans: true` on the analysis too (below), so the run plan can show membership |
| **Label set** | `list_mabl_tests` with `labels`, `applicationId`, and `limit: 200`. **A label or application filter never returns `nextCursor`:** the api applies those filters in memory after scanning the workspace, so a page that filled the limit comes back `truncated: true` with no cursor to continue it. Treat a truncated page as an incomplete scope, not a finished one — split the query by `testType` or `branch`, or page the unfiltered catalog with `cursor` and apply the labels yourself (`references/screening.md`). When the change under review names a mabl branch, call it once with that `branch` too and union the results: a test authored on the branch for this change is otherwise absent from the scope and wrongly reported out of it. The same applies to a critical set |
| **Explicit ids** | Includes narrow: the scope set is the impacted set ∩ the ids named. Excludes subtract, and they subtract **last**: remove the named ids from the final run set — whatever the scope above produced, the default included, plus any critical set added below — and report each excluded test as `not run · out of scope (excluded)` |

**`labels` is any-of, not all-of.** Two labels return the union, not the intersection, so a
scope of `smoke` plus `checkout` is wider than a reader expects. Say which semantics
you applied in the report.

**Scope narrows; it never widens.** A test inside the scope that the analysis did not return does
not join the wave — that is the "widen a run past the set you screened" that
**The default workflow** prohibits, arriving through a door labelled *the user asked for a plan*.
Name what the scope held beyond the impacted set, and leave it out of the wave.

**Every impacted test outside the scope still gets a row:** `not run · out of scope (plan
<name> / label <label>)`, in the run plan and again in the report. A candidate that vanishes
because of a scope the reader didn't set is indistinguishable from one you missed, and the point
of narrowing is that someone can see what was narrowed away.

**A critical set is a label convention, not a field.** mabl has no criticality on tests or plans,
so "always run the critical ones" means a label the user names — a `smoke` or `critical` label is
the usual shape, and an org's own convention belongs in its site notes
(`references/customizing.md`), not in a guess. Resolve it as a label scope, add its tests to
the run plan **whether or not they are impacted**, and tag those rows `[critical]`. This is the
one addition to the run set, and it is one the user asked for by name; it buys those tests a
place in the wave, not a pass on the screen below — band them like everything else. Two things
it does not buy: an exemption from an explicit exclude ("the critical set except test X" keeps X
out even when X carries the label, with its `excluded` row), and an exemption from the CI
contract — a critical test left pending approval fails the job exactly as an impacted one does
(`references/run-plan-report.md`, "Running in CI").

### Most of the screen already arrived with the results

Each result carries **`run_context`** — the facts you would otherwise have gone and fetched —
whenever enrichment could run for that test at all:

| Field | What it settles |
|---|---|
| `enabled` | Kind A's disabled gate, read live |
| `test_type` | `browser`, `api`, `performance`, `mobile` and the like — whether the run mechanisms in **Run it** apply at all |
| `mobile_platform` | The platform recorded on a `mobile` test. Read it with `test_type`: which runner and which device the test needs, neither half deciding on its own |
| `step_count` | Whether there is anything to execute. `0` means the test matched on its name or description and has no steps of its own; absent for a performance test by design |
| `ai_assertions` | Whether any scanned step carries a GenAI assertion or condition — the billable-flag decision in **Run it** |
| `run_history` | A sample of the newest 10 runs — `latest_status`, `latest_run_time`, `last_passed_time`, `runs_examined`. Workspace-wide, with no time, environment, plan, or branch filter, so it is not the runs your intended target would produce |
| `run_history_note` | Why `run_history` is absent when the sample held runs but none could be reported: `no_started_runs_examined`, `skipped_runs_examined`, `terminated_before_start_runs_examined`, `unreportable_runs_examined` |
| `quality` | `score`, `total_plan_runs`, `runs_capped`, and the flake fields, over the response's `quality_window` |
| `quality_note` | Why `quality` is missing for a real reason rather than a failed lookup |
| `defaults` | `url_set`, `environment_id`, `credentials_id`, `credential_cloud_only`, `datatable_ids` — the run configuration recorded on the test at authoring time |
| `plans` | Plan membership, and only when you asked for it (below) |
| `incomplete_reasons` | Which of the above did not resolve for this test, by name |

Two result-level fields go with them: **`quality_window`** is the window every `quality` in the
response was computed over — the sample context this section requires you to quote alongside a
score — and **`run_context_incomplete`** is true when enrichment failed or ran out of time
anywhere in the set.

**`run_history` is absent three different ways, and only one of them is a failure.** With
`run_history_note`, the sample held runs none of which could be reported, and the note says
which way. With neither the note nor a token, no recent runs came back — read that as a test
that has not run recently, which is the case the no-history rule below is about. With
`run_history_source_unavailable` in `incomplete_reasons`, the lookup failed and the answer is
unknown.

**So screening starts by reading, not by fetching.** Reach for `get_test_quality_report`,
`list_mabl_tests`, `get_mabl_test`, or the credential and environment lists for a field that is
*absent*, or for something `run_context` doesn't carry at all — the latest pass, a failure
category, a test's steps. Not to re-confirm what it already answered.

**`plans` is opt-in, and it costs a lookup per returned test.** Pass `includePlans: true` only
when plan membership is part of the question — recommending an existing plan over N ad-hoc runs
(**Run it**), or judging whether a candidate has automated coverage already. A routine pre-PR pass
doesn't need it, and asking for it by reflex makes every call slower for nothing. When you do
ask, each entry carries `plan_id`, `name`, `enabled`, `browser_types`, `retry_on_failure`, and
`has_triggers`; the list is capped at 5 per test, with `plans_truncated` in `incomplete_reasons`
when a test belongs to more.

### An absent field is never "fine"

**This is the rule the rest of it rests on.** `run_context` omits a field rather than sending
`null` or `false`, so an absence is silence — and silence looks identical whether the answer
would have been good news or bad. A missing `enabled` does not mean enabled. A missing `quality`
does not mean a clean history. A missing `credentials_id` does not mean the test runs without
credentials, and a missing `environment_id` does not mean no environment.

Absences come in three flavours. Only the last is nothing to worry about, and none of them is
"fine":

- **Not resolved.** The lookup behind the field failed, was capped, or ran out of time — the case
  for `enabled`, `test_type`, `quality`, `ai_assertions`, `step_count` on a test that isn't a
  performance test, and for everything at once when `defaults` or `run_context` is missing
  wholesale. Read these as **unknown**: screen them another way, or say you couldn't.
- **Not recorded.** `environment_id`, `credentials_id`, and `datatable_ids` come straight off the
  test, so when `defaults` is present their absence is a fact: the test's authoring-time
  configuration names none. That is still not a statement about the run — a plan carries its own
  environment and credentials, and a cloud run given none proceeds on a warning — so it changes
  what you go and read (the run history in **Scope the call**), not whether you have to.
- **Not applicable, or not asked for.** `step_count` on a `performance` test and `plans` on a
  call that didn't set `includePlans` are absent by design — `test_type` is what distinguishes
  the first from a failed step scan. Nothing failed and there is nothing to chase, but they are
  also not answers, so don't report them as ones.

Three things help you tell which flavour you're looking at:

1. **`incomplete_reasons`** names what went wrong for *this* test — `test_fetch_failed`,
   `steps_not_scanned`, `quality_source_unavailable`, `credentials_source_unavailable`,
   `plans_fetch_failed`, `plans_truncated`, `enrichment_timeout`. A field one of those accounts
   for is unresolved, full stop. **The converse doesn't hold:** not every unresolved field gets a
   token — a credential the caller simply can't see leaves `credential_cloud_only` absent and
   silent — so no token is not a clearance either. (That flag is also absent and moot when
   `defaults.credentials_id` is itself absent: no recorded credential, nothing to classify.)
2. **`quality_note`** is the one absence with a stated benign explanation:
   `no_plan_runs_in_window` means the lookup ran and found no plan runs inside `quality_window`.
   That's the no-baseline case below, not a failure — and not, by itself, a new test.
3. **`run_context` missing entirely** means enrichment couldn't run for that test at all —
   nothing about it has been screened.

Carry every unresolved field into the run plan and the report as *unknown*. Screening a set where
some of the data didn't resolve is a legitimate outcome; presenting it as screened is not.

**Kind A — hard gates. Check always; skip and alert.** Conditions where a run gives you no
signal about your change, in any workflow. Each of these reads off `run_context`:

- **Disabled?** `enabled: false` — skip it, but alert on it: a disabled test sitting in the
  impact set is itself a coverage signal worth surfacing. Absent is unknown, and `get_mabl_test`
  settles one test's `enabled` when you need it settled.
- **Nothing to execute?** `step_count: 0` — the test matched on its name or description and has no
  steps of its own, so there is nothing there to break (**Honest limits**). Don't run it and don't
  let it headline the plan — but it still gets a row, *not run · no executable steps*, because a
  stub the retrieval ranked highly is itself a coverage signal, and a candidate that vanishes from
  the report is indistinguishable from one you forgot. When `step_count` is *absent*, `test_type`
  is what tells you which absence you have: `performance` means absent by design, because those
  tests run configured workloads rather than authored steps. Any other `test_type` means the steps
  couldn't be scanned — unknown, not zero.
- **Runnable by the mechanisms in the run step?** `test_type` tells you. Mobile tests can't be
  dispatched through the ad-hoc run tools at all, and api and performance tests run through their
  own runners rather than the browser path documented in **Run it**. Report those as impacted and
  outside what this workflow can dispatch — the honest row, and the one that keeps them from being
  dropped quietly or queued into a wave that will never take them.
- **Already failing, or just unreliable?** Don't binarize this to pass/fail on the last run —
  cite mabl's own `quality.score`, gated by `quality.total_plan_runs` as a second axis, rather
  than inventing a pass-rate band. **Never quote a bare rate.** "0% pass rate" is not a finding
  until it carries its context: score, sample count, the window it was measured over, the latest
  run, the latest *pass*, and the dominant failure category. A 0% over three runs last quarter
  and a 0% over ninety runs this week justify opposite decisions, and the bare number hides which
  one you have. The first three ride along with the result — the window is the response's
  `quality_window` — and the last three still come from `list_mabl_test_runs`.
- **No usable baseline is not a gate.** `quality_note: no_plan_runs_in_window` is the one missing
  `quality` with a stated cause — but take it literally: it says the test had no plan runs inside
  `quality_window`, **not** that it has never run. An established test that sat idle through the
  window looks exactly the same here, so check `list_mabl_test_runs` before you call a test new.
  Either way it should still run — flag the missing baseline for two reasons, not one: a failure
  needs interpreting rather than assumed to be yours, and a genuinely new test's run is itself
  less reliable. Find-wait tuning is learned from run history, so mabl pads extra wait time into a
  genuinely zero-history test and says so in the run log:
  *"N.Ns of extra wait time was used across all steps to increase reliability. This wait time
  is likely to improve with additional successful cloud runs."*

The same rule governs every list you still consult: **each is bounded — by a row cap, a page
size, or a minimum-runs filter — so something's absence from a response never means "fine," only
"not answered."** Diff your impacted `test_invariant_id` values against whatever came back and
carry anything missing as *unknown* rather than screened. On one real 25-test set, 10 never
appeared in the quality report at all — that particular hole is the one `run_context` fills,
because it answers per test and names what didn't resolve. The rule still governs everything
else: the same default caps hide credentials and environments you are about to run with, so a
config id that looks absent may just be past the first page. **→ `references/screening.md`** for
the score bands, the per-tool footguns, and what the CLI can and cannot screen.

**A candidate with no score in the window predicts failure — set the expectation, don't act on
it.** On one measured wave every candidate *with* a healthy score passed, while **10 of the 11
with no score at all failed** with `test_implementation`: stale fixtures, broken for reasons that
predated the change. `quality_note: no_plan_runs_in_window` is what that group looks like in the
results — the same window-local silence, which is a reason to expect trouble, not proof the test
is new. Still run them — those failures form a valid before/after baseline, and a
few may be genuine victims the change repairs. What changes is what you tell the reader: budget
diagnosis time for that group, and don't let a wall of red from unscored tests read as your
change breaking things.

**No run history is a reason to read the test, not to skip it.** A test nobody has run is the one
you cannot judge from history, so it costs you a `get_mabl_test_steps` read instead — band it on
its steps (Kind C), run it flagged `no run history` — or `no quality baseline in window` when
`run_history` shows it did run before the window — and never let the triage shortcut
("side effects not verified") sweep it into the bottom band. That shortcut is the actual skip
path for new tests: it turns the test a dev wrote *for this change* into a row nobody approved.
`references/screening.md` puts these candidates ahead of the `role: validates` tail in the read
budget for exactly that reason.

**Its run target has to come from somewhere other than history too.** The `(environment,
credential, deployment)` triple is pinned from a candidate's recent passing plan runs
(**Scope the call**), and a never-run test has none to read. For these candidates the target is
the one the preflight stated for the change, checked against the test's `defaults`: a `defaults`
triple that matches a group already pinned from history puts the test in that group; a recorded
`environment_id` or `credentials_id` that names something *other* than the stated target is a
question for the user, not a tie-break; and `defaults` that record nothing leave the stated target
standing. A test authored on the branch for the change under review has the clearest target of all
— the deployment that serves the change — so name it. Either way the row says the target came from
intent and `defaults`, not from history, because a reader comparing it with its neighbours should
know it was pinned differently.

**A test created on a branch runs at its branch version.** When the candidate was authored on a
branch — `list_mabl_tests` takes a `branch` filter, and the PR you're validating usually names it
— pass that `branch` to `run_mabl_test_cloud`, which runs the branch version instead of master,
and name the branch in the row. The local runner has the same flag: `mabl tests run --mabl-branch`
for the canary and the wave, and `tests export --mabl-branch` for the step read that bands it, so
a branch candidate carries its branch through `references/local-run-dispatch.md` as well as
through the cloud call. Without it you run the master version: for a test authored on the branch
that is a version predating the change, which is the reverse of what you meant to validate.

**One extra gate applies only to local runs: does step 1 navigate?** A test that opens straight
into a login flow, with no leading *Visit URL*, starts on a blank page under the CLI and fails its
first step in ~30 seconds no matter which target you point it at. `tests export --format json`
carries the steps — nested under `flows[].steps`, not at the top level, so don't read a missing
top-level `steps` key as a missing export — which makes this cheap to check on the candidates you
plan to run locally. It is a defect in the test rather than a property of your change, and **a
passing cloud run does not rule it out** — the cloud runner navigates first and the local runner
does not.

`defaults.url_set: false` is a *different* local failure that arrives free with the results: the
test records no default URL, so a local `tests run` with no `--url` fails immediately rather than
guessing. Every dispatch in **Run it** pins the url explicitly, which is what makes that
survivable — but it's worth knowing which candidates depend on that pin. A `url_set: false` test
has nowhere to navigate; the missing-*Visit URL* test above has somewhere and never goes there.

**Kind B — run-target confirmation. Always surface; never auto-skip.** The question is
**does the target match what you intend to validate** — not "is it prod." Warn only on a
mismatch with stated intent; an engineer validating a prod workflow by targeting prod is doing
the right thing, not tripping a gate.

`tests run` prints the target it resolved (`URL:`, `Environment:`, `Credentials:`) near the top of
its output. **Read those against your intent before you trust the result** — that's the practical
instruction; you don't have to reason about flag precedence yourself. **→ `references/screening.md`**
for how each flag resolves, and for the two header lines that mislead by their absence.

**A correct URL is not a correct build.** Those lines tell you where the run pointed, never what
was being served there. A dev server left running from earlier work answers on the expected port
and satisfies every target check while serving a tree that does not contain your change — and then
the impacted tests *pass*, for the wrong reason, which is worse than failing because nothing looks
wrong. So before trusting a local run, confirm the served build is the one you mean: fetch the page
and grep the bundle for the new element or string, or check which branch and commit the server was
started from. Handed a running local server and told to use it, the first thing a cold session did
was question whether that server contained the change under test. It was right to.

**Kind C — side-effect band. This is the screen that decides what you dispatch yourself.**
"Mutating" is a classification, not a verdict. A test that creates a uniquely-named fixture,
deletes only what it created, and asserts the thing is gone is a *better* regression signal than
a read-only proxy for the same behavior — so banding matters more than a blanket warning. Band
every candidate:

| Band | What it looks like | What you do with it |
|---|---|---|
| **Read-only** | No create, edit, or delete steps at all | Dispatch it yourself (**Run it**); the only band safe to run in parallel |
| **Contained / self-cleaning** | A final step group or flow marked as a teardown, deleting by an identifier the test captured when it created the record | Dispatch it yourself (**Run it**), serially |
| **Shared-state mutation** | Writes or edits records other tests and people depend on | Ask first; run serially |
| **Destructive, or cleanup you couldn't verify** | Bulk delete, cascade, permission change — *or any teardown you were unable to confirm* | Ask, and rank it last |

Four bands, one line between them: **the top two you dispatch, the bottom two you ask about.**

**One override, and it moves the line up: when the change under test is itself destructive** — a
cascade, a permission model, a bulk delete, anything in a data lifecycle — **contained tests stop
auto-dispatching and join the ask.** The band is earned by reading the test, and it answers "does
this test behave when the product works." Auto-dispatch needs the other question: does it behave
when the product is *broken*, which is the hypothesis you are testing. A contained test that
creates a workspace and deletes it by captured id is impeccable right up until your cascade bug
takes three sibling workspaces with it — and the band saw nothing wrong, because nothing about
the test was wrong.

**Unverified is not contained.** A candidate reaches the contained band on evidence, not on
intent: if you did not read the teardown, it belongs in the bottom band. Screening can legitimately end
with side effects unconfirmed — that is a normal outcome, and the harmless way to be wrong is to
treat it as destructive.

**The cleanup contract.** mabl has a real mechanism for this: a step group or flow marked **Run
as teardown**, which runs *even when the test fails* and which can only be the test's final
step. That mechanism is what "self-cleaning" means here, and the contract is three points:

1. **The final step group or flow is actually marked as a teardown.** Trailing delete steps that
   aren't marked are not a teardown — they simply don't execute when the body fails, which is
   exactly the run that leaves the orphan behind.
2. **It targets what the test created, through a variable captured at creation time.** The
   documented pattern is to extract the new record's id into a variable as the test creates it,
   then delete by that variable. A literal fixture name is shared state wearing a create step's
   clothes; "the first row" is worse.
3. **It contains cleanup steps, not assertions.** A failure *inside* a teardown fails the test,
   so mabl's guidance is to keep assertions out of it. When proving the record is gone matters —
   and for a test whose subject *is* deletion it does — that assertion belongs in the body,
   ahead of the teardown.

Point 3 is the one that misleads. One authored test "cleaned up" with *Delete* → *Confirm* → a
route assertion, which proves the app navigated somewhere rather than that anything was removed;
reading the export caught it, and the fix was a real absence check **in the test body**. Don't
read that as license to assert inside a teardown.

**And note what the band does not require: proof that the teardown deleted anything.** A test
earns the contained band on the marking, the captured identifier, and the scoped delete — three
things you can read off the steps. Demanding a deletion *assertion* on top of that would be
asking for a check that, by the rule above, cannot live where it would have to run: any body
assertion executes before the teardown does. Require the assertion only when deletion is the
behavior under test.

**If you can't confirm the teardown marking, the test is unverified** — bottom band, by the rule
above. And because the credential, not `--workspace-id`, decides where the browser actually lands
(Kind B), a failed contract can mean "leaves an orphan you personally cannot inspect or delete."

Cleanup that has to span several tests is a different mechanism — a plan stage with **Always run
stage** enabled — worth recognizing when a set's cleanup lives outside the tests themselves.

**Running locally does not make this go away** — the most common misreading of Kind C. A local
front end still talks to a real backend, which is often a shared environment rather than an
isolated sandbox, so the writes are just as real. Weigh this hardest
when the change itself is destructive — a bulk delete, a cascade, a permission change — since
those are precisely the tests whose side effects are least recoverable. Related: when you fan out
in parallel, several data-mutating tests hit that one shared backend at once, so if parallel
failures don't reproduce serially, suspect contention before you suspect your change.

Across B and C, don't trust the test's own metadata: a `description` can claim self-cleaning
behavior its steps don't perform, and a test's own environment default can disagree with what
its actual runs use. Ground truth is the steps and the run history, never the description —
and reading steps is the long pole of screening, so triage rather than read all of them
(**→ `references/screening.md`**).

## 7. Run it

Present the set as a **run plan** first — ordered and annotated so the run reads as a decision
rather than a guess:

- **Order:** `validates`/directly-exercising tests first; `uses`/rippled tests next. Never
  mark the tail "skippable" — order it, do not discard it.
- **Cost & shape:** state the count. There is **no batch dispatch** for an ad-hoc set — N tests is
  N calls, which is exactly what makes the canary below worth its extra minute. When an existing
  plan already covers most of the set (roughly >~15 tests), *recommend* it — but **a plan run is
  always an ask, never something you start yourself.** A plan contains whatever its author put in
  it: tests you never screened, never banded, and may never have seen. "Prefer one plan run" is a
  cost argument you make to a person; dispatching one is precisely the "widen a run past the set
  you screened" that **The default workflow** prohibits. The same goes for `run_mabl_plan`,
  `rerun_mabl_plan`, and re-running a failed test with `rerun_mabl_test` to test for flake —
  reasonable next moves, none of them yours to start. **This is the case `includePlans` exists
  for** (**Screen before you run**): re-running the analysis with it set names the plans that
  already cover your candidates, with the `enabled`, `browser_types`, `retry_on_failure`, and
  `has_triggers` a reader needs to judge the recommendation. Ask for it when you're about to make
  that argument, not by default. **A plan run scope is not permission either:** *"only run the
  tests in plan X"* narrows what you dispatch one call at a time to that plan's members — it does
  not authorize starting the plan, which would run the members your analysis never returned.
- **Environment honesty:** mabl tests run against a **deployed** app. A cloud run exercises
  deployed code, not your uncommitted working tree — validating local changes needs a local
  run path or a preview deploy. Say which applies; **don't imply a cloud run tests your
  branch.**
- **Data-driven tests cover less ad hoc than the DataTable suggests.** A non-empty
  `run_context.defaults.datatable_ids` means the test is parameterized by a DataTable, so a single
  ad-hoc run exercises one scenario out of a set. That is all `defaults` proves — it is the
  authoring-time configuration, not what any plan does at run time (**Scope the call**) — so say
  the ad-hoc run is narrow, without claiming what its plans sweep unless you asked for
  `includePlans` and read them.

Shape it like this:

> **Scope** — plan *Nightly regression* · N of M impacted tests in scope
>
> **Running now** — read-only · contained — N tests
> - `[validates]` **test name** — one-line context · [view test](view_test_url)
> - `[uses]` **test name** — one-line context · [view test](view_test_url)
> - `[critical]` **test name** — always-run label `smoke` · [view test](view_test_url)
>
> **Needs your approval** — shared-state · unverified cleanup — N tests
> - **test name** — what it writes and where · [view test](view_test_url)
>
> **Not running** — N tests
> - **test name** — disabled · quality 3 across 92 runs
> - **test name** — out of scope (plan *Nightly regression*)
>
> *(Absent from the quality report is not a reason to skip — those tests run, flagged.)*
>
> Approve the **Needs your approval** group and I'll add it to this wave.

These are the same three buckets the report uses (**Report the validation**), with one collapse:
anything left unapproved when you write the report joins **Not run** there, carrying
`pending approval` as its reason. Keep the words identical at both ends so a reader tracking one
test across the two artifacts doesn't have to translate — which goes for the scope line, the
`[critical]` tag, and `out of scope` as much as for the buckets.

**Dispatch the first group yourself.** Read-only and contained tests (**Screen before you run**,
Kind C) don't need a confirmation round-trip: screening *is* the gate, and holding a screened,
side-effect-free run behind an approval prompt is the friction this workflow exists to remove.

**But if the ask was for a plan, stop at the plan.** Someone who asked *which* tests to run wants
the list; dispatching is the default for "validate this change," not an override of a narrower
request. **The default workflow** opens with *unless the request says otherwise* for this reason —
and "just tell me what to run" is a request saying otherwise.

**Ask about the second group, and don't start it until someone answers.** Shared-state and
unverified-cleanup runs write data in real workspaces other people see, and no amount of
screening makes that your call. Surface the exact calls for both groups — `test_invariant_id` is
what an id-based run mechanism takes, and **display names are not unique**, so a name-keyed
reference can silently collapse two distinct tests into one.

### Canary before you fan out

**Dispatch exactly one test, read what comes back, and only then run the rest.** Pick a cheap
candidate you expect to pass, **and pick it from the read-only band whenever that band isn't
empty** — the canary exists to catch a wrong target, and a wrong target plus a contained
canary is exactly the write you were trying not to make. Three failure modes surface in that
one run, and each otherwise costs you the whole wave:

- **A wrong target.** The mis-resolved `(environment, credential, deployment)` triple from
  **Scope the call** shows up on run one instead of run eighteen.
- **A missing credential.** `run_mabl_test_cloud` warns that a test was trained with a
  credential none was supplied for — but only in the response, one run *after* it mattered. The
  canary is what makes that warning cost a single run.
- **A build that never deployed.** A cloud run exercises whatever is deployed to the target
  environment, which is not necessarily the commit you believe you're validating. **Verify the
  artifact, not the workflow conclusion** — a merge can report green with every
  image-publishing job skipped, so a passing pipeline is not evidence that a build exists. The
  evidence is the deployed build's identity, from wherever your deploy pipeline records it — a
  version endpoint, the deploy job's commit, the revision on a deployment event — checked to
  contain your change. The run's `execution_runtime_version` is not that evidence: it identifies
  the mabl runtime the test executed on, which says nothing about your application's build.

Then read the receipt that the target you pinned is the target you got. Which receipt depends on
the mechanism: a cloud run returns `resolvedBinding` in the `run_mabl_test_cloud` response (url,
deployment, credential, link-agent, per run); a CLI run prints the `URL:`/`Environment:`/
`Credentials:` header instead. Same purpose, two different artifacts — don't go looking for one
in the other's output.

**A GenAI assertion needs a flag that bills, so it is not auto-dispatchable locally.**
`run_context.ai_assertions` is how you know which candidates have one, without reading steps.
`tests run` hard-fails a GenAI assertion without `--allow-billable-features`,
which means a test whose real coverage lives in those assertions fails on tooling rather than on
your change. Don't paper over that by adding the flag to the local automatic wave: spending
credits is not inside the grant there. Keep those tests out of the local auto-dispatch and put
them in the ask with the reason — *needs `--allow-billable-features`* — so the decision to spend
is someone's, and made once rather than discovered through a red canary.

**The cloud path is deliberately different, and this is not an oversight.** A cloud run executes a
GenAI assertion normally and bills for it, and that cost is assumed: running a test the way it was
authored is the point, and gating it would add friction to every cloud wave to re-decide something
already decided. So `ai_assertions` does *not* hold a test back from a cloud dispatch, in CI or
out of it — it only tells you why the local mechanism will refuse the same test, and what the ask
has to say when you route it to a human instead.

**Absent `ai_assertions` means the steps weren't scanned, not that there are none** — for the
local wave, a candidate you couldn't check is one you haven't cleared.

### When a run runs long

A cloud run past ~4 minutes is normal, but it serializes everything queued behind it. Choose one
of three and say which you chose: **keep polling** (the default while runs are still
completing), **inspect** the in-flight run, or **cancel** — and cancelling takes approval, since
a cancelled run has already consumed capacity and leaves a partial record behind.

**Put a wall-clock budget on the wave, not just on a run.** With ~4-minute runs, no batch
dispatch, and a set that can reach ~50 candidates, "keep polling" has no natural end — and in CI
nobody notices. Set a budget before you start, and when it runs out, stop dispatching, report what
completed, and mark the remainder `not run · timed out`. A timed-out wave is an incomplete
validation on exactly the same terms as an approval-gated one (**Report the validation**), not a
passing one with fewer rows.

**Choosing how to run it matters as much as what to run:**

| Goal | Mechanism | What you get back |
|---|---|---|
| Validate **uncommitted local changes** | `mabl` CLI `tests run` against a local server | Pass/fail via the **exit code** (no JSON) |
| Machine-readable results on **deployed** code | `run_mabl_test_cloud` | `journey_run` ids you poll with `get_mabl_test_run` |
| A human wants to **watch** a local run | `run_mabl_test_local` | A **launcher link to hand the person** — and nothing else: no status, logs, or pass/fail |
| Running **inside CI**, with nobody to ask | `run_mabl_test_cloud` only | Pass/fail plus the report; no debug session, no approval round-trip |
| Running **inside CI, advisory only** | `analyze_test_impact` only, no run tools | Impacted list + gaps in the CI report (job output or PR comment); nothing dispatched (see `references/run-plan-report.md`, "Advisory mode") |

The `run_mabl_test_cloud` row is the environment-honesty point above made concrete: a cloud run exercises
deployed code, not your working tree. The third row is a structural dead end for this
workflow, not a limitation to work around. That leaves the CLI as the **only** mechanism that
gives you pass/fail for local changes.

**In CI, the approval step has nobody to answer it — so don't wait on one.**
**→ `references/run-plan-report.md`** for what to run instead and what to record.

**Three rules for a local CLI dispatch**, whatever script you end up with:

- **Pin the whole target before dispatch** — url, credentials, environment, *and* the reporting
  workspace — and pass all four explicitly to every run. The credential decides which workspace
  receives writes, and the resolved-target header only reaches a log *after* that run began, so
  confirming afterwards isn't confirming. Pin the workspace to the one that owns the application
  you analyzed (**Scope the call**): the CLI keeps its own workspace setting that the MCP server
  never reads, so the two can disagree and file your run records somewhere you won't look for them.
- **Default to serial locally.** The local runner binds a **fixed local port** (8000 on the version
  checked), so concurrent local runs on one machine contend for it and the loser dies with
  `EADDRINUSE` before executing a step. It's a race, so it can pass twice and fail the third time
  — which is worse than a consistent failure, because an intermittent infrastructure error in a
  fan-out reads like a flaky test. Fan out only after confirming your CLI version doesn't share
  that port, and recognize the signature if you do.
- **Split the set by band** whenever you run more than one at a time (locally after the check
  above, or in the cloud): read-only tests in a small pool (2–4 — each is a real browser sharing
  one server and one backend); contained tests, and anything explicitly approved, serially so they
  can't collide. **A candidate whose side effects you couldn't establish goes in neither list** —
  unknown is not the same as safe, and running it serially protects the other tests from it, not
  the workspace. It stays pending approval (**Screen before you run**, Kind C) until someone
  approves it by id.
- **Capture each exit code immediately** into a per-dispatch results file. `tests run` has no
  JSON output, so the exit code is the only pass/fail signal — and any command you append after
  it, even an `echo`, *becomes* the status, which makes a failing run report success.

**→ `references/local-run-dispatch.md`** for the worked script, the userland check it depends on,
and how to read the aggregate exit code.

### Diagnosing a failure

**Get the evidence before you form a theory.** The exit code tells you *that* a test failed; the
console output tells you *what* failed, and it carries more than its reputation suggests. A
failing run prints each step with a dot-notation position, the failure text, and — decisive here
— the enclosing flow:

```
3.1.16. Assert the 'Example Org' button ID is 'organization-dropdown'.
[ERROR] Test failed: Assertion failed: The assertion target was not found.
[ERROR] Failure running Flow in 00:01:03: App - Login
```

The third line names the enclosing flow, which is what turns a bare assertion failure into a
diagnosis. Capture this output per test. Don't go hunting in `--artifacts-dir` instead; on three
separate failing runs it produced nothing.

**But read the failing step before you conclude anything from the flow name.** A shared flow is
shared precisely because it exercises shared UI, so it is also the most likely place for your
change to surface first. In the output above, if your diff renamed that button's id, the login
flow is not incidental — it is the flow that caught you, and the assertion needs updating. Same
three lines, opposite conclusion. Ask what the failing step *targets* (a selector, id, label,
text, route) and whether your diff touched that thing; only when the answer is no does the flow
name tell you the run died short of your change.

**Then sort the failure**, because the right next action differs completely by cause:

| Cause | The tell |
|---|---|
| **Died in shared setup, never reached your change** | The failing step is inside a shared flow *and* what that step targets is nothing your diff touched. Only then does it say nothing about your diff. |
| **Your change intentionally altered this behavior — the test needs updating** | The failing assertion describes the *old* behavior and your change made it wrong on purpose. Expect this whenever the change is deliberate and user-visible; it's test maintenance, not a defect. Updating it is `mabl-test-edit`'s job. |
| **Genuine regression** | The failing step exercises what you changed, and the test passed before it. |
| **Pre-existing failure** | It was already failing before your diff — check run history (**Screen before you run**) before attributing a break to your change. |
| **Flake or environment** | Untrained selectors, timing, or local state that differs from where the test normally runs — but that's a list of causes, not a tell; the actual discriminator is below. |

**Requires `mabl-test-edit`.** If it isn't there, name the test and the failing assertion in the
report and stop; don't edit the test yourself.

**The flake row needs evidence, not a shrug** — it's last in the table and catches everything the other four rows didn't claim — how a regression gets written off as flaky. The evidence came back with the analysis: `run_context.quality` carries `flake_rate`, `flaky_plan_runs`, and `last_flaky_time` beside the score, over the response's `quality_window`. Weighed against `total_plan_runs`, they calibrate how much one failure is worth, not what it means: a chronically flaky test can still be broken by your diff. A zero count rules out prior intermittent behavior inside that window, and `runs_capped: true` says the score was computed over a truncated sample of it, so read it as directional. **An absent `quality` is unknown, not zero** — with `quality_note: no_plan_runs_in_window` it means the test had no plan runs inside the window, which is not the same as never having run; without the note, the lookup failed and `incomplete_reasons` says so. Either way, check `list_mabl_test_runs` (**Screen before you run**) rather than reading silence as clean — older runs outside the window are exactly where a flake verdict would have to come from. Neither rules out a first-time target or environment mismatch — the checks below cover that. A rerun that doesn't reproduce is strong flake evidence; one that does only narrows the field, since it reused the same conditions.

Three traps land at exactly this moment:

- A **GenAI assertion fails locally by default** — that's the tooling, not your code, so re-run
  with `--allow-billable-features` before diagnosing further.
- **Re-read the resolved-target header** from the failing run: Kind B is a pre-flight check, but a
  target you got wrong surfaces later as a mystery failure, not as an error.
- **"The login steps passed" is not "I am logged in."** Entering credentials and clicking *Log in*
  can all report `passed` while the app stays unauthenticated, and then everything after the next
  navigation fails for reasons unrelated to your change. The usual cause is the origin you ran
  against, and it has a one-line fix (**→ `references/local-debugging.md`**).

Before investing in a shared-setup failure, check the test's own steps for an `Echo`/TODO
annotation — teams document known environment-specific breakage there, and a failure someone
already diagnosed can save the whole investigation. When a failure looks environment-related,
**re-run the same test with the same credentials against a different target**: passing on one and
failing on the other isolates an environment problem from a real defect without touching your
diff.

Read what the console output already told you before setting up anything heavier. When you do need
to step through it, **→ `references/local-debugging.md`** covers the debug-session commands, the
two prerequisites a local target has (a trusted certificate and a registered sign-in origin —
separate requirements, keyed to different things), and the tests that can't be run locally at all.

**Requires `mabl-debug`.** If it isn't there, say which skill is missing; the CLI's own
`mabl agent debug session --help` covers the same commands.

**Never run `agent debug session get-variables`.** It prints the entire mablscript variable
context into your terminal, your transcript, and any log you're capturing. CLI versions before
2.128.4 print resolved credential values in plaintext; later versions mask credential values, but
the rest of the tree still lands in every capture, and a value copied into an ordinary variable is
only masked when the masker recognizes it.

## 8. Report the validation, then offer to close the gap

**The report is the deliverable.** The run plan says what you intended; the report says what
happened, and it is what makes the pass reviewable by someone who wasn't watching it. Emit it
every time — including when everything passed, especially then, because a bare "all green"
without its scope block is indistinguishable from "I ran the wrong thing and it passed."

Five blocks: scope, analysis, validated, not run, gaps — six on a follow-up commit, when a
**Previously validated** block carries rows from an earlier report (see
`references/run-plan-report.md`). The scope line is the preflight plus two things preflight
couldn't know — what actually executed, and which commit it executed against — minus credentials
and run mode. The cause on a failed row is one of the five in the failure-cause table under
**Diagnosing a failure**. **CI advisory mode changes the shape:**
`Run mode: CI advisory (analysis only)` joins the scope line, `Impacted` replaces `Validated` and
`Not run`, and the report says nothing ran — `references/run-plan-report.md`, "Advisory mode".

```
## Test impact analysis
Scope:      <application> · <workspace> · <deployment> · <what ran: see below> · <PR @ commit sha> · scope: <plan names | labels | all impacted> (<in-scope>/<impacted> in scope)
Analysis:   <N> candidates, <N> gaps · more_may_exist: <bool> · run_context_incomplete: <bool>
Validated:  <test> — passed | failed (<cause>)
Previously: <test> — passed · carried from <sha>   (follow-up commits only; never counted in Validated)
Not run:    <test> — disabled | quality <n> across <m> runs | pending approval (shared-state) | out of scope (plan <name>)
Gaps:       <gap> — authored <test-id> | deferred
```

**"What actually executed" is a different field per run mode, and neither is optional.** For a
**cloud** run it's the deployed build's identity — the version, commit, or deployment revision
your pipeline recorded for the target environment, confirmed to contain the change
(**Canary before you fan out**). For a **local** run it's evidence about the *served build* — the
branch and commit the dev server was started from, or a grep of the served bundle for something
your change introduced (**Screen before you run**, Kind B). A local report that copies a SHA out
of `git` is asserting a validation of a commit no browser ever loaded: a stale dev server answers
on the right port, passes every target check, and turns "nothing looks wrong" into a signed
deliverable. The commit field says what you *meant* to validate; this field is the only one that
says what was *there*.

Every row carries its `view_test_url` — see the reference file; the compressed form above elides
them only to show the shape.

**→ `references/run-plan-report.md`** for the full template, what each field is load-bearing
for, and how a previous report changes what a follow-up commit has to re-run.

### Never stop at "there's a gap"

A gap reported without an offer is just a to-do you handed back. Surface each gap **together
with** an offer to author against it, and hand off to `mabl-test-authoring` when that's
accepted. Authoring stays opt-in — which coverage a team wants is their call, not yours — but
the *asking* is not optional, and neither is naming the gap in the report.

**Requires `mabl-test-authoring`.** If it isn't installed, don't author the test yourself: name
the gap in the report, say what authoring it needs, and stop there.

**After authoring, don't accept the summary as evidence.** The authoring skill's validate step
and the exported test are the receipt; a claim of "cleanup is clean" is not.

## 9. Honest limits

- **Absence is inconclusive.** A test not in the results — or an area not in
  `coverage_gaps` — is **not** proof the change is covered. It may simply be unmodeled or
  unmatched; coverage gaps and tool misses look identical here.
- **API/performance tests may not rank.** Text and semantic search are tuned for
  browser-flow descriptions, so if your change touches API or performance behavior, say those
  tests might be missing from the set rather than assuming they were considered.
- **A result can match on prose rather than on steps.** Retrieval reads descriptions and
  authoring notes too, so a test with no executable steps can surface — and rank well — because
  its *write-up* describes your area. `run_context.step_count` is the check: `0` is a stub, and
  a stub should never be the headline of your run plan. An absent `step_count` on a non-performance
  test means the steps couldn't be scanned, which is the same warning by a different route.
- **The analysis is scoped to one application, and you may not know what's outside it.** Near-
  duplicate tests covering the same surface can live in a different application, where a single
  call cannot see them. When a change hits shared UI, ask whether another application covers the
  same ground before calling the set complete — and if a shared reusable flow is implicated, its
  used-by index is a better measure of blast radius than the impact set, which stops at its own
  result ceiling.
- **When coverage looks thin, widen and say so.** Before concluding "no coverage," fall back
  to plain `search_mabl_tests` with broader phrasings — and report the gap honestly instead
  of implying the change is fully covered. Note the asymmetry: `search_mabl_tests` requires an
  explicit `workspaceId`, so pass the workspace that owns the application you analyzed
  (**Scope the call**) or you will be comparing results from two different places.
- **It finds tests; it does not write them.** Authoring new coverage against a gap it surfaced is
  a handoff to `mabl-test-authoring` — offered every time (**Report the validation**), never
  performed unasked.
