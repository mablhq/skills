---
name: mabl-update-agent-instructions
description: |
  Land ONE change to how mabl's AI agents behave in a workspace. Work out
  which agent capability and which application/environment scope it applies
  to, read the instructions that agent already reads, then propose the
  smallest sensible action — amend a row, widen its scope, create one, or
  skip as already covered — and apply only after explicit approval.
  A contradiction with an already-enabled instruction HALTS for a human; it
  is never overwritten silently.
  Fire on: "make the authoring agent stop using hard waits", "tell the agent
  to use our URL variable instead of literal hosts", "the recovery agent
  shouldn't heal a real regression away", "update our agent instructions",
  "add a rule for the AI", "why is the agent doing X", or a pasted `*-ain`
  instruction id.
  NOT for changing a test — to edit one use mabl-test-edit, to create one use
  mabl-test-authoring. NOT for first-time workspace setup — use mabl-init.
allowed-tools: Bash, mcp__mabl__list_mabl_workspaces, mcp__mabl__list_mabl_applications, mcp__mabl__list_mabl_environments, mcp__mabl__get_current_user
---

# mabl update agent instructions

Agent instructions are the free-text rules mabl's AI agents read before they act. One change to them is rarely "write a new rule" — most of the work is deciding **where the change belongs** and **whether something already says it** (or says the opposite).

That is this skill's job. It places the change, reads what the affected agent already reads, and proposes one action. Writes happen only on explicit approval.

## Prerequisites

Instruction CRUD is **CLI-only** — the hosted `mabl` MCP server has no agent-instruction tools. The MCP server is used here for name↔id lookups only, and every one of those has a CLI fallback, so the CLI is the hard dependency and MCP is a convenience.

```bash
# Check the mabl CLI is installed and recent enough; install/upgrade if not
MIN_MABL_CLI_VERSION=2.109.27
command -v mabl >/dev/null 2>&1 || npm install -g @mablhq/mabl-cli
[ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ] || npm install -g @mablhq/mabl-cli@latest

mabl auth login --auto   # one-time OAuth in browser
mabl auth info           # reading needs any key; applying needs a write-capable one
```

**Then probe for the commands, because a version number is not a capability.** Features ship together and a build can satisfy the pin without carrying the surface:

```bash
mabl agent-instructions --help 2>&1 | grep -Eqw 'list' || echo "CLI has no agent-instructions surface — stop"
mabl agent-instructions update --help 2>&1 | grep -Eqw -- '--enabled' || echo "no --enabled flag — enabling is unavailable on this build"
```

If the surface is absent, say so and stop. Do not fall back to editing instructions any other way.

**Read `references/cli-surface.md` before running anything.** It holds the verified command and flag surface, the JSON row shape, the read script this procedure runs, name↔id resolution, the listing default, and the reason for the version pin.

## The three capabilities

Getting the capability wrong is the most common way a change has no effect: the rule exists, but the agent that would follow it never reads it.

| Capability | The agent | Reads instructions when |
|---|---|---|
| `authoring` | Test Authoring Agent | generating or editing test steps |
| `recovery` | Test Recovery Agent | a step failed and it is deciding how to heal |
| `results_analysis` | Results Analysis Agent | explaining a run or a failure |

## Empty means ALL

The one thing about this data that is easy to read backwards. **Every scoping field is a filter, and an empty or absent filter means "no restriction" — not "nothing".** An empty `capabilities` is a rule every agent reads; an empty `application_ids` applies to every application; likewise environments.

So the *least*-populated row is the *most*-reaching one, and a broad policy ("always make the run pass") is exactly the kind of thing that lives there — the most likely row to contradict a change and the easiest to miss.

**This is why an unscoped row is never filtered out.** It is not an exception to reading only what is relevant: an unscoped row *is* relevant to every capability, because every agent reads it.

When authoring, prefer to be explicit — pass `--capabilities` rather than leaving a new rule unscoped, so the next reader can tell the scoping was a decision and not an omission.

*(Absent vs empty in the JSON, and how `list` renders each: `references/cli-surface.md`.)*

### The one filter that is not empty, and cannot be changed here

`test_types` is a fourth scoping field, and it does not follow the rule above. Every instruction the CLI creates is stored as `test_types: ["browser"]`, and **no CLI command — `create`, `update` or `list` — exposes a flag for it.** So a rule written here reaches browser tests only; API, mobile and performance tests never read it, and nothing in the output says so.

