# Adapting the CLI's draft

The mechanics for fitting the mabl CLI's Playwright draft to a project: which of
its patterns to replace, and how to write the steps it leaves untranslated.
Every change here keeps the step it touches. None of them removes coverage.

## Draft patterns to replace

| In the draft | Replace with | Why |
|---|---|---|
| `await locator.type(text)` | `await locator.fill(text)` | `type()` is deprecated. Use `pressSequentially(text)` instead only when the field reacts to each keystroke, like search-as-you-type or a masked input. |
| `await page.waitForTimeout(ms)` | A wait on what the step was waiting for, such as `await expect(nextElement).toBeVisible()` | A fixed sleep is slow when the app is fast and flaky when it is slow. If you can't tell what it waited for, keep it. |
| `` page.locator(`//div[...]`) `` (a recorded XPath) | `getByRole`, `getByLabel`, `getByText` or `getByTestId`, chosen from the page | A recorded XPath breaks on any layout change. Start from the alternatives the CLI listed in its comment, or from `error-context.md` after a failed run. |
| `.first()` on a locator | Keep it, unless you are replacing that locator anyway | The CLI adds it to every element. A good locator matches one element and doesn't need it, and Playwright's strict mode tells you when one matches more. |
| `` page.locator(`data-test-id=x`) ``, `` page.locator(`id=x`) `` | Leave them, or use `getByTestId('x')` when the config's `testIdAttribute` is that attribute | These are Playwright's own attribute selectors and work as written. |
| `replaceMablVariables(...)` | Leave it, or use plain template strings once every variable is an ordinary TypeScript value | The helper itself is fine. The danger is an unset variable, for which it returns the variable's name. |
| `console.log` flow and step group markers | A comment, or the helper call when you move the flow into a helper | They only show where a flow or group began and ended. |
| `process.env.USERNAME`, `process.env.PASSWORD` | The project's own credential variables | Never a literal value. |

## Writing the steps the CLI couldn't translate

Where the CLI had no translation it leaves a comment that says "not supported",
worded a few ways, and a JavaScript condition becomes `if (true) {`. To see a
step's details (the cookie, the file, the script, the condition), export the
test as JSON to a scratch file once and pull out only that step by its
description or type. Don't read the whole file into context.

```bash
mabl tests export <testId> --format json --file <scratch>/<testId>.json
```

### Actions

| mabl step | In Playwright |
|---|---|
| Set, remove or clear cookies | `context.addCookies([...])`, `context.clearCookies({ name })`, `context.clearCookies()` |
| Upload a file | `locator.setInputFiles(path)`. The file has to be in the project; ask for it if it isn't. |
| Wait for uploads | A wait on what the page shows once the upload finishes. |
| Download a file | Start `page.waitForEvent('download')` before the click that triggers it, then await it after. Checking a downloaded PDF's contents needs a PDF library the project may not have, so ask. |
| Click and hold, then release | `source.dragTo(target)`, or `page.mouse.down()`, `move()` and `up()` for finer control. |
| Wait for a new tab | Start `page.waitForEvent('popup')` before the click that opens it, await it after, and run the following steps against the new page. |
| Run JavaScript | `page.evaluate(...)` with the script, when the export carries it. A script stored elsewhere in mabl doesn't come through, so ask the user for it. |
| Accessibility check | `@axe-core/playwright` if the project already has it. Otherwise ask before adding a dependency. |
| A flow the CLI couldn't load | Check that the flow exists on that mabl branch and export again. If it still doesn't load, the flow's steps are owed. |
| Enter an MFA code, or open an email | These need a source the project controls, such as a TOTP secret or a test inbox. Ask; they are usually owed. |
| Switch tabs | Keep a handle on each page, from `context.pages()` or `page.waitForEvent('popup')`, and run the following steps against the right one. |
| Switch into a frame | `page.frameLocator(selector)`, then locate inside it. |

### Variables

| Create a variable from | In Playwright |
|---|---|
| The page URL | `page.url()` |
| A count of elements | `await locator.count()` |
| JavaScript | `await page.evaluate(...)` with the script, when the export carries it. Otherwise ask for it. |
| A file's contents, or a file built from a template | Read the file with `node:fs` in the test. The file has to be in the project. |
| A generated email address | Needs the project's own test inbox. Ask; usually owed. |

Store the value where the rest of the spec reads it: `variables.set(...)` while
the spec still uses the draft's Map.

### Conditions and assertions

| mabl step | In Playwright |
|---|---|
| A condition on JavaScript | Evaluate it with `page.evaluate(...)` and branch on the result, in place of `if (true)`. |
| A condition or assertion on a cookie | Read it from `await context.cookies()` and check its value. |
| A condition or assertion on the viewport | `page.viewportSize()` |
| A condition or assertion on an email | Needs the project's test inbox. Ask; usually owed. |
| A condition or assertion written as an AI prompt | No Playwright equivalent. Ask the user for the concrete check it stands for; otherwise owed. |

A condition the CLI left as a comment still has its `}` or `} else {` below it.
Write the `if (...) {` where the comment is, and the block closes as before.

For any other step, look for the Playwright API that does what the step's
description says. If there isn't one, leave the step owed. Don't write a
workaround that only looks like the step.
