# Overrides, lane by lane

Which override each lane takes, what it is called on each surface, and what it
does not do. The lanes, the defaults that matter to a launch, and every bound
live in `SKILL.md`; this file is the crosswalk.

Read a flag's availability from `--help` rather than from this table. Flags ship
independently of version numbers, and a table is a snapshot of one build.

## Availability

`run` is a local run, `run-cloud` is tests in the cloud, `deployments create` is
a deployment event. The MCP column names the parameter where a tool exposes the
override; which tool exposes which is read from that tool's own input schema, not
from this column.

| Override | `run` | `run-cloud` | `deployments create` | MCP |
|---|---|---|---|---|
| Workspace | `-w` | `-w` | `-w` | `workspaceId` |
| Application | `-a` | `-a` | `-a` | `applicationId` |
| Environment | `-e` | `-e` | `-e` | `environmentId` |
| One URL binding | no | `-d` | no | `deploymentId` |
| Application URL | `--url` | `--url`, `--app-url` | `--url`, `--app-url` | `urlOverride` |
| API URL | no | `--api-url` | `--api-url` | `apiUrlOverride` |
| Credentials | `--credentials-id` | `--credentials-id` | no | `credentialsId` |
| Basic auth credentials | `--basic-auth-credentials-id` | `--basic-auth-credentials-id` | no | `httpAuthCredentialsId` |
| One DataTable row | `--scenario-id` | no | no | check the tool schema |
| Every DataTable row | `--data-table-id` | no | no | check the tool schema |
| mabl branch | `--mabl-branch` | `--mabl-branch` | `--mabl-branch` | `branch` |
| Only tests changed on that branch | `--branch-changes-only` | `--branch-changes-only` | no | no |
| Browsers | no | `--browsers` | `-b` | `browsers` |
| Code revision | no | `--revision` | `--revision` | `revision` |
| Test labels | `--labels`, `--exclude-labels` | `--labels`, `--exclude-labels` | no | no |
| Plan labels | no | no | `-l` | `planLabels` |
| Tests from a plan | `--from-plan-id` | no | no | no |
| Publish results to the app | `--reporter mabl` | not applicable | not applicable | not applicable |
| Billable features | `--allow-billable-features` | runs as authored | runs as authored | runs as authored |
| Unattended | `--headless` | `--no-prompt` | `-o json` implies `--silent` | not applicable |
| Block until done | the command blocks | no | `--await-completion` | no; poll |
| Locale, timezone | `--locale`, `--timezone-id` | `--locale`, `--timezone-id` | no | no |
| Browser size | `--width`, `--height` | no | no | no |
| HTTP headers | `--http-headers` | `--http-headers` | `--http-headers` | `httpHeaders`, single cloud run only |
| Inherit a prior run's whole target | `--run-id` | no | no | no |
| Interaction speed | `--interaction-speed` | no | no | no |
| User agent | `--user-agent` | no | no | no |
| Artifacts directory | `--artifacts-dir` | no | no | no |
| Browser extensions | `--enable-browser-extensions` | no | no | no |

## What an override does not do

`SKILL.md`'s **Overrides** carries the two rules that bind every lane: pin the
whole target before dispatch, and an environment on its own does not change the
URL. The rest are per-override.

**An application plus an environment resolves the URL by matching a
deployment**, and can match more than one. Where it does, pass `-d` on the cloud
lane, or `--url` on either, and nothing starts until one of them picks. Two
failures here start nothing and both say so in text: one for an
application-environment pair that matches no deployment, and one for a test with
no default URL when neither the flags nor the test's own saved URL supply one.

**A URL override does not move the browser's workspace.** Where a run writes
data, the credentials decide which workspace receives it. No flag changes that.

**`--override-environment-id` on a deployment event does not select plans.** It
requires `--application-id`, and it changes what the matched plans run against,
never which plans match.

**`--revision` does not select anything.** It labels the event with the commit
under test, which is what makes that event findable afterwards.

**`--branch-changes-only` narrows to tests edited on the branch.** A test with no
edits on that branch runs its master version when the branch is passed without
this flag, so passing the branch alone costs nothing for the rest of a set.

**A run started from `--run-id` inherits that run's whole target** — URL,
environment and credentials together. Pin the target explicitly even then, or a
run believed to be local ends up aimed wherever the source run pointed.

## Choosing a surface by what it can bind

Two overrides exist on one surface only, and between them they decide which
surface a cloud run takes:

- **Test labels are CLI-only.** `run_mabl_test_cloud` takes one test id; there is
  no label parameter on any MCP run tool.
- **A DataTable binding on a cloud run is MCP-only.** `mabl tests run-cloud` has
  no DataTable flag, so the row can be bound locally or through the MCP tool, and
  not through the cloud CLI command.
Everything else overlaps closely enough that either surface serves.

## Custom HTTP headers

Both surfaces carry them for a single run: `--http-headers` on the CLI as
space-delimited `name:value` pairs, `httpHeaders` on `run_mabl_test_cloud` as
`{name, value}` objects. What differs is reach. The CLI has the flag on a local
run, a cloud run and a deployment event; on MCP only the single-test cloud run
takes it, so a set, a plan, a re-run and a deployment event through MCP cannot
carry one.

`--http-headers` is the one cell in this table that differs between builds that
all meet the floor: `tests run` and `deployments create` carry it, `run-cloud`
carries it on some builds and not others. SKILL.md's cloud lane ships the probe.
It is also why this file's availability column is read from `--help` rather than
trusted: the version on the machine is not the version that shipped.

Header values are run-scoped and are not stored on the test. They are kept out of
the run output log, and the result echoes back the header *names* only. Report the
names; never echo a value back to the caller, and never put one in a run record.

## A set dispatched as one cloud run

`run_mabl_test_batch_cloud` takes `workspaceId`, `environmentId`, `applicationId`
and `browsers` as required, and `branch`, `credentialsId`, `deploymentId` and
`urlOverride` as optional — the same overrides as a single cloud run, applied to
every test in the set.

It adds two of its own: `concurrency`, which is `parallel` or `sequential`, and
`concurrencyLimit`, which caps how many run at once and is ignored when the
concurrency is sequential.

It takes none of these: test labels, a DataTable or scenario, basic auth
credentials, a code revision. `urlOverride` here replaces the deployment's URL for
every test in the set, as the web URL for browser and performance tests and as the
API base URL for API tests.

## Ids the overrides take

Each override takes the id of the entity it names, verbatim as the API returned
it: application `*-a`, environment `*-e`, plan `*-p`, test `*-j`, credentials
their own id. No computation turns one into another, so a derived id is a
different entity's id that happens to look plausible, and it surfaces as a
permission error rather than as anything that says "wrong id".
