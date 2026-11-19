# Archetype: B2B SaaS admin console

Users, roles and permissions, organizations and tenants, settings, billing,
and integrations. Tenant data must stay isolated and clearly named; role
matrices mean running the same flow as different personas; naming matters
once a suite holds hundreds of tests and variables; feature flags drift
between environments; and async operations need resilient waits.

These are examples, not policy. Swap the placeholder apps and environments for
the workspace's Scope Key, rewrite each rule to the team's interview answers,
and check every one against the writing rules and the live rules before
proposing it.

## Ask about

- The personas (Admin, Member, Viewer, or the app's own) and the credentials
  for each.
- How test records are marked so they're safe to clean up, and which shared
  tenants must never be touched.
- Async operations (invites, provisioning, background jobs) and what signals
  completion.
- Feature flags that differ between Staging and Production.
- Known interruptions: product tours, onboarding checklists, a feature-flag
  banner in Staging.

## Authoring

**AI-AUTH-WS-NAMING-01 · Test and variable naming** — authoring,
workspace-wide. Crawl.

> When creating tests and variables, follow the naming convention [Area] -
> [Action] - [Persona] for tests (for example, "User Management - Invite User -
> Admin") and env_area_description for variables. Use consistent, descriptive
> names; never use placeholders like test1 or temp.

Why: the signature standard for a console with sprawling assets.

**AI-AUTH-WS-WAIT-01 · No hard-coded waits** — authoring, workspace-wide.
Crawl.

> Do not use fixed-time waits. Wait for the specific element, toast, or
> completion state that signals an async operation (invite sent, user
> provisioned, settings saved) has finished before asserting or proceeding.

Why: admin consoles are async-heavy; timed waits are the top flake source.

**AI-AUTH-WS-DATA-01 · Isolate and label tenant test data** — authoring,
workspace-wide. Crawl.

> When creating records (users, orgs, projects) during authoring, prefix names
> with qa-automation- and a unique identifier so test data is isolated,
> searchable, and safe to clean up. Never modify records that lack this
> prefix.

Why: protects shared tenants and makes cleanup deterministic.

**AI-AUTH-ADMIN-LOGIN-01 · State the persona for permission flows** —
authoring, AdminConsole. Crawl.

> In the AdminConsole application, when authoring a test that depends on a
> role, begin by signing in as the required persona (Admin, Member, or Viewer)
> and assert the expected permissions are visible before exercising the
> feature. Do not assume the default signed-in role.

Why: makes permission-dependent tests explicit and reliable.

**AI-AUTH-ADMIN-ASSERT-01 · Confirm saves persist** — authoring,
AdminConsole. Walk.

> In the AdminConsole application, after changing a setting, confirm the save
> succeeded by waiting for the success toast and asserting the setting persists
> after a page reload, rather than assuming the change took effect.

Why: catches silent save failures.

**AI-AUTH-BILL.STG-DATA-01 · Seeded billing plans in Staging** — authoring,
BillingPortal, Staging. Run.

> In the BillingPortal application on the Staging environment, use the seeded
> test subscription plans and the sandbox billing provider only. Never trigger
> a real charge. Confirm the environment is Staging before changing a
> subscription.

Why: isolates billing side effects. The environment check matters because
environment scope is advisory.

## Results analysis

**AI-ANLZ-WS-TRIAGE-01 · Lead with flaky versus real** — results analysis,
workspace-wide. Crawl.

> When analyzing failing runs, begin by stating whether the failure looks
> flaky (async timing, environment) or a real regression, with supporting
> evidence, before detailing next steps.

Why: fast, consistent triage across a large suite.

**AI-ANLZ-ADMIN-FLAKY-01 · Async timeouts are likely flaky** — results
analysis, AdminConsole. Walk.

> When analyzing AdminConsole application failures, treat timeouts waiting on
> provisioning, invites, or background jobs as likely flaky and recommend a
> rerun, unless the same async step fails consistently across runs.

Why: encodes what the team knows about the app's async behavior.

**AI-ANLZ-ADMIN-TRIAGE-01 · Permission failures versus bugs** — results
analysis, AdminConsole. Walk.

> When analyzing AdminConsole permission-related failures, clearly distinguish
> between an unexpected access denial (potential regression) and an expected
> denial that the test was verifying. State which persona was active.

Why: keeps correct access control from being labeled a bug.

**AI-ANLZ-ADMIN.STG-ENV-01 · Note Staging-only features** — results
analysis, AdminConsole, Staging. Run.

> In the AdminConsole application on the Staging environment, if a failure
> involves a feature that is flag-gated and not yet in Production, note this in
> the analysis so it is triaged as a Staging or flag concern rather than a
> customer-facing regression.

Why: keeps flag-gated noise out of the customer-impact bucket.

## Anti-patterns

- **No naming convention on a large suite.** Unsearchable asset sprawl.
  Enforce naming workspace-wide.
- **Assuming the default signed-in role.** Permission tests pass or fail for
  the wrong reason. State the persona.
- **Timed waits for async jobs.** Wait on the job's end state.
- **Modifying unprefixed shared records.** Corrupts other teams' tenant data.
- **Authoring a workaround past "permission denied".** The denial is usually
  what's under test. Let it stand and analyze it.
