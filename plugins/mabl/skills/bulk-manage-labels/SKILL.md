---
name: bulk-manage-labels
description: |
  Clean up, standardize, or bulk-apply labels across mabl tests and plans —
  safely. Classifies label drift into cosmetic, functional and ambiguous
  before writing anything, because mabl label matching is case-insensitive
  and "tidying" case variants changes nothing while destroying nothing is
  guaranteed.
  Fire when the user wants to tidy, normalize, standardize, merge, rename,
  audit or bulk-apply labels or tags on mabl tests or plans, or says their
  labels/tags are "a mess", inconsistent, duplicated, or drifting.
  One boundary: adding or removing a label on ONE named test belongs to
  `mabl-test-edit`, which treats it as a cheap reversible metadata op. This
  skill owns workspace-wide label hygiene, where the same operation stops being
  cheap because it can silently change what CI selects.
allowed-tools: Bash, mcp__mabl__list_mabl_tests, mcp__mabl__edit_mabl_test_metadata, mcp__mabl__list_mabl_plans, mcp__mabl__get_mabl_plan, mcp__mabl__edit_mabl_plan
---

# Bulk-manage mabl labels

Labels drive plan and suite selection, so a careless relabel silently changes
what runs in CI. This skill exists because an unaided agent, asked to make
"smoke / Smoke / smoke-test" consistent, also collapsed four distinct
`regression` labels nobody mentioned — reported complete success, and left no
way to tell which tests had been in which grouping.

## Prerequisites

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.123.0
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth info    # verify you're logged in (run `mabl auth login --auto` if not)
```

## The fact that changes the whole task

**mabl label matching is case-INSENSITIVE.** Verified at both the CLI and REST
layers: filtering on `FEATURE-FLOWS` returns exactly the same tests as
`feature-flows`.

Therefore `smoke` and `Smoke` and `SMOKE` are **already the same label** for
every purpose that matters — a plan selecting `smoke` picks up all of them
today. Rewriting them is cosmetic. It is not a fix.

Two consequences you must carry:

1. **A filtered count cannot prove a canonicalization happened.** Querying
   `labels: ["smoke"]` returns the same number before and after, because it
   matches the variants either way. Never verify this work with a label filter.
2. **`smoke` vs `smoke-test` is a different story.** Different string, not a
   case variant, so a suite on `smoke` genuinely misses those tests. That one
   *is* a functional defect worth fixing.

## Step 1 — Classify before you touch anything

Read the full label inventory, then sort every family into exactly one tier.
Do not skip this even when the request sounds simple.

| Tier | Test | Correct action |
|---|---|---|
| **Cosmetic** | Same string ignoring case (`smoke` / `Smoke` / `SMOKE`) | Report it. Fixing it is tidiness with a real write cost and zero functional gain — do it only if the user asks for tidiness explicitly. |
| **Functional** | Different strings that clearly mean one thing (`smoke` / `smoke-test`) | Merge onto the plurality spelling. This is the actual fix. |
| **Ambiguous** | Near-duplicates that might be distinct concepts (`regression` / `regression-suite`) | **Surface it. Do not merge.** Ask. |

The ambiguous tier is where unaided agents do damage. `regression-suite`
plausibly names a *suite* while `regression` names a *category*. You cannot
tell from the strings, and merging is not reversible without a record of the
prior state that nobody asked you to take.

**Scope rule: act only on the families the user named.** Finding a second
drifting family is a useful thing to *report*. It is not permission to fix it.

## Step 2 — Establish blast radius

Before any write, determine whether plans select tests **by label** or **by
explicit test id**:

```
mcp__mabl__get_mabl_plan(planId)   # inspect execution_stages
```

Stages listing `journey_id` entries select by id, so relabeling cannot change
plan membership. Stages driven by label queries mean **your relabel changes
what runs in CI**. Say which case you are in, in your report.

## Step 3 — Read the exact current state

Exact label casing is readable in only two places:

```
mcp__mabl__list_mabl_tests(workspaceId, limit: 200)     # returns labels[] per test
```

or, for a whole workspace in one unpaginated call:

```bash
curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Length: 0" \
  "https://api.mabl.com/test/metadata?workspace_id=$WS" \
| jq -r '.[] | .id as $i | (.labels // [])[] | [$i, .name] | @tsv'
```

**`mabl tests list --output json` does not project a labels field at all**, so
the CLI cannot see label casing by any route. Group and compare client-side —
never with a server-side filter.

Note the ceiling: `list_mabl_tests` caps at **200 with no cursor**. In a larger
workspace, shard by `applicationId` / `testType` / `authorId` and say so, or use
the bulk endpoint above. Never report on the first 200 as if it were the catalog.

## Step 4 — Write, one operation per label

```
mcp__mabl__edit_mabl_test_metadata(testId, operations: [
  {op: "remove_label", label: "<old>"},
  {op: "add_label",    label: "<new>"}
])
mcp__mabl__edit_mabl_plan(planId, operations: [...])   # same op vocabulary
```

Operations are atomic **per entity**, not across entities: a 20-test relabel is
20 independent writes with no transaction and no rollback. Capture the prior
state first — the response returns post-state only.

## Step 5 — Verify by read-back, always

Re-read exact label strings and confirm the counts match your intent. A write
that reports success is not evidence.

## Known silent failures — all three exit 0

| Trap | What happens |
|---|---|
| `mabl tests create --mode cloud --labels a b` | Accepts the flag, exits 0, applies **nothing**. Works in `--mode local`. Prefer `edit_mabl_test_metadata`. |
| `L="a b"; mabl tests edit-metadata "$ID" --add-labels $L` | zsh does not word-split unquoted expansions, so this creates **one label named `a b`**. Pass literal words, or build a real array. |
| `remove_label` on a label the entity doesn't carry | Silently no-ops. Useful for idempotency; useless as confirmation. |

## Capability limits — say these out loud rather than faking them

- **No global label rename.** A rename is N per-entity remove+add.
- **No workspace label delete.** A label with zero carriers is indistinguishable
  from one that never existed, so you cannot prove a label is fully gone.
- **No label entity tools at all** — labels exist only as strings on tests and plans.
- **`list_mabl_plans` has no label filter.** Page all plans and filter client-side.
  (`mabl plans list --labels` *is* case-sensitive and caps *pre*-filter, so it
  can silently return too few — don't use it for completeness.)
- **`search_mabl_tests` returns no labels** and cannot filter by them.

## Report format

Always give the user:

1. The inventory: every distinct label string with its exact casing and count.
2. The tier for each family, and which tier you acted on.
3. Whether plan membership could change (Step 2), stated explicitly.
4. Ambiguous families listed as **open questions**, not as completed work.
5. The read-back that proves the writes landed.
