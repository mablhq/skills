# Changelog

All notable changes to the `mabl` plugin are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Version numbers match
the `version` field in `plugin.json` (kept in sync across all manifests — see
`CLAUDE.md`).

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
