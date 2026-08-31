---
name: mabl-convention-guide
description: |
  REVIEW a whole mabl workspace for the conventions and best practices it
  follows, and write them up. Reads the STATED rule from agent instructions
  first — a CLI-only surface the MCP server cannot see — infers the OBSERVED
  pattern from the tests second, and reports where the two disagree. Ends by
  asking what to do with the findings: document them, turn them into agent
  instructions, or both.
  Fire when someone inherits or joins a workspace, or asks how things are named
  and organized, for conventions or best practices to be documented, an
  onboarding or style guide, or a consistency audit of test and plan naming.
  Where nothing is written down, proposes a starting set instead of reporting
  an empty result.
  NOT for landing one rule change — that is mabl-update-agent-instructions.
  NOT for local project wiring: mabl-init writes ids, applications and
  environments into one checkout's agent memory; conventions live in mabl and
  apply to everyone.
allowed-tools: Bash, Read, Write, Edit, mcp__mabl__list_mabl_tests, mcp__mabl__get_mabl_test_steps, mcp__mabl__list_mabl_plans, mcp__mabl__get_mabl_plan, mcp__mabl__list_mabl_applications, mcp__mabl__list_mabl_environments, mcp__mabl__list_mabl_credentials, mcp__mabl__list_mabl_data_tables, mcp__mabl__list_mabl_failure_reasons
---

# mabl workspace convention guide

Two different things get called "the convention", and confusing them produces a
confident, wrong write-up:

- **Normative** — what the team has *stated* the rule is. Lives in mabl **agent
  instructions**.
- **Descriptive** — what the tests actually *do*, inferred from what is there.

A guide that presents the descriptive pattern as the rule tells new joiners to
copy the current drift. This skill exists because an unaided agent did exactly
that: it derived the pattern from test names accurately, never found the stated
rule, and never noticed that two enabled instruction rows contradicted each
other.

The workspace arrives as input. This skill reviews the workspace it is handed
and does not go looking for one. Every call that accepts a workspace names it
explicitly: `mabl agent-instructions list` with no `-w` returns a full result
from the caller's default workspace, with nothing in the output to say which
workspace answered, so an unnamed call can describe a workspace nobody asked
about. Where a call takes no workspace at all, the entity id carries it, which
is one more reason to pass every id back exactly as it was returned.

## Prerequisites

