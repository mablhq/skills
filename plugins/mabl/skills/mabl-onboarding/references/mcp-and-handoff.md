# The hosted mabl MCP server, and the mabl-init handoff

The three MCP states and each remedy, the probe, the application routes that key on them, and gate C5: the mabl-init handoff contract, its four degradation branches and the fallback section it writes.

The hosted **`mabl` MCP server** is *optional* for this skill but it changes two
things, so probe for it in step 0 with the commands given there and record the
answer:

1. It is the **only** agent path to `create_mabl_application` — the entity every
   other write waits on (§3 route 1).
2. It is **strictly required** by `mabl-init`, whose entire **mabl data** surface is
   `mcp__mabl__*` — its `allowed-tools` also carries `Bash`, `Read`, `Write` and
   `Edit` for the file it writes, but **no CLI fallback for reading mabl** — and to
   which you hand off in step 8 on one of **four** named branches (§8).

**It has three states, not two, and the middle one has its own remedy.** This is
the single most consequential thing to get right in the whole preflight, because
§3's application route, §8's handoff branch and §10's blocking count all key on
it, and the most likely real-world state is the one a two-state model gets wrong:

| State | What you see | The remedy — and it is not interchangeable |
|---|---|---|
| **1. absent** | no `mabl` server configured at all | **add** the entry — §0's **state-1 add gate**, which carries the command |
| **2. configured, not authenticated** | a `mabl` entry exists, `Needs authentication`, and the only `mcp__mabl__*` tools in the session are `authenticate` / `complete_authentication` | **authenticate it.** Adding it again is the *wrong* remedy — it is already added |
| **3. reachable** | connected **and** `create_mabl_application` is in the tool list you can actually see | none; take §3 route 1 |

State 2 is the state a fresh install lands in, and it is **one operator step from
state 3**. Telling the operator to add a server they already have — the remedy a
two-state model reaches for — burns the run's most valuable single sentence. If
you find state 2, the highest-value thing you can say in the entire session is
*"the server is already configured; it just needs you to sign in once"*.

**Never hand off blind and never hard-fail on any of the three.** If it genuinely
needs adding (state 1 only), the server key is `mabl` and the entry is
`{"type": "http", "url": "https://mcp.mabl.com/mcp"}` — offered as a gated write
with a runnable command in **§0's state-1 add gate**, not as JSON to paste.

**The hosted `mabl` MCP server does create them.** Its tool list includes
`create_mabl_application`, `create_mabl_environment`, `create_mabl_credentials`,
`create_mabl_data_table` and `create_mabl_plan`. Do not assume a tool is
present just because it is named: the server hides tools a workspace has no
feature flag for, so read the tool list you actually have rather than this one.
Two shapes matter here:

- `create_mabl_application` takes a workspace id, a name, an **existing
  environment id**, a URL and a type, and creates the application **and** the
  app-environment-URL deployment binding in one call. So it also produces the
  first URL row.
- `create_mabl_plan` requires **at least one test id**. A day-one workspace has
  zero tests, so plan creation is out of reach on this run for that reason — not
  because no tool exists. Say it that way.

**What this skill does with that.** Workspace writes go over the **CLI**, with
one deliberate exception: **the application**, which the CLI cannot create and
which everything else waits on. **That exception keys on all three MCP states, not
two.** If the server is **reachable (state 3)**, you offer `create_mabl_application`
as an ordinary gated write. If it is **configured but not authenticated (state 2)**,
you offer the **sign-in first** — one operator command makes the write yours (§3
route 1A) — and only a **declined** sign-in turns the application into a human step.
If it is **absent (state 1)**, the application is a human step in the web app, with
the optional add offered alongside it. Never let state 2 fall through to the human
route unasked; never present the human route as the only one when the server is
there or one sign-in away. **Credentials are the
one capability this skill declines on purpose** — `create_mabl_credentials` would
put a live password in this transcript, so it goes to the web app and you say why
(§4). Declining a capability you have is fine; pretending you lack it is not.

### The MCP probe — run these, don't invent one

Record the answer. **§3's application route, §8's handoff branch and §10's
blocking count all depend on it**, and a `create_mabl_application` you never
offered is a run blocked for no reason.

**The primary signal is your own tool list, because it is harness-independent and
it is what actually decides whether you can write.** Read it first:

- `mcp__mabl__create_mabl_application` visible → **state 3, reachable.**
- the only `mcp__mabl__*` tools are `authenticate` and `complete_authentication`
  → **state 2, configured but not authenticated.** That two-tool surface *is* the
  fingerprint of an unauthenticated hosted mabl server; don't read it as "the
  server has no create tools".
