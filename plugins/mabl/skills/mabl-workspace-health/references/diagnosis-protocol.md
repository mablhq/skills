# Root-cause protocol for one test

Run these in order. Each step is here because skipping it produces a wrong answer.
A full pass on one test takes real time, and the value sits in the steps people
skip.

## 1. Read the test and its plans

`get_mabl_test` with `includePlans: true`. Record every plan, whether it is
enabled, and any brand or region its name encodes. A test running in fifteen
brand and region cells is fifteen experiments, not one.

## 2. Split the pass rate by cell

`get_test_quality_report` once per enabled plan, passing both `testId` and
`planId`. Build a table of runs, passes and pass rate per cell. This is the
highest-value step and the one most often skipped, because the shape of the
table usually names the cause before any error message is read.

| Shape | Points at |
|---|---|
| A few cells at zero, the rest passing | Data, since tables are usually per brand or region |
| Every cell degraded by a similar amount | Environment, or a shared flow |
| One region at zero, the other healthy | Something host specific |
| Cells split exactly on a data table flag | That flag |

## 3. Bucket the failures by failing step

`list_mabl_test_runs` with `limit: 30`, then `get_mabl_test_run` per failed run
for the failing step and screenshot. Group by failing step and environment, and
count each group. Several groups mean several stacked defects rather than one fix.

## 4. Read the saved failure analysis as a lead

`analyze_mabl_failure` with `includeEvidence: true` on two or three runs from
different groups and different weeks. Follow any console log or HAR it names. It
reads the symptoms of one run, cannot see data tables, and does not know other
cells pass. Expect it to be partly right more often than fully right.

## 5. Open the screenshots

`list_mabl_test_run_artifacts` and `get_mabl_test_run_artifact`. Open the images,
not summaries, at least four from different groups. For each, say whether the
page rendered normally, showed an error page, was still loading, or showed
something unexpected. This single distinction separates environment from data and
steps faster than anything else. A run reported as a server error can carry a
clean HAR and fully rendered screenshots.

## 6. Read the step definitions

`get_mabl_test_steps`, compact first, then full for the steps that matter. Run
output numbers steps from 1, stored steps index from 0.

Count disabled steps and assertions. A green run with most assertions switched
off proves little. Look for hardcoded values that should come from a data table,
such as one brand's name or record id fixed in steps while a table feeds the rest.

## 7. Read every data table the test uses

`list_mabl_data_tables` and `get_mabl_data_table`. No automated analysis does
this, and it is where many causes live.

| Shape | What it looks like |
|---|---|
| Column name case | The table spells a column differently from the step, so the variable resolves empty |
| Missing required space | A postal code stored without its space, rejected by the site |
| Leading or trailing whitespace | Including tabs, which become encoded characters in URLs |
| Stale identifiers | An order or product id the site no longer returns |
| Listing membership | A product page loads fine but is absent from the listing the test clicks through |
| Missing flag columns | A guarding condition never matches, so a block silently skips |
| Migration gaps | Some tables moved to a new credential or flag model, others were left behind |

Listing membership is the one most often missed, by checking only that the page
loaded.

## 8. Check shared flows and their callers

`get_mabl_flow_steps`, then `list_mabl_tests_using_flow`, before proposing any
change. A failing step numbered like 4.1.14 sits inside a flow. When it does, the
flow is the finding. A fix there is worth far more than one test, and a mistake
there does far more damage.

## 9. Check the live page

Open the page in a real browser with the `chrome-devtools` MCP server
(`new_page`, `navigate_page`, `take_snapshot`) and confirm what the selector,
product, control or value looks like now. Command line fetches are often blocked,
and some regional hosts refuse outside connections. That is a limit on the check,
so record the finding as unverified rather than dropping it.

## 10. Check which version actually runs

`list_mabl_test_versions`, read last. Confirm the version that executes matches
the default branch, and whether fixes are stranded on unmerged branches.

## Writing the dossier

Each diagnosed test gets:

- A lead verdict, stating plainly where the team's belief or mabl's analysis was
  wrong.
- The per-cell table of runs, passes and where each cell dies.
- The failing step and what the screenshots actually show.
- Data table findings, named table by table.
- The root cause with its category, more than one where cells disagree.
- The repair move, not applied, with an owner.
- A confidence statement naming the weakest link in the reasoning.
- How mabl's own failure analysis compared.
