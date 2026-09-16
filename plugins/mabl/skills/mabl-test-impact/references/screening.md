# Screening candidates in detail

Read this when you are screening more than a couple of candidates, when a screening query comes back
and you need to know what its silence means, when you need to reason about which target a `tests run`
will actually resolve, or before you point a run at a local server.

`SKILL.md`'s **Screen before you run** carries the rules that govern all of it; this file is the
mechanics. Most of what follows has two forms — the field the impact result already handed you, and
the call you make when it didn't. Both are here, and the interpretation is the same either way.

## Scoring reliability: quality score, not a pass rate

Each impact result carries its own `run_context.quality` — `score` (0–100), `total_plan_runs`,
`runs_capped`, and the flake fields — computed over the response's `quality_window`, so for the
candidates the analysis returned this is a reading exercise, not a fetch. `get_test_quality_report`
is the same server-computed number, and the tool you fall back to when a lookup left `quality`
absent, when you're screening tests the analysis didn't return, or when you need a different window.
It won't help against `quality_note: no_plan_runs_in_window` — a test with no runs in the window is
excluded from the report too, so that call comes back just as empty.

The score is a composite of pass rate, reliability rate, stability rate, and breakage/transition
history — the quality-report tool contract says it is *"computed server-side using the product's
canonical formula; do not re-derive it from raw test runs."* Cite that score; don't invent your own
bands. Read it against `total_plan_runs` as an **independent second axis**: one tells you whether
there is enough data for the score to mean anything, the other whether the news is good or bad.
Collapsing them into one number downgrades confident bad news to a shrug — a low score at high
`total_plan_runs` is confident bad news, not ambiguity.

| `total_plan_runs` | `score` | Verdict |
|---|---|---|
| 0, or `quality` absent **for a stated reason** — a `quality_note`, with neither `quality_source_unavailable` nor `enrichment_timeout` in `incomplete_reasons` | *(none)* | Run it, flagged `no quality baseline in window`; only when `run_history` is also absent with no `incomplete_reasons` token has the test not run recently, and the flag is `no run history`. Either way read its steps and band it — the read replaces the score rather than the skip doing it |
| `quality` absent **because the lookup failed** — `quality_source_unavailable` or `enrichment_timeout` in `incomplete_reasons` | *(unknown)* | Not a baseline, a gap: the test may have ninety runs at score 3 and you just can't see them. Recover it with `get_test_quality_report` before you band, and apply whichever row it lands in. If it stays unresolved, say **unknown** on the row — steps tell you what the test does, not how it has been doing |
| < 5 | *(any)* | Not enough data for the score to mean anything — read the actual runs via `list_mabl_test_runs`, don't quote a percentage |
| ≥ 5 | ≥ 90 | Trust the result |
| ≥ 5 | 40–89 | Run it, but treat a single failure as inconclusive — look at the trend, not the latest run |
| ≥ 5 | ≤ 39 | Distrust — skip and alert, with the failure reason, same as "consistently failing" |

Why the score and not a raw pass rate: a test that alternates between pass and fail on nearly every
run has a middling pass rate and a near-zero score, because the score sees the pass/fail
*transitions* a rate cannot. A rate-only rule ranks that noise above genuinely better tests.

**The two responses spell the score differently.** `run_context.quality.score` and the quality
report's `quality_score` are the same number under two names; `total_plan_runs` is spelled the same
in both. Don't go hunting for `quality_score` inside an impact result and conclude it is missing.

**Quote the score with its context, never on its own.** Six fields make a reliability claim
readable, and five of them arrive with the impact result: the score, `total_plan_runs`, the window
(`quality_window`, or the range you passed the quality report), and the latest run and latest pass
from `run_history` (`latest_status`/`latest_run_time` and `last_passed_time` — a workspace-wide
10-run sample, so a missing `last_passed_time` means no pass *in that sample*, not never). Only the
dominant failure category still costs a `list_mabl_test_runs` call. A bare "0% pass rate" hides
which situation you're in, and the latest-pass date is the one people forget and the one that most
often settles it.

