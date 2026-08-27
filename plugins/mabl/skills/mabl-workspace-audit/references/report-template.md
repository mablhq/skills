# Report structure

The shape of the deliverable written in step 7 of `SKILL.md`, and the rules for
a comparison run. A later audit reads these files back by name, so the names are
part of the contract.

## Where it goes

```
.mabl/audit/<workspace-name>/
  conventions.md                 what the user agreed in step 1, reused next run
  <YYYY-MM-DD>/
    report.md                    the narrative and the ranked findings
    findings.csv                 one row per ENTITY, at its highest-ranked finding
    <category>.csv               one per finding category, the same rows split out
    quarantined.csv              step 8 only — the intended set BEFORE the first
                                 edit, each row then resolved confirmed/unconfirmed
```

**Namespaced by workspace, then by date.** Both halves matter. Conventions are a
property of the workspace, not of the machine — a shared `conventions.md` hands
one workspace's naming rules to the next one audited. The date directory is what
makes a comparison run possible, and what stops a second audit overwriting the
first.

**`findings.csv` carries one row per entity, not per finding.** An entity that
satisfies several findings is ranked once, at its highest, with the others in a
supporting column. Row-per-finding double-counts every such entity and inflates
every total — see Consistency below. The per-category CSVs are the same rows
split for triage, so an entity may appear in several of those; only
`findings.csv` is the population count.

CSV because a spreadsheet is where this gets triaged — sorted by rank, filtered
by owner, split between people. Write the same numbers into `report.md` and the
CSVs, and make `report.md` say which CSV backs each section.

Nothing goes anywhere else on the skill's own initiative. If the user names a
path, use theirs.

## report.md

### 1. What was measured

Before any finding. A reader who cannot reproduce the scope cannot trust a
count, and every number below is scoped by something on this list.

- Workspace name and id. The audit date.
- The dormancy window in days, with both epoch bounds.
- **Which activity lane ran** — Lane A paged, or Lane B one-call-per-test — and
  if the run switched lanes, where. This is what tells the reader whether the
  duration figures are a distribution or one sample per test.
- Counts retrieved, each against the limit used **and against the size the user
  expected in step 1**: tests, plans, plans successfully described, users, open
  branches, flows, run rows indexed, pages fetched.
- `minPlanRuns` for the quality report.
- The branch the flow used-by index covered.
- The branch-staleness bar, and whether the user set it or it defaulted.
- Which conventions were supplied in step 1, and which were declared absent.
- **The quarantine label**, if step 8 ran — verbatim, because step 9's undo
  instruction depends on it.
- **Every partial sweep and closed lane, by name**, with the findings each one
  weakened. A lane that was refused carries the server's error text verbatim.

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
and the mismatch is nearly always an entity counted once per finding instead of
once per entity — which is why `findings.csv` is keyed the way it is.

## Comparison runs

When step 1 found a previous date directory under the **same workspace**, this
run also reports what changed. Read the previous report's measurement header
first, then:

**Compare only what was measured the same way.** In order:

1. **Same workspace id.** A report from another workspace is not a prior run of
   this one, whatever the directory holds.
2. Same dormancy window, `minPlanRuns`, limits, and conventions. A metric whose
   scope differs between runs is **not comparable** — say so beside it rather
   than subtracting the numbers. A 90-day window against a 180-day one makes
   dormancy look solved.
3. Same activity lane, for anything derived from durations.

For each comparable metric report the absolute change and the percentage change
together — "348 → 12 (−336, −96.6%)".

Then classify each one:

| Class | Means |
|---|---|
| Resolved | The previously flagged item is gone from this run |
| Improved | Same finding, smaller |
| Unchanged | Same finding, same size |
| Regressed | Same finding, larger |
| Not comparable | Scope, lane, or convention differed between runs |
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
