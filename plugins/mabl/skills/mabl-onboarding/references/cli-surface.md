# The verified mabl CLI surface

Every CLI fact this skill depends on: which commands create and which only read, exact flag names and types, the version floor, and every footgun with its consequence.

> **Command and flag discovery.** Don't guess flag names — ask the CLI.
> `mabl <group> --help` and `mabl <group> <cmd> --help` are **the** authority for
> every command this skill drives. `mabl agent debug command-list` is *not* — it
> emits only the `mabl agent debug` subtree and knows nothing about
> `environments`, `datatables`, `deployments`, `agent-instructions`, `plans` or
> `branches`. Don't cite it as coverage for them. If a subcommand you want isn't
> in `--help`, say so in the report and name your weaker evidence instead of
> inventing a command.

**Every list command silently caps at 10 results** (`--limit` / `-l` defaults to
10). Pass an explicit `--limit` on every single list call, or you will inventory
a 45-workspace account as 10 workspaces, conclude an entity doesn't exist, and
create a duplicate. Say this once in the report.

**The uniform `--output json --limit N` idiom is not universal, and the misses
hard-fail.** An unknown flag prints a usage block plus `Unknown argument: output`
and **exits 1**. The shape is **writes reject `--output`, reads accept it**, with
exceptions running both ways — see "Which commands reject `--output`" below,
including `agent-instructions create`, which is the headline write. Check
`--help` before you add `--output` to any command you have not run before.

> **Where the version floor comes from.** `2.109.19` is the release that added
> `mabl agent-instructions` CRUD — the newest command this skill actually runs,
> and the flagship write of the empty-workspace case. Everything else in the
> write table is older, so nothing here justifies a higher floor. If a run needs
> a command that isn't in the write table, check that command's own release
> rather than raising this number for everyone.

**The mabl CLI creates no application, no credential and no plan.** Verify it
yourself: `mabl applications --help` is `list` / `describe`,
`mabl credentials --help` is `list` only, `mabl plans --help` is `list` /
`describe` / `edit-metadata`. There is no `create` in any of the three.

### The entity table, scoped by tool

The middle column names **subcommands, not invocations**. Every one of these
`list` subcommands silently caps at 10 — when you actually run one it carries an
explicit `--limit` and `--output json`. The reads that reject `--output` are
`auth info` and `datatables export`; the writes reject it as a rule — see
"Which commands reject `--output`" below.

| Entity | CLI surface (names only) | Who can create it |
|--------|-------------------------|-------------------|
| Workspace | `workspaces list` · `describe` · `copy` | account/company admin in the web app — **no agent path at all** |
| Link agent | `link-agents list` · `delete` · `terminate` | a human, deploying it — **no agent path at all** |
| Application | `applications list` · `describe` | **not the CLI**; hosted MCP `create_mabl_application`, or a human in the web app |
| Credential | `credentials list` (ids, names, types, descriptions — **never values**) | **not the CLI**; hosted MCP `create_mabl_credentials`, or a human in the web app |
| Plan | `plans list` · `describe` · `edit-metadata` | **not the CLI**; hosted MCP `create_mabl_plan`, which needs ≥1 test — so not on a day-one workspace |

Never write a sentence claiming you created a **workspace** or a **Link agent**,
and never say "no agent can create X" about an application, credential or plan —
say **"the CLI can't"**, and name what did create it. If a human creates one
mid-run, attribute it to them in the same document ("you created this, not me").
If you created the application over the MCP server, say that, with the tool name.


### The write surface, in full

