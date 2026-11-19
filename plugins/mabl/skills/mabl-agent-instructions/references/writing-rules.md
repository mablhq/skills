# Writing rules

Apply all ten to every new or changed instruction.

1. **One rule, one instruction.** Never combine unrelated rules.
2. **Name the capability before writing.** Match the guidance to that
   capability's job:
   - **Authoring** (`authoring`): how tests and flows get built. Interactions,
     naming, reusable flows, required steps, waits, assertions, test data, and
     known modals or banners handled as explicit steps.
   - **Results analysis** (`results_analysis`): how run outcomes get
     interpreted, prioritized and framed. Known-flaky areas, triage priorities,
     business context.
3. **Use the narrowest scope that achieves the goal.** Workspace-wide is the
   default in mabl; narrow beats broad.
4. **Be specific and observable.** Concrete, checkable actions, not
   aspirations.
5. **Write for the agent.** Imperative, lead with the action, no preamble.
6. **Don't restate mabl defaults**, such as "create reliable tests".
7. **Don't hard-code volatile values workspace-wide** (URLs, codes, card
   numbers). Scope them to the exact application and environment, or point to
   a mabl variable or data table. Application and environment scope is
   advisory, so a session that doesn't know its environment may still read an
   environment-scoped rule; prefer a variable or data table for anything that
   must not leak across environments.
8. **Never put secrets, passwords or real customer PII in an instruction.**
   Point to mabl credentials or variables instead.
9. **Check every new or changed rule for conflicts** with the live ones, and
   call out each one you find. Prefer editing the existing rule.
10. **Target 1,800 characters or fewer.** 2,000 is the hard maximum, including
    the ID line. Count with code and report the exact count.

## Naming standards for what the agent builds

The first batch should include authoring rules that encode the team's naming
standards for tests, reusable flows and variables. If the team hasn't defined
them, propose these and ask the team to confirm:

- **Tests:** `App - Module - specific outcome`, for example
  `Storefront - Checkout - guest pays by card`.
- **Reusable flows:** verb-first and single-purpose, for example
  `Log in as admin`, `Add item to cart`.
- **Variables:** a consistent `prefix_descriptive_name` pattern, for example
  `user_email`, `order_total`.

## Help center

Link these when the user wants mabl's own guidance:

- [Writing agent instructions](https://help.mabl.com/hc/en-us/articles/48333986215444-Writing-agent-instructions):
  scopes, enable and disable, guidelines.
- [Create reusable flows with the mabl agent](https://help.mabl.com/hc/en-us/articles/51218649146388-2026-07-20-Create-reusable-flows-with-the-mabl-agent):
  how instructions tell the agent when to create reusable flows.
- [How to make your tests easier to understand](https://help.mabl.com/hc/en-us/articles/19078165320084-How-to-make-your-tests-easier-to-understand):
  naming templates and readability standards worth encoding.
- [Agentic test authoring capabilities](https://help.mabl.com/hc/en-us/articles/37947539774612-Agentic-test-authoring-capabilities):
  what the authoring agent can and can't do, so rules stay realistic.