Say this out loud whenever the change is about a non-browser test type, and send the reader to the mabl app to widen the row. Do not claim a rule applies to a test type this surface cannot scope it to.

## Establish the workspace, and name it out loud

**The workspace is an input.** When the request names one, take it and move on.

When it does not, `-w` becomes a trap: it is optional on every command here, and omitted the CLI falls back to the machine-wide default — possibly any workspace this user last touched. For a read that produces a puzzling set; for a **write** it authors a rule into the wrong workspace, with no error.

Resolve it with the ladder in `references/cli-surface.md`, then:

- **Always pass `-w` explicitly** from here on, even when it matches the default. An explicit id is the difference between a reviewable command and one whose target depends on machine state.
- **Report the workspace name, not just the id.** A human catches "Acme Web" being wrong and cannot catch one opaque string being wrong.
- If a project record and the CLI default **disagree, ask** — do not pick. That is exactly the situation that ends in a write to the wrong workspace.
- More than one plausible candidate and nothing recorded: ask, with the names.

**Pass every id verbatim, exactly as it came back.** Never derive one id from another, and never retype one from a report.

## Place the change

**Placement comes before reading, because placement decides what to read.** The request usually says *what* should be different, not *where* it applies. Decide each dimension and be able to say why:

| Dimension | How to decide |
|---|---|
| **Capability** | What moment does the change act on? Building a test → `authoring`. Reacting to a failure → `recovery`. Explaining a result → `results_analysis`. A change about behavior belongs on the agent that behaves, not the one that narrates. More than one capability is allowed, and widens the read. |
| **Applications** | Scope to an application only if the request is about *that app's* quirks; general judgment stays unscoped. Match what comparable existing instructions do — an oddly-scoped rule is one someone will later fail to find. Resolve the name to an id, and if the request named an app in words, show which id it mapped to: that mapping is a guess worth surfacing. |
| **Environments** | Same test. Scope only if the change genuinely differs by environment (stricter in Prod than Dev) — and if it does, that is **two** instructions, so say so. |

Ambiguous scope is a question, not a guess. One question, then proceed.

## Check the rule is no more specific than its scope

An instruction is injected into **every** agent action its configuration matches. There is no per-test, per-step or per-run targeting — **the configuration is the entire targeting mechanism.** So a rule written about one situation but scoped broadly gets applied to situations nobody considered.

Two shapes to tell apart:

- **Specific text, no condition.** *"Click Continue after entering the shipping address"*, scoped to `authoring` alone, reaches every test the agent writes — including ones with no address form. It needs a condition in the text (*"When a form asks for a shipping address, …"*), a narrower scope, or both.
- **Specific text whose condition is the scope.** *"Use the sandbox card number for payment steps"*, scoped to the Payments application, is self-limiting. Fine as written.

The question to ask: **what does the agent do with this when the situation it describes is absent?** If the answer is "something odd", the rule needs a stated condition.

**Never block on this.** State what the configuration will actually match, in plain words — *"this applies to every test the authoring agent writes here, not only checkout tests"* — offer the narrowing, and let the requester decide. A team is allowed to want a broad rule; they are just not well served by getting one without being told.

## Read what that agent actually reads

**Fetch wide, review narrow.** There is no server-side capability filter, so the fetch returns the workspace's whole set; the *review* is what narrows.

```bash
WS="<workspace_id>"; mkdir -p .mabl
mabl agent-instructions list -w "$WS" -o json --limit 1000 > .mabl/agent-instructions.json
```

That file holds every instruction's full text. `.mabl/` is the CLI's own working directory; write nothing outside it.

**`--limit` is not optional — the CLI's listing default is far lower than a real workspace and truncates silently, with no signal** (`references/cli-surface.md`). The only evidence of a complete fetch is a row count *below* the limit passed; if they are equal, raise it and fetch again.

Then run the **candidate read** from `references/cli-surface.md` for the capability chosen when placing the change. It prints in full only the rows that agent reads — the chosen capability plus every unscoped row — with each one's `apps=` / `envs=` scope and a line accounting for what it set aside.

**Read those candidates in full and no others.** A row scoped only to a capability the change does not touch is not a candidate: the agent being changed never sees it. Report how many rows were set aside and under which capabilities, so "narrowed deliberately" never looks like "read incompletely".

**Enabled and disabled are not interchangeable.** Only an enabled instruction steers an agent. A disabled row that covers the topic can still be the right row to amend, but amending it changes no behavior — enabling is a **separate decision and a separate command**, never a flag added to the text edit. Someone switched that row off on purpose.

