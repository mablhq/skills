# Archetype: Banking and fintech

Accounts, balances, transfers, payments, statements, and KYC or onboarding,
under strict data-handling and compliance expectations. PII and financial
data must never reach test data, logs or screenshots; step-up authentication
and short session timeouts interrupt flows; amounts, fees and interest need
exact verification; and real money must never move.

These are examples, not policy. Swap the placeholder apps and environments for
the workspace's Scope Key, rewrite each rule to the team's interview answers,
and check every one against the writing rules and the live rules before
proposing it.

## Ask about

- Where synthetic customers, accounts and cards come from, and which values
  are documented test values.
- How tests get a step-up or OTP code in each environment.
- Which environment has sandbox payment rails, and how a test can tell which
  environment it is in (a banner, a URL).
- Known interruptions: session timeouts, step-up prompts, environment
  overlays.

## Authoring

**AI-AUTH-WS-DATA-01 · Never author with real PII** — authoring,
workspace-wide. Crawl.

> Never use real customer PII when authoring tests. Use only synthetic test
> data for names, addresses, SSNs, account numbers, and card numbers. If a
> field needs sensitive-looking data, use documented sandbox or test values.

Why: the foundational data-handling rule.

**AI-AUTH-WS-DATA-02 · Mask sensitive fields** — authoring, workspace-wide.
Crawl.

> When authoring steps that enter account numbers, card numbers, SSNs, or
> passwords, treat these as sensitive so their values are masked in test steps
> and results. Do not assert on the full plaintext of a sensitive value; assert
> on masked or last-4 representations.

Why: keeps secrets out of artifacts everyone can see.

**AI-AUTH-WS-NAMING-01 · Variable naming convention** — authoring,
workspace-wide. Walk.

> When creating variables, use the naming convention env_domain_description,
> lowercase with underscores. Example: uat_payments_transfer_amount. Never
> store raw sensitive values in a plainly named variable.

Why: consistency, and a nudge away from storing secrets in the clear.

**AI-AUTH-BANK-ASSERT-01 · Verify balance math on transfers** — authoring,
RetailBanking. Crawl.

> In the RetailBanking application, after completing a transfer, verify that
> the source account balance decreased and the destination balance increased
> by exactly the transfer amount. Assert on both balances before considering
> the transfer successful.

Why: correct money movement is the core assertion.

**AI-AUTH-PAY.UAT-DATA-01 · Sandbox rails in UAT** — authoring, Payments, UAT.
Walk.

> In the Payments application on the UAT environment, initiate payments only
> through the sandbox payment rail using documented test account numbers. Never
> target real external accounts. Confirm the environment banner reads UAT
> before submitting a payment.

Why: prevents real money movement. The banner check matters because
environment scope is advisory.

**AI-AUTH-BANK-LOGIN-01 · Handle MFA with a test OTP** — authoring,
RetailBanking. Crawl.

> In the RetailBanking application, when a step-up authentication or OTP prompt
> appears during authoring, use the documented sandbox OTP retrieval method
> rather than a hard-coded code. Add a step to fetch the current test OTP
> dynamically.

Why: the non-brittle way to get through MFA.

## Results analysis

**AI-ANLZ-WS-REPORT-01 · Never surface PII in analysis** — results analysis,
workspace-wide. Crawl.

> When analyzing results, never include real or full sensitive values (account
> numbers, SSNs, card numbers) in the summary. Refer to them by field name or
> last-4 only.

Why: data handling extends to the analysis itself.

**AI-ANLZ-WS-TRIAGE-01 · Flaky versus real, plus a compliance flag** —
results analysis, workspace-wide. Walk.

> When analyzing failing runs, first state whether the failure is flaky or a
> real regression. Separately flag any failure that indicates a data-handling
> or compliance issue (for example, sensitive data displayed in plaintext) as
> high priority regardless of flakiness.

Why: compliance failures outrank flakiness triage.

**AI-ANLZ-PAY-TRIAGE-01 · Prioritize money-movement failures** — results
analysis, Payments. Walk.

> When analyzing Payments application results, prioritize failures in payment
> submission, settlement, and balance reconciliation over navigation or display
> issues. Call out any failure where an amount was incorrect first.

Why: focuses attention on the riskiest paths.

**AI-ANLZ-PAY.UAT-FLAKY-01 · UAT gateway errors are environmental** — results
analysis, Payments, UAT. Run.

> In the Payments application on the UAT environment, treat sandbox gateway or
> connectivity errors as likely environmental unless they recur across
> multiple runs, and recommend a rerun before escalating to engineering.

Why: fewer false escalations from sandbox instability.

## Anti-patterns

- **Real PII in test data or assertions.** A privacy breach that leaks into
  artifacts. Synthetic data only, with sensitive fields masked.
- **A hard-coded OTP or MFA code.** Breaks on every rotation. Fetch it
  dynamically.
- **A retry loop around a declined transaction.** The decline is the outcome;
  retrying can turn a real defect green. Reserve retries for transient errors.
- **One workspace-wide rule listing every compliance rule.** A kitchen sink
  you can't tune or disable piece by piece. One rule per instruction.
- **Analysis that echoes full account numbers.** Last-4 or field names only.
