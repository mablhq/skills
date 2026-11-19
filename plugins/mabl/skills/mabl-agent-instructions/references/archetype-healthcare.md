# Archetype: Healthcare and insurance portal

Patient and member records, eligibility, claims, appointments, benefits, and
clinical or coverage forms, under HIPAA-adjacent data-handling expectations.
PHI and PII must never reach test data, logs or screenshots; long multi-step
forms carry conditional sections; eligibility rules branch into many
outcomes; consent and session-timeout screens interrupt flows; and copays,
deductibles and claim totals need exact verification.

These are examples, not policy. Swap the placeholder apps and environments for
the workspace's Scope Key, rewrite each rule to the team's interview answers,
and check every one against the writing rules and the live rules before
proposing it.

## Ask about

- Where the synthetic member cohort lives and which eligibility scenarios it
  covers.
- Which multi-step forms matter most and where their conditional sections
  branch.
- How billed, covered and patient-responsibility amounts should reconcile.
- Known interruptions: HIPAA and consent screens, session timeouts,
  conditional form sections.

## Authoring

**AI-AUTH-WS-DATA-01 · Never author with real PHI** — authoring,
workspace-wide. Crawl.

> Never use real patient or member data when authoring tests. Use only
> synthetic test identities for names, dates of birth, member IDs, and
> diagnoses. Draw sensitive-looking values from documented test data sets,
> never from production records.

Why: the foundational data-handling rule.

**AI-AUTH-WS-DATA-02 · Mask PHI and PII fields** — authoring, workspace-wide.
Crawl.

> When authoring steps that enter member IDs, dates of birth, SSNs, or
> diagnosis codes, treat these as sensitive so their values are masked in test
> steps and results. Do not assert on full plaintext PHI; assert on masked or
> partial representations.

Why: keeps PHI out of shared artifacts.

**AI-AUTH-WS-NAMING-01 · Variable naming convention** — authoring,
workspace-wide. Walk.

> When creating variables, use the naming convention env_domain_description,
> lowercase with underscores (for example, staging_claims_claim_total). Never
> store raw PHI in a plainly named variable.

Why: consistency, and a guardrail against storing PHI in the clear.

**AI-AUTH-MEMBER-FLOWS-01 · Fill multi-step forms section by section** —
authoring, MemberPortal. Crawl.

> In the MemberPortal application, when completing multi-step enrollment or
> intake forms, fill and validate each section before advancing. After each
> step, assert the progress indicator advanced and no validation error is shown
> before continuing.

Why: long forms drop data silently; per-section checks catch it.

**AI-AUTH-CLAIMS-ASSERT-01 · Verify claim math** — authoring, ClaimsPortal.
Crawl.

> In the ClaimsPortal application, after submitting or viewing a claim, verify
> the displayed totals: billed amount, covered amount, and patient
> responsibility (copay or deductible) should reconcile. Assert patient
> responsibility equals billed minus covered before considering the claim
> correct.

Why: coverage math is high-stakes and error-prone.

**AI-AUTH-MEMBER.STG-DATA-01 · Test member cohort in Staging** — authoring,
MemberPortal, Staging. Walk.

> In the MemberPortal application on the Staging environment, use only the
> seeded synthetic member cohort and their documented eligibility scenarios.
> Confirm the environment is Staging before creating or modifying member
> records.

Why: keeps synthetic data in the safe environment. The environment check
matters because environment scope is advisory.

## Results analysis

**AI-ANLZ-WS-REPORT-01 · Never surface PHI in analysis** — results analysis,
workspace-wide. Crawl.

> When analyzing results, never include real or full PHI (member IDs, dates of
> birth, diagnoses, SSNs) in the summary. Refer to sensitive values by field
> name or partial, masked form only.

Why: data handling extends to the analysis itself.

**AI-ANLZ-WS-TRIAGE-01 · Flaky versus real, plus a compliance flag** —
results analysis, workspace-wide. Walk.

> When analyzing failing runs, first state whether the failure is flaky or a
> real regression. Separately flag any failure indicating a data-handling
> issue (for example, PHI displayed in plaintext) as high priority regardless
> of flakiness.

Why: data-handling failures outrank routine triage.

**AI-ANLZ-CLAIMS-TRIAGE-01 · Eligibility denial versus defect** — results
analysis, ClaimsPortal. Walk.

> When analyzing ClaimsPortal failures involving denied coverage, distinguish
> between an unexpected denial (potential regression) and an expected denial
> the test was verifying. State the member scenario and expected coverage
> outcome.

Why: keeps correct denials from being labeled bugs.

**AI-ANLZ-CLAIMS-REPORT-01 · Explain claim-math failures** — results
analysis, ClaimsPortal. Run.

> For ClaimsPortal failures involving incorrect totals, include billed,
> covered, and patient-responsibility amounts and show how they should
> reconcile, so the discrepancy is immediately actionable.

Why: makes coverage-math bugs clear at a glance.

## Anti-patterns

- **Real PHI in test data or assertions.** Privacy exposure in artifacts.
  Synthetic identities only, with PHI masked.
- **Advancing multi-step forms without per-section checks.** Silent data loss
  passes as success.
- **Authoring a workaround past an eligibility denial.** The denial is often
  what's under test. Let it stand and analyze it.
- **PHI echoed in analysis.** Field names or masked values only.
- **One workspace-wide rule bundling every compliance rule.** One rule per
  instruction.