| Write | Command | Notes |
|---|---|---|
| Environment | `mabl environments create --name … [--application-id … --app-url … --api-url …] [--variables k:v …] [--preview] [--link <agent>] [--mabl-branch <b>] -w <ws>` | prints `Environment <id> CREATED`, **not JSON**, and **rejects `--output`** — passing it exits 1 with nothing created |
| Environment | `mabl environments update <id> [--name …] [--variables k:v …] [--preview] [--link <a>] [--link-bypass] [--mabl-branch <b>]` | PATCH. **Not a sparse one — see the footgun below.** No `-w`. `--link-bypass` is real but `hidden:true`, so it's absent from `--help` |
| Environment | `mabl environments delete <id>` | |
| URL row | `mabl environments urls add <id> --application-id <app> [--app-url …] [--api-url …]` | `mabl environments urls add <id>` declares `--application-id` as **required** (`mabl environments urls add --help`) — so no URL row exists without an application. No `-w`. **No upsert, no edit, no delete**, and **rejects `--output`** |
| DataTable | `mabl datatables create <file> --name "…" -w <ws>` / `mabl datatables update <id> <file> [--format csv\|json]` | `create` emits JSON; `update` prints nothing. **No `delete` subcommand exists — a created DataTable is permanent from the CLI**, and `update` deletes rows absent from the file |
| Agent Instruction | `mabl agent-instructions create --name … --instruction-text "…" [--capabilities …] [--application-ids …] [--environment-ids …] [--disabled] -w <ws>` / `update <id> …` / `delete <id>` | both **print JSON unprompted and accept no `--output`** — passing it exits 1. Text limit: see below, the `--help` figure is stale. Response carries a `test_types` you cannot set — see below |
| Branch | `mabl branches create <name> -w <ws> --output json \| sed '/^Creating Branch \[/d'` / `merge --from <b> --to master` / `delete <identifier>` | ⚠ `create` prints `Creating Branch [<name>]` to **stdout before** the JSON, so a bare `\| jq` fails (`Invalid numeric literal at line 1, column 9`, exit 5) — **the `sed` is required, and the branch was still created**. `delete`/`describe` take an id **or** a name (`--name` forces name) |
| Deployment event | `mabl deployments create …` | the CI trigger |
| Application (MCP only) | `create_mabl_application` on the hosted `mabl` MCP server | **not a CLI command.** Creates the application *and* its app-environment-URL binding; needs an existing environment id. §3 route 1 |
| Local CLI default | `mabl config set workspace <id>` | **user-global**, see below |

Anything not in that table must be a read. The read surface, **as subcommand
names rather than invocations** — when you actually run one it carries
`--output json` and an explicit `--limit`, except where noted below:

`workspaces list|describe` · `applications list|describe` · `environments
list|describe|urls list` · `datatables list|describe|scenarios|export` ·
`agent-instructions list|describe` · `branches list|describe` · `plans list` ·
`credentials list` · `users list` · `link-agents list` · `auth info`

#### Which commands reject `--output`

**Writes reject `--output`; reads accept it.** Each rejection prints a usage block
plus `Unknown argument: output` and **exits 1**, with nothing created. Never carry a
count of them — the set is long, it differs per command group and it moves with the
CLI. Learn the shape, then ask `--help`.

The exceptions run both ways. On this skill's surface, measured on CLI 2.129.2:

- **Writes that accept `--output`** — `branches create` (which also puts prose on
  stdout, below), `branches merge`, `deployments create`.
- **Reads that reject it** — `auth info`, whose text you parse, and
  `datatables export`, which takes `--format json|yaml|csv` instead (default
  `json`; `describe`, `list` and `scenarios` all *do* have `--output`).

Everything else follows the rule, including the writes this skill runs at its own
gates: `agent-instructions create` and `update` print JSON unprompted and reject
the flag, and so do `environments create` and `environments urls add`. When one exits
1 that way, the fix is to drop the flag, **not** to suspect you invented the
subcommand.

Settle it against the CLI in front of you rather than trusting this paragraph. The
sweep is one line per command, reads only, and needs no auth:

```bash
for c in "environments create" "environments urls add" "agent-instructions create" \
         "branches create" "datatables export" "auth info"; do
  if sh -c "mabl $c --help" 2>&1 | grep -q -- '--output'; then
    echo "$c  accepts --output"
  else
    echo "$c  REJECTS --output"
  fi
done
```

Add any command you are about to reach for to that list. `sh -c` is deliberate:
`mabl $c --help` does not word-split under `zsh`, so the loop would otherwise report
top-level help for every entry and call them all rejections.

#### A second, separate hazard: `--output` accepted, but prose on stdout first

