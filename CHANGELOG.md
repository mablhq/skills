# Changelog

All notable changes to the `mabl` plugin are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Version numbers match
the `version` field in `plugin.json` (kept in sync across all manifests — see
`CLAUDE.md`).

## [1.7.0] - 2026-08-27
### Added
- `mabl-onboarding` skill — onboarding for a brand-new or empty workspace, the
  step before `mabl-init` has anything to record. Interviews you about what you
  ship and what needs verifying, discovers your repo — including related repos
  elsewhere on the machine, which is where the full list of environments usually
  lives — then builds out the parts of the workspace a command can build:
  environments, deployment URL rows, in-product agent instructions, mabl
  branches, a CI deployment trigger. Every write is drafted and applied only on
  an explicit yes, and everything with no product surface is recorded as durable
  team policy instead.
  Tests, DataTables and plans are deliberately *not* built here — each is a
  decision with an owner, so each gets a question instead: what is worth testing
  before anything is authored, and how tests should be grouped before any plan
  exists. Plans group by product module rather than test tier, adopt an existing
  taxonomy (tracker components, an existing test-case folder layout) when the
  team has one, and are never scheduled. Another workspace is never read without
  asking.
  States plainly what no agent can create (a workspace, a Link agent) and what
  the CLI cannot create but the `mabl` MCP server can (applications,
  credentials, plans), so a tooling gap is never reported as an impossibility.
  Hands project-local persistence to `mabl-init` rather than writing memory
  files itself, and can also be entered mid-workflow by another skill that finds
  the workspace missing an application, environment or credential — it fills
  only the gap and hands the ids back.

### Changed
- `mabl-onboarding`'s credential gate now reads `require_cloud_only_credentials`
  off `mabl workspaces describe` instead of asking about it. The key is omitted
  when the policy is off, so an absent key means off rather than unknown.
- `mabl-onboarding`'s credential gate now settles the credential *type* rather than
  just the name. mabl has four (Basic, Basic with MFA, Cloud, Cloud with MFA), the
  type is fixed at creation, and cloud credentials cannot be used for local
  training or local runs — so the gate asks about MFA and local execution, points
  at `Configuration > Credentials`, and reads the stored type back because a
  workspace-level "require cloud credentials" policy is enforced in the API and can
  override what was asked for. It also no longer asks whether credentials are
  per-environment: they cannot be, and environment variables are the answer.
- `mabl-onboarding` now re-derives drafted content from the source before the gate
  that writes it, scopes "I read this" claims to what was actually checked, and
  verifies an intended absence rather than only a presence. A live run drafted an
  agent instruction listing nine repo selectors as read; eight existed, and the
  ninth was pattern-completed after a truncated grep.
- `mabl-init` now routes to `mabl-onboarding` when the workspace it discovers has
  no applications or environments, instead of ending on "this workspace isn't set
  up for testing yet". Its description says the same, so the two skills no longer
  compete for "set up mabl" on an empty workspace.

## [1.6.1] - 2026-08-25
### Changed
- `mabl-test-edit`'s description now fits the 1024-character budget every skill
  matcher reads. It was 1201, and Codex truncates at 1024 mid-word, so the
  boundary clause — that a just-authored test's validation gap is the authoring
  skill's decision, and this skill should take the specifiable fixes it routes
  over because a structured step edit is instant and can't delete anything —
  was being cut off before any matcher saw it. Scope and sibling routing are
  unchanged; one redundant trigger phrase was dropped.
- Every skill that routes you to a sibling skill now checks the sibling is there
  first. A skill can be installed on its own, so "route this to
  `mabl-test-edit`" was a dead end for anyone who installed only the skill they
  were reading. The two places it happens — test authoring to test edit, and
  coverage design to test authoring — now declare it with **Requires
  `<name>`** and say which skill is missing when it isn't there, so you find out
  from the skill rather than from it quietly doing nothing.
- Three places named a sibling skill where nothing actually routes there:
  `mabl-test-coverage-design` explained which Chrome `chrome-for-mabl` attaches
  to by naming the skill that uses it, `mabl-test-edit` compared writing a
  `test_case` to writing one for the authoring skill, and it cited `mabl-init` as
  the source of a saved workspace it reads out of agent memory either way. All
  three now say the thing itself.
- `mabl-test-edit` no longer names mabl's internal feature flags when it explains
  which edit lanes a workspace has. The flag names were never usable: the skill
  says two lines later that an agent can't read a workspace's flags and has to
  judge a lane by whether its tool is in the tool list. What that column was
  really carrying — the lanes are gated **independently**, so one being closed
  tells you nothing about the other — is now said outright, and the observable
  signals (the tool list, the "contact mabl support" error) are unchanged.
- `mabl-debug`'s fix-and-retry cycle no longer tells you to rebuild the mabl CLI
  from a script in a repo you don't have. For an app-code fix the thing to
  rebuild is the app under test, and the reason to start a fresh session is an
  upgraded CLI — both now say so.
- The Cursor install notes no longer promise that the CLI installer will pick up
  `chrome-devtools` later. The caveat that matters is unchanged: `mabl agent
  install cursor` wires up two of the three MCP servers, so add the third by
  hand.
- Four more places described mabl's internals rather than what you can see.
  `mabl-debug` said a payload is absent on "TRA-recovered" runs — the status you
  actually get is `recovered`, from Runtime recovery — and branched its step-id
  guidance on whether a flow has persisted `json_steps` ids, which nothing you
  can run reports; that branch is now the observable one, comparing the two id
  strings before copying. `mabl-test-coverage-design` told you to open a test
  with `get_test_definition`, which is the cloud planner's own tool, not yours;
  it now points at `mabl tests export`. And `mabl-test-edit`'s escape-hatch note
  no longer says "preview flags off".
- Runtime recovery is gone from the skills — the feature, the `recovered` status
  it left behind, and the recovery session id. It's sunset, so explaining it costs
  every reader something to serve the shrinking few opening a run old enough to
  carry it. Nothing is stranded: the triage recipe no longer depends on knowing
  the status list at all. It selects any step that isn't passed or skipped — so it
  still finds a recovered step without naming one — and stops loudly when there's
  nothing to triage, instead of quietly passing an empty step id to three artifact
  calls the way it briefly did.
- The skills validator now has tests, and it needed them: the description budget
  it enforces was passing a 2789-character description clean, because a blank
  line inside a plain scalar ended the measurement instead of folding into it. A
  CRLF checkout also made every valid file report as having no frontmatter. The
  reader moved to `.github/scripts/lib/frontmatter.mjs` so its folding rules can
  be tested without running the validator, and CI runs those tests first.
- The validator no longer trusts a folder name. A skill directory is
  PR-author-controlled on a public repo and its name was compiled straight into a
  pattern, so `evil(((` crashed the run before any finding printed and `(a+)+$`
  backtracked past the six-hour job default. Names are now checked and escaped,
  symlinks and vendored trees are skipped, an empty skills directory fails
  instead of reporting "All 0 skills are valid", and the workflow runs read-only
  with a ten-minute bound.
- "mablscript" is gone from the skills. It named the step format in three places
  where the reader only ever sees the consequence — a `legacy_unsupported` flow
  the structured lanes can't edit, or an export mabl refuses — so those now say
  that instead.

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
