---
name: mabl-coverage-mapper
description: >-
  Export a mabl test suite and map what it actually covers — which
  applications, pages/routes, user flows, and API endpoints are exercised — then
  surface coverage gaps and recommend what to build next. Uses read-only mabl CLI
  exports; Claude does the analysis. Use when someone asks to
  "export our tests to analyze coverage", "what does our suite cover", "where are
  the coverage gaps", "what tests should we build next", or "map our test
  coverage".
allowed-tools: Bash
---

# mabl Coverage Mapper

Answers the question a mabl user raised directly: *"How do I get my tests out of
mabl so I can analyze them for app coverage and figure out what else I need to
build?"* It exports tests via the CLI, has Claude parse the steps, and produces
a coverage map + gap list. Every command is read-only, so it is safe to run in
locked-down or regulated environments.

## When to use

- "Export our tests and analyze coverage."
- "What parts of the app are/aren't covered?"
- "What should we build next?" / "Where are the gaps?"
- Preparing a coverage review for leadership.

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.118.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth info    # verify you're logged in (run `mabl auth login --auto` if not)
```

This skill only **reads**. If your account supports scoped API keys, a
**read-scoped** key is sufficient (and recommended for regulated environments) —
nothing here creates, edits, runs, or deletes. If `tests list` returns 0 rows,
stop and say so — don't report empty coverage as real.

**Output:** write dumps, exports, and the final report under `./mabl-reports/`
(create it; add it to `.gitignore` if you're in a repo). Report:
`./mabl-reports/coverage-map-<workspace>-<date>.md`.

**Inputs (ask if not given):**

- `workspace_id` (`-w`).
- Optional `labels` to scope the export (recommended for large suites).
- **Optional but powerful — a reference of what *should* be covered:** the
  app's sitemap / route list, an OpenAPI/Swagger spec, or a list of critical
  user journeys. With it, gaps are concrete (route X untested). Without it, the
  skill infers structure from what tests touch and flags thin areas.

## Hard rules

- **Read-only.** `list` + `export` only. You compute the coverage map.
- **Beat the default limit** (`--limit 5000+`) on `list`.
- **Truncation guard.** `tests list`/`plans list` have only `--limit` (no cursor). If a
  `list` returns exactly `--limit` rows the set is **truncated** — headline the map
  **"PARTIAL — computed on first N"** and scope by `--labels` to get under the cap.
- **Export format:** `tests export` uses `--format`/`--fmt` (not `-o`). Use
  `json` or `yaml` for step analysis. `playwright`/`side` need browser tests;
  `postman` needs API tests; default/perf tests can't export.

## Procedure

### Step 1 — Inventory

```bash
WS="<workspace_id>"
mkdir -p ./mabl-reports   # working dumps + final report live here (gitignore in a repo)
mabl tests list  -w "$WS" --output json --limit 5000 > ./mabl-reports/tests.json   # id, name, enabled, created_time, last_updated_time (+ --labels)
mabl plans list  -w "$WS" --output json --limit 5000 > ./mabl-reports/plans.json   # id, name, application_id, labels, created_time
```

`plans.json` gives the `application_id` grouping that `tests list` lacks — use
it to organize coverage by application.

### Step 2 — Export tests for step analysis

Export each test (or a labeled subset / a sample if the suite is huge — say so):

```bash
mkdir -p ./mabl-reports/export
mabl tests export <test_id> --format json --file ./mabl-reports/export/<test_id>.json   # resolves by test id; no -w
```
Exported test JSON contains app URLs, selectors, and step data — handle per your
data policy and delete it when no longer needed.

The JSON is `{ id, name, description, steps[] }`. Each entry in `steps[]` is an
object **keyed by its action type**, e.g. `{"VisitUrl": {…}}`, `{"Click": {…}}`,
`{"SetViewport": {…}}`, or an assertion step (a key beginning with `Assert…`). Parse
each test for coverage signal:
- **URLs / routes** visited — the `VisitUrl` steps carry the destination URL (the
  primary route-coverage signal).
- **User flows** (the sequence: login → search → checkout, etc.).
- **UI surfaces** touched (pages, key components/selectors).
- **API endpoints** exercised (for API tests / API steps: method + path).
- **Assertions** made (what's actually verified vs. merely visited).

### Step 3 — Build the coverage map

Aggregate across tests into a matrix:

```
application → { routes/pages covered, flows covered, endpoints covered,
                assertion depth (verified vs. just-visited), #tests }
```

Deduplicate (many tests hit the same login route). Note where a route is
*visited but not asserted* — that's shallow coverage, a gap in disguise.

### Step 4 — Find gaps

- **With a reference** (sitemap / OpenAPI / journey list): diff covered vs.
  reference → list untested routes/endpoints/journeys, ranked by criticality.
- **Without a reference:** flag (a) apps/areas with few or zero tests relative
  to peers, (b) routes visited-but-not-asserted, (c) flows that stop before a
  critical outcome (e.g. add-to-cart tests that never assert checkout), (d)
  error/edge paths absent (only happy paths covered).

### Step 5 — Report + hand back the export

```
# Coverage Map — <workspace/app>

## Coverage by application
| application | routes covered | flows | endpoints | asserted vs visited | #tests |

## Gaps / what to build next (prioritized)
1. <untested critical route/flow/endpoint> — why it matters, suggested test
2. <shallow coverage: visited-not-asserted route> — add assertion
...

## Shallow coverage (visited, not verified)
- ...

## Notes
- Scope of export (all / labeled / sampled), reference used (yes/no).
```

The raw export JSON under `./mabl-reports/export/` is theirs — the user asked to
get tests *out* of mabl to analyze further or diff over time. It contains app
URLs, selectors, and step data; handle per your data policy and delete it when no
longer needed.

## Caveats

- This is **behavioral coverage** (what the suite exercises), not **code
  coverage**. Say so. It answers "are our journeys/endpoints covered", not "what
  % of lines run."
- Without a reference route/endpoint list, "gaps" are relative (thin vs. peers),
  not absolute. Push for a sitemap/OpenAPI/journey list to make gaps concrete.
- For very large suites, sampling the export is fine — **state the sample** and
  offer to widen.