Keep the whole `quality` object, not just the score: `flake_rate`, `flaky_plan_runs`, and
`last_flaky_time` ride along with it and sit unused during screening, but `SKILL.md`'s **Diagnosing
a failure** needs them to back a flake verdict. `runs_capped: true` means the score was computed
over a truncated sample of the window, so a capped score is directional.

## The `run_context` fields

| Field | What it settles |
|---|---|
| `enabled` | The disabled gate, read live |
| `test_type` | `browser`, `api`, `performance`, `mobile` and the like — whether the run mechanisms in `SKILL.md`'s **Run it** apply at all |
| `mobile_platform` | The platform recorded on a `mobile` test. Read it with `test_type`: which runner and which device the test needs, neither half deciding on its own |
| `step_count` | Whether there is anything to execute. `0` means the test matched on its name or description and has no steps of its own; absent for a performance test by design |
| `ai_assertions` | Whether any scanned step carries a GenAI assertion or condition — the billable-flag decision in `SKILL.md`'s **Hard gates**, which is the one home for that rule |
| `run_history` | A sample of the newest 10 runs — `latest_status`, `latest_run_time`, `last_passed_time`, `runs_examined`. Workspace-wide, with no time, environment, plan, or branch filter, so it is not the runs your intended target would produce |
| `run_history_note` | Why `run_history` is absent when the sample held runs but none could be reported: `no_started_runs_examined`, `skipped_runs_examined`, `terminated_before_start_runs_examined`, `unreportable_runs_examined` |
| `quality` | `score`, `total_plan_runs`, `runs_capped`, and the flake fields, over the response's `quality_window` |
| `quality_note` | Why `quality` is missing for a real reason rather than a failed lookup |
| `defaults` | `url_set`, `environment_id`, `credentials_id`, `credential_cloud_only`, `datatable_ids` — the run configuration recorded on the test at authoring time |
| `plans` | Plan membership, and only when you asked for it with `includePlans` — capped at 5 per test, with `plans_truncated` in `incomplete_reasons` when a test belongs to more. Each entry carries `plan_id`, `name`, `enabled`, `browser_types`, `retry_on_failure`, `has_triggers` |
| `incomplete_reasons` | Which of the above did not resolve for this test, by name |

**`run_history` is absent three different ways, and only one of them is a failure.** With
`run_history_note`, the sample held runs none of which could be reported, and the note says which
way. With neither the note nor a token, no recent runs came back — a test that has not run recently.
With `run_history_source_unavailable` in `incomplete_reasons`, the lookup failed and the answer is
unknown.

Three things tell you which flavour of absence you are looking at (`SKILL.md`, **Absent fields**):

1. **`incomplete_reasons`** names what went wrong for *this* test — `test_fetch_failed`,
   `steps_not_scanned`, `quality_source_unavailable`, `credentials_source_unavailable`,
   `plans_fetch_failed`, `plans_truncated`, `enrichment_timeout`. A field one of those accounts for
   is unresolved, full stop. **The converse doesn't hold:** not every unresolved field gets a token —
   a credential the caller simply can't see leaves `credential_cloud_only` absent and silent — so no
   token is not a clearance either. (That flag is also absent and moot when `defaults.credentials_id`
   is itself absent: no recorded credential, nothing to classify.)
2. **`quality_note`** is the one absence with a stated benign explanation: `no_plan_runs_in_window`
   means the lookup ran and found no plan runs inside `quality_window`. That is the no-baseline case,
   not a failure — and not, by itself, a new test.
3. **`run_context` missing entirely** means enrichment couldn't run for that test at all; nothing
   about it has been screened.

## Every bulk query is bounded, so absence never means "fine"

