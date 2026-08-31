# Getting cases out of a tracker

Mechanics for the export step. The decision about *which* route to take is in
`SKILL.md`; this file is what each route actually produces and where each one
loses something.

Every route ends in the same four columns: **source key**, **summary**,
**steps/description**, **grouping**. Read one exported row before exporting a
thousand.

## Jira, CSV export

A JQL search, exported from the issue navigator. Two export shapes exist and
they are not equivalent:

- **"Export Excel CSV (current fields)"** gives the columns visible in the
  current view. If Description is not one of them, it is not in the file, and
  the file still looks complete.
- **"Export Excel CSV (all fields)"** gives every field, including Description.
  It is wider and messier, and it is the one to use.

What the shape costs you when you read it back:

- Multi-line descriptions are quoted and contain literal newlines *inside* a
  field. A line-by-line parser splits one case into several rows. Parse it with
  a real CSV reader, not by splitting on newlines.
- Jira wraps long text and emits **repeated columns of the same name** for
  multi-valued fields (several `Comment` columns, several `Labels` columns). A
  parser that maps header to value keeps only the last one.
- Description arrives as wiki markup or ADF-flavoured text, not prose. Panels,
  code blocks and `{color}` macros survive as literal markup. Strip them before
  they reach a prompt; markup in a prompt reads as instructions about
  formatting.

## Jira, REST

The repeatable form of the same query.

```bash
curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" \
  --get "https://your-domain.atlassian.net/rest/api/3/search" \
  --data-urlencode 'jql=project = PROJ AND type = Test ORDER BY created DESC' \
  --data-urlencode 'fields=key,summary,description'
```

Two things about the response:

- It **paginates**, and the default page is small. Read `total` against how many
  issues you got and page with `startAt` until they agree. A silently truncated
  first page is the most common way a backlog import comes out short.
- On API v3, `description` is **Atlassian Document Format** — a nested JSON
  document, not a string. Walk it for text nodes. A naive `.description` read
  gives `[object Object]` for every case, which then reaches the generator as
  the entire test intent.

Never build the JQL by concatenating user input into the string. Pass it as a
parameter, as above.

## Xray

**This is the trap worth knowing.** Xray keeps manual test steps in its own
**Manual Test Steps** grid — a custom field with its own storage — not in the
Jira description. A Jira export of an Xray test therefore returns the summary
and an empty or near-empty description, for every row, without erroring.

A thousand rows of title-only look exactly like a successful export. The tell is
mechanical: **count the rows whose description is empty.** If that number is
large, stop and export from Xray instead.

Export from Xray, where the step rows come with the case:

- Xray's own **Export to CSV** on a test-repository or test-set view includes
  the step grid, flattened to one row per step with the test key repeated. Group
  by key and concatenate the step rows in order to rebuild one case.
- Columns are typically `Test Key`, `Action`, `Data`, `Expected Result`. `Action`
  is the step, `Data` is the input to use, `Expected Result` is the verification.
  That maps cleanly onto the prompt elements: `Data` becomes the concrete values,
  `Expected Result` becomes the on-screen verification.
- A **Test Set** or **Test Plan** is the natural grouping column.

Xray also has a REST API for tests and their steps. Use it for the same reason
as Jira's: repeatability.

## TestRail

There is no TestRail integration. CSV export is the lane.

TestRail's export columns vary by the case template a project uses, so read the
header row rather than assuming. The two common templates map like this:

| TestRail column | Maps to | Note |
|---|---|---|
| `ID` (`C4471`) | source key | Keep the `C` prefix. It is what the team searches on, and it is what goes in the test name. |
| `Title` | summary | |
| `Section` / `Suite` | grouping | Usually the best available feature area. |
| `Preconditions` | prompt preamble | Often carries the "who it runs as" element. |
| `Steps` (**Text** template) | steps | One free-text field. |
| `Steps Separated` (**Steps** template) | steps | Repeats per step, alongside `Expected Result`. Group and concatenate, as with Xray. |
| `Expected Result` | the verifications | The highest-value column in the file — this is what becomes assertions. |
| `Priority`, `Type`, `Automation Status` | triage input | `Automation Status` often already records what the team gave up on. Read it before sorting. |

Names carrying a `C` id (`C4471 Alert dialog accept path`) are the signal that a
backlog originated in TestRail even when the file came from somewhere else.

## A plain spreadsheet

The most common real input, and the one with no schema. Someone's tab of test
cases, with columns nobody designed for this.

Do not guess the mapping. **Show the user the header row and the first two data
rows, say which column is being read as what, and let them correct it** before
anything is generated. A wrong steps column is not visible until every generated
test is wrong in the same way.

Three shapes that appear repeatedly:

- **One row per step**, with the case title merged or repeated down a column.
  Group by the title column and concatenate.
- **Steps as a numbered list inside one cell**, with embedded newlines. Read it
  as one field; the numbering is fine to keep.
- **Expected results in a separate column from the steps.** This is the good
  case — that column is the verification list, and it is what Step 3 needs most.

An empty grouping column is not a blocker. Group by whatever *is* there — a URL
column, a page name, the first word of the title — and say what was used.
