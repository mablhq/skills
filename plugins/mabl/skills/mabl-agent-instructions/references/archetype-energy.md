# Archetype: Energy and utilities

A residential self-service portal (usage, billing, payments, outages, service
start, stop and transfer, rate-plan enrollment) alongside field and
operations tools for work orders, meter service and dispatch. Consumer-grade
UX meets regulated billing and real-world physical actions.

These are examples, not policy. Swap the placeholder apps and environments for
the workspace's Scope Key, rewrite each rule to the team's interview answers,
and check every one against the writing rules and the live rules before
proposing it.

## Ask about

- How a bill is calculated from usage and rate plan (tiers, time of use,
  taxes, surcharges).
- Which actions have physical side effects (disconnects, dispatch, work-order
  completion), and how a test can tell which environment it is in.
- Scheduling windows for service changes and meter reads.
- Required disclosures and assistance-program notices.
- Known interruptions: outage and maintenance banners, session timeouts,
  usage charts and outage maps that load asynchronously.

## Authoring

**AI-AUTH-WS-DATA-01 · Never author with real customer PII** — authoring,
workspace-wide. Crawl.

> Never use real customer PII when authoring tests. Use only synthetic test
> data for names, service addresses, SSNs, account numbers, bank accounts, and
> card numbers. If a field needs sensitive-looking data (for example, an SSN
> for a credit check), use documented sandbox or test values.

Why: the foundational data-handling rule.

**AI-AUTH-WS-DATA-02 · Mask sensitive fields** — authoring, workspace-wide.
Walk.

> When authoring steps that enter account numbers, SSNs, bank account or card
> numbers, or passwords, treat these as sensitive so their values are masked
> in test steps and results. Do not assert on the full plaintext of a
> sensitive value; assert on masked or last-4 representations.

Why: keeps secrets out of artifacts everyone can see.

**AI-AUTH-WS-NAMING-01 · Variable naming convention** — authoring,
workspace-wide. Walk.

> When creating variables, use the naming convention env_domain_description,
> lowercase with underscores. Example: staging_billing_amount_due. Never store
> raw sensitive values in a plainly named variable.

Why: consistency, and a nudge away from storing secrets in the clear.

**AI-AUTH-PORTAL-ASSERT-01 · Verify usage-to-bill math** — authoring,
CustomerPortal. Crawl.

> In the CustomerPortal application, after opening a bill, verify the billed
> amount reconciles with the displayed usage and the enrolled rate plan (for
> example, consumption times the applicable tier or time-of-use rate, plus
> stated taxes and surcharges). Assert on the total due before considering the
> bill correct.

Why: billing correctness is the core assertion in a utility portal.

**AI-AUTH-FIELD-ENV-01 · No real disconnects or dispatch** — authoring,
FieldOps. Crawl.

> In the FieldOps application, never author steps that submit a real service
> disconnect, field dispatch, or work-order completion in Production. Confirm
> the environment banner reads Staging before performing any action with
> physical side effects; otherwise stop at a read-only verification.

Why: prevents real-world side effects. Scope it to the app in every
environment, not to Production alone: environment scope is advisory, and the
banner check in the text does the guarding.

**AI-AUTH-PORTAL-DATA-01 · Dynamic dates for scheduling** — authoring,
CustomerPortal. Crawl.

> In the CustomerPortal application, when scheduling a service start, stop, or
> transfer or selecting a meter-read date, compute the date dynamically
> relative to today (for example, today plus 3 business days) rather than
> hard-coding a calendar date. Confirm the picker reflects the selected date
> before proceeding.

Why: hard-coded dates go stale and fall outside scheduling windows.

## Results analysis

**AI-ANLZ-WS-REPORT-01 · Never surface PII in analysis** — results analysis,
workspace-wide. Crawl.

> When analyzing results, never include real or full sensitive values (account
> numbers, SSNs, service addresses, bank or card numbers) in the summary. Refer
> to them by field name or last-4 only.

Why: data handling extends to the analysis itself.

**AI-ANLZ-WS-TRIAGE-01 · Flaky versus real, plus a compliance flag** —
results analysis, workspace-wide. Walk.

> When analyzing failing runs, first state whether the failure is flaky or a
> real regression. Separately flag any failure indicating a regulatory or
> data-handling issue (for example, a required rate disclosure or
> assistance-program notice missing, or sensitive data shown in plaintext) as
> high priority regardless of flakiness.

Why: compliance failures outrank flakiness triage.

**AI-ANLZ-PORTAL-TRIAGE-01 · Prioritize billing, payment and outage
failures** — results analysis, CustomerPortal. Run.

> When analyzing CustomerPortal results, prioritize failures in billing
> calculation, payment submission, and outage reporting over navigation or
> display issues. Call out any failure where a billed amount or payment total
> was incorrect first.

Why: focuses attention on the riskiest consumer paths.

**AI-ANLZ-PORTAL.STG-FLAKY-01 · Staging meter-data gaps are environmental**
— results analysis, CustomerPortal, Staging. Walk.

> In the CustomerPortal application on the Staging environment, treat missing
> or incomplete interval or meter data in usage charts as likely a sandbox
> feed gap unless it recurs across multiple runs, and recommend a rerun before
> escalating to engineering.

Why: fewer false escalations from incomplete sandbox feeds.

## Anti-patterns

- **Real PII in test data or assertions.** Synthetic data only, with
  sensitive fields masked.
- **Disconnects or dispatch authored against Production.** Real physical
  action. Check the environment banner first.
- **Hard-coded service or meter-read dates.** They drift outside valid
  windows. Compute them relative to today.
- **Asserting on a chart before it renders.** Wait for the visualization to
  finish loading.
- **A retry loop around a business-rule rejection** (failed credit check,
  program ineligibility, past-due balance). The rejection is the outcome;
  reserve retries for transient errors.
- **One workspace-wide rule listing every compliance rule.** One rule per
  instruction.
