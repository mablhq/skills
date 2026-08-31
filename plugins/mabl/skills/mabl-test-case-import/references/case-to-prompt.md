# Four cases, rewritten

Worked examples of the rewrite in `SKILL.md`. Each shows the case as a human
wrote it, then the prompt, then what the rewrite had to supply that the case
never said. The last one is not rewritten at all, which is the point.

The five elements are: **where it runs**, **who it runs as**, **what to do with
real values**, **what to verify as something visible on screen**, and **at least
one visual assertion**. Plus constraints and cleanup where they apply.

---

## 1. A Jira case, written for a colleague

**PROJ-572 — Verify guest checkout**

```
1. Go to product page
2. Add to cart
3. Check out as guest
4. Enter shipping details
5. Verify confirmation
```

Everything a person fills in from context is missing: which site, which product,
what shipping data is safe to use, and what "verify confirmation" looks like.

**Prompt**

```
On the staging storefront at https://staging.shop.example.com, open the product
page for "Aluminum Water Bottle" and add one to the cart. Check out as a guest
without signing in. Fill shipping with the name Test Guest, the address
100 Main St, Boston MA 02110, and the email guest@example.com.

Verify the cart badge shows 1 after the item is added. Verify the shipping form
shows the email that was entered. Verify the confirmation page displays an order
number. Take a visual assertion of the confirmation page.

Do not sign in at any point, and do not use a saved payment method.
```

**Name:** `PROJ-572 Guest checkout` — 3 words, well inside the 15-word cap, and
the key makes the test findable from the ticket.

What the rewrite supplied: the URL, the specific product, real shipping values,
three on-screen verifications where the case had one vague one, a visual
assertion, and two constraints the case implied but never wrote down.

---

## 2. An Xray case whose steps came across as a grid

Exported from Xray, so the steps arrive as rows rather than prose:

| Test Key | Action | Data | Expected Result |
|---|---|---|---|
| QA-88 | Sign in | standard user | Dashboard loads |
| QA-88 | Open Reports | | Reports list appears |
| QA-88 | Filter by date | Last 30 days | Only rows within range shown |
| QA-88 | Export CSV | | File downloads |

The grid is better raw material than prose, because `Data` and `Expected Result`
are already separated. `Expected Result` is the verification list.

**Prompt**

```
On the staging app at https://staging.example.com, sign in using the mabl
credential named "Standard user". Open the Reports page from the main
navigation. Set the date filter to "Last 30 days". Export the filtered list as
CSV.

Verify the dashboard heading is visible after signing in. Verify the reports
list shows at least one row. Verify that after the date filter is applied every
visible row's date falls within the last 30 days. Verify a download completes
and the downloaded file name ends in .csv. Take a visual assertion of the
filtered reports list.
```

**Name:** `QA-88 Reports date filter and CSV export`

What the rewrite supplied: the credential **by name** — never its contents — and
the on-screen form of "only rows within range shown", which as written is a
statement about data rather than about the screen.

---

## 3. A TestRail row

`C4471 | Alert dialog accept path | Section: Dialogs | Expected Result: dialog
closes and confirmation text appears`

Short, but it has the one column that matters: an expected result.

**Prompt**

```
On https://sandbox.example.com, open the alert dialog example from the home
page. Trigger the alert and accept it.

Verify the dialog is no longer visible after accepting. Verify the page shows
the confirmation text that follows an accepted alert. Take a visual assertion of
the page after the dialog closes.

Do not dismiss or cancel the dialog.
```

**Name:** `C4471 Alert dialog accept path` — keep the `C` id. It is what the
team searches on.

What the rewrite supplied: where it runs, the negative constraint that keeps the
test on the accept path rather than the cancel path, and a visual assertion.

---

## 4. The case that should be parked

**PROJ-610 — Verify the reports page loads**

There is nothing here to rewrite. "Loads" is not observable, and a test built
from this passes forever without telling anyone anything.

Two options, and both are the user's call:

- **Rewrite it against the real screen.** Open the page, look at what it shows,
  and name three things that should be true — a heading, a row count, a control
  that is enabled. Then it is case 1 or 2 above.
- **Park it.** Record the key in the parked column and move on.

A backlog import is a good moment to notice that some of the cases were never
test cases. What is not acceptable is generating from it anyway: the session
completes, a test exists, the count looks right, and the coverage is imaginary.

---

## Writing values that stay true

**Concrete beats placeholder.** "Fill in the shipping form" produces a different
test every run. "Fill shipping with the name Test Guest, the address 100 Main
St, Boston MA 02110" produces the same one.

**Verifications are about the screen.** A badge showing a number, a button
becoming disabled, a validation message appearing, a row leaving a table. Avoid
anything that depends on state nobody can see in a browser — a database row, a
queue depth, an internal flag.

**Anything that creates data cleans up after itself.** Give the created thing a
findable name — a fixed prefix plus a timestamp — and tell the test to delete
only that. A test that deletes by broad search eventually deletes something a
colleague was using. Say both halves in the prompt.

**Constraints are cheap here and expensive later.** If the flow has a path that
should never be taken, write it down: "do not sign in", "do not use the saved
card", "do not accept the cookie banner".
