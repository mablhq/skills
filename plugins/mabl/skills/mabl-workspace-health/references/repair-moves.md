# Repair moves

The fixes that close most failing mabl tests. Every diagnosed test gets one named
move from this table. Never write "fix the selector" when the row says which
selector and which move.

| Symptom in the run | The move | Path |
|---|---|---|
| An assertion fires before an async area settles | Wait until the ready element is present, then assert | Direct edit where the ready element is already captured |
| A fixed wait sits before an intermittent failure | Replace it with a conditional wait on the element the next step needs | Direct edit |
| A navigation assertion checks the URL before it changes | Wait until the URL matches, then assert | Direct edit |
| A selector no longer matches but the control still exists | Keep the working locator, give it a stable description and id | Direct edit, then verify with a cloud run |
| The control moved somewhere no test has captured | New steps against the new control | Re-authoring with mabl's AI test authoring |
| An assertion is stricter than the behaviour it protects | Loosen the comparator, for example equals to contains | Propose only, since it changes what the test proves |
| A step hardcodes a value a data table already carries | Replace the literal with the table variable | Direct edit |
| A data table cell is stale, mis-cased, padded or missing a required space | Correct the cell | Table write, no test change |
| A fail-at-end assertion lets the run die somewhere unrelated | Change it to terminate | Direct edit |
| Browser back resets scroll and the assertion runs off-screen | Restore scroll position before asserting | Direct edit |
| Captured element text includes data that changes daily | Retarget the step at a stable element, such as a heading or a test id | Direct edit, then verify with a cloud run |
| Screenshots show error pages and every cell is degraded | No test change, file a platform ticket | None |
| The latest version sits on an unmerged branch | Merge the branch | Source-control action |

## Direct edit or re-authoring

The deciding question is whether the element moved or the selector broke. A
direct edit changes any property that is not a find target, deterministically,
and can reuse a locator for an element that is already captured. It cannot
discover an element nobody has captured, and it cannot verify itself without a
run. Re-authoring opens a real browser, finds new elements and validates by
running. Most of the table is direct edits. Re-authoring is needed only for
element discovery.

Any edit that touches a find target is unproven until the test runs.

## Writing the prescription

For each diagnosed test:

- **The move**, named from the table.
- **Where**, the step index or the table and column. Run output numbers steps from
  1 and stored steps index from 0.
- **The concrete change**, specific enough to apply without a follow-up question.
- **Who owns it**, since data and environment fixes leave the test alone.
- **The path**, direct edit, re-authoring, table write or no test change.
- **How it is verified**, three consecutive passing runs, ideally a plan run on a
  branch.