One rule governs every list you consult: **each is bounded — by a row cap, a page size, or a
minimum-runs filter — so a candidate's absence from a response never means "fine," only "not
answered."** Diff your impacted `test_invariant_id` values against whatever came back, and carry
anything missing as *unknown* rather than screened. `run_context` closes that hole for the candidates
the analysis returned — every returned test gets its own row, and one that couldn't be resolved says
so in `incomplete_reasons` instead of vanishing from a bulk response. The tools below are the
fallback path, for a field `run_context` left absent, for a set you found through `search_mabl_tests`
instead, or for a window the response didn't use. Their bounds are what the rule is about:

- `list_mabl_tests(applicationId, limit:200)` gets enabled status for a whole application group in
  one call — and **with `applicationId` set, the 200 cap is a wall, not a page.** The api applies the
  application, label, and author filters in memory after scanning the workspace, so a filtered query
  never returns `nextCursor`; a page that filled the limit comes back `truncated: true` instead, with
  no cursor to continue it. Results come most-recently-created-first, so past 200 tests that wall
  silently un-screens your oldest candidates. When `truncated` is set, split the query by `testType`
  or `branch`, or page the unfiltered catalog with `cursor` and apply the filters yourself. Then diff
  here too: any impacted `test_invariant_id` missing from the response is *unscreened*, not enabled.
  Resolve each with `get_mabl_test`, and if you can't, label it **unknown**. It also filters on
  `labels` (any-of), `excludeLabels`, `branch`, and `testType`, which is what makes a label run scope
  resolvable in this same call, under the same truncation rule.
- `get_test_quality_report(applicationId, startTime, endTime, minPlanRuns: 1)` is the bulk form of
  the table above. Pass `minPlanRuns: 1` — the **default is 5**, and tests below it are **excluded
  entirely, not flagged**, which silently hides the tests most likely to be quietly broken. Two more
  footguns: results are **paginated** (`limit` caps at 100, with an opaque `cursor`), and there is a
  server-enforced **90-day cap** on the window (a longer range 400s). Clamp the range before you send
  it; if you do trip it, shorten the window and retry rather than reporting the screen as
  unavailable.
- **Tests with no runs in the window are handled differently by the two responses.** In the quality
  report they are simply invisible — even at `minPlanRuns: 1` — so you only find them by paging the
  report fully and diffing its ids against your impacted set. In an impact result they are stated:
  `quality` absent with `quality_note: no_plan_runs_in_window`. Either way, run them, flag the
  missing baseline, and use `list_mabl_test_runs` (or `mabl tests get-runs`) to confirm a test is
  genuinely new rather than merely idle for the window you chose.
- `list_mabl_test_runs` and `get_mabl_test_run_failure_reason` get you the dominant failure category
  to quote. `run_history` already carries the latest run and the latest pass; the failure category is
  the part it does not.
- `list_mabl_test_run_summaries` **looks like a shortcut and is not**: it returns one row per *run*,
  not per test, so a handful of chronically-failing tests crowd out everything else and can miss your
  candidates entirely. `get_test_quality_report` returns one row per *test* with server-computed
  aggregates, which is the whole reason it is the right tool here.

## What the CLI can and cannot screen

The CLI covers most of the hard gates. **`mabl tests list`** reports enabled state (an `Enabled`
column, or the field in `-o json`) — mind its `--limit`, which **defaults to 10**. **`mabl tests
get-runs <test-id>`** lists a test's recent runs with outcome plus a failure category and summary
each, which is a real per-test trend; it is the one command behind the `MIN_MABL_CLI_VERSION` floor
in `SKILL.md`'s **Prerequisites**, so check `mabl tests --help` before relying on it. Don't
substitute `mabl test-runs`: that group's `get-test` resolves a run back to its test, the wrong
direction.

Two things the CLI can't give you. The **aggregate** — server-computed quality across an application
without looping per test — so bulk screening still wants the MCP tools. And **the test's own recorded
target**: `tests list -o json` returns id, name, enabled, and timestamps but no url, and `tests
export --format json` carries metadata plus steps but no `url`, `environmentId`, or `credentialsId`.
An impact result covers most of that gap through `run_context.defaults`, but **not the url itself**,
so confirming the host a test points at still needs `get_mabl_test`.

