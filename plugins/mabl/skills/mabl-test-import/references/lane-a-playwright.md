# Lane A — Playwright

`mabl tests import playwright` reads Playwright **trace files**, not source
code. Most of what follows is about getting the right traces to the importer.

## A1. Find the project root

The CLI looks for `playwright.config.ts` — that exact filename — in the
directory it runs in, and rejects a `.js`, `.mjs`, or `.cjs` config with "No
playwright project found" even from the correct root. A JavaScript Playwright
project cannot use the one-command route at all; go straight to A3.

## A2. Let the CLI run Playwright

```bash
mabl tests import playwright \
  --path "$PROJECT_ROOT" \
  --project chromium \
  --tests-path e2e \
  --grep "the one test title" \
  --workspace-id "$WORKSPACE_ID"
```

The CLI runs `npx playwright test --trace on` for the selected tests, then
converts the traces. Before running it:

- **Every selected test must pass.** Playwright exits non-zero if any fails
  and the import aborts. Narrow with `--grep`, or use A3.
- **It deletes the project's `test-results` directory first.**
- **`--project` writes a temporary spec into the repo.** To read the project's
  `baseURL` the CLI writes `<tests-path>/mablImportInfo.spec.ts`, runs it, and
  deletes it. Set `--tests-path` to the directory the Playwright tests
  actually live in — it defaults to `tests`, which in a repo with both
  `tests/` (unit) and `e2e/` (Playwright) drops the probe in the wrong place.
  If that run fails the file is left behind; check for it and remove it.
- **`--extra-arguments` cannot take a value starting with `--`.** It fails
  with "Not enough arguments following" and exits 1, so a script will catch
  it. It is rarely needed anyway: the CLI hardcodes `--trace on`, so the
  config's own `trace:` setting is irrelevant either way.

Pass the source suite's own environment through — a config reading
`process.env.BASEURL` needs that variable exported for the CLI's run too.

## A3. Or import traces you produced yourself

Required for a JavaScript config; also the route when some tests fail or the
run needs setup the CLI's invocation will not do.

```bash
npx playwright test e2e/favorites.spec.js --trace on
cp -R test-results /tmp/mabl-import-traces        # not optional — see below
mabl tests import playwright --traces-path /tmp/mabl-import-traces \
  --path "$PROJECT_ROOT" --project chromium --tests-path e2e \
  --workspace-id "$WORKSPACE_ID"
```

Two traps live here, and both fail quietly:

- **Traces are not always under `<--path>/test-results`.** Playwright resolves
  its output directory from the package root, so a config in a subdirectory of
  the npm package writes traces to the package root instead. The symptom is
  `ENOENT: no such file or directory, scandir '.../test-results'`. Find the
  real ones with `find . -name trace.zip -not -path '*/node_modules/*'`.
- **`--project` combined with `--traces-path` destroys the traces.** The
  `baseURL` probe runs before the traces are read and clears the default
  output directory first. Symptom: five traces in, `Found 1 test results`,
  `No tests were imported.` The copy above is what prevents it.

`Found N test results` counts directory entries, not tests — `.last-run.json`
is counted and skipped. Trust `Imported N steps` and the saved test id.

## A4. Two reasons an imported test fails on its first run

Both are correctness problems, both survive a clean `Import complete.`, and
they fail at different steps — so check for both.

**No navigation step.** The converter emits a Visit URL step only when the
Playwright trace carries a `goto` URL. A source test that navigates with
`page.goto('')` and leans on the project `baseURL` produces a test whose
first step is an element interaction. The flow's URL is metadata; it does not
navigate. The run then starts at `about:blank` and step 1 fails with "Element
not found" — the step debug output shows `url_before: about:blank`, which is
how to tell this apart from a selector problem. A source test that calls
`page.goto('<url or path>')` gets a proper `Visit URL {{@web.defaults.url}}`
step and is fine.

**Playwright locator syntax that CSS cannot resolve.** The converter rewrites
Playwright's internal locators into CSS by string-stripping the prefix, which
leaves Playwright's match-mode flag inside the brackets. Which locator API the
source test used decides whether that survives:

| Source locator | Becomes | Runs? |
|---|---|---|
| `page.locator('.new-todo')` | `.new-todo` | yes |
| `getByPlaceholder(...)` | `[placeholder="What needs to be done?"i]` | yes — `i` is valid CSS |
| `getByTestId(...)` | `[data-testid="todo-title"s]` | **no** — "the assertion target was not found" |
| anything chained, `.nth()`, `.filter()` | `internal:testid=[data-testid="todo-item"s] >> nth=0` | **no** — `>>` chains skip normalization entirely and keep the `internal:` prefix |

Grep the source suite for `getByTestId` and for chained locators before
importing; that count predicts how much of the result will be broken.

**Two fixes, and neither of them happens here.** Without `--auto-save` the CLI
offers four choices — **Run test to activate auto-heal**, View, Save, Discard —
and that run is the only CLI path that rewrites these locators. It needs a TTY,
so it cannot be scripted, and this skill has not verified what it produces. The
other is to `--auto-save` and repair the selectors afterwards, which needs no
TTY. That repair is a selector rewrite, and `SKILL.md` Step 6 routes it.

Either way, never leave an unrepaired import enabled: label it (`imported`,
`unhealed`), disable it, and say why in the description, so it stays out of
plans and quality metrics until the repair or the auto-heal run has been done.
