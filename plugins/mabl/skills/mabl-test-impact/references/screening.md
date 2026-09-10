# Screening candidates in detail

Read this when you are screening more than a couple of candidates, when a screening query comes
back and you need to know what its silence means, or when you need to reason about which target a
`tests run` will actually resolve.

`SKILL.md`'s **Screen before you run** carries the rules that govern all of it; this file is the
mechanics. Most of what follows has two forms — the field the impact result already handed you,
and the call you make when it didn't. Both are here, and the interpretation is the same either
way.

## Scoring reliability: quality score, not a pass rate

Each impact result carries its own `run_context.quality` — `score` (0–100), `total_plan_runs`,
`runs_capped`, and the flake fields — computed over the response's `quality_window`, so for the
candidates the analysis returned this section is a reading exercise, not a fetch. The bands below
apply unchanged either way; `get_test_quality_report` is the same server-computed number, and the
tool you fall back to when a lookup left `quality` absent, when you're screening tests the
analysis didn't return, or when you need a window other than the one the response used. It won't
help against `quality_note: no_plan_runs_in_window` — a test with no runs in the window is
excluded from the report too, so that call comes back just as empty.

The score is a composite of pass rate, reliability rate, stability rate, and breakage/transition
history — the quality-report tool contract says it's *"computed server-side using the product's
canonical formula; do not re-derive it from raw test runs."* Cite that score; don't invent your
own bands. Read it against `total_plan_runs` as an **independent second axis**: one tells you
whether there's enough data for the score to mean anything, the other whether the news is good or
bad. Collapsing them into one number downgrades confident bad news to a shrug.

| `total_plan_runs` | `score` | Verdict |
|---|---|---|
| 0, or `quality` absent **for a stated reason** — a `quality_note`, with neither `quality_source_unavailable` nor `enrichment_timeout` in `incomplete_reasons` | *(none)* | Run it. Flag it `no quality baseline in window`; only when `run_history` is also absent with no `incomplete_reasons` token has the test never run recently, and the flag is `no run history`. Either way read its steps and band it — a test without history is the one you cannot judge from history, so the read replaces the score rather than the skip doing it |
| `quality` absent **because the lookup failed** — `quality_source_unavailable` or `enrichment_timeout` in `incomplete_reasons` | *(unknown)* | Not a baseline, a gap. The test may have ninety runs at score 3; you just can't see them. Recover the score with `get_test_quality_report` (below) before you band, and apply whichever row it lands in. If it stays unresolved, the reliability read is **unknown** — say so on the row. Steps tell you what the test does, not how it has been doing, so the no-baseline read above does not close this gap |
| < 5 | *(any)* | Not enough data for the score to mean anything — read the actual runs via `list_mabl_test_runs`, don't quote a percentage |
| ≥ 5 | ≥ 90 | Trust the result |
| ≥ 5 | 40–89 | Run it, but treat a single failure as inconclusive — look at the trend, not the latest run |
| ≥ 5 | ≤ 39 | Distrust — skip and alert, with the failure reason, same as "consistently failing" |

Why the score and not a raw pass rate: in one application's 90-day sample, a test at `n=176`
with a **50% pass rate** — "medium trust" under any rate band — scored **0**, because it
alternates on nearly every run. The score sees the pass/fail *transitions* a rate cannot, so a
rate-only rule would have ranked that pure noise *above* genuinely better tests. The inverse is
worth knowing too: a low score at *high* `n` is confident bad news, not ambiguity — one test
scored **3 across 92 runs**, which means broken, not "look closer." Don't let low-score language
imply low-information. Expect most tests to be clear-cut; in that sample roughly **85%** sat near
one extreme or the other.

**The two responses spell the score differently.** `run_context.quality.score` and the quality
report's `quality_score` are the same number under two names; `total_plan_runs` is spelled the
same in both. Don't go hunting for `quality_score` inside an impact result and conclude the score
is missing.

**Quote the score with its context, never on its own.** Six fields make a reliability claim
readable. Three arrive with the impact result — the score, `total_plan_runs`, and the window
(`quality_window` at the top of the response, or the range you passed the quality report). Three
still cost a call: the latest run, the latest **pass**, and the dominant failure category, all
from `list_mabl_test_runs`. A bare "0% pass rate" hides which situation you're in — 0% across
three runs last quarter is an idle fixture, 0% across ninety runs this week is a broken test, and
they justify opposite decisions. The latest-pass date is the one people forget and the one that
most often settles it.

Keep the whole `quality` object, not just the score — `flake_rate`, `flaky_plan_runs`, and
`last_flaky_time` ride along with it and sit unused during screening, but `SKILL.md`'s
diagnosing-a-failure step needs them to back a flake verdict and assumes you still have what the
analysis already returned. `runs_capped: true` means the score was computed over a truncated
sample of the window rather than all of it, so a capped score is directional.