One trap has no CLI fallback at all: **`tests run --id <test>` bypasses the enabled check**
(`singleTestRun: true` short-circuits it), so a disabled test runs with no warning.

## Which target a run will actually resolve

**A candidate's runnable target lives in run history, not in test metadata.** `run_context.defaults`
carries what was recorded on the test at authoring time — what a bare run would resolve, which is not
what the test's plans necessarily use. When the two disagree, run history decides
(`SKILL.md`, **Scope the call**). `defaults.credentials_id` gives you the first cut for free:
candidates recording different credentials are different targets, visible before you fetch anything.
An absent `credentials_id` means the test records none of its own, which is not the same as running
without one — its plans can supply theirs, so run history still decides.

**A candidate with no run history has no triple to read.** For those, the target is the one the
preflight stated for the change, checked against the test's `defaults`: a `defaults` triple matching a
group already pinned from history puts the test in that group; a recorded `environment_id` or
`credentials_id` naming something *other* than the stated target is a question for the user, not a
tie-break; and `defaults` that record nothing leave the stated target standing. A test authored on
the branch for the change under review has the clearest target of all — the deployment that serves
the change. Either way the row says the target came from intent and `defaults`, not from history.

`tests run` reports the target it resolved, however you specified it, near the top of its output — in
this relative order, interleaved with a few other lines (workspace, test description, datatable
scenario):

```
URL: <resolved url>
Environment: <name> - <environment-id>
Credentials: <name> - <credentials-id>
```

Read those against your intent before you trust the result. Two gaps are easy to read past:
`Environment:` is **omitted entirely** when nothing resolved, rather than printed as blank or `None`
the way `Credentials:` is — so a *missing* line is the signal, not an empty one. And `URL:` doesn't
print at all for a mobile test. The rest of this list is what can make those lines surprise you:

- `--workspace-id` scopes where **results are reported**, not the account the test operates in. The
  browser signs in as whoever the **credential** belongs to and lands in that user's account — an
  assertion can depend on that account's state, something invisible in the test definition itself.
- Absent `--url` or `--run-id`, **both** an `--environment-id`-only run and a fully bare `tests run
  --id <test>` resolve to the same target: **the test's own recorded `url`**. For a local run the
  deployment-derived url is never populated, so `--environment-id` alone changes nothing about it
  (the CLI's own help says so: *"Setting the environment does not override the default URL. Please
  use the (—url) command to override the URL."*). If that field is unset the CLI **fails loudly**:
  *"No default URL found on test, please specify a URL using -u or --url flag."* Whether it is set is
  the half you get for free — `run_context.defaults.url_set` — and `false` predicts exactly that
  error on a local run given no `--url`. That a url *is* set says nothing about whether it is the
  host you want.
- `--run-id <test-run-id>` inherits url, environment, and credentials **together** from a real prior
  cloud run — the low-effort way to get a working config, and still the right first move. But it
  reproduces that run's target *exactly*, and that target can be **stale or ephemeral** (a per-PR
  preview host that no longer exists); the resolved-target header above is how you catch it, and
  `--url` overrides when the inherited target isn't what you want.
- Credentials marked `cloud_only` are rejected for local runs. `run_context.defaults` answers this per
  candidate with `credential_cloud_only`, present only when the test records a credential and that
  credential resolved — so an absent flag is unknown, not "safe for local." Without it, `credentials
  list` always warns that *"Cloud credentials are not available for local runs"* but never says
  **which** credential is the cloud-only one; the default table hides that field, so check with
  `-o json`. This is the credential's normal, correct state for a cloud or CI run.
- To see where a test will actually point a browser, read its **navigation** (`VisitUrl`) steps, not
  the selector metadata — every selector in an export carries the absolute url of the page it was
  recorded on, so grepping for hostnames flags nearly every selector as a false positive. `mabl tests
  export --format json` carries the full step detail. **The steps are nested under `flows[].steps`,
  not at the top level** — the top level is test metadata — so a reader that looks for a top-level
  `steps` key finds nothing and concludes, wrongly, that the export omitted them. It writes
  `<test-id>-<n>.mabl.json` to your current directory, so don't let it get committed by accident.