## Classify each candidate

**A contradiction is found by reading text, never by reading names.** A name is a label someone chose; it can be neutral (`Recovery - Run completion policy`) while the text says the exact opposite of the change. Classifying from names alone means the halt only fires when a row happens to be helpfully named — luck, not a check.

Put each candidate in exactly one bucket:

| Verdict | When | Action |
|---|---|---|
| **update** | A row owns the topic and is merely silent on the new requirement | Amend that row. **Prefer this.** |
| **rescope** | A row already says this, but its configuration misses part of where the change needs to apply | Widen that row's scope. See below. |
| **create** | Nothing the agent reads covers the topic | New row, named to match the set's existing style |
| **skip** | Already stated, unchanged in substance, and already scoped wide enough | Nothing. Show the row that covers it. |
| **conflict** | An **enabled** row *the same agent reads* says the opposite | **HALT** |

**Prefer update over create.** Two instructions on one topic give the agent no way to rank them, and the second is invisible to whoever reads the first.

### A duplicate is a configuration question, not a dead end

When a candidate already says what the change says, the topic is covered — but **coverage is text *plus* configuration.** Compare that row's application and environment scope against where the change was placed:

| The existing row's scope | Verdict |
|---|---|
| the same, or already broader | **skip** — show the row and its scope by name |
| **narrower** — missing applications or environments the change needs | **rescope** — offer to widen that row's configuration |
| narrow *on purpose* — its own text names the app or environment it is scoped to | **create** a sibling, or split the rule. Say which, and why reuse was rejected. |

**Prefer rescope over create.** Two rows with identical text and different scope is the duplicate problem with extra steps: the next person to read one has to find and diff the other to learn they are one rule.

**A widened row is a behavior change for everything newly included.** Name the applications and environments that gain the rule, by name, and put it forward as its own approval. Widening is not tidying up.

### A conflict, and how far it reaches

**A rule under a different capability is not a conflict**, even when it reads like one: a contradiction only bites when the *same agent* holds both rules. An unscoped row is read by every agent, so it is always live.

**Application and environment scope narrow a conflict; they do not excuse it.** Because empty means all, the scopes overlap in one direction only:

| The change | The contradicting row | Verdict |
|---|---|---|
| unscoped | unscoped | **conflict**, everywhere |
| unscoped | scoped to app X | **conflict, but only for app X** — the change reaches into X, so tests there get both rules |
| scoped to app X | unscoped | **conflict** for app X — the broad rule reaches in |
| scoped to app X | scoped to app Y | **not a conflict** — the scopes never meet |

Environments behave identically — substitute "environment" throughout. A rule that contradicts only in Prod is a Prod-only conflict, and reporting it as workspace-wide overstates it.

A partial overlap is still a halt, but the resolution may be narrower than disabling the other rule — scoping the change to avoid the overlap is often better. **Name the specific applications and environments where the two actually meet**; "there is a contradiction" without a blast radius is not a decision anyone can make.

**An enabled conflict halts.** Write nothing. Present the contradiction, offer the ways out (disable the old rule, narrow it, narrow the change, or drop the change), and wait. Never silently overwrite, and never resolve it by judging which rule is better — that is the human's call.

### When the row is disabled

A disabled row steers nothing, so **nothing here halts** — there are no mixed signals to a live agent, and halting on a dormant row blocks a change nothing live opposes, which is how a gate teaches people to ignore it. Handle it as offers instead:

- **Still prefer amending it when it owns the topic.** A disabled row whose text contradicts the new policy is a landmine: the moment anyone re-enables it, the agent holds both rules. Amending retires the wrong policy instead of parking it.
- **Offer to enable it — its own numbered decision — whether it owns the topic or contradicts it.** A disabled row that covers the change is often the whole answer: someone already wrote this rule and switched it off. Say what enabling would turn on, and let the human decide.
- **Never offer to enable contradicting text unchanged without saying what that creates** — two opposing rules in front of one agent. Offer the pair (*amend to match the new policy, then enable*) as one decision, with "leave it off" beside it.
- **Say plainly that text alone changes nothing.** An amended-but-still-disabled row is recorded and dormant.
- **Create a new row instead only when reuse would drag in something unrelated** — it belongs to a group switched off deliberately, or its name and history mean something else. Say which.

## Write the proposal, then stop