- no `mcp__mabl__*` tools at all → **state 1 or a failed connect.** The tool list
  alone can't tell those apart, so corroborate with the commands below.

Then corroborate with the harness, which is the only thing that can distinguish
*absent* from *configured-and-not-working*. In Claude Code — the harness this
skill runs in:

```bash
claude mcp get mabl        # exit 0 = a `mabl` entry exists; exit 1 = absent.
                           # Read the `Status:` line: "✔ Connected",
                           # "! Needs authentication", or "✘ Failed to connect".

claude mcp list | grep -i mabl   # Enumerate EVERY mabl-ish server you can see,
                                 # not just `mabl` — see below. Slow: it
                                 # health-checks all servers, so run it once.
```

In any other harness, use that harness's equivalent listing, and if it has none,
the tool-list reading above stands on its own — say that is what you used.

**Both readings go in the report, together.** `Status: ✔ Connected` is
**necessary but not sufficient**: the server hides tools a workspace has no
feature flag for, so a connected server whose tool list has no
`create_mabl_application` is still not route 1. Never report connection state as
if it were tool reachability.

> **A `✘ Failed to connect` row is a rarer fourth reading.** Route it like state 1
> — no tools, so no MCP route — but **report it as configured-and-failing with the
> error text quoted**, never as absent. The remedy is that error, not an `add`, and
> telling someone to add a server they already have is exactly the mistake the
> three-state model exists to prevent.

#### There is more than one mabl MCP server, so rule out by tool inventory

Do not treat "mabl MCP" as one binary. A session can easily have a **connected**
mabl server that is *not* the hosted one — a local `mabl-cli: mabl mcp start`
stdio server is common on a developer's machine, and on the validated run it was
connected while the hosted `mabl` server needed authentication.

So the report must name **which** servers you saw and **why** each non-hosted one
does not substitute — and the reason must be its **tool inventory**, read, not
assumed:

> *"`claude mcp list` shows two connected mabl servers plus the hosted one.
> `mabl-cli` (stdio, connected) exposes `get_applications`, `get_environments`,
> `get_credentials` and test/plan/run tools — I read its tool list, and it has no
> application-creation tool, so it cannot stand in for route 1. The hosted `mabl`
> server (`https://mcp.mabl.com/mcp`) is the one with `create_mabl_application`,
> and it is in state 2: configured, needs authentication."*

"No MCP tool was called because the server wasn't authenticated" is a **blanket
claim** and it is false the moment a second mabl server is connected. Scope it to
the server it is true of, and show the inventory that ruled the others out.

#### State 2 — the one-step fix, and it is the operator's step

This is the remedy the skill used to be missing entirely. **Authenticating an
already-configured server is not adding it.** Offer it as its own gated,
**operator-run** step, exactly like `mabl auth login --auto` — it pops a browser
OAuth consent, so it is never yours to run silently:

```
WRITE n of m   authenticate the hosted `mabl` MCP server (session-level)  not applied

state     `claude mcp get mabl` → exit 0, Status: ! Needs authentication.
          The entry already exists and is correct. Nothing needs adding.

you run   claude mcp login mabl          # opens a browser; --no-browser prints
                                         # the URL for an SSH/headless session
          or, in an interactive Claude Code session: `/mcp` → `mabl` →
          Authenticate

caveats   - This is your sign-in, not mine: I can't complete a browser consent.
          - This is the SECOND mabl consent of the run. The CLI login you may
            have just done is a separate OAuth grant. Two browser prompts both
            saying "mabl" is expected, not a loop.
          - It unblocks `create_mabl_application` (§3 route 1) and the
            `mabl-init` handoff (§8 branch A). Without it we take §3 route 2
            and §8 branch B.

          approve / edit / skip / why?
```

`mcp__mabl__authenticate` is also present in state 2 and returns a URL for the
operator to open — same consent, initiated from in-session. Either route, **then
re-probe**. If the tool list still shows only the two auth tools after they sign
in, say exactly that and treat the run as state 2 — tools may only appear to a
fresh session. Do **not** claim state 3 you did not observe.

If they skip it, that is state 2 **by their choice**, which §8 branch D words as a
choice, not as a limit — and §10 reports it as "configured, you declined the
sign-in", never as "absent".

Warn about the second consent **now, not later**, on any path that ends in an MCP
sign-in: state 1's add, state 2's login, or the marketplace plugin install in §8.