- GenAI assertions **hard-fail in CLI runs** without `--allow-billable-features`, and that flag bills.
  `SKILL.md`'s **Hard gates** owns what to do about it; the short version is that such a test leaves
  the local automatic wave and joins the ask, and you never add the flag yourself.

## Local target gates

A local target has two independent requirements, and satisfying one tells you nothing about the
other: **the certificate has to cover the hostname you use, and the identity provider's allowlist has
to contain the whole scheme-host-port origin.**

**Trust the certificate.** On CLI < 2.128.4 there is no flag on `session start` to bypass certificate
errors; from 2.128.4 pass `--browser-ignore-certificate-errors` to the debug session. `tests run` has
no equivalent, so a local *wave* still needs the certificate trusted. If `curl` without `-k` returns a
normal response for your dev-server URL, the trust is in place; until it is, expect
`ERR_CERT_AUTHORITY_INVALID` with nothing you can pass to work around it. However the dev server
generates its certificate, add it to the OS trust store — the System keychain on macOS,
`/usr/local/share/ca-certificates/` plus `update-ca-certificates` or `trust anchor` on Linux (Chrome
reads its own NSS store there, so `certutil -d sql:$HOME/.pki/nssdb` may be needed too), *Trusted Root
Certification Authorities* on Windows. Those take `sudo`: propose the command, don't run it
unattended, and verify by succeeding **without** `-k`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "https://<host>:<port>/"
```

**Confirm the port while you are there.** Many dev servers fall through to the next free port when the
default is busy, so a stale server can keep answering on the expected port while serving a build that
predates the change (`SKILL.md`, **Target confirmation**): `lsof -nP -iTCP -sTCP:LISTEN` on macOS or
BSD, `ss -ltnp` on Linux.

**Address the server by its registered origin.** Sign-in posts the credentials to the identity
provider as a cross-origin request, and the provider answers only for origins on its allowlist. Local
development usually has a registered origin for exactly this reason — a dedicated loopback hostname
on a fixed port, for example, rather than `https://localhost:<port>` — so point the run at that one.
**The port is part of the origin, which is the trap:** an allowlist entry for one port does not cover
the next one, so a dev server that fell through to a free port silently breaks authentication while
serving the app perfectly well. Same for `localhost` when the registered name is the loopback
hostname. Both produce identical symptoms — UI steps pass, no session, and the first post-login
element is never found (`SKILL.md`, **Diagnosing a failure**). A preflight request to the identity
provider tells you whether an origin is registered before you spend a run on it: read the response
rather than its exit status, because the origin has to come back echoed exactly and a credentialed
sign-in additionally needs allow-credentials, which a wildcard satisfies on a presence check and
still fails in the browser.

**Does step 1 navigate?** A test that opens straight into a login flow, with no leading *Visit URL*,
starts on a blank page under the CLI and fails its first step in ~30 seconds no matter which target
you point it at. Neither `tests run` nor a debug session navigates on your behalf — `--url` supplies
the target the test's own *Visit URL* step resolves against, and nothing more. **A passing cloud run
does not rule it out**, because the cloud runner performs an initial navigation that the local runner
does not, so screen for "does step 1 navigate," not for "does it pass in the cloud." `tests export
--format json` carries the steps (under `flows[].steps`), which makes this cheap to check on the
candidates you plan to run locally. It is a defect in the test — the fix is a leading *Visit URL*
step — so either pick a different candidate or say so in the row.

`defaults.url_set: false` is a *different* local failure that arrives free with the results: the test
records no default URL, so a local `tests run` with neither `--url` nor `--run-id` fails immediately
rather than guessing.
Every dispatch in `SKILL.md`'s **Run it** pins the url explicitly, which is what makes that
survivable. A `url_set: false` test has nowhere to navigate; the missing-*Visit URL* test above has
somewhere and never goes there.

