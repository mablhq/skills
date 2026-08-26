# Changelog

All notable changes to the `mabl` plugin are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Version numbers match
the `version` field in `plugin.json` (kept in sync across all manifests — see
`CLAUDE.md`).

## [1.7.0] - 2026-08-26
### Added
- `mabl-compare-versions` — answers "what changed in this test or reusable flow"
  and stops there. It reports the difference as a classification split by whether
  behaviour actually changed: steps added, removed, changed and moved; assertion
  counts per type; strictness moving (an exact match becoming a substring, a value
  emptied, a step disabled); data-binding changes; date literals; description
  rewrites. It requires no other skill and is built to be called by them: the
  verdict is left to whoever holds the intent behind the edit.
- **Two normalization gates run before anything is counted**, because both change
  what the counts mean. `description` and `annotation` are server-rendered and
  drift from the step body, so a version can report many changed steps that
  changed no behaviour. And a step that left its position has four possible
  causes, only one of which is deletion.
- **A removed step is never assumed deleted.** It may have moved (matching step
  id), had its id regenerated, been part of a flow-invocation id migration, or
  been extracted into a reusable flow. On real diffs, platform churn presented
  as deletions outnumbered genuine moves several times over.
- **Extraction into a reusable flow gets its own resolution path**, because it is
  the most destructive-looking change that removes nothing and it produces no
  added step to pair against: the existing step group *becomes* the flow
  reference, keeping its id, so a seven-assertion refactor reports as seven
  removals and one change. Step identity survives extraction, so matching the
  removed ids inside the flow resolves it exactly — provided the flow is read on
  the branch it was created on. Read on the default branch it comes back empty,
  which looks like a confirmed catastrophe rather than a wrong lookup.
- Separates nonfunctional classes the counts hide: regrouping (one added group
  header, children untouched), marker steps, and binding changes that only alter
  representation. Notes the asymmetries — a removed `Echo` is evidence where an
  added one is noise, and a group header embeds its own step count so any change
  inside it churns the header too.
- States what the diff cannot see rather than implying otherwise: who changed it
  (no version carries an author), whether the test is enabled, what a nested flow
  did, and run results. A metadata-only edit creates no version at all.
- States what changed and which way, without a verdict in the vocabulary. An
  assertion going from an exact match to a substring is reported as less strict,
  because that is a fact about the step; whether it was wanted depends on what
  was asked for, which this skill does not know.
- Assertion analysis works by diffing the two step descriptors and reporting
  **every** field that differs, minus a short exclusion list with a stated reason
  per entry: server-rendered commentary, step identity, the execution-inert
  `condition.attribute`, and a field absent versus set to its own default. That
  is complete by construction, so it covers step and condition types this skill
  has never heard of — where any list of fields worth checking, or of ways a test
  can get worse, is only as complete as whoever wrote it.
- Two effects are called out because the field name doesn't reveal them.
  `onFailure` switched to `continue` leaves an assertion that still appears,
  still runs, and stops failing the test. And a prose condition has no operator
  at all — an `ai_prompt` holds its whole requirement in `userPrompt`, `truthy`
  holds none, so both are reported by quoting the texts rather than by ranking.
- Movements off the one defined axis are said plainly instead of forced onto it:
  a positive operator becoming its negation is **inverted**, not looser;
  `AssertStartsWith` ↔ `AssertContains` is **lateral**; a changed target is
  **rescoped**. Anything else is reported with its field and both values and no
  invented rank.
- A description-only change is reclassified, not suppressed: it is reported with
  its step numbers and both texts, and the report says the diff carries no signal
  for whether a person wrote it or the platform regenerated it.
- Captured diffs and the written report go to the CLI's own `.mabl/` cache, and
  the skill guarantees that directory is ignored rather than assuming it: the
  root `.gitignore` entry for `.mabl/` is written by `mabl agent debug`, so in a
  repo where only `compare` has run it is absent. A `.gitignore` of `*` inside
  `.mabl/` covers the tree including itself and edits no tracked file.
- The report gains an **Unclassified** section for real changes that fit no
  class, so nothing is dropped or force-fit — the caller is owed every change,
  not only the ones this skill has a name for.
- Notes two facts about step ids that Gate B depends on: steps written by hand
  through the step-edit tools carry no id at all (agent-authored ones do), and
  `mabl tests export --format json` drops ids entirely — so an export can count
  assertions but never resolve a removal.