Rejecting `--output` is not the only way a command breaks a `| jq` pipeline. Two
commands in this skill's surface accept `--output json` and still put a human line
on **stdout**, so the pipe fails on prose, not on a flag. **The mandatory `sed` is
part of the invocation, not an optional nicety** — and note the two differ in
*where* the prose lands, so the same `sed` will not do for both:

- **`credentials list` — human line AFTER the closing bracket.**
  `Cloud credentials are not available for local runs.` See §1 for the exact
  `sed`.
- **`branches create` — human line BEFORE the JSON.** `mabl branches create <name>
  -w <ws> --output json` prints `Creating Branch [<name>]` first, then a blank
  separator line, then the JSON. Piped to `jq` it fails with
  `jq: parse error: Invalid numeric literal at line 1, column 9` and **exit 5** —
  column 9 is where `jq` gives up on the word `Creating`. *(Verified by mabl in the
  CLI source: `branches create`'s handler calls `logger.info("Creating Branch
  [...]")` before `outputEntity(...)`, and the CLI's log transport routes `info` to
  `console.log`, i.e. stdout. The behavioural check a customer can run is the parse
  error itself.)* The working form:

  ```bash
  mabl branches create "$BRANCH" -w "$WS" --output json \
    | sed '/^Creating Branch \[/d' | jq '.'
  ```

  Exit 5 is `jq`'s, not the CLI's — **the branch was created.** Do not retry on it;
  re-read with `mabl branches list -w "$WS" --status open --output json --limit 100`
  and you will find it there. A blind retry on this error is how a run ends up
  reporting two branches, or reporting a failure that never happened.

  **That last sentence is the tell: this command creates something.** If you run it
  because the run needs a branch, it is an ordinary gated write. If you run it to
  *check this claim*, it is a diagnostic write — and it still created a branch, so it
  is gated and logged exactly the same way (`references/write-gates.md`, "A
  diagnostic or probe write is a gated write, and it is logged like any other").

**Never invent a subcommand or a flag.** And before you pipe any command's output
to `jq` for the first time, run it **unpiped once** and look at what is actually on
stdout. Two commands in a surface this small already fail this way; assume there is
a third you have not met.

### Agent Instructions — the shape that bites

**The real limit on `--instruction-text` is 2000 characters, and the flag's own
help is stale.** `--help` says *"The instruction text (max 1000 characters)"*;
the CLI does **not** enforce it, and the server accepts past 1000 and rejects
above 2000 with `instruction_text must be 2000 characters or less`. So:

- **Budget to 2000**, and put the count in the draft
  (`instruction text: 1480 / 2000 characters`). Do not split or demote text
  between 1001 and 2000 characters — it stores fine, byte-exact.
- **On overflow the write fails loudly and creates nothing**: a non-zero exit and
  a message naming the field and the real limit. There is **no silent truncation
  at any length**, so you never end up with a half-stored instruction — but tell
  the operator what happened rather than retrying blind.
- **Split, don't truncate**, when a draft genuinely exceeds 2000. Several narrow
  instructions scoped by `--capabilities` and `--application-ids` beat one
  truncated blob and stay independently editable.
- **What still doesn't fit goes to §7 as policy**, marked as such, not dropped.
- The same limit applies to `update <id>`.
- *(Measured 2026-09 against CLI 2.129.2: the server's own validator rejects
  above 2000, and a 1400-character instruction stored whole. The
  customer-runnable check is the rejection message itself — re-measure it rather
  than trusting this line if the CLI has moved on.)* Do not copy the stale 1000
  into their committed file.

**This file is where the 2000 lives.** `references/closing-report.md` and
`references/write-gates.md` both restate it; if the limit moves, change it here
first and follow the two.

Capabilities are exactly `authoring`, `recovery`, `results_analysis`. **The CLI
does not validate them, but the server does — and its rejection tells you
nothing.** `results-analysis` with a hyphen is rejected by both `create` and
`update` as a bare `Bad Request` (exit 1, nothing created, an existing
instruction's capabilities left untouched). It names no field and lists no valid
values, so **treat an unexplained `Bad Request` on either call as a misspelled
capability first.** There is no silently-stored-but-inert instruction to go
hunting for.

The identifier field is `instruction_id`, not `id`, and instruction ids carry an
`-ain` suffix. `update` is a true sparse PATCH, so it converges in place and never
duplicates. *(All three verified by mabl in the source, and **none of them is visible
in `--help`** — so do not go to `--help` to check them and do not drop them when it
comes back silent. `instruction_id`: the CLI's `update` handler returns
`instruction.instruction_id ?? id`, i.e. the field it reads off the entity is
`instruction_id`. The `-ain` suffix: the API's id generator registers the agent
instruction entity type with the literal tag `ain`, so every generated id ends
`-ain`. Sparse PATCH: the CLI builds the request body by copying **only** the flags
you actually passed — each field is guarded by an `!== undefined` check — and sends it
as an HTTP `PATCH` to `/agentInstruction/<id>`. The customer-runnable check for all
three is one round trip: `create`, read `instruction_id` out of the JSON it prints and
note its `-ain` ending, then `update <id> --name X` and `describe <id>` — the name
changed, `instruction_text` and `capabilities` are untouched, the `instruction_id` is
the same one, and `agent-instructions list` still shows one row, not two.)*
`create` scopes workspace-wide unless narrowed with
`--application-ids` / `--environment-ids`; `--disabled` creates it inert for
review.

#### `test_types` — a field in the response with no flag behind it

The JSON `create` prints back carries **`test_types: ["browser"]`**, and there is
**no CLI flag that sets it**. `mabl agent-instructions create --help` lists
`--name`, `--instruction-text`, `--capabilities`, `--application-ids`,
`--environment-ids`, `--disabled` and `-w`, and nothing else — so the value is not
something you chose, and not something you can change. Don't let it read in the
report as a setting you picked.

**What is knowable, and say only this much:**

- The CLI **hardcodes** `test_types: ['browser']` into the create request. *(Verified
  by mabl in the CLI source, where the request body sets it unconditionally with the
  comment "Only browser test type is currently supported; matches UI behavior". The
  customer-runnable check is the field's presence in the create response with no flag
  in `--help` able to have produced it.)*
- So **every instruction this skill creates is browser-scoped**, whether or not
  anyone intended that, and `update` does not carry a way to change it either.
- **Mobile is therefore out of reach on this path.** If the operator wants
  mobile-scoped agent instructions, say plainly that the CLI cannot express the
  scope and route them to the web app to check what the product offers there — do
  **not** guess at a flag, a value like `mobile`, or an API field.
- **Unmeasured:** what mabl's agents do with `test_types` is not something this run
  observes. Report it as a field you did not set, not as a scope you verified.

**Unmeasured, and don't imply otherwise:** creating an instruction with the
right capability value proves it exists, not that it steers authoring. Only a
real run tells you that. Say so.

### The footguns that silently produce a wrong result

Write these into the durable file in §7 so the next agent inherits them.

- **`environments update` resets booleans by omission.** *(⊘ Unobservable on a
  day-one workspace — see below.)* Four fields are derived
  from flag *presence* and therefore always sent: `preview`,
  `use_link_agent`, `link_bypass_mabl_proxy`, `use_source_control_tag`. A narrow
  `mabl environments update <id> --name X` silently sets `preview=false`,
  **detaches the Link agent**, unsets the proxy bypass, and unpins the mabl branch
  — with no error and no output. **Every update must re-pass all four:
  `--preview` / `--link` / `--link-bypass` / `--mabl-branch`.** A three-flag
  remedy silently loses the fourth.
  **`--link-bypass` is a real flag but it is hidden, so it does not appear in
  `mabl environments update --help`.** It is registered on the option builder that
  `create` and `update` share, defaults to `false`, and is sent on every call. So
  an environment set to bypass the mabl HTTP proxy over Link loses that setting on
  *any* update unless you pass a flag `--help` never mentions — which is exactly
  why it is written down here. *(Verified by mabl in the CLI source; not
  customer-checkable from `--help`, which is the whole point. The behavioural check
  a customer **can** run: pass `--link-bypass` and the setting survives; omit it
  and it doesn't.)* This is the one place in this skill where `--help` is not
  sufficient — **keep the claim regardless of what `--help` shows**, and never
  "verify" it away.
  Separately, passing `--variables` replaces the **entire** variable map with no
  merge and no per-key delete, so re-send every variable you want to keep. An
  update that **omits** `--variables` sends no variable field at all, so it leaves
  them alone — the empty list is converted to nothing before the request, and the
  request is a PATCH. *(Mechanism verified by mabl in the CLI source; not
  demonstrable read-only, since proving it needs a live update. Treat "omitting is
  safe" as the documented behaviour, and still re-send the map whenever you know
  it.)*
- **`datatables update` is destructive convergence.** It updates matching rows,
  adds new ones, and **deletes any row absent from the file**. If a teammate
  adds a scenario in the UI, the next converge from the file removes it.
  Converge from the file or edit in the UI, not both. **This sentence is a required
  caveat in the `datatables update` gate**, and it is named in the `datatables
  create` gate too, because create is what commits them to the file-as-source-of-
  truth pattern.
- **`urls add` has no upsert and no delete.** Re-running it for an
  already-associated URL creates **another** row, and there is no CLI path to
  edit or remove a wrong one. A wrong URL row becomes a human cleanup task.
  **This sentence is a required caveat in the `urls add` gate** — that gate is
  where the operator says yes, so that is where the irreversibility has to be
  legible. Same rule for the MCP `create_mabl_application` write, which also
  creates a URL binding.
- Passing `--app-url` / `--api-url` to `environments create` **without**
  `--application-id` silently drops the URLs. The environment is created, the
  command succeeds, and no test can target it. This is the single most likely
  way an onboarding run produces a useless environment.
- **Space-delimited array flags reject `,` `;` and `|` with no escape
  mechanism.** A password containing `;` or a URL with a comma in its query
  string cannot be set through the CLI at all. **This applies to `[array]` flags
  and to nothing else. Which flags are arrays depends on the command — don't
  generalise, and check `--help`, which prints the type:**
  - `environments create`: `--app-url` and `--api-url` are **arrays**
    (`[array]` in `--help`), as is `--variables`.
  - `deployments create`: `--app-url` and `--api-url` are **plain strings**
    (`nargs: 1, type: 'string'`) — one URL each, per run. The arrays there are
    `--browsers`, `--labels` and `--http-headers`.
  - `environments update`: `--variables` is an array; there are no URL flags at
    all (URL rows are `environments urls add`).
  - `agent-instructions create` / `update`: the arrays are `--capabilities`,
    `--application-ids` and `--environment-ids`.

  **`--instruction-text` is `[string]`, not an array, and commas in it are
  completely harmless.** Write ordinary English in it, with commas, semicolons,
  colons and comma-separated lists, exactly as you would in any prose. *(Verified:
  `mabl agent-instructions create --help` types `--instruction-text` as
  `[string] [required]` while typing `--capabilities`, `--application-ids` and
  `--environment-ids` as `[array]`.)*

  This distinction is load-bearing and has already been got wrong the expensive
  way: read as a house style rather than as a parser constraint, it produced 1200+
  characters of comma-free agent-instruction prose — degrading the skill's own
  flagship artifact for a limit that does not apply to that flag. **The rule is
  about how yargs splits array arguments. It is not a writing style.** If you catch
  yourself rephrasing readable prose to avoid punctuation, you are in a `[string]`
  and the rule does not apply — stop.
- A `--variables` value containing a colon (i.e. every URL) trips a spurious
  yellow `Variable wrapping whitespace detected` warning. The value is stored
  intact. Don't treat it as a failure and don't let it look like one in the
  report.
- **`mabl config set workspace <id>` is user-global**, not per-project. Setting
  it silently repoints every other repo on the machine. Offer it explicitly as
  its own gated write, and if declined, pass `-w` on every command.
- `-w` is **registered but never read** on `deployments create` and on
  `datatables update`. *(⊘ Unobservable on a day-one workspace — see below.)*
  Both accept it without complaint and both ignore it, so
  passing it does nothing and *relying* on it to disambiguate a workspace will
  bite you. **This contradicts their own `--help`**, which advertises
  `--workspace-id, -w  Workspace containing target environment and/or application`.
  Each derives the workspace from the ids instead: `deployments create` resolves it
  from the application or environment id, and `datatables update` locates the table
  by the DataTable id alone. *(Verified by mabl in the CLI source; not
  customer-checkable from `--help`, which is exactly why it is written here.)*

  **This is an established fact — keep it. Do not re-derive it and do not drop it
  because you cannot open the source.** The behavioural test a customer *can* run:
  pass a `-w` naming a **different** workspace than the ids belong to. The command
  still targets the ids' workspace and succeeds, which is the whole hazard. Never
  quietly delete a footgun because your evidence for it is not local.
- **`-l` is overloaded.** On list commands it means `--limit`; on
  `deployments create` it means `--labels`. `-l 50` on a deployment creates a
  label named `50`. Spell both out.
- Mainline in mabl branches is **`master`**, not `main`. `branches merge --to`
  defaults to `master`. Hardcoding `main` either fails or, with
  `--auto-branch` on the deployments path, silently creates a stray branch.
  *(⊘ Unobservable on a day-one workspace — see below.)*

#### Three of these cannot be observed on the workspace this skill targets

Keep them anyway. This is the note that stops the next run wasting a pass hunting
for confirmation that **cannot exist on a new workspace** — and, worse, concluding
from a failed hunt that a documented footgun is wrong and quietly deleting it.

| Footgun | Why it is unobservable here | What a day-one run actually sees |
|---|---|---|
| **`environments update` resets four booleans by omission** | demonstrating it needs an `environments update` — and this skill's build-out **creates** environments, it never updates one | nothing at all; no update is performed, so no reset can be witnessed |
| **`-w` accepted but ignored** on `deployments create` / `datatables update` | demonstrating it needs one of those two commands to run against a **second** workspace. `deployments create` needs an application; `datatables update` needs an existing DataTable | nothing; and note `--help` **advertises** the flag, so the only local evidence points the *wrong* way |
| **Mainline is `master`, not `main`** | a fresh workspace's `branches list` returns **no mainline row** — mainline is not a branch record, so there is nothing to read the name off | an empty list, or only branches this run created. Absence of a `master` row is **not** evidence against the claim |

The rule the rest of this section already states, restated where it bites hardest:
**an unobservable claim is not a weak claim.** Each of the three is marked with its
evidence basis and its customer-runnable check, and each check needs a workspace
further along than this one. So:

- **Do not "verify" them away.** A read that returns nothing is not a
  counter-example. The three failure modes are: deleting the footgun, softening it
  to a hedge, and — the sneakiest — writing it into §7's file with a "we could not
  confirm this" qualifier that reads to the next agent as "probably untrue".
- **Do not send the operator looking either.** Never write "check whether your
  mainline is called `master`" in the report or in the committed file. On this
  workspace they will find nothing, and a null result invites them to delete the
  warning.
- **Do say they are unobservable here**, once, in report section D: *"three of these
  are inherited, not observed — nothing on a day-one workspace can exercise them.
  They are here because they bite later, on your first `environments update`, your
  first multi-workspace `deployments create`, and your first branch merge."* That
  sentence is what makes them survive.

### The CI deployment trigger

Draft it as a patch the human merges through their normal PR flow. Don't edit
their workflows unless they ask.

```bash
mabl deployments create \
  --application-id <APPLICATION_ID> \
  --environment-id <ENVIRONMENT_ID> \
  --browsers chrome firefox \
  --labels smoke \
  --revision "$GITHUB_SHA" \
  --repository-url git@github.com:acme/webapp.git \
  --await-completion --fast-failure --output json

# PR preview, overriding the URL per run
mabl deployments create \
  --application-id <APPLICATION_ID> \
  --override-environment-id <PREVIEW_ENV_ID> \
  --app-url "https://pr-${PR_NUMBER}.preview.example.com" \
  --labels smoke --output json
```

Hard dependency rules, each a hard error if violated: `--fast-failure` requires
`--await-completion`; `--auto-branch` requires `--mabl-branch`;
`--snapshot-from` requires `--environment-id`; `--override-environment-id`
requires `--application-id`; and at least one of `--application-id` /
`--environment-id` is required. `--output` forces silent mode. And **exit 1 does
not distinguish "a test failed" from "the invocation was malformed"** — gate on
the parsed JSON, not the exit code alone.