## Banding side effects without reading everything

**This is the screening question `run_context` does not answer.** It scans steps for GenAI assertions
and counts them; it says nothing about whether a test creates, edits, or deletes, so banding stays a
step read. Don't trust the test's own metadata either: a `description` can claim self-cleaning
behavior its steps don't perform.

Reading steps means `get_mabl_test_steps`, the **long pole** of screening — tens of kilobytes per
test, no bulk form, because every selector carries full DOM metadata. `run_context.step_count` is the
cheap forecast of that cost and lets you spend the reads where they buy the most; `0` means there is
nothing to read and nothing to band. For a large set, triage rather than read all of them: band the
highest-risk candidates properly and mark the rest **"side effects not verified"**, which puts them in
the bottom band by rule rather than implying they are clean. **Never spend that shortcut on a
candidate without a history baseline** — `quality` absent, `run_history` absent with no
`incomplete_reasons` token, or any `run_history_note`. History is the other way to judge a test, so a
candidate that has none has only its steps: read them and band it by what they do — **unverified**
when those steps show a bulk delete, cascade or permission change, or when the step lookup failed,
never as the shortcut. Take the shortcut instead and the test a dev wrote *for
this change* is the one that doesn't run.

**What to look for, in this order.** You are placing the test into one of the four bands in
`SKILL.md`'s **Side-effect bands**, which is a much narrower question than "what does this test do":

1. **Does it create, edit, or delete anything?** If not it is read-only — the top band, and you're
   done. This is the majority of most sets and the cheapest question to answer.
2. **Is the last step group or flow marked `Run as teardown`?** That is the mechanism that makes
   cleanup failure-safe: a teardown runs even when the test fails, and only the test's *final* step
   can be marked as one. Trailing delete steps that aren't marked are not a teardown — they don't
   execute on the run that failed halfway, which is the run that left the orphan.
3. **Does it delete by a variable captured at creation time?** The documented pattern is to extract
   the created record's id into a variable as the test creates it and delete by that variable. A step
   typing a literal fixture name is shared state wearing a create step's clothes — two concurrent runs
   collide on it, and so do two people a minute apart — and "the first row" is worse than either.
4. **Are there assertions inside the teardown?** There shouldn't be: a failure *within* a teardown
   fails the test, so mabl's guidance is cleanup steps only. An absence check that proves the record
   is gone is legitimate and belongs in the test **body**, before the teardown. Reading *Delete →
   Confirm → assert the route* as cleanup is the near-miss in the other direction: it proves the app
   navigated, not that anything was removed.

**The band does not require proof that the teardown deleted anything.** A test earns the contained
band on the marking, the captured identifier, and the scoped delete — three things you can read off
the steps. Demanding a deletion *assertion* on top would ask for a check that, by point 4, cannot live
where it would have to run. Require it only when deletion is the behavior under test.

Any of those you can't answer from the steps puts the test in the bottom band. Unknown is not the same
as safe, and note precisely what the bottom band means: the test **does not run** until someone
approves it by id. Serial execution is not a middle setting between "run it" and "ask about it" — it
protects the other tests from this one, not the account. Cleanup that has to span several tests is a
different mechanism, a plan stage with **Always run stage** enabled, worth recognizing when a set's
cleanup lives outside the tests themselves.

**That makes the triage shortcut expensive, so use it deliberately.** Marking the tail "side effects
not verified" on a large set puts the majority into the bottom band, which means pending approval.
Banding costs a `get_mabl_test_steps` read per test; not banding costs the test. Spend the reads on
the candidates you actually intend to dispatch, in this order — **candidates without a history
baseline first, then `role: validates`, then the rest** — and be explicit in the report about how many
you left unbanded and why. No-history candidates come first because nothing else can screen them and
they arrive last: a test authored on a branch for the change under review has no history to read and,
having been found by search rather than by a modeled relationship, usually no `role` either, which
puts it at the back of a `validates`-first read order and then into the bottom band by the shortcut.
Two ways to lose the same test; reading it first closes both.