- Works over the mabl MCP server or the CLI — the diff is byte-identical on both.
  The MCP lane needs nothing installed, so the CLI prerequisite is marked as the
  CLI lane's alone rather than opening the skill unconditionally. On the CLI-only
  lane the extraction check is corroborated rather than closed: `mabl flows
  export --mabl-branch` does read a flow on a branch, but the export carries no
  step ids, so it shows the flow is non-empty without proving which steps are in
  it. The CLI also cannot date a version or list a flow's versions, so unresolved
  removals are reported as unresolved rather than as deletions.

## [1.6.0] - 2026-08-19
### Changed
- `mabl-test-coverage-design` now schedules the fan-out itself instead of
  authoring every test one after another. The copy graph it already builds says
  what each test is waiting for, so the skill reads it as waves: the central
  anchor first, then everything whose parent has landed, and so on. A suite's
  wall-clock becomes the number of waves rather than the number of tests.
  Deciding this is no longer the user's job — "one at a time" and "all at once"
  remain as spoken overrides.
- Wide waves bring their own failure modes, so the skill now bounds them: a wave
  ends once every session in it is terminal, paused on a question, or wedged, and
  a wave that comes back with several failures at once gets re-run one at a time.
  A wave wider than the workspace's concurrent-session cap isn't one of those
  failures — those sessions queue and are admitted as slots free, so the skill
  waits for them instead of relaunching and authoring the same test twice. The
  wait is bounded rather than the session: if the queue is mostly work the suite
  didn't launch, the skill stops waiting, reports those tests as still queued,
  and leaves the sessions running for the user to pick up. Width also provokes
  `skipped` — what a dedupe gate returns when several near-identical intents go
  out together — so the skill calls that out and re-runs the intent alone. Which status is terminal stays `mabl-test-authoring`'s to say.
- Polling a wave now reads each session's own `status` instead of listing the
  workspace. `list --status all` pages through every authoring session the
  workspace has ever run, and it returns neither the created-test id nor a paused
  session's question — the two things the next step needs. `list` keeps its real
  job, sweeping for sessions left waiting on an answer, and gains two more: it's
  how the skill measures how deep the rate-limit queue is, and how it checks
  whether a launch that errored actually created a session before retrying it —
  a blind retry would author the test twice.
- Both skills now say that the short `status` output carries the created-test id
  only for `completed`, `failed`, and `terminated`. A session that stops any
  other way, such as `merged`, needs `--verbose` to report its id, and without it
  a test that was authored looks like one that never got built.
- `mabl-test-authoring` now sorts the session statuses it didn't previously name.
  It no longer gives up on a `rate_limited` session after 20 minutes — that
  status is a queue, not a fault, so the skill keeps polling rather than
  abandoning a run that was still going to start. And `skipped`, `merged`,
  `accepted`, and `closed` are called out as terminal, so a session that already
  stopped no longer reads as an unrecognised status waiting out the wedged clock.

## [1.5.1] - 2026-08-19
### Removed
- `mabl-debug` no longer points at `get_runtime_recovery_session`. Runtime
  recovery is retired and that MCP tool no longer exists, so the skill was
  telling agents to call something that would fail, and describing the tool's
  output as their strongest signal for the fix. Guidance for reading an older
  run that did recover is kept — those runs still carry the `recovered` status,
  and a recovered step is debugged the same way as a failed one. The id table
  also no longer claims `*-as` means Runtime recovery specifically; it is any
  mabl agent session.

## [1.5.0] - 2026-08-19
### Added
- `mabl-test-coverage-design` now plans a **copy graph** before it authors
  anything: it groups the designed tests by the path they walk, authors one
  anchor per group, and has every other test copy from whichever test in its
  own group is closest to it, rather than from the suite's first test. A test
  that only changes the ending of the test before it starts from that one, so
  it inherits the setup that was already worked out. The graph is shown up
  front and recorded in the design doc, and if a source fails to author, the
  tests below it fall back toward their anchor instead of being skipped.
  Because a copy also inherits the step that names the subject the test later
  deletes, the skill now checks that the source generates that name rather
  than hard-coding it.

## [1.4.0] - 2026-08-10
### Fixed
- A cloud authoring session that stops to ask a question no longer strands the
  skill that launched it. `needs_attention` isn't a terminal status, so both
  authoring skills used to poll a session that would never move again while the
  question sat unanswered in the web app. `mabl-test-authoring` now reads the
  pending question and answers it when the answer is something it already
  knows — which credential, app, or environment the intent asked for — and
  surfaces it to you when it isn't, rather than guessing. In
  `mabl-test-coverage-design` this mattered more than it looked: authoring is
  serial, so one unanswered question meant no later test in the suite was ever
  authored. A paused test is now reported with its question instead of quietly
  blocking the fan-out.