Agent instructions are **CLI-only**; the hosted `mabl` MCP server exposes no
tool that reads them. The rest of the review runs on either surface. So the CLI
is a hard dependency here.

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.109.27
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth info   # reading needs any key; run `mabl auth login --auto` if not logged in
```

**Then probe for the surface, because a version number is not a capability.**
Features ship together, so a build can satisfy the pin without carrying the
command:

```bash
mabl agent-instructions --help 2>&1 | grep -Eqw 'list' || echo "CLI has no agent-instructions surface"
```

If it is absent, say so and continue with the observed pattern alone — then
report the normative side as **unread**, not as empty. Those are different
findings, and collapsing them is the failure this skill exists to prevent.

## Read the stated convention first

```bash
mabl agent-instructions list -w "$WS" --output json --limit 500
```

**`--limit` defaults to 10 and truncates in silence.** No marker, no count, no
error. `mabl tests list` and `mabl flows list` both print a row count and the
line `... use the --limit flag to return a larger set` when they cut a result
short; `agent-instructions list` prints neither, so a default-limit read of a
28-row workspace is indistinguishable from a complete read of a 10-row one
(measured 2026-08-31). Pass it explicitly, and if the row count equals the
limit, raise it and read again.

For every row, record the text, whether it is **enabled** (the JSON field is
`disabled`, so an enabled row reads `"disabled": false`), and its scope.

**An unset scope dimension is absent from the row, not present and empty.**
`capabilities`, `application_ids` and `environment_ids` are omitted entirely
when the instruction is not scoped on them, so a reader looking for an empty
array finds no field and records no scope at all. Absent here means the widest
possible scope, which is the opposite of what a missing field usually suggests.

| Dimension | Field | Absent means | Set by |
|---|---|---|---|
| Agent capability | `capabilities`: `authoring`, `recovery`, `results_analysis` | every capability | `--capabilities` |
| Application | `application_ids` | every application | `--application-ids` |
| Environment | `environment_ids` | every environment | `--environment-ids` |
| Test type | `test_types` | never absent | no flag on `create` or `update` |

`test_types` behaves unlike the other three. It is present on every row, it read
`["browser"]` on all 45 rows across the three workspaces measured 2026-08-31,
and neither `agent-instructions create` nor `agent-instructions update` exposes
a flag that sets it. Report any other value as something to ask about rather
than as a scope the team chose.

**Capability is the dimension most often dropped, and dropping it invents
conflicts that do not exist.** Two rows that state opposite things about healing
are not in conflict if one is scoped to `authoring` and the other to `recovery`
— they are read by different agents and never meet. Flattening the scope makes
a clean workspace look broken.

Then check for these hazards explicitly. All of them occur in real workspaces:

| Hazard | Why it misleads |
|---|---|
| A **disabled** row stating a rule | Reads as authoritative in a dump; is not in force. Always report enabled state. |
| **Two enabled rows that contradict** *within the same scope* | Neither is "the" convention. Report the conflict as the finding. |
| **Near-duplicate rows** saying the same thing twice | Which one a later edit lands in is a coin flip. Report the pair, not one of them. |
| **Per-application or per-environment variants** of one rule | The rule is conditional, not global. Don't flatten them into one. |
| A **narrowly scoped** row answering a workspace-wide question | Quoting it as workspace policy is wrong. Say what it is scoped to. |
| An **unscoped** row that reads as absolute — "always make the run pass" | Applies to every capability, every app, every environment. Its blast radius is the finding. |

Resolve `application_ids` and `environment_ids` to names via
`list_mabl_applications` and `list_mabl_environments` before quoting a row.
A raw id in a guide for new joiners is unreadable.

If a stated rule exists and the tests do not follow it, that gap **is** the
answer to "how do they organize things" — report both sides.

## Infer the observed pattern

```
list_mabl_tests(workspaceId, limit: 200)
```

Look at name grammar (delimiter, casing, segment order), description style,
prefix conventions (`[BROKEN]`, `DND-`, ticket keys), and label taxonomy.
Report conformance as a count — "22 of 26 conform" — and name every violator.

Then the surrounding structure. `list_mabl_plans` gives plan names, labels and
enabled state; `get_mabl_plan` gives the execution stages.

**A plan selects its tests by id.** Every stage carries a list of `journey_id`
values (under `tests` from `get_mabl_plan`, under `journeys` from the CLI), and
no field anywhere in the payload selects tests by label, so a stage cannot be
read as "everything tagged smoke". Labels on a plan describe the plan itself.
What the stages do report is how the work is split: how many stages there are,
each stage's `concurrency`, and how many tests each holds.

`mabl plans describe <id> -o json` returns more of a plan than the MCP tool
does, including `triggers`, `browser_types`, `execution_runner_type`,
`retry_on_failure` and `credentials_required`. Where the CLI is available,
trigger and browser coverage are worth reporting. The two surfaces disagree on
one shape: plan `labels` are plain strings from the MCP tools and objects
carrying `name` and `color` from `plans describe`. Read whichever you called.

`list_mabl_applications`, `list_mabl_environments`, `list_mabl_credentials` and
`list_mabl_data_tables` cover naming across configuration.

`list_mabl_failure_reasons` returns mabl's nine default categories in every
workspace, so the list by itself carries no local signal. Only rows with
`isDefault: false` are a taxonomy this team created. Report those, and say "no
custom failure reasons" rather than reprinting the defaults as if the workspace
had chosen them.

For practices that live inside tests rather than in their names — how the team
waits, how it selects elements, how it logs in, how it sets up data — read the
steps of a handful of tests with `get_mabl_test_steps`. Pass
`detail: "compact"`: it returns one record per step carrying the step type and
description, which is what a habit survey needs, where full steps run an order
of magnitude larger. Say how many tests you read. A habit seen in four tests is
a habit seen in four tests, not a workspace rule.

## Do not assert product behaviour you have not tested

This is the failure mode that most damages a convention write-up. An unaided
agent wrote *"mabl labels are case- and separator-sensitive, so these are 8
unrelated tags"* — and that is **false**.

**mabl label matching is case-INSENSITIVE** at both the CLI and REST layers.
`FEATURE-FLOWS` returns the same tests as `feature-flows`.

So `smoke` / `Smoke` / `SMOKE` are already one label for selection purposes, and
recommending a cleanup of them is recommending cosmetic churn. `smoke` vs
`smoke-test` is genuinely different. Getting this backwards inverts the advice.

General rule: where a recommendation depends on how a mabl mechanism behaves,
either test it in one call or state it as an open question. Never infer a
mechanism from appearance.

## State your completeness basis

Say what you could and could not see. Silence reads as completeness.

- **`list_mabl_tests` caps at 200 and returns no cursor.** Past that, shard by
  `applicationId`, `testType` or `authorId`, and say that you did.
- **A returned cursor does not mean another page exists.** `list_mabl_plans`,
  `list_mabl_applications`, `list_mabl_environments` and
  `list_mabl_credentials` each hand back a cursor alongside a complete result,
  and `list_mabl_applications` returns that same cursor again for the empty page
  after it, which loops forever. Bound every page walk: stop on the first page
  with no rows, stop if a cursor repeats, and stop after 10 pages whatever the
  cursor says. Say so if you hit the bound.
- **Enumerate reusable flows from the CLI, not the MCP server.** `mabl flows
  list -w <ws> --limit 500` returns the whole set: the workspace measured
  2026-08-31 returned the same 149 flows at `--limit 500` and at `--limit 5000`.
  It prints a table of id, description and created time and takes no `--output`
  flag, so parse the table. The MCP server offers only `search_mabl_flows`,
  which ranks by relevance and caps, so it cannot ground a conformance count.
  Without the CLI, report flow naming as not enumerated rather than
  generalizing from whatever a search returned.
- **Names come back resolved; workspace membership does not.** `list_mabl_tests`
  returns `createdBy` and `lastUpdatedBy` as objects carrying `name` and
  `email`, `list_mabl_plans` returns a `users` map, and the CLI returns
  `created_by_user`, so no id lookup is needed to name an author. No call lists
  who belongs to the workspace, so the people you can name are the people who
  touched the assets you enumerated. Say that.
- Check authorship spread. Where every asset has one author, the "conventions"
  are one person's habits — frame them that way, not as team policy.

## When nothing is written down

A workspace with no agent instructions and no consistent pattern is the normal
starting state, not a failed review. Reporting an empty finding set is useless
to the person who asked.

Say plainly that nothing is stated and what, if anything, is consistent. Then
propose a starting set drawn only from what is observable in this workspace:

- the test-name shape already most common, written as a rule
- the wait and selector habits seen in the steps you read
- how credentials and test data are set up
- the label vocabulary already in use, deduplicated

Mark each proposal with the evidence behind it and how thin that evidence is.
Then stop and let the reader confirm, edit or reject each one. Proposing is the
deliverable here; writing is not, until they say so.

## Write it up

Structure the guide so a new joiner can act on it:

1. **Stated rules** — quoted, with enabled state and full scope. Conflicts and
   duplicate pairs called out.
2. **Observed pattern** — the grammar, with a conformance count.
3. **Where they disagree** — the most useful section, and the reason to read.
4. **Violators** — named, so they can be fixed or accepted deliberately.
5. **Structure** — plans, applications, environments, labels, prefixes.
6. **Completeness basis** — what was enumerated in full and what was sampled.

Keep normative and descriptive claims visibly separate throughout. Never present
an inferred pattern in the voice of a rule.

## Decide what happens to the findings

A review that ends in a message is a review nobody acts on. Having reported the
findings, ask which of these to do, and do only what is chosen:

**1. Document them.** Write the guide to `.mabl/conventions.md`. That is the
only path this skill writes on its own initiative.

`.mabl/` is normally ignored, so a doc written there is invisible to everyone
else on the team — which defeats the point of writing it. Offer to add an
exception, and add it only if the reader says yes, because `.gitignore` is
theirs and outside this skill's own territory:

```gitignore
.mabl/*
!.mabl/conventions.md
```

**The trailing-slash form does not work here.** With `.mabl/` ignored as a
directory, git never descends into it, so `!.mabl/conventions.md` is never
consulted and the file stays invisible — with no error to say so. Excluding the
children (`.mabl/*`) is what makes the negation reachable.

**2. Turn them into agent instructions**, so mabl's own agents follow the
convention rather than only humans reading a file.

**Requires `mabl-update-agent-instructions`.** Hand each finding to that skill
one at a time and let it decide where the change belongs. If it is not
installed, say which skill is missing and stop — do not create or edit
instructions from here. Do not guess how to install it; that depends on which
of the five surfaces installed this one.

Do not reimplement any of what that skill owns: placing a change by capability
and scope, reading only the instructions the affected agent reads, preferring to
amend the row that already owns the topic over adding a second one, and halting
when a change would contradict an enabled row. Duplicating that logic here is
how the two drift apart and start giving opposite advice.

Findings convert unevenly, so triage before handing anything over. A conflict
between two enabled rows and a near-duplicate pair are both existing-row
problems and go over as they are. A violator count is not a rule and converts to
nothing — leave it in the document.

**3. Both** — write the document, then hand the rules over.

**4. Something else** — take the instruction given. These are defaults, not
limits: asked to write somewhere specific, write there.