**On approve: they run it, you re-probe, and you emit its `WRITE LOG` line (§6)**
with target `session` — a sign-in you asked for and they granted is an applied
session-level write, and §10 counts it. On skip, no log line: nothing was applied.

#### State 1 — the optional add, with a real command

State 1 is the only state where adding the entry is the right remedy, and the add is
**optional**: this skill's own writes do not need the MCP server unless the operator
wants route 1's `create_mabl_application` or a branch-A `mabl-init` handoff. Offer it
as a gated write with a command, not as a JSON fragment to paste:

```
WRITE n of m   add the hosted `mabl` MCP server (tooling config)       not applied

state     `claude mcp get mabl` → exit 1. No `mabl` entry exists, and the
          session has no `mcp__mabl__*` tools at all.

command   claude mcp add --transport http mabl https://mcp.mabl.com/mcp

          # same entry, JSON-shaped, if you prefer to see the object:
          # claude mcp add-json mabl '{"type": "http", "url": "https://mcp.mabl.com/mcp"}'

caveats   - Default scope is `local` — this machine, this project, not
            committed. `--scope user` makes it global to you; `--scope project`
            writes a `.mcp.json` your teammates will see in the next diff,
            which makes it a committed-file write and puts it under §7's gate
            as well. Say which scope you want.
          - This makes the server CONFIGURED, not reachable. It lands in
            state 2, so the sign-in above is the step after it, not an extra.
          - That sign-in is the SECOND mabl consent of the run (§0).
          - What it buys: `create_mabl_application` (§3 route 1) and the
            branch-A `mabl-init` handoff (§8). Nothing else in this skill
            needs it.

          approve / edit / skip / why?
```

Both forms exist in `claude mcp --help` (`add`'s own help text carries an
HTTP-transport example; `add-json` takes the JSON string, and both accept
`-s/--scope`). **Verify the shape yourself against `claude mcp add --help` /
`claude mcp add-json --help` before you run either**, and prefer `add --transport
http` — it is the form the harness's own help documents for an HTTP server. In any
other harness, use that harness's own add command — the server key is
`mabl` and the entry is
`{"type": "http", "url": "https://mcp.mabl.com/mcp"}`. **On approve: run it, emit
the `WRITE LOG` line (§6) with target `machine` (or `committed file` under
`--scope project`), then re-probe and expect state 2** — never report an add as
having made the server reachable. §8 branch B's `mabl agent install claude --scope
project` is the other route to the same entry, and it lands in state 2 too.

### Closing gate C1 — the three state-keyed scripts

These close **gate C1**, not the state-1 add gate above. They live here rather
than in `references/workspace-and-repo.md`, which owns the rest of C1, because
what the close says depends on which of the three MCP states applies.

Close gate C1 with four things confirmed: the workspace name **and** id, the
caller's role, the counted emptiness picture, and — because this is the gate that
just counted `0 applications` — **the ordering constraint and which route applies
to them**:

> **State 3 — reachable:** *"You have 0 applications, and nothing targetable can
> exist until one does. Two routes: the hosted mabl MCP server is reachable in this
> session, so I can create it as a gated write once we've picked an environment
> name — or you create it in the web app and I read it back. Which?"*
>
> **State 2 — configured, not authenticated. Lead with the one-step fix, because on
> this state that sentence is the most valuable thing in the whole gate:** *"You
> have 0 applications, and nothing targetable can exist until one does. The tool
> that creates one lives on the hosted mabl MCP server, which is **already
> configured here — it just isn't signed in yet**. One command from you
> (`claude mcp login mabl`, or `/mcp` → mabl → Authenticate) and I can create the
> application myself. Otherwise you create it in the web app and I read it back.
> Which?"*
>
> **State 1 — absent:** *"…the mabl CLI cannot create an application and there is no
> hosted mabl MCP server configured in this session, so this one is yours, in the
> web app — or I can add the server first, which is its own gated step. I'll do
> everything downstream either way."*

**Do not collapse state 2 into state 1 here.** They produce different sentences and
different next actions: state 1's remedy is an install, state 2's is a sign-in, and
telling someone in state 2 to add a server they already have is the specific wrong
turn §0 exists to prevent. Substitute the state you actually probed.

Substitute the real count. If `applications list` already returned one, name it
instead and move the question to the URL row: *"you already have `<app>`, so what's
missing is the environment and the URL row that links them."*

Say this **here**, at the close of C1, not after gate C2's discovery pass. §3 is
where it becomes an action; C1 is where the operator hears it.


## 3. Gate C3 — applications, environments, URLs, and network reach

**Step one of build-out is the application. Settle it first, before you draft
anything else in this gate** — it is the constraint you already stated at the
close of C1, and this is where it becomes an action. Which script you use depends
on the MCP probe from §0, and **you do not get to skip the MCP route when the
server is there**.

**Three probe states, three scripts — and the middle one is not route 2 yet:**

| §0 state | Which route |
|---|---|
| **3. reachable** | **route 1**, below. Offer the write. |
| **2. configured, not authenticated** | **route 1A**, below: offer the sign-in *first*, and only if they decline does this become route 2. Going straight to route 2 from state 2 hands back a job that one operator command would have made yours. |
| **1. absent** (or a failed connect) | **route 2**, below, plus **§0's state-1 add gate** (`claude mcp add --transport http mabl https://mcp.mabl.com/mcp`) if they want the server for `mabl-init`'s sake anyway — §8 branch B's `mabl agent install claude --scope project` reaches the same entry. Either way it lands in state 2, so the sign-in is the step after. |

