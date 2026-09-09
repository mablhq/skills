# `agent-instructions` CLI surface

Verified against mabl CLI `2.129.2` (measured 2026-08-28). Every command here is real, every flag was taken from `--help`, and the field list came from live `-o json` output. Treat this as a measured surface snapshot: re-check command and flag availability with `mabl agent-instructions <command> --help` before using them, and follow the live output if it differs.

## The commands

```
mabl agent-instructions list      -w <ws> -o json --limit <n>
mabl agent-instructions describe  <id> -o json
mabl agent-instructions create    -w <ws> --name <n> --instruction-text "<text>"
                                  [--capabilities authoring results_analysis]
                                  [--application-ids <a>...] [--environment-ids <e>...] [--disabled]
mabl agent-instructions update    <id> [--name <n>] [--instruction-text "<...>"]
                                  [--capabilities ...] [--application-ids ...] [--environment-ids ...]
                                  [--disabled | --enabled]
mabl agent-instructions delete    <id>          # exists; this skill never uses it
```

- `describe` and `update` take the id as a **positional** and accept **no `-w`** — instruction ids are globally unique.
- **`-o` exists only on `list` and `describe`.** `create` and `update` print the resulting row as JSON unconditionally, and passing `-o` to either fails with `Unknown argument: o` and a non-zero exit, writing nothing.
- `--disabled` and `--enabled` conflict with each other on `update`; pass one.
- `--capabilities`, `--application-ids` and `--environment-ids` are **arrays** — pass multiple values space-separated.
- `list` accepts **no filters** beyond workspace and limit. Narrowing to the chosen capabilities happens client-side, in the candidate-read recipe below.
- **The `instruction_text` cap is stated in `SKILL.md`'s hard rules; this is how it was established.** Measured 2026-08-28 by bisection against the live server: the limit is exact, and one character over it fails with `instruction_text must be 2000 characters or less`, exits non-zero, and writes nothing. `create --help` prints a lower number and `update --help` prints none; the server is authoritative over both.

## The silent listing default

Measured 2026-08-28: `agent-instructions list`, `workspaces list`, `applications list` and `environments list` **all** default to returning 10 rows, silently. The workflow does not rely on that default staying true; it passes an explicit limit every time.

Pass an explicit high limit on every one of them. The consequences of not doing so are not cosmetic:

- A workspace with 16 instructions returns 10, and a change reconciled against the truncated set proposes a duplicate of a rule that already exists — or misses the rule it contradicts.
- A workspace with 15 applications resolves 10, and the eleventh silently cannot be found by name.

**Completeness has no positive signal.** The response carries no total, and the CLI discards the API's pagination cursor (`.then(result => result.agent_instructions ?? [])`), so the only available evidence is that **the row count came back below the limit passed**. Do not look for a total or a next page; there is neither.

Use the same check for every CLI list in this skill:

1. Pass an explicit limit larger than the workspace should need.
2. Count the returned rows.
3. If `count == limit`, repeat with a higher limit or report the read as incomplete.

## The row shape

Each row from `list` / `describe` carries, among other fields:

| Field | Notes |
|---|---|
| `instruction_id` | suffix `-ain`; globally unique |
| `name` | display name |
| `instruction_text` | the text injected into the agent's prompt |
| `disabled` | boolean — `true` means it steers nothing |
| `capabilities[]` | `authoring` · `results_analysis` · `recovery` (retired — see `SKILL.md`); **optional** |
| `application_ids[]` | may be **absent** rather than `[]` |
| `environment_ids[]` | may be **absent** rather than `[]` |
| `created_by_id` · `created_time` · `last_updated_by_id` · `last_updated_time` | audit fields, epoch ms |

**Read every array defensively** — `r.get('application_ids') or []`, never `r['application_ids']`. Absent and empty both mean "all", and roughly half the rows in a real workspace omit these fields entirely.

## Why `create` and `update` treat the same flags differently

What an omitted flag does on each command is the operative table in `SKILL.md`'s apply step. This is the reason behind it.

The two commands build their request bodies differently. `create` builds a full body, so an omitted or empty scope array goes out as `undefined` and the field is stored absent — which is why there is no way to create a row scoped to "nothing". `update` builds a sparse body and sends it as a `PATCH`, so only the flags actually passed appear in it at all.

That single difference is what makes an omission a decision on one command and a no-op on the other. And a replacement that drops ids exits 0, so verify an `update` by describing the row afterwards.

`--enabled` is not a separate field: it is stored as `disabled: false`. That is why enabling is a real write with its own approval, and why it can be combined with a text edit in one command — which this skill deliberately does not do, to keep the two decisions separable.

**Passing `--application-ids` with no values clears it.** Measured 2026-08-28: `update <id> --application-ids` with nothing after it stores `application_ids: []` — an empty array, not an absent field. Empty means all, so the row does widen back to every application. But the two are not identical on screen: `list`'s table renders an absent field as `All` and an empty array as a **blank cell**, so a row cleared this way reads as scoped-to-nothing to the next person. Prefer it anyway over leaving a stale scope; just say in the report that the field is now empty rather than absent.

