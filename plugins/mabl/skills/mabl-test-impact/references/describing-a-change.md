# Describing a change: three worked examples

Read this while writing the `changeDescription` and `guidance` for `analyze_test_impact`. Each example
names what a *user* meets, in product vocabulary and in your own words. None quotes the diff.

## 1. A shared validator that reaches further than its framing

**The change:** a shared field-validation module (the code that formats and checks postal codes, card
numbers and expiry dates as the user types) switches from validating on blur to validating on each
keystroke.

**Name every place a user meets that validation:**

- entering a shipping address during checkout;
- entering card details and seeing card and expiry errors at checkout;
- **editing a saved address or payment method in account settings.**

The third area is the one that pays off. The change is framed around checkout, but the *same*
validator runs in account settings, a surface the diff never names.

> Field validation for postal codes, card numbers and expiry dates now fires on each keystroke
> instead of on blur, so error text appears while the user is still typing. Affects the shipping
> address and payment steps of checkout, and editing saved addresses and payment methods in account
> settings.

`guidance`: *"Pre-PR safety pass; broad coverage of every form using these validators."*

## 2. A destructive change: name the data-lifecycle surfaces

**The change:** deleting a customer account now cascades to its saved addresses, saved payment
methods and order drafts, which used to be orphaned.

A destructive change reaches every surface that creates, lists, reads or removes the records in the
cascade, not just the delete button. Name them all:

- closing an account from account settings, and the confirmation that follows;
- the saved-addresses and saved-payment-methods lists, before and after a deletion;
- resuming a draft order, and what the user sees when its account is gone;
- any admin or support view that looks up a closed account's records.

> Closing a customer account now also removes that account's saved addresses, saved payment methods
> and draft orders. Affects account closure in account settings, the saved address and payment
> method lists, resuming draft orders, and support views of closed accounts.

`guidance`: *"Destructive change to a data lifecycle; include tests that create or delete accounts,
addresses, payment methods or drafts."*

Say it plainly in the description. Whoever runs the set decides which tests may run unattended, and a
cascade is exactly the case where a self-cleaning test can take records it never created.

## 3. A change you skip

**The change:** a README rewrite, a new linter rule, and a renamed internal helper with no behavior
change.

Nothing here has a runtime user surface, so there is nothing for the analysis to find. Skip the call
and say so in one line: *"No user-facing change (docs, lint config, internal rename); impact analysis
skipped."*

When a change mixes a skip-worthy part with a real one, describe only the real one. When you can't
tell whether a refactor changed behavior, make the call: it is cheap, and it tells you whether there
is anything to find.