**Route 1 — hosted `mabl` MCP server reachable.** This is a write you can do, so
gate it like any other write rather than handing it back:

> *"The mabl CLI can't create an application, but the hosted mabl MCP server can:
> `create_mabl_application` creates the application **and** its
> app-environment-URL binding in one call, which also gives us the first URL row.
> It needs an environment to bind to, so the order is environment first. Here's
> the pair I'd create — approve / edit / skip / why?"*

Show it as a `WRITE n of m` block in §6's shape: the environment
(`mabl environments create`, CLI, so you get `--variables` / `--preview`), then
`create_mabl_application` with workspace id, name, that environment id, the
canonical URL and `web_application` or `api`. Caveats: it creates two things, not
one; there is no MCP delete for an application; and the URL it binds becomes a
deployment row that the CLI cannot edit or remove (§6, `urls add`). If the
operator prefers to create it in the web app themselves, that is **route 2** — take
it without argument and say what they are choosing.

**On approve, that is two writes, so it is two `WRITE LOG` lines (§6):** emit one
the moment `mabl environments create` returns with its environment id, and a second
the moment `create_mabl_application` returns with its application id. Target `mabl`
for both. Do not wait until the pair is finished and log them together — the log is
appended at each return, in run order, and §10's counts are produced by counting its
lines.

**Route 1A — the server is configured but not authenticated (§0 state 2).** The
tool exists, it is one operator command away, and the wrong move is to write this
run off as MCP-less. Offer the sign-in *as the unblocking step*, naming what it
unblocks:

> *"The mabl CLI can't create an application. The hosted mabl MCP server can, and
> it's **already configured in this session — it just needs you to sign in once**.
> `claude mcp login mabl` (or `/mcp` → mabl → Authenticate) and I can create the
> application and its first URL row myself, in one gated write. That same sign-in
> also unblocks the `mabl-init` handoff at the end, so it buys two things. If you'd
> rather not, no problem — then you create the application in the web app and I
> build everything around it. Which?"*

Then **re-probe** (§0). On success, continue as route 1 and say the state changed.
On decline, continue as route 2 — but the report must word it as **state 2 with the
sign-in declined**, never as "no MCP server", because those have different remedies
and the operator chose one of them.

**Route 2 — no MCP server, or the operator wants it in the UI.**

> *"Then this one's yours: create the application in the mabl web app
> (Settings → Applications — nav as of this writing). I can't do it over the CLI —
> `mabl applications` is `list` and `describe` only, and every URL row requires
> `--application-id`. Once it exists, tell me its name and I'll read the id and
> build the environments and URL rows around it."*

Either way, name what it unblocks (URL rows → environments a test can target →
the `mabl-init` handoff) and **wait**. Do not proceed past this gate on an
assumption that it will happen later. If the application does not exist by the end
of this gate — no server, or the offer declined, or they left — do not silently
stall: apply the writes that don't need an application, then take **§8 branch D**.

## 8. Gate C5 — hand persistence to `mabl-init`

The project-local agentic setup is **not yours**. `mabl-init` owns which
application and environment ids get written where, the persistence format and
path, and the file write itself. How to invoke it — by name, never by a path
inside its folder — is stated once in `SKILL.md`, which is always loaded; it is
not repeated here.

### Preconditions, all of them, before you hand off

