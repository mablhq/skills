# Archetype: E-commerce and checkout

Cart, checkout, payment and confirmation funnels, with catalogs, promotions,
inventory, and guest versus signed-in flows. Prices, taxes, shipping and
discounts must be verified rather than assumed; consent banners and promo
modals interrupt flows; sandbox payment credentials differ by environment.

These are examples, not policy. Swap the placeholder apps and environments for
the workspace's Scope Key, rewrite each rule to the team's interview answers,
and check every one against the writing rules and the live rules before
proposing it.

## Ask about

- Which app holds the cart and which holds checkout, and how prices, tax and
  shipping are calculated.
- The sandbox payment method per environment, and whether Production ever
  takes test orders.
- Guest versus signed-in checkout: which path the team prefers to test.
- Known interruptions: cookie and consent banners, newsletter and promo
  modals, a debug overlay in Staging.

## Authoring

**AI-AUTH-WS-NAMING-01 · Variable naming convention** — authoring,
workspace-wide. Crawl.

> When creating variables, always use the naming convention
> env_feature_description, lowercase with underscores. Example:
> staging_checkout_order_total. Never use spaces or generic names like var1.

Why: one readable, searchable standard across every app.

**AI-AUTH-WS-WAIT-01 · No hard-coded waits** — authoring, workspace-wide.
Crawl.

> Do not insert fixed-time waits. Instead, wait for the specific element or
> network state that indicates the page is ready before interacting. Prefer
> assertions on visible elements over arbitrary delays.

Why: fixed waits are the most common source of slow, flaky tests.

**AI-AUTH-CHKOUT-ASSERT-01 · Verify totals after cart changes** — authoring,
Checkout. Crawl.

> For the Checkout application, always verify the order total after adding or
> removing items from the cart. After each cart change, assert that the
> displayed subtotal equals the sum of line items before proceeding.

Why: pricing correctness is the point of checkout.

**AI-AUTH-STORE-ASSERT-01 · Assert cart badge increments** — authoring,
Storefront. Crawl.

> In the Storefront application, after adding a product to the cart, assert
> that the cart badge count increments by exactly 1 before navigating away. Do
> not rely on the cart drawer animation completing.

Why: turns a flaky visual step into a deterministic assertion.

**AI-AUTH-CHKOUT.STG-DATA-01 · Sandbox payment data in Staging** — authoring,
Checkout, Staging. Walk.

> In the Checkout application on the Staging environment, always use the
> sandbox test card 4242 4242 4242 4242 with any future expiry and any CVC.
> Never enter real payment details. Complete purchases only against sandbox
> payment credentials.

Why: keeps test transactions out of Production and standardizes test data.
Environment scope is advisory, so also store the card in a mabl variable or
data table scoped to Staging.

**AI-AUTH-CHKOUT-FLOWS-01 · Guest versus account checkout** — authoring,
Checkout. Walk.

> When authoring checkout tests for the Checkout application, prefer the guest
> checkout path unless the test intent explicitly requires a signed-in account.
> If an account is required, sign in before adding items to the cart, not
> after.

Why: encodes the team's most stable path and the right order.

## Results analysis

**AI-ANLZ-WS-TRIAGE-01 · Lead with flaky versus real** — results analysis,
workspace-wide. Crawl.

> When analyzing failing test runs, begin the response by stating whether the
> failure appears flaky (incidental or environmental) or a real product
> regression, then give the supporting evidence.

Why: every reader gets the same fast triage signal first.

**AI-ANLZ-CHKOUT.STG-FLAKY-01 · Payment gateway timeouts are environmental** —
results analysis, Checkout, Staging. Walk.

> In the Checkout application on the Staging environment, treat payment gateway
> timeouts as likely sandbox or environment issues rather than product defects
> unless they recur across multiple runs. Recommend a rerun before escalating.

Why: sandbox gateways are known to flake; avoids false escalations.

**AI-ANLZ-CHKOUT-TRIAGE-01 · Prioritize revenue-path failures** — results
analysis, Checkout. Walk.

> When analyzing Checkout application results, prioritize failures that block
> completing a purchase (payment, order confirmation) over cosmetic or
> catalog-browsing failures. Call out revenue-impacting failures first.

Why: aligns analysis with business impact.

**AI-ANLZ-CHKOUT-REPORT-01 · Explain total mismatches with the math** —
results analysis, Checkout. Run.

> For Checkout application failures involving an incorrect order total, include
> the expected total, the actual total, and the line-item breakdown in the
> explanation so the discrepancy is immediately clear.

Why: makes pricing bugs actionable at a glance.

## Anti-patterns

- **A coupon code hard-coded workspace-wide.** Codes expire and break
  unrelated tests. Scope to app and environment, or use a variable or data
  table.
- **Asserting totals against a fixed number.** Prices move with promos and
  tax. Assert subtotal equals the sum of line items.
- **A real card anywhere.** Real charges and PCI exposure. Sandbox card only.
- **Every failure analyzed as a regression.** Gateway noise gets escalated as
  product bugs. Lead with flaky versus real.