Report in this shape. It leads with placement because that is the part most likely to be wrong, and ends with commands that have not run.

1. **Header** — the change verbatim; the workspace **name and id** and how it was resolved; rows fetched vs the limit passed (under it is the proof nothing truncated); how many reviewed as candidates and how many set aside, under which capabilities; CLI version; and that no writes happened.
2. **Where this change belongs** — the placement dimensions with their reasoning. Flag any judgment call the requester might disagree with.
3. **What this rule will match** — the specificity finding, in plain words. Offer the narrowing; do not withhold the change over it.
4. **What is already there that this touches** — **all** enabled candidates first, then disabled, never interleaved. One relationship per row from exactly this vocabulary: **owns-the-topic** / **adjacent** / **unrelated** / **contradicts**. Mark unscoped rows as such, and show application and environment scope **by name**.
5. **The proposal** — the verdict, the reasoning for update vs rescope vs create, and for a text change the **current and proposed text** with counted (not estimated) character counts against the 2000 limit. For a rescope, the scope before and after, by name, and what newly gains the rule.
6. **Decisions to make** — the numbered offers: any contradiction and its options, any enable, any rescope. Each states its consequence.
7. **To apply** — the exact commands, in order, clearly not yet run.

**The text in the proposal and the text in the command must be byte-identical.** No emphasis added for the write-up, no punctuation swapped. A human approves what they read, and what they read has to be what gets written — so write the proposed text once, plainly, and reuse that exact string.

Then stop and wait for a decision.

## Apply, on explicit approval only

Commands and flags: `references/cli-surface.md`. Four rules govern this step.

**Nothing is written without explicit approval — including this skill's own offers.** An offer to rescope, enable or disable is a line in the report, not a step already underway. Approval of the main change is not approval of the offers beside it; each one is answered on its own.

**Scope flags behave differently on `create` and `update`, and the difference is easy to get backwards.**

| | Flag omitted | Flag passed |
|---|---|---|
| `create` | the field is stored absent → **every** application / environment | exactly what was passed |
| `update` | the field is **left as it was** — omitting it does not widen anything | **replaces the whole list**, so pass every id the row should end up with, not just the additions |

So a narrowly-placed change created without `--application-ids` silently ships workspace-wide, and a rescope that passes only the new ids silently drops the ones already there.

**Confirm every id written, not just the first.** Echo each command and its result, then `describe` each affected instruction.

`create` and `update` print the resulting row as JSON on their own and **reject `-o`** with `Unknown argument: o`, exiting non-zero without writing. Only `list` and `describe` take `-o json`. So read the id straight out of what `create` printed — never re-list and match on the name.

**Never `delete`.** The command exists; this skill does not use it. `update <id> --disabled` is reversible with `--enabled` and keeps the audit trail. Deleting is not undoable and takes the history with it.

## Hard rules

- **Never invent a rule.** Every word of proposed instruction text traces to what was actually requested. If the request is vague, ask — do not pad it with generic testing advice the team never asked for.
- **Imperative and checkable.** "Wait for the spinner to disappear before asserting", not "handle timing properly." A reader must be able to tell whether the agent complied.
- **2000 characters, hard.** The server enforces it and says so: `instruction_text must be 2000 characters or less`. The CLI's own `--help` claims 1000 — it is wrong; trust the server. A rule that will not fit gets tightened, not truncated. If it genuinely needs more room it is more than one instruction — split it by topic and say so.
- **One change — but landing it may take two writes.** Resolving a contradiction, or enabling the row being amended, is part of landing the change. Improvements merely *noticed* get mentioned, not written.
- **Reflect intent, but flag a footgun.** If the change looks like trouble (disabling healing entirely, a rule far more specific than its scope, contradicting the team's own conventions), say so once, plainly, and let the human decide.

## Boundaries

- **This skill changes a set of instructions.** It works the same on an empty workspace — every candidate is simply `create` — but it does not set a workspace up. Discovering a workspace's applications, environments and credentials in the first place is a different job.
- **Copying a set to other workspaces** is a different job too; this skill changes one workspace.
- **Where instructions take effect depends on workspace configuration.** The CLI manages content; whether a given workspace's agents consult it is that workspace's setting. Authoring ahead of time is safe either way.

## Additional resources

- **`references/cli-surface.md`** — verified command and flag surface, the JSON row shape, the candidate read script, the silent listing default, `create` vs `update` field semantics, name↔id resolution (MCP preferred, CLI fallback), and the version pin rationale.