## Every bulk query is bounded, so absence never means "fine"

One rule governs every list you consult: **each is bounded — by a row cap, a page size, or a
minimum-runs filter — so a candidate's absence from a response never means "fine," only "not
answered."** Diff your impacted `test_invariant_id` values against whatever came back, and carry
anything missing as *unknown* rather than screened.

This is not a small correction, and it is why the per-test form matters. Measured on one real run
— a 25-test impact set for a shared-table change, screened against a 30-day quality report for
the same application — **10 of the 25 never appeared in the report at all**, including two of the
most directly relevant tests, while 3 of the 15 that did appear were failing on essentially every
run with a quality score of 0. Reading absence as a clean bill would have left 40% of the set
unscreened *and* kept three guaranteed red herrings in the run. `run_context` closes exactly that
hole for the candidates the analysis returned: every returned test gets its own row, and one that
couldn't be resolved says so in `incomplete_reasons` instead of vanishing from a bulk response.

The tools below are the fallback path — for a field `run_context` left absent, for a set you found
through `search_mabl_tests` instead, or for a window the response didn't use. Their bounds are
what the rule is about:

- `list_mabl_tests(applicationId, limit:200)` gets enabled status for a whole application
  group in one call — and **with `applicationId` set, the 200 cap is a wall, not a page.** The
  api applies the application, label, and author filters in memory after scanning the workspace,
  so a filtered query never returns `nextCursor`; a page that filled the limit comes back
  `truncated: true` instead, with no cursor to continue it. Results come most-recently-created-first,
  so past 200 tests that wall silently un-screens your oldest candidates. When `truncated` is set,
  split the query by `testType` or `branch`, or page the unfiltered catalog with `cursor` until
  `nextCursor` stops coming back and apply the filters yourself. Then diff here too: any impacted
  `test_invariant_id` missing from the response is *unscreened*, not enabled. Resolve each one
  with `get_mabl_test` (it returns `enabled` for a single test), and if you can't, label it
  **unknown** rather than presenting it as screened. A disabled test that slips through this gap
  looks like a passing candidate right up until it doesn't run. It also filters on `labels`
  (any-of), `excludeLabels`, `branch`, and `testType` — which is what makes a label run scope
  (`SKILL.md`'s **Screen before you run**) resolvable in this same call, under the same
  truncation rule.
- `get_test_quality_report(applicationId, startTime, endTime, minPlanRuns: 1)` is the bulk form of
  the table above: no per-test loop, server-computed `quality_score` and `total_plan_runs` per
  test. Pass `minPlanRuns: 1` — the **default is 5**, and tests below it are **excluded entirely,
  not flagged**, which silently hides the tests most likely to be quietly broken. Passing `1`
  surfaces them instead; their score then lands in the untrustworthy `< 5` row above, which is
  exactly how you're meant to read it. Two more footguns: results are **paginated** (`limit` caps
  at 100, with an opaque `cursor`), so a larger application needs paging, not one call; and
  there's a server-enforced **90-day cap** on the window (a longer range 400s). Clamp the range
  before you send it rather than learning the cap from an error — and if you do trip it, shorten
  the window and retry rather than reporting the screen as unavailable. A 400 here means your
  query was too wide, not that the tests can't be screened.
- **Tests with no runs in the window are the case the two responses handle differently, and it's
  worth knowing which one you're reading.** In the quality report they are simply invisible — even at
  `minPlanRuns: 1`, a test with *no* runs in the window can't appear, so you only find them by
  paging the report fully and diffing its ids against your impacted set. In an impact result they
  are stated: `quality` absent with `quality_note: no_plan_runs_in_window`. Either way the action
  is the same — run them, flag the missing baseline, and use `list_mabl_test_runs` (or `mabl tests
  get-runs`) to confirm a test is genuinely new rather than merely idle for the window you chose.
- Once you know which test to alert on, `list_mabl_test_runs` gets you the specific failure
  reason to quote. Nothing in `run_context` replaces it: the latest run, the latest pass, and the
  failure category are not in the response.
- `list_mabl_test_run_summaries` **looks like a shortcut and is not**: it returns one row per
  *run*, not per test, so a handful of chronically-failing tests crowd out everything else —
  100 rows can cover just a couple hours of wall clock in a busy workspace and miss your
  candidates entirely. `get_test_quality_report` avoids this because it returns one row per
  *test* with server-computed aggregates, which is the whole reason it's the right tool here.

## What the CLI can and cannot screen