1. Caller identity and role resolved; the no-account case already routed.
2. Exactly **one** target workspace chosen, id **and** name in hand.
3. The workspace is **verifiably non-empty by counts** — at least one
   application, one environment, and one URL row. This is a three-part AND, so
   **record which of the three is zero**; branch D's wording depends on it.
   `mabl-init` hard-branches to "this workspace isn't set up for testing yet"
   otherwise, which reads as the skill forgetting the interview that just
   happened. **If any part fails, take branch D below** — do not hand off and
   hope, and do not treat a failed precondition as a reason to end the run
   without persisting.
4. Credentials the app needs already exist — **names and ids** from
   `credentials list --output json` (it returns both; values never) — or the
   operator has confirmed none are needed, which is the normal day-one answer.
5. Your writes **applied and re-readable**, not merely drafted, so `mabl-init`'s
   independent re-read agrees.
6. The MCP probe answered **to one of §0's three states by name** — reachable,
   configured-but-unauthenticated, or absent. "MCP: no" is not an answer to this
   precondition, because the middle state has a one-step remedy that the other two
   don't, and it decides which branch below you take.
7. Your own closing summary **held back** until `mabl-init` returns, so there is
   one ending, not two.

### The handoff block

Pre-supply the answers so `mabl-init` re-asks nothing. Its re-discovery of your
environments is **desirable** — it is the independent read-back that proves your
writes landed — but its *decision* steps must be suppressed:

```
HANDOFF -> mabl-init

workspace        CONFIRMED. <name> / <workspace-id>.
                 Treat your workspace-selection step as settled; do not ask.
caller           <email>, workspace role <owner|editor|viewer>.
not empty        VERIFIED BY COUNTS, not by the `onboarded` flag:
                 <n> applications, <n> environments, <n> URL rows.
application(s)   <name> / <id>   (created by the human in the web app, OR by me
                 over the hosted MCP `create_mabl_application` — say which)
environments     <name> / <id>, <name> / <id>
default          <app> + <env>. Do NOT re-ask the app/env selection question
                 or the one-default vs folder-based strategy — settled in the
                 interview.
credentials      <name> (<env>). Names only; no value was ever read.
run history      NONE / <state>. If none, your credential inference from run
                 summaries will legitimately find nothing — use the name above
                 rather than dumping the credential list.
also record      the CLI footguns, the D14 guardrails, and the open questions
                 (<rows>) verbatim.
yours alone      persistence format, path, and the file write itself.
closing          I own the final summary. Do not suggest a first test.
```

Then **open the file yourself** and confirm the workspace id and application id
are actually in it. Report what you verified, not what was reported to you.

### Four degradation branches — never hard-fail

Branches A/B/C key on **tooling** (is `mabl-init` there, is the MCP server there).
Branch D keys on **preconditions**, which is the case the trigger phrase "my mabl
workspace is empty" actually lands in. Check D **first**: if the preconditions
aren't met, no amount of tooling saves the handoff. But D is only an *ending* once
the §3 route-1 (or 1A) MCP offer has actually been made and answered — a
precondition you could still satisfy is not a blocker.

**Map §0's three states onto these branches before you pick one.** `mabl-init`'s
entire **mabl data** surface is `mcp__mabl__*` — every mabl fact it discovers comes
from a `mcp__mabl__list_*` / `get_current_user` call and it has **no CLI fallback**,
even though its `allowed-tools` carries `Bash`, `Read`, `Write` and `Edit` for the
file it writes — so what matters to it is **tool reachability**, not whether an entry
exists in a config file:

| §0 state | Branch, if `mabl-init` is present |
|---|---|
| **3. reachable** | **A** |
| **2. configured, not authenticated** | **B**, and B's offer is the **sign-in**, not an install — see below. `mabl-init` sees only `authenticate` / `complete_authentication`, which is functionally no tools, so B's improvise hazard is fully live here |
| **1. absent** | **B**, and B's offer is the **add** |

**A. `mabl-init` present, MCP reachable (state 3).** Chain by name with the block
above, suppress your own persistence entirely, then read the file back. If
`mabl-init` returns without a file (declined, or it improvised), fall through to
branch C — a declined persistence is still no persistence, and you may not leave
that silently.

**B. `mabl-init` present, MCP not reachable (state 1 or state 2).** The dangerous
one: `mabl-init` has no MCP-absent branch, so it does not fail cleanly, it
improvises — and **a state-2 server improvises exactly as badly as a missing one**,
because two auth tools are not a tool surface. Do not hand off blind. What you offer
depends on which state you probed, and the two are not interchangeable:

- **State 2 — offer the sign-in.** It is one operator command, the entry is already
  correct, and this is where saying so is worth the most:

  ```bash
  claude mcp login mabl        # operator-run; --no-browser for SSH/headless
  ```

  Do **not** offer `mabl agent install` here. It would rewrite an entry that is
  already right (and `--force` would replace a correct entry with an identical one),
  which costs a gate and fixes nothing. The missing thing is the OAuth grant.

- **State 1 — offer the add**, as a gated write to their tooling config:

  ```bash
  mabl agent install claude --scope project   # or cursor | copilot | vscode | agents-md
  ```

  That writes the `mabl` and `chrome-for-mabl` MCP entries (and the mabl-debug
  skill; `--skip-mcp` inverts it, `--force` replaces existing entries). It leaves the
  server in **state 2**, so the sign-in above is the step after it, not an optional
  extra. (§0's state-1 add gate is the narrower route to the same `mabl` entry, if
  they want only that one.)

**Both of B's offers are applied writes, so both emit a `WRITE LOG` line the moment
they return (§6)** — target `session` for the sign-in they grant, `machine` for
`mabl agent install` (`committed file` if the scope they pick writes a tracked file).
A skipped offer applies nothing and gets no line.

Warn about the second OAuth prompt first, on both. On yes, **re-probe**, and
continue as branch A only if the probe now reads state 3. On no, or on an
unsupported target, run branch C and tell them which enrichment they are giving up —
naming the real state ("configured, you declined the sign-in" or "not configured"),
because that determines what they do next.

**C. `mabl-init` absent, or the fallback path.** Write the minimum yourself,
CLI-only, at the **project root only** — no format menu, no folder-based mapping
strategy, a single default app and environment. **This is a write to a committed
file, so it goes through §7's draft-show-approve gate too** — resolved path shown,
full content shown, four-way choice, no inferred yes. Use the **same
`## mabl testing` heading** on purpose, so a later `mabl-init` run **replaces
the section in place** instead of appending a second, conflicting mabl block,
and add a marker comment that vanishes on that upgrade:

```markdown
## mabl testing
<!-- written by mabl-onboarding without the mabl MCP server; run mabl-init to enrich -->

Workspace: <name> `<workspace-id>`
Application: <name> `<application-id>`
Default environment: <name> `<environment-id>`
Credentials (names only): <name>
Canonical app URL: <url>
```

##### The marker is a mechanism, so emit it and then prove you emitted it

**That comment line is not decoration and it is not prose about the write — it is
the write.** It is how a later `mabl-init` run recognises this section as
onboarding's own and **replaces it in place** rather than appending a second,
conflicting `## mabl testing` block to the same file. If the marker is missing,
the upgrade path is silently broken and nobody finds out until there are two mabl
sections disagreeing about which environment is the default.

This has already failed once in the specific way that a described-but-unwritten
artifact fails: a run's report **stated** it had left the marker in the caller's
`CLAUDE.md`, and the file contained no HTML comment and no occurrence of
`mabl-init` at all. Describing a marker is not writing one. So the write is bound
mechanically:

1. **The marker line is part of the `content` block in §7's gate**, verbatim,
   immediately under the heading, shown to the operator with everything else. It is
   not appended afterwards, not added "on the way out", and not implied.
2. **Immediately after the write returns, emit its `WRITE LOG` line (§6) and then
   grep for it** — the log line records that the file write happened and against
   which path; the grep is the read-back for it, in the same spirit as
   `datatables scenarios`:

   ```bash
   grep -n 'written by mabl-onboarding without the mabl MCP server' <resolved-path>
   grep -c 'mabl-init' <resolved-path>          # expect ≥ 1
   grep -c '^## mabl testing' <resolved-path>   # expect exactly 1
   ```

3. **The report may claim the marker only by quoting that grep's output.** Section F
   shows the matched line with its line number. No match, no claim — and a `grep`
   that finds nothing means the write did not do what you said, so **go fix the file
   and re-verify**, rather than softening the sentence in the report.
4. **If the third grep returns 2 or more**, you have created the exact duplicate
   the marker exists to prevent. Say so as a **human cleanup task** with the line
   numbers of both headings, in section D. Do not quietly leave two.

Name what the fallback loses: credential inference from real runs (moot on a new
workspace, which has no runs at all — say that rather than describing a read you
cannot demonstrate here), the persistence format and path options, and a single
canonical URL per environment (the CLI returns every URL row, so you have to ask
which one is canonical).

#### Recovering `mabl-init` — the skill AND its MCP server, together

