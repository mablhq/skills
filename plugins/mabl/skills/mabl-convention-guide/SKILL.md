---
name: mabl-convention-guide
description: |
  Work out how a mabl workspace names and organizes things, and write it up so
  new people follow the same pattern. Reads the STATED convention from agent
  instructions first — which the MCP surface cannot see — before inferring one
  from the tests, and flags where the two disagree.
  Fire when someone inherits or joins a workspace and asks how things are
  named or organized, wants conventions documented, an onboarding write-up, a
  style guide, or a consistency audit of test and plan naming.
  One boundary: `mabl-init` writes workspace *wiring* — ids, applications,
  environments, credentials — into your local agent memory so a project can run
  tests. This skill reads and documents the team's *conventions*, which live in
  mabl itself and apply to everyone, not just this checkout.
allowed-tools: Bash, mcp__mabl__list_mabl_tests, mcp__mabl__list_mabl_plans, mcp__mabl__get_mabl_plan, mcp__mabl__list_mabl_applications, mcp__mabl__list_mabl_environments, mcp__mabl__list_mabl_credentials, mcp__mabl__list_mabl_data_tables, mcp__mabl__list_mabl_failure_reasons, mcp__mabl__get_mabl_test_steps, mcp__mabl__search_mabl_flows
---

# mabl workspace convention guide

Two different things can be called "the convention", and confusing them produces
a confident, wrong write-up:

- **Normative** — what the team has *stated* the rule is. Lives in mabl **agent
  instructions**.
- **Descriptive** — what the tests actually *do*, inferred from names.

A guide that presents the descriptive pattern as the rule tells new people to
copy the current drift. This skill exists because an unaided agent did exactly
that: it derived the pattern from test names accurately, never found the stated
rule, and never noticed two enabled instruction rows contradicted each other.

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.123.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth info    # verify you're logged in (run `mabl auth login --auto` if not)
```

## Step 1 — Read the STATED convention first. CLI only.

**The MCP surface has zero agent-instruction tools.** If you work only through
MCP you are structurally blind to the place stated conventions live, and you will
infer a rule while a written one sits right there. Use the CLI:

```bash
mabl agent-instructions list -w "$WS" --output json --limit 500
mabl agent-instructions describe "$ID"
```

For every row, record: the text, whether it is **enabled or disabled**, and what
it is **scoped to** (workspace, application, environment).

Then check for these four hazards explicitly — all of them occur in real
workspaces:

| Hazard | Why it misleads |
|---|---|
| A **disabled** row stating a rule | Reads as authoritative in a dump; is not in force. Always report enabled state. |
| **Two enabled rows that contradict** | Neither is "the" convention. Report the conflict as the finding. |
| **Per-application variants** of one rule | The rule is conditional, not global. Don't flatten them. |
| An **app-scoped** row where the question was workspace-wide | Quoting it as workspace policy is wrong. |

If a stated rule exists and the tests do not follow it, that gap **is** the
answer to "how do they organize things" — report both sides.

## Step 2 — Infer the descriptive pattern

```
mcp__mabl__list_mabl_tests(workspaceId, limit: 200)
```

Look at name grammar (delimiter, casing, segment order), description style,
prefix conventions (`[BROKEN]`, `DND-`, ticket keys), and label taxonomy. Report
conformance as a count — "22 of 26 conform" — and name every violator.

Then the surrounding structure: `list_mabl_plans` / `get_mabl_plan` for stage
shape and whether stages select by id or label; `list_mabl_applications`,
`list_mabl_environments`, `list_mabl_credentials`, `list_mabl_data_tables` for
naming across config; `list_mabl_failure_reasons` for the one workspace-level
taxonomy MCP exposes.

## Step 3 — Do not assert product behaviour you have not tested

This is the failure mode that most damages a convention write-up. An unaided
agent wrote *"mabl labels are case- and separator-sensitive, so these are 8
unrelated tags"* — and that is **false**.

**mabl label matching is case-INSENSITIVE** at both the CLI and REST layers.
`FEATURE-FLOWS` returns the same tests as `feature-flows`.

So `smoke` / `Smoke` / `SMOKE` are already one label for selection purposes, and
recommending a cleanup of them is recommending cosmetic churn. `smoke` vs
`smoke-test` is genuinely different. Getting this backwards inverts the advice.

General rule: if a recommendation depends on how a mabl mechanism behaves, either
test it in one call or state it as an open question. Never infer mechanism from
appearance.

## Step 4 — State your completeness basis

Say what you could and could not see. Silence reads as completeness.

- **`list_mabl_tests` caps at 200 with no cursor.** Beyond that, shard by
  `applicationId` / `testType` / `authorId` and say so.
- **There is no exhaustive flow enumerator.** `search_mabl_flows` is
  relevance-ranked and capped, so **flow naming cannot be fully audited** — say
  that rather than generalizing from a sample.
- **`search_mabl_flows` takes no `workspaceId`** and silently resolves against
  the caller's default workspace. If you call it, confirm the results belong to
  the workspace under review, or you will describe a different one.
- **There is no user roster.** `list_mabl_users` requires ids; harvest them from
  `createdById` / `lastUpdatedById` and note the roster is partial.
- Check authorship spread. If every asset has one author, the "conventions" are
  one person's habits — frame them that way rather than as team policy.

## Step 5 — Write the guide

Structure it so a new joiner can act on it:

1. **Stated rules** — quoted, with enabled state and scope. Conflicts called out.
2. **Observed pattern** — the grammar, with a conformance count.
3. **Where they disagree** — the most useful section, and the reason to read.
4. **Violators** — named, so they can be fixed or accepted deliberately.
5. **Structure** — plans, applications, environments, labels, prefixes.
6. **Completeness basis** — what you enumerated fully and what you sampled.

Keep normative and descriptive claims visibly separate throughout. Never present
an inferred pattern in the voice of a rule.

## Optional follow-through

If the workspace has **no** stated convention and the observed pattern is
consistent, the natural next step is to write it down where mabl's own agents will
read it:

```bash
mabl agent-instructions create -w "$WS" --name "Test naming convention" \
  --instruction-text "<the pattern, in one paragraph>"
```

Propose this; do not do it unasked. And check for an existing row first — that
check is Step 1.