- Polling an authoring session no longer runs forever on a status it doesn't
  recognise. A session stuck on the same non-terminal status for 20 minutes is
  reported as wedged, naming the status, rather than being waited on
  indefinitely.

## [1.3.0] - 2026-08-07
### Added
- `mabl-test-coverage-design` now validates the tests it authors instead of
  stopping at the links. Each test is checked against the intent it was built
  from — assertions actually present, actually run, actually passed — and the
  suite is reported in three states: authored + validated, authored but
  unverified (with what didn't match), and authoring failed. One test failing
  validation doesn't stop the others.
- Copying an existing test in `mabl-test-coverage-design`: when the workspace
  already has a test that's nearly the one you need, seed from it and describe
  only what differs, rather than authoring it from scratch. The fan-out step
  makes that choice per test: a test that walks the same path as one already
  authored copies from it — inheriting its assertions and variable setup with
  their trained element finds — and only a test that walks a different path
  falls back to referencing.

### Changed
- `mabl-test-coverage-design` now requires mabl CLI 2.124.30 (was 2.111.0) for
  the commands the validation step uses.

## [1.2.0] - 2026-08-04
### Added
- `mabl-test-edit` skill — change a test that already exists. It routes each
  edit to the cheapest lane that can make it deterministically: metadata
  (rename, labels, enable/disable), structured step edits
  (replace / insert / delete / move, no browser), or a live cloud authoring
  agent when the change needs to look at the running app. Handles shared
  reusable flows (blast-radius review before you commit), branch-aware writes
  with a confirmation before touching the default branch, and honest
  degradation when the authoring preview isn't enabled for the workspace.
- `mabl-test-authoring` now checks the test it built. After a session
  completes it reads the test's steps back and compares them to the intent it
  was given, and reads per-step pass/fail from the validation run the agent
  already reported — so nothing has to be re-run. On a mismatch it offers to fix
  the test, routing to `mabl-test-edit`'s structured-step lane when the edit can
  be named exactly (instant, and it can't delete a step) and only opening a cloud
  session when the fix needs the running app. Either way it diffs the versions
  afterwards, so a fix can't go green by dropping an assertion.

### Fixed
- `mabl-test-authoring` documented the authoring session's status field as
  `status` (it is `sessionStatus`) and implied `createdTestId` meant success.
  A test id is set on failed sessions too, so it never proved anything.

## [1.1.0] - 2026-07-27
### Added
- `mabl-init` skill — one-time project setup that discovers your workspace,
  applications, environments, and credentials over the `mabl` MCP server and
  writes them (with resolved deployment URLs and worked create/run examples)
  into your agent memory file, so later sessions can author and run tests
  without re-explaining the setup. Auto-detects the memory file per client
  (`CLAUDE.md` / `AGENTS.md` / Copilot instructions) and never stores secrets.

## [1.0.2] - 2026-07-15
### Changed
- `mabl-test-coverage-design` now defaults to authoring a suite **serially** —
  the central happy-path test first, then each later test referencing all the
  siblings before it — so the suite converges on one consistent shape.
### Removed
- The `seed` suite-strategy mode. `serial` already is the seed, so the hybrid
  mode was redundant; `parallel` remains for when speed matters more than
  consistency.

## [1.0.1] - 2026-07-10
### Added
- `chrome-devtools` MCP server, so `mabl-test-coverage-design` drives its own
  Chrome instance while exploring an app instead of sharing `chrome-for-mabl`
  (which stays reserved for `mabl-debug`'s attach-to-session use).

## [1.0.0] - 2026-06-29
### Added
- Cursor as a fourth install surface.
- OpenAI Codex as a fifth install surface.
- `mabl-test-coverage-design` skill.
### Fixed
- Stale CLI commands in `mabl-test-authoring`.
- Stale `MABL_API_URL` documentation removed from `mabl-debug`.

## [0.1.0] - 2026-06-22
### Added
- Initial release: `mabl` skills marketplace plugin for Claude Code, with the
  `mabl-debug` and `mabl-test-authoring` skills, the hosted `mabl` MCP server,
  and the `chrome-for-mabl` MCP server.