`mabl-init` is not a CLI-driven skill. **Its entire mabl data surface is
`mcp__mabl__*`** — its `allowed-tools` holds `Bash`, `Read`, `Write` and `Edit` for
the file it writes, but **not one mabl read that isn't an MCP call**, and its own
prerequisites say it uses the hosted mabl MCP server, *not* the mabl CLI. That is
what makes a tool-less server fatal to it: there is nothing to fall back to. So
installing the skill without the server does not recover
branch A — **it lands the operator in branch B**, the improvise hazard, with a
skill that has no MCP-absent branch and will not fail cleanly. Recovery therefore
means **both**, and the MCP entry is part of the recovery, not an optional extra
step afterwards.

**Every recovery route below is a change to the operator's tooling, so every one of
them is gated — and the two `/plugin` lines are additionally *operator-run*, which
the adjacent `mabl agent install` already is.** Slash commands are typed into the
operator's own session; they are not shell you execute, and nothing here may read
as a step you quietly took. Label them, every time you emit them.

For a **Claude Code** caller — which is the harness this skill runs in — one gated
step does both:

```
WRITE n of m   install the mabl plugin (skills + MCP servers)       not applied

you run   /plugin marketplace add mablhq/skills
          /plugin install mabl@mabl

          ^ YOURS TO TYPE, in your own Claude Code session. These are slash
            commands, not shell — I cannot run them and I have not.

caveats   - Installs the mabl skills AND all of the plugin's MCP servers,
            including the hosted `mabl` one. That is why it is the route that
            recovers branch A rather than landing you in branch B.
          - It changes your tooling config, not just this project.
          - You will be asked to sign in to mabl again for the MCP server —
            the second consent warned about in §0.

          approve / edit / skip / why?
```