The same empty-flag behavior has not been measured for `--capabilities` or `--environment-ids` in this reference. When clearing one of those fields matters, probe it on a disposable row first, describe the row after the write, and report the observed stored value before relying on it.

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
grep -rIn --exclude-dir=.git -Ei \
  'workspace[ _-]?id|workspace:' \
  CLAUDE.md AGENTS.md .github/ .mabl/ 2>/dev/null

# 2. Is there a CLI default? Prints the id AND the workspace name.
mabl config get workspace

# 3. Neither — list them (this command also defaults to 10 rows).
mabl workspaces list -o json --limit 1000 | python3 -c \
  "import json,sys; [print(w['id'], '|', w['name']) for w in json.load(sys.stdin)]"
```

**Search for workspace-id keys, never for an id pattern.** A regex built around the id's shape silently matches nothing when the id doesn't look the way the pattern assumed — and "no project record found" is then indistinguishable from "no search was possible", so the step falls through to the CLI default and targets the wrong workspace. Key-shaped matches find the id however it was written: `MABL_WORKSPACE_ID=`, `workspace:`, `workspaceId`, or a `.mabl/config.json` entry. Matching the key rather than the bare word is also what keeps `${{ github.workspace }}` out of the results, so workflow files stay searchable — a repo that records its id as a CI environment variable is a common case, and excluding that YAML would hide the answer entirely.

## Name ↔ id resolution

Scoping is stored as ids; humans think in names. Resolve both directions before reporting or applying. The hosted `mabl` MCP server is the nicer surface when available, and every row has a CLI fallback:

| Need | MCP tool | CLI fallback |
|---|---|---|
| workspaces, id ↔ name | `list_mabl_workspaces` — takes no workspace argument | `mabl workspaces list -o json --limit 1000` |
| applications, id ↔ name | `list_mabl_applications` — **workspace id required** | `mabl applications list -w "$WS" -o json --limit 1000` |
| environments, id ↔ name | `list_mabl_environments` — **workspace id required** | `mabl environments list -w "$WS" -o json --limit 1000` |

**Pass the workspace id to the application and environment tools.** Measured 2026-09-03, two runs: called without it, both fail with `workspaceId: Required` and the call has to be repeated. The workspace is already in hand by this point — it is resolved before anything gets read.

**Detect, then degrade.** If the MCP server is not configured, use the CLI column and say once that you fell back. Nothing here is MCP-only.

> **The MCP server has NO agent-instruction tools.** Its ~79 tools cover plans, tests, flows, runs, applications, environments, credentials, data tables, deployments and authoring sessions — and nothing for agent instructions; it never calls the `/agentInstruction` endpoint. Reading and writing instructions is **CLI-only**. Use MCP for the lookups above and nothing else in this skill.

## Why the version pin sits where it does

The pin itself lives in the prerequisite block in `SKILL.md`; this is the reasoning behind it.

The whole `agent-instructions` CRUD surface — including `--enabled` — arrived in one commit at package version `2.109.18`. That version was never published; npm's `2.109.x` line begins at `2.109.27`, which is therefore the oldest version a user can actually install that supports every command this skill uses. Every other command here (`auth`, `config get`, `workspaces list`) long predates it, so `agent-instructions` is the binding constraint.

## The candidate read

Reads `.mabl/agent-instructions.json`, written by the read step in `SKILL.md`, against the capabilities chosen when placing the change.

**Fetch wide, review narrow.** The fetch returns every row in the workspace; the candidate read keeps only the rows the target agents actually read. Put a row in the candidate set when either of these is true:

- `capabilities` is absent or empty, because unscoped means every agent reads it.
- `capabilities` intersects the chosen capability set. For a change placed on both `authoring` and `results_analysis`, a row scoped to either one is a candidate.

Everything else is set aside, never silently dropped.

For every candidate, print enough to classify it without another lookup:

- name and `instruction_id`
- enabled vs disabled
- capabilities, with an explicit `ALL` label when unscoped
- application ids or `ALL`
- environment ids or `ALL`
- counted character length
- full `instruction_text`

Then print the reconciliation:

- candidate row count
- unscoped candidate count
- set-aside row count
- set-aside breakdown by capability, with a note that rows scoped to two capabilities count under both
- `candidates + set aside == fetched`

Four details are load-bearing:

- **Capability matching is set intersection.** Running a one-capability read for a two-capability change misses contradictions visible only to the other selected agent.
- **Unscoped rows stay in the candidate set.** Filtering only on capability membership drops exactly the broadest rows in the workspace — the ones most likely to contradict the change.
- **The set-aside tally counts capabilities, not rows.** A row scoped to two capabilities appears under both, so the per-capability numbers can exceed the row count. Report the row count as the total and the tally as a breakdown; presenting the tally as a partition makes the reconciliation look wrong when it is right.
- **The application and environment lines make the overlap rules usable.** Without them a conflict confined to one application or one environment is indistinguishable from a workspace-wide one, and every conflict gets reported at full blast radius.