The CLI covers most of the hard gates. **`mabl tests list`** reports enabled state (an `Enabled`
column, or the field in `-o json`) — mind its `--limit`, which **defaults to 10**. **`mabl tests
get-runs <test-id>`** lists a test's recent runs with outcome plus a failure category and summary
each, which is a real per-test trend. It is the reason `SKILL.md`'s **Prerequisites** floor exists —
check `mabl tests --help` before relying on it; older installs don't have it. Don't substitute
`mabl test-runs`: that group's `get-test` resolves a run back to its test, the wrong direction.

Two things the CLI can't give you. The **aggregate** — server-computed quality across an
application, without looping per test — so bulk screening still wants the MCP tools, with per-test
CLI calls as the fallback. And, less obviously, **the test's own recorded target**: `tests list -o
json` returns id, name, enabled, and timestamps but no url, and `tests export --format json`
carries metadata plus steps but no `url`, `environmentId`, or `credentialsId`. An impact result
covers most of that gap — `run_context.defaults` gives `environment_id`, `credentials_id`, and
whether a url is recorded at all — but **not the url itself**, so confirming the host a test points
at still needs `get_mabl_test`. A CLI-only workflow can run a test but cannot tell you beforehand
where that test points.

One trap has no CLI fallback at all: **`tests run --id <test>` bypasses the enabled check**
(`singleTestRun: true` short-circuits it), so a disabled test runs with no warning — checking
enabled state is on you.

## Which target a run will actually resolve

`tests run` reports the target it resolved, however you specified it, near the top of its output —
in this relative order, interleaved with a few other lines (workspace, test description, datatable
scenario):

```
URL: <resolved url>
Environment: <name> - <environment-id>
Credentials: <name> - <credentials-id>
```

Read those against your intent before you trust the result. Two gaps are easy to read past:
`Environment:` is **omitted entirely** when nothing resolved, rather than printed as blank or
`None` the way `Credentials:` is — so a *missing* line is the signal, not an empty one. And `URL:`
doesn't print at all for a mobile test.

The rest of this list is what can make those lines surprise you:

- `--workspace-id` scopes where **results are reported**, not the workspace the test actually
  operates in. The browser logs in as whoever the **credential** belongs to and lands in that
  user's default workspace — an assertion can depend on the credential-user's account state,
  something invisible in the test definition itself.
- Absent `--url` or `--run-id`, **both** an `--environment-id`-only run and a fully bare
  `tests run --id <test>` resolve to the same target: **the test's own recorded `url`** — for a
  local run the deployment-derived url is never populated, so `--environment-id` alone changes
  nothing about it (the CLI's own help says so verbatim: *"Setting the environment does not
  override the default URL. Please use the (—url) command to override the URL."*). If that
  field is unset, the CLI **fails loudly** rather than guessing: *"No default URL found on
  test, please specify a URL using -u or --url flag."* Whether it's set is the one half you get
  for free — `run_context.defaults.url_set` — and `false` predicts exactly that error on a local
  run given no `--url`. The other half stays a judgment call: a url being *set* says nothing about
  whether it's the host you actually want.
- `--run-id <test-run-id>` inherits url, environment, and credentials **together** from a real
  prior cloud run — the low-effort way to get a working config, and still the right first move.
  But it reproduces that run's target *exactly*, and that target can be **stale or ephemeral**
  (a per-PR preview host that no longer exists, for instance) — the resolved-target header
  above is how you catch it; pass `--url` to override when the inherited target isn't what you
  want.
- Credentials marked `cloud_only` are rejected for local runs. `run_context.defaults` answers this
  per candidate with `credential_cloud_only`, present only when the test records a credential and
  that credential resolved — so an absent flag is unknown, not "safe for local." Without it,
  `credentials list` always warns that *"Cloud credentials are not available for local runs"* but
  never says **which** credential is the cloud-only one; the default table hides that field, so
  check with `-o json`. Note this is the credential's normal, correct state for a cloud or CI run
  — it only blocks local dispatch.
- To see where a test will actually point a browser, read its **navigation** (`VisitUrl`)
  steps, not the selector metadata — every selector in an export carries the absolute url of
  the page it was recorded on, so grepping for hostnames flags nearly every selector as a false
  positive. `mabl tests export --format json` carries the full step detail; no extra flag is
  needed. **The steps are nested under `flows[].steps`, not at the top level** — the top level is
  test metadata (`journeyId`, `name`, `description`, `labels`, `dataTables`, `flows`), so a reader
  that looks for a top-level `steps` key finds nothing and concludes, wrongly, that the export
  omitted them. Note it writes `<test-id>-<n>.mabl.json` to your current directory, so don't let it
  get committed by accident.
- AI assertions **do not execute in CLI runs by default** — `--allow-billable-features`
  defaults to `false`, and a GenAI assertion **hard-fails** rather than being silently skipped.
  `tests run` reports this helpfully and names the fix: *"AI assertions are not available in
  CLI runs by default. Use --allow-billable-features to enable, failing assertion."* Without
  the flag, a test whose real coverage lives in GenAI assertions fails locally for a reason
  that has nothing to do with your change — pass the flag before you spend time diagnosing it.
  `run_context.ai_assertions` flags these before dispatch instead of after; absent means the steps
  weren't scanned, so it is not a clearance.

## Banding side effects without reading everything

Don't trust the test's own metadata: a `description` can claim self-cleaning behavior its steps
don't perform, and a test's own environment default can disagree with what its actual runs use.
Ground truth is the steps and the run history, never the description.

**This is the screening question `run_context` does not answer.** It scans steps for GenAI
assertions and counts them; it says nothing about whether a test creates, edits, or deletes, and
there is no field that bands side effects. Banding stays a step read.

Reading steps means `get_mabl_test_steps`, which is the **long pole** of screening — 12–70KB per
test, no bulk form, because every selector carries full DOM metadata. `run_context.step_count` is
the cheap forecast of that cost, and it lets you spend the reads where they buy the most; `0`
means there is nothing to read and nothing to band, because the test has no steps of its own. For
a large set, triage rather than read all of them: band the highest-risk candidates properly and
mark the rest **"side effects not verified"**, which puts them in the bottom band by rule rather
than implying they're clean. **Never spend that shortcut on a candidate without a history
baseline** — `quality` absent (`quality_note: no_plan_runs_in_window` means idle in the window,
not necessarily never run), `run_history` absent with no `incomplete_reasons` token (no recent
runs at all), or any `run_history_note` (every one of its four values means the sample held runs
none of which could be reported, so there is still nothing to judge by). History is the
other way to judge a test, so a candidate that has none has only its steps: read them and band it
by what they do (read-only, contained, or approval-required), and reserve "unverified" for a step
lookup that failed. Take the shortcut instead and the test a dev wrote *for this change* is the
one that doesn't run.

**What to look for, in this order.** You are placing the test into one of the four bands in
`SKILL.md`'s **Screen before you run**, which is a much narrower question than "what does this
test do":

1. **Does it create, edit, or delete anything?** If not, it's read-only — the top band, and
   you're done. This is the majority of most sets and it's the cheapest question to answer.
2. **Is the last step group or flow marked `Run as teardown`?** This is the mechanism that makes
   cleanup failure-safe: a teardown runs even when the test fails, and only the test's *final*
   step can be marked as one. Trailing delete steps that aren't marked are not a teardown — they
   don't execute on the run that failed halfway, which is the run that left the orphan.
3. **Does it delete by a variable captured at creation time?** The documented pattern is to
   extract the created record's id into a variable as the test creates it and delete by that
   variable. A step typing a literal fixture name (`Test App`) is shared state wearing a create
   step's clothes — two concurrent runs collide on it, and so do two people a minute apart —
   and "the first row" is worse than either.
4. **Are there assertions inside the teardown?** There shouldn't be: a failure *within* a
   teardown fails the test, so mabl's guidance is cleanup steps only. An absence check that
   proves the record is gone is legitimate and belongs in the test **body**, before the teardown.
   Reading *Delete → Confirm → assert the route* as cleanup is the near-miss in the other
   direction: it proves the app navigated, not that anything was removed.

Any of those you can't answer from the steps puts the test in the bottom band. Unknown is not the
same as safe — and note precisely what the bottom band means: the test **does not run** until
someone approves it by id. Serial execution is not a middle setting between "run it" and "ask
about it"; it protects the other tests from this one, not the workspace.

**That makes the triage shortcut above expensive, so use it deliberately.** Marking the tail
"side effects not verified" on a 25-test set puts the majority into the bottom band, which means
pending approval — and in CI, where nobody answers, `references/run-plan-report.md` makes that a
permanently incomplete verdict. Banding costs a `get_mabl_test_steps` read per test; not banding
costs the test. On a large set, spend the reads on the candidates you actually intend to
dispatch, in this order — **candidates without a history baseline first, then `role: validates`, then
the rest** — and be explicit in the report about how many you left unbanded and why, rather than
letting the tail quietly become an approval queue nobody asked for.

**No-history candidates come first because nothing else can screen them, and they arrive last.**
A test authored on a branch for the change under review has no history to read and, having been
found by search rather than by a modeled relationship, usually no `role` either — which puts it
at the back of a `validates`-first read order and then into the bottom band by the shortcut.
Two ways to lose the same test; reading it first closes both.