On yes, they type it, and **then** say "set up mabl for this project". Re-probe
before you claim it worked (§0's three states) — an install that lands the server
in state 2 is not yet route 1. **A plugin install the operator confirms they ran is
an applied machine-level write: emit its `WRITE LOG` line (§6), `approved  human
yes`, `result` quoting the re-probe reading.** If they never confirm running it, it
is drafted and left in their hands, not applied — no log line.

If the operator would rather not install the marketplace plugin, the MCP entry
alone is enough to make an already-present `mabl-init` safe. This one **is** shell,
so it is a gated write you may run on an explicit yes — and, like every applied
write, it emits its `WRITE LOG` line the moment it returns:

```bash
mabl agent install claude --scope project     # writes the `mabl` MCP entry
```

or, for the `mabl` entry alone, §0's state-1 add gate
(`claude mcp add --transport http mabl https://mcp.mabl.com/mcp`).

**Either way, adding the entry leaves it in state 2, not state 3** — a freshly
written MCP entry has no OAuth grant behind it. §0's state-2 sign-in step is the
next one, and it is the operator's. Do not report an `agent install` or a plugin
install as having made the server reachable; report it as having made the server
*configured*, then re-probe.

**Skills-only install routes do not install any MCP server.** `gh skill install`
is a real `gh` command, available to any caller — including Claude Code — on a
recent enough `gh`. It is **version-conditional, not harness-conditional**: check
with `gh skill --help` first. (On older releases the subcommand does not exist and
you get `unknown command "skill" for "gh"` — observed on `gh` 2.25.1. That is a
fact about that binary, not about this environment.)

```bash
gh skill --help                              # exists? then:
gh skill install mablhq/skills mabl-init     # skills only, NO MCP servers
# You must then add the `mabl` MCP server to that agent's config by hand,
# or mabl-init has no tools at all.
```

Whichever route they take, state that running `mabl-init` later **replaces and
enriches** the section you just wrote.

**D. Gate C5's preconditions are not met — the incomplete-build-out ending.** This
is the skill's own headline trigger, so it gets a defined ending rather than
falling off the end of the branch list.

**First, check that it should fire at all.** Precondition 3 is a three-part AND,
and the application third of it is **agent-doable when the hosted MCP server is
reachable** (§3 route 1). So:

- **State 3, reachable, and the offer not yet made → do not take branch D.** Go back
  and make the §3 route-1 offer. Ending the run as "blocked on you" when
  `create_mabl_application` is sitting right there is a false ending.
- **State 3 and the offer declined → branch D, worded as a choice, not an
  impossibility:** *"I can create the application over the mabl MCP server; you'd
  rather do it in the web app, so this is where I stop. One line unblocks it, and
  it's yours by your choice, not by my limits."*
- **State 2, configured but not authenticated, and the sign-in not yet offered → do
  not take branch D.** Go back and make the §3 **route-1A** offer. This is the
  false-ending case that is easiest to get wrong, because the server *looks* absent
  from where you're standing: you have no create tool, so branch D feels correct. It
  is not. One operator command turns this into state 3, and stopping without having
  said so is stopping a step early on the run's most valuable sentence.
- **State 2 and the sign-in declined → branch D, worded as a declined step, not a
  missing server:** *"The mabl MCP server is configured here; it just isn't signed
  in, and you'd rather not do that now. So the application is yours in the web app —
  and if you change your mind, `claude mcp login mabl` puts it back in my hands."*
  **Never render this as "no MCP server".** The remedy differs by a whole install.
- **State 1, not configured → branch D, worded as a CLI limit:** *"The mabl CLI can't
  create an application and there's no hosted mabl MCP server configured here, so
  this one is yours."*

**Then take the sub-branch that matches which count is zero.** Never print D's
script without substituting the actual state — an app-exists-but-no-URL-row run
given the no-application wording gets an ending in which every sentence is false.

- **D1 — zero applications.** Line 1: *"Your workspace has 0 applications, so
  nothing is targetable yet and build-out stops here."* Report header:
  `App in scope: NOT YET CREATED`. The card's **title** is what says the run is
  blocked and on what; this field names the gap and stops there (§10, "two in-card
  renderings").
- **D2 — the application exists, but the environment or the URL row does not** (you
  created it or they did, and the environment or `urls add` write was declined or
  failed). Line 1 names the real gap: *"Your application `<name>` exists; what's
  missing is `<0 environments | a URL row linking <app> to <env>>`, so nothing can
  target it yet."* Report header:
  `App in scope: <name> · <id> — present; no <the missing piece> yet`. The
  resume command is the `urls add` line, not "create the application".
  **Do not say "0 applications" on this path.**

**Do not hand off in either sub-branch.** `mabl-init` would hard-branch to "this
workspace isn't set up for testing yet", which reads as the skill forgetting the
interview that just happened, and would waste their approval.

What you do instead, in order, all of it:

1. **Say the state plainly, once**, using the D1 or D2 line above, with the counts
   substituted — *"…not because the interview failed, but because it's blocked on
   `<the specific missing thing>`."*
2. **Apply every write that does not depend on an application.** These are real
   and worth having: Agent Instructions (D12), mabl branches, an environment with
   `--variables` and no URL rows, and — if the personas are settled — a DataTable
   (D7). Gate each as normal, and emit each one's `WRITE LOG` line as it returns
   (§6) — a blocked run's counts are exactly as checkable as a complete run's. An
   application-blocked run is not an empty run.
   **Say the irreversibility inversion out loud on this path:** the two writes that
   work with no application are the deletable one (Agent Instruction) and the
   single permanent one on the whole surface (DataTable). Default to holding the
   DataTable until there is an application to scope it against, and if the operator
   wants it now, name that trade in the gate and in the report.
3. **Persist anyway, through §7's gate**, with a `## mabl testing` section that
   records the interview, the policy, the open questions, and an explicit
   `Application: NOT YET CREATED — blocked` (D1) or
   `Application: <name> <id>; blocked on <missing piece>` (D2) line where the ids
   would go. The interview is the expensive part and it must survive the session.
   **This is the branch where "never skip persistence silently" is easiest to
   violate**, because there's no id to write.
4. **Hand them a resume path, not a re-run.** D1: *"Create the application in the
   web app (Settings → Applications — nav as of this writing) — or let me do it over
   the MCP server — then either say 'set up mabl for this project' to run
   `mabl-init` against it, or come back to me and I'll add the URL rows and finish
   the environments."* D2: skip straight to the missing piece. Name the command
   that unblocks:
   `mabl environments urls add <env> --application-id <app> --app-url <url>`, or a
   fresh `mabl environments create … --application-id <app> --app-url <url>`.
   **In the report, the blocked step itself is a section-A item and stays there.**
   What section F carries is only what A does not: this literal resume command, and
   the sentence that names which A item it resumes ("resumes A item 1"). F does not
   re-tell the item (§10, "the blocking items get exactly one rendering").
5. **Report it as a blocking item, counted in the headline**, not as a failure of
   the run. Report **section A** is where this lives.

If the application appears mid-run — you created it over the MCP, or they created
it in the web app — re-count, attribute it correctly (*"you created this, not me"*,
or *"I created this over the mabl MCP server"*), and continue into A/B/C from the
top.

**On no branch — including D — do you skip persistence silently.**

