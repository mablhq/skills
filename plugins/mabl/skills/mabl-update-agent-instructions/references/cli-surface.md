# `agent-instructions` CLI surface

Verified against mabl CLI `2.129.2` (measured 2026-08-28). Every command here is real, every flag was taken from `--help`, and the field list came from live `-o json` output. Re-check with `mabl agent-instructions <command> --help` rather than guessing.

## The commands

```
mabl agent-instructions list      -w <ws> -o json --limit <n>
mabl agent-instructions describe  <id> -o json
mabl agent-instructions create    -w <ws> --name <n> --instruction-text "<=1000 chars>"
                                  [--capabilities authoring recovery results_analysis]
                                  [--application-ids <a>...] [--environment-ids <e>...] [--disabled]
mabl agent-instructions update    <id> [--name <n>] [--instruction-text "<...>"]
                                  [--capabilities ...] [--application-ids ...] [--environment-ids ...]
                                  [--disabled | --enabled]
mabl agent-instructions delete    <id>          # exists; this skill never uses it
```

- `describe` and `update` take the id as a **positional** and accept **no `-w`** — instruction ids are globally unique.
- `--disabled` and `--enabled` conflict with each other on `update`; pass one.
- `--capabilities`, `--application-ids` and `--environment-ids` are **arrays** — pass multiple values space-separated.
- `list` accepts **no filters** beyond workspace and limit. Narrowing to one capability happens client-side, in the read script below.
- The 1000-character cap on `instruction_text` is **server-enforced**: exceeding it returns a 400 on both `create` and `update`.

## The silent listing default

`agent-instructions list`, `workspaces list`, `applications list` and `environments list` **all** default to returning 10 rows, silently. This is a shared default (`DEFAULT_LISTING_RESULT_LIMIT`), not a quirk of one command.

Pass an explicit high limit on every one of them. The consequences of not doing so are not cosmetic:

- A workspace with 16 instructions returns 10, and a change reconciled against the truncated set proposes a duplicate of a rule that already exists — or misses the rule it contradicts.
- A workspace with 15 applications resolves 10, and the eleventh silently cannot be found by name.

**Completeness has no positive signal.** The response carries no total, and the CLI discards the API's pagination cursor (`.then(result => result.agent_instructions ?? [])`), so the only available evidence is that **the row count came back below the limit passed**. Do not look for a total or a next page; there is neither. If count equals limit, raise the limit and read again — never report an ambiguous read as complete.

## The row shape

Each row from `list` / `describe` carries, among other fields:

| Field | Notes |
|---|---|
| `instruction_id` | suffix `-ain`; globally unique |
| `name` | display name |
| `instruction_text` | the text injected into the agent's prompt; max 1000 chars |
| `disabled` | boolean — `true` means it steers nothing |
| `capabilities[]` | `authoring` · `recovery` · `results_analysis`; **optional** |
| `application_ids[]` | may be **absent** rather than `[]` |
| `environment_ids[]` | may be **absent** rather than `[]` |
| `created_by_id` · `created_time` · `last_updated_by_id` · `last_updated_time` | audit fields, epoch ms |

**Read every array defensively** — `r.get('application_ids') or []`, never `r['application_ids']`. Absent and empty both mean "all", and roughly half the rows in a real workspace omit these fields entirely.

## `create` and `update` treat the same flags differently

Verified in the CLI source, not inferred from the help text. The two commands hit the API differently, and the difference decides whether an omitted flag is a decision or a no-op.

**`create` builds a full request body.** An omitted or empty scope array is sent as `undefined`, so the field is stored absent — which means **all**. There is no way to create a row scoped to "nothing".

**`update` builds a sparse body and sends it as a `PATCH`.** Only the flags actually passed appear in it.

| Flag on `update` | Effect |
|---|---|
| omitted | field **untouched** — the row keeps whatever scope it had |
| passed | field **replaced wholesale** by the values given |

So widening a row's scope means passing **every id the row should end up with**, additions and existing alike. Passing only the new ones drops the rest, and the command still exits 0.

`--enabled` is not a separate field: it is stored as `disabled: false`. That is why enabling is a real write with its own approval, and why it can be combined with a text edit in one command — which this skill deliberately does not do, to keep the two decisions separable.

> **Untested:** whether passing a scope flag with **no values** on `update` clears the field back to "all". It plausibly sends an empty array, which means all — but it has not been run. Do not rely on it; state it as unknown if it comes up.

## How `list` renders scope — and why to read the JSON instead

The table view renders the capability column as `capabilities?.join(', ') ?? 'All'`. That means:

| Stored value | Table shows |
|---|---|
| field **absent** | `All` |
| **empty array** `[]` | a **blank cell** |
| `['authoring']` | `authoring` |

**`All` and blank mean the same thing** — a workspace-wide rule every agent reads. A blank capability cell is the easiest row in a set to misread as "scoped to nothing" when it means the opposite. Judge scope from `-o json`, never from the table.

## Resolving the workspace

`-w` is optional on every command in this skill. Omitted, the CLI falls back to the machine-wide default from `mabl config get workspace` — whichever workspace this user last touched. Resolve it explicitly, in order, stopping at the first hit:

