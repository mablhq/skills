# Lane C — Author from the source

Lanes A and B work from a recording — a Playwright trace, or WebDriver traffic.
A recording carries what the browser did, so both lose what the source test
*meant*: a regex assertion becomes an `Echo`, an in-process `assertEquals` is
invisible on the wire, and a locator the source built by chaining converts to
CSS that does not resolve.

The source does not have that problem. It states the intent directly. Lane C
reads it and hands that intent to the same cloud authoring agent lane B submits
to, which then drives the live app itself. Elements are captured against the
running page rather than string-converted, and the assertions come from the
source rather than from a wire capture.

The cost is per test: one cloud authoring session, minutes of real compute,
credits. Lane A converts a directory of traces in one command. Use lane C for
the tests the other lanes would ruin, not for the suite.

## C1. Read the test, and everything it calls

A test built on a page object model or shared helpers is not readable from its
own file. Follow the imports and read what each step actually does. Skip this
and the intent describes method names instead of user actions, and the agent
authors against the names.

## C2. Write the intent from the source, and invent nothing

Call `mabl_authoring_initiate` with `testInformation` carrying the
`deployment_id` bound in `SKILL.md` Step 2, a name, and a `test_case` that
walks the test end to end — every action in order, every assertion the source
makes.

Three rules make the result trustworthy:

- **Every line traces to a line of source.** Setup the test does through an API
  fixture is setup the mabl test has to do through the UI or not at all. Say
  which; never drop it silently.
- **Name elements by what the user sees, not by the source's locator.**
  `getByTestId("add-to-cart")` is "the Add to cart button". The agent finds the
  element itself, and a raw selector pasted into the intent reintroduces the
  brittleness lane A produces.
- **Keep the source's assertions as assertions.** They are the reason this lane
  exists. An action the source performs only in order to reach an assertion is
  not the test.

Pass `credentials_id` when the source test logs in, and `labels` so the
imported tests stay filterable. For a family of near-identical tests, author
one, then pass its id as `source_test_id` on the rest and describe only what
differs — each copy starts from the first one's captured elements.

## C3. What lane C trades away

The call returns a session id (`-as`) immediately and authors asynchronously;
`SKILL.md` Step 5 owns the polling and `SKILL.md` Step 6 the verification. Two
things are specific to this lane, and the agent reports neither.

**It captures the element it saw, not the rule the source used.** A source
locator that was deliberately dynamic — text matching, `.filter()`, `.nth()` —
becomes a fixed capture of whichever element matched on the day. Measured:
`page.locator('a >> div:has-text("Claw Hammer with Shock Reduction Grip"))`
authored as a find on that product's own `data-test` id and an xpath ending
`a[6]`. It resolves, and it runs, but it no longer follows the product if the
grid reorders. Grep the source for those APIs before importing and say which
tests are affected; the fix is to make the intent state the rule ("the product
card whose title is X"), not to patch the selector afterwards.

**It adds assertions the source never made.** Measured on the same test: seven
source assertions, seven present, plus one the agent invented from context.
Often an improvement, never what the source checked. List added and missing
side by side in `SKILL.md` Step 6 and let the user rule.
