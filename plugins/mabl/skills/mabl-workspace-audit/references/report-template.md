# Report structure

The shape of the deliverable written in step 7 of `SKILL.md`, and the rules for
a comparison run.

## Where it goes

```
.mabl/audit/<workspace-name>-<YYYY-MM-DD>/
  report.md          the narrative and the ranked findings
  findings.csv       one row per finding: rank, category, entity, id, evidence, disposition, effort
  quarantined.csv    written by step 8 only, after the read-back confirms
```

CSV because a spreadsheet is where this gets triaged — sorted by rank, filtered
by owner, split between people. Write the same numbers into both files, and make
`report.md` say which CSV backs each section.

Nothing goes anywhere else on the skill's own initiative. If the user names a
path, use theirs.

## report.md

### 1. What was measured

Before any finding. A reader who cannot reproduce the scope cannot trust a
count, and every number below is scoped by something on this list.

- Workspace name and id. The audit date.
- The dormancy window in days, with both epoch bounds.
- Counts retrieved, each against the limit used: tests, plans, plans
  successfully described, users, open branches, flows, run rows indexed, pages
  fetched.
- `minPlanRuns` for the quality report.
- The branch the flow used-by index covered.
- Which conventions were supplied in step 1, and which were declared absent.
- **Every partial sweep and closed lane, by name**, with the findings each one
  weakened.

### 2. Ranked findings

High, then medium, then low, per the ranking rule in `references/findings.md`.
Each row carries: entity name, id, the evidence that produced it, a suggested
disposition, and an effort tag.

Effort tags, because a list of two hundred items with no sense of cost gets read
once and never actioned:

| Tag | Means |
|---|---|
| Quick win | Minutes to hours. A label, a disable, a trigger. |
| Short term | Days. Fixing a failing test, splitting a plan. |
| Strategic | Weeks or a policy change. Flow architecture, naming migration, branch governance. |

Pair every percentage with its absolute numbers — "62% compliant (412 of 665)".
A percentage alone hides the size of the job, and a count alone hides whether it
matters.

### 3. Unverified

Its own section, never merged into the ranked list. One line per closed lane or
partial sweep: what could not be established, and what it would take to
establish it. A reader must be able to tell "we checked and it's clean" from "we
couldn't check".

### 4. Questions the data cannot answer

Real questions, addressed to the user. A test in no plan that somebody runs by
hand before every release is not dead, and nothing this skill read can tell the
difference. Ask; do not guess, and do not bury the guess in a disposition column.

### 5. Recommended next step

One paragraph. What to do first, and why that first. If an escalation trigger in
`references/findings.md` fired, this is where it changes the recommendation —
name the trigger and its number.

## Consistency

The counts in `report.md` and `findings.csv` must agree, and the section totals
must agree with the header counts. Cross-check them before reporting the audit
done. A report whose summary and detail disagree gets the whole audit dismissed,
and the mismatch is nearly always double-counting an entity that satisfied more
than one finding — rank it once, at its highest.

## Comparison runs

When step 1 found a previous report in `.mabl/audit/`, this run also reports
what changed. Read the previous report's measurement header first, then:

**Compare only what was measured the same way.** A metric whose window,
`minPlanRuns`, limit, or conventions differ between the two runs is **not
comparable** — say so beside it rather than subtracting the numbers. This is the
most common way an audit comparison becomes fiction: a 90-day window against a
180-day one makes dormancy look solved.

For each comparable metric report the absolute change and the percentage
change together — "348 → 12 (−336, −96.6%)".

Then classify each one:

| Class | Means |
|---|---|
| Resolved | The previously flagged item is gone from this run |
| Improved | Same finding, smaller |
| Unchanged | Same finding, same size |
| Regressed | Same finding, larger |
| Not comparable | Scope or convention differed between runs |
| New | Not measured in the previous run |

**Name the specific items resolved since last time**, not just the delta. If the
previous run's `findings.csv` is present, diff the id sets — the entities that
dropped out are the ones somebody actually fixed, and they are the only part of
a comparison that proves work happened rather than that a number moved.

An item that dropped out because this run's sweep was partial is **not**
resolved. Check it against the unverified section before claiming it.

## Tone

Report the state. The reader is the person who owns this workspace, and they are
about to make deletion decisions from it — they need the number, not a framing
of the number. No score standing in for a verdict, no severity word doing work a
count would do better, and no softening of a finding to make the report pleasant
to receive.