```bash
# 1. Does the project record one? Search for the KEY, not the id's shape —
#    then read the value out of whatever matched.
grep -rIn --exclude-dir=.git -i 'workspace' CLAUDE.md AGENTS.md .github/ .mabl/ 2>/dev/null

# 2. Is there a CLI default? Prints the id AND the workspace name.
mabl config get workspace

# 3. Neither — list them (this command also defaults to 10 rows).
mabl workspaces list -o json --limit 1000 | python3 -c \
  "import json,sys; [print(w['id'], '|', w['name']) for w in json.load(sys.stdin)]"
```

**Search for the key, never for an id pattern.** A regex built around the id's shape silently matches nothing when the id doesn't look the way the pattern assumed — and "no project record found" is then indistinguishable from "no search was possible", so the step falls through to the CLI default and targets the wrong workspace. Grepping for the word finds the id however it was written: `MABL_WORKSPACE_ID=`, `workspace:`, `workspaceId`, a `.mabl/config.json` entry, or a sentence in a memory file.

## Name ↔ id resolution

Scoping is stored as ids; humans think in names. Resolve both directions before reporting or applying. The hosted `mabl` MCP server is the nicer surface when available, and every row has a CLI fallback:

| Need | MCP tool | CLI fallback |
|---|---|---|
| workspaces, id ↔ name | `list_mabl_workspaces` | `mabl workspaces list -o json --limit 1000` |
| applications, id ↔ name | `list_mabl_applications` | `mabl applications list -w "$WS" -o json --limit 1000` |
| environments, id ↔ name | `list_mabl_environments` | `mabl environments list -w "$WS" -o json --limit 1000` |
| who am I / access check | `get_current_user` | `mabl auth info` |

**Detect, then degrade.** If the MCP server is not configured, use the CLI column and say once that you fell back. Nothing here is MCP-only.

> **The MCP server has NO agent-instruction tools.** Its ~79 tools cover plans, tests, flows, runs, applications, environments, credentials, data tables, deployments and authoring sessions — and nothing for agent instructions; it never calls the `/agentInstruction` endpoint. Reading and writing instructions is **CLI-only**. Use MCP for the lookups above and nothing else in this skill.

## Why the version pin sits where it does

The pin itself lives in the prerequisite block in `SKILL.md`; this is the reasoning behind it.

The whole `agent-instructions` CRUD surface — including `--enabled` — arrived in one commit at package version `2.109.18`. That version was never published; npm's `2.109.x` line begins at `2.109.27`, which is therefore the oldest version a user can actually install that supports every command this skill uses. Every other command here (`auth`, `config get`, `workspaces list`) long predates it, so `agent-instructions` is the binding constraint.

## The candidate read

Reads `.mabl/agent-instructions.json`, written by the read step in `SKILL.md`. Set `CAP` to the capability chosen when placing the change.

**Fetch wide, review narrow.** This prints the full text of only the rows the target agent actually reads — the chosen capability, plus every unscoped row, because unscoped means every agent. Everything else is counted and set aside, never silently dropped: the closing reconciliation line is what makes "narrowed on purpose" distinguishable from "read incompletely".

```bash
CAP="recovery"   # or authoring / results_analysis
python3 - "$CAP" <<'EOF'
import json, sys
from collections import Counter

cap = sys.argv[1]
rows = json.load(open('.mabl/agent-instructions.json'))

candidates, setaside = [], []
for r in rows:
    caps = r.get('capabilities') or []
    (candidates if (cap in caps or not caps) else setaside).append(r)

for r in candidates:
    caps = r.get('capabilities') or []
    tag = (f"capabilities={','.join(caps)}" if caps
           else "capabilities=ALL (unscoped - every agent reads this)")
    apps = r.get('application_ids') or []
    envs = r.get('environment_ids') or []
    text = r.get('instruction_text') or ''
    print(f"=== {r.get('name','(unnamed)')}  [{'disabled' if r.get('disabled') else 'ENABLED'}]")
    print(f"    {tag}")
    print(f"    apps={','.join(apps) if apps else 'ALL'}  "
          f"envs={','.join(envs) if envs else 'ALL'}  "
          f"{len(text)} chars  {r.get('instruction_id','(no id)')}")
    print(text, "\n")

unscoped = sum(1 for r in candidates if not (r.get('capabilities') or []))
by_cap = Counter(c for r in setaside for c in (r.get('capabilities') or []))
multi = sum(1 for r in setaside if len(r.get('capabilities') or []) > 1)
print(f"{len(candidates)} candidates read in full ({unscoped} of them unscoped); "
      f"{len(setaside)} set aside as out of scope for '{cap}'")
if setaside:
    print(f"  set-aside rows appear under (a row with two capabilities is counted "
          f"under each, so these need not sum to {len(setaside)}): {dict(by_cap)}"
          + (f"; {multi} row(s) carry more than one" if multi else ""))
print(f"reconcile: {len(candidates)} + {len(setaside)} == {len(rows)} fetched")
EOF
```

Two details in there are load-bearing:

- **`not caps` keeps unscoped rows in the candidate set.** Filtering on `cap in caps` alone drops exactly the broadest rows in the workspace — the ones most likely to contradict the change.
- **The set-aside tally counts capabilities, not rows.** A row scoped to two capabilities appears under both, so the per-capability numbers can exceed the row count. Report the row count as the total and the tally as a breakdown; presenting the tally as a partition makes the reconciliation look wrong when it is right.
- **The `apps=` / `envs=` line** is what makes the overlap rules in the skill usable. Without it a conflict confined to one application or one environment is indistinguishable from a workspace-wide one, and every conflict gets reported at full blast radius.
