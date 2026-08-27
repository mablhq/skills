---
name: mabl-onboarding
description: |
  Onboard a NEW or EMPTY mabl WORKSPACE. Interview the human about what they
  ship and what needs verifying, then build the parts of that workspace an agent
  can — environments, deployment URL rows, in-product agent instructions, mabl
  branches, CI deploy triggers — every write drafted and applied only on an
  explicit yes. Tests, DataTables and plans are NOT built here.
  Fire when the mabl side doesn't exist yet: "onboard my mabl workspace", "I
  just signed up for mabl", "my mabl workspace is empty", "we're new to mabl",
  "roll mabl out to my team", or "/mabl-onboarding". Fire mid-workflow too when
  another skill finds the workspace missing an application, environment or
  credential: it fills only the gap and hands the ids back.
  If the workspace already HAS its applications and environments and the job is
  telling THIS PROJECT's agent which ids to use, that's mabl-init — this skill
  calls it rather than writing memory files itself.
  A human creates the workspace itself in the mabl UI; this skill never
  provisions one.
allowed-tools: Bash, Read, Write, Edit, Skill, mcp__mabl__create_mabl_application, mcp__mabl__authenticate, mcp__mabl__complete_authentication
---

# mabl onboarding

Take a workspace someone just created and turn it into a workspace a team can
test in. Interview the human about what they ship and what they need
verified, discover their repo deterministically, build out everything in mabl
that a command can build, and record everything else as durable policy. Then
hand the project-local agentic setup to `mabl-init`.

**Two readers, and the whole skill is shaped by the split.** The **operator** is
the one person in this session, rolling mabl out for their team — every question,
draft and gate is addressed to them as "you", and their workspace role is
resolved in gate C1, never assumed. The **report reader** in step 10 is the
operator *plus* their engineering lead, who was not in the session and has to
sign off. Where the two pull against each other, structure follows the lead and
voice follows the operator.

**Everything that changes state is drafted, shown, and applied only on an
explicit yes.** Workspace writes, edits to a **committed** file in their repo
(steps 7 and 8), and **machine-level** changes such as a global npm install each
get their own gate: a committed-file or machine write never inherits the
workspace gate by implication. `references/write-gates.md` is the contract for
all of them, including the write log every applied write appends the moment it
returns.

## Two ways in, and they run different steps

**Full onboarding** is the cold start: nothing exists on the mabl side, the
person in the session is the operator, and the run is the whole ordered procedure
below, ending in the closing report.

**Gap-fill** is the mid-workflow entry: another skill was doing something else,
found this workspace missing an application, an environment or a credential, and
called here for that one thing. It is not a shorter onboarding, it is a narrower
job — and getting it wrong in either direction is expensive. Running the
fifteen-row depth sheet against someone who wanted one environment spends a
session they did not offer; running the interview's write gates without them
spends an approval nobody gave.

Take the gap-fill lane when **the caller names the workspace and the entities it
needs**. Everything else is full onboarding — including a human who says "my
workspace is empty", who has no caller and no return address.

| | Full onboarding | Gap-fill |
|---|---|---|
| Steps run | 0 through 10 | 0, a shortened C1, C3, then the return block |
| Workspace | gate C1 resolves it | the caller supplied it: confirm id **and** name against `workspaces list`, never re-pick |
| Repo discovery (C2) | always | only where the caller could not name the app URL |
| Depth sheet (5), policy file (7), persistence (8), hand-offs (9) | yes | **no** — the caller owns the workflow those belong to |
| Closing report (10) | yes | **no** — the return block replaces it; the caller owns the ending |
| Write gates | every write | every write, unchanged |

The gates do not relax on the narrow lane. A gap-fill run creates the same
entities under the same draft-show-approve rule, with the same write log and the
same irreversibility disclosures. **A calling skill's request is not the
operator's yes** — the human in the session still approves every write, and a
caller that asked for an application still gets asked.

### What gap-fill hands back

End with this block and nothing else. Every id is **copied verbatim** from the
response that created or listed it — never derived from another id, never
reformatted, never a suffix added or removed. A recomputed id round-trips
perfectly and then authenticates as a *different* workspace, which surfaces as a
403 that says nothing about ids.

```
RETURN -> <calling skill>

workspace      <name> / <workspace-id>
application    <name> / <application-id>   created by <me, over
                                           create_mabl_application | you, in
                                           the web app>
environment    <name> / <environment-id>
url row        <environment-id> -> <application-id> @ <url>
credentials    <name> / <credential-id>    names and ids only; no value read
still missing  none | <entity, who owns creating it, and the one command or UI
                       path that creates it>
```

`still missing` is a required field, not something omitted when the run went
well: write `none`, or name the entity. **Credentials are the one thing gap-fill
will not create** — creating one over the MCP server would put a live password in
this transcript — so a run called for a credential ends with that row in `still
missing`, pointing at the web app, and says why. That is the honest ending, not a
failure.

If the caller wanted an entity this run could not produce, say so in `still
missing` and stop. Never substitute a different entity, and never invent an id to
fill a row.

## Prerequisites

Probe first, install nothing yet. A global CLI install or upgrade repoints every
other repo on that machine, so it is its own gated write (`WRITE 0` in
`references/write-gates.md`), not a setup line.

```bash
# PROBE. Read-only.
MIN_MABL_CLI_VERSION=2.109.19
if ! command -v mabl >/dev/null 2>&1; then
  echo "mabl CLI: NOT INSTALLED"
elif [ "$(printf '%s\n%s' "$MIN_MABL_CLI_VERSION" "$(mabl --version)" | sort -V | head -1)" = "$MIN_MABL_CLI_VERSION" ]; then
  echo "mabl CLI: $(mabl --version) — OK (floor $MIN_MABL_CLI_VERSION)"
else
  echo "mabl CLI: $(mabl --version) — BELOW floor $MIN_MABL_CLI_VERSION"
fi

mabl auth info    # PROBE ONLY. Text, no --output json; parse
                  # "Logged in as user [<email>]".
```

**Never run `mabl auth login --auto` yourself.** If the probe says auth is stale,
hand that login to the operator and wait: run unconditionally, it pops a browser
OAuth consent every time, even when the token is fine. And do not pin a workspace
before auth is good — `mabl config set workspace` validates against the API, and
a failed pin makes every later command fail with a misleading "Please specify a
workspace ID" instead of an auth error. Where the version floor comes from is
recorded in `references/cli-surface.md`; do not raise it for one command's sake.

The hosted **`mabl` MCP server** is optional for this skill, is **strictly
required** by `mabl-init`, and has **three** states whose remedies are not
interchangeable. Probe it in step 0, record which state by name, and read
`references/mcp-and-handoff.md` before acting on it.

## The standing rule: the capability boundaries

These four are what stop the skill lying. State them scoped; never soften one and
never overstate one.

- **No agent can create a workspace, and no agent can create a Link agent.** Not
  the CLI, not the MCP server, not this skill. `mabl link-agents` is `list` /
  `delete` / `terminate` — probe it rather than quoting that. Route the human
  instead, and never write a sentence claiming to have created either. **Do not
  assert *where* a Link agent is created**: a workspace is created in the web app,
  but a Link agent is a deployed agent rather than a web-app entity, and naming
  the wrong place is worse than saying it is outside every surface you have.
- **The mabl CLI creates no application, no credential and no plan — the hosted
  MCP server creates all three.** So never say "no agent can create X" about
  them: say **"the CLI can't"**, and name what did create it. Credentials are the
  one capability this skill declines on purpose, and it says why. Plans are out of
  reach on day one for a different reason: `create_mabl_plan` requires **at least
  one test id** and this workspace has none — a precondition, not a capability
  limit, and the report must word it that way (`references/mcp-and-handoff.md`).
- **Every URL row requires an application first** (`--application-id` is required
  on `environments urls add`), so build-out has a fixed first step — and the order
  inside that step is **environment, then application**, because
  `create_mabl_application` needs an environment id. On a genuinely empty
  workspace the first move is therefore the one thing only a human or the MCP
  server can do. Say it at the close of gate C1, act on it in gate C3, and if the
  application still does not exist by the end of C3 the run has a defined ending:
  step 8, branch D.
- **Attribution travels with every entity.** One a human made is "you created
  this, not me"; one created over the MCP server names the tool.
- **Never read another workspace without asking.** Another workspace may look
  like free evidence — an existing app under test, a naming convention already in
  use. It is still not this run's to open. Ask first, naming the workspace and what
  reading it would be for, and treat a no as final. This is not only privacy: a convention
  copied from elsewhere silently becomes this team's convention without anyone
  deciding it, and during any evaluation of this skill it contaminates the run.
- **This skill creates no test, no DataTable and no plan.** Each is a decision
  with an owner, and each has its own question in step 9. Building them here is
  how an onboarding run quietly becomes someone else's test strategy.

## Two rules that outrank convenience

**Irreversibility.** `mabl tests`, `mabl datatables` and `mabl applications` have
**no delete subcommand**; creation in those families is permanent — including the
application you may create over the MCP server, and the URL row that comes with
it. Probe the real surface in step 0 rather
than trusting that sentence, never create anything as a probe in a no-delete
family, and never re-issue a create on a status that is not proven terminal —
`RATE_LIMITED` means *wait and re-poll*, not *failed*. Recovering a duplicate
(rename, disable, label `to-delete`, report it as human-only cleanup) and the
probe itself: `references/write-gates.md`.

**Verification.** Every failure this skill has hit in the field reported success —
`exit 0`, `OK`, labels "applied" that selected nothing. **A write's own return
value is not evidence the write is correct**: read it back through a *different*
surface than the one that wrote it. The per-entity table, the silent list cap that
makes "absent" and "truncated" indistinguishable, and the unquoted-variable
splitting hazard: `references/write-gates.md`.

Which command can create what, with exact flags and types:
`references/cli-surface.md`.

## The ordered procedure

One hard limit applies everywhere in this procedure: **never put more than six
unanswered questions in a row anywhere.** Gate ordering, gather-then-confirm, the
mechanical enforcement of that six-question cap, and the correction ledger:
`references/interview.md`.

**0. Preflight — CLI, auth, MCP.** Decides whether the CLI is present and at the
floor, whether auth is good, and **which of the three MCP states applies, by
name** — "MCP: no" is not an answer to this, because the middle state has a
one-step remedy the others don't. Must not: run the operator's logins, or report
an added server as a reachable one. → `references/mcp-and-handoff.md` for the
probe, for ruling out a non-hosted mabl server by its tool inventory, and for the
state-1 add and state-2 sign-in gates.

**1. Gate C1 — the caller, their role, and which workspace.** Decides the
caller's identity and resolved workspace role, the single target workspace (id and
name), and **counted** emptiness — never the workspace record's `onboarded` flag.
Must not: write any *other* user's name or email to any file, count mabl's seeded
demo files as workspace content, or claim it can create a workspace. Close it by
stating the application-first ordering and which route applies. →
`references/workspace-and-repo.md`; the three state-keyed closing scripts are in
`references/mcp-and-handoff.md`.

**2. Gate C2 — repo pre-discovery.** The workspace is empty, so the repo is the
only evidence this run has. A shell floor **enumerates** and classifies nothing;
every judgment, every read and every redaction is the agent's. Must not: treat
commented-out code as a finding, or hand back raw enumerator output — the gate
closes with a filled-in draft in which every row carries its source and a marker.
→ `references/workspace-and-repo.md`.

**Do not scan only the current directory.** The repo defining the app under test is
often a sibling checkout or one level up. Search the machine for related repos by
product name and host stem — and find them mainly because **a related repo lists
the environments**, so gate C3 gets all four deployment targets instead of the one
public URL the operator mentioned. Finding nothing is a normal outcome, not a
failure. → `references/workspace-and-repo.md`.

**3. Gate C3 — application, environments, URLs, network reach.** Settle the
**application first**, on the route the step-0 state selects: reachable → offer
the write; configured-but-unauthenticated → offer the **sign-in** first, and only
a declined sign-in makes this a human step; absent → the human in the web app,
with the optional add alongside. Must not: skip the MCP route when the server is
there or one sign-in away, collapse state 2 into state 1, or proceed on the
assumption the application will appear later. → routes in
`references/mcp-and-handoff.md`; the environment, URL, preview and network-reach
drafting in `references/interview.md`.

**4. Gate C4 — authentication and personas.** Decides the sign-in mechanism,
whether credentials are per-environment or shared, how many roles, whether a
temporary inbox is needed, and which personas are test **data** rather than mabl
credentials. Record those personas as policy for the authoring hand-off; do not
build a DataTable for them here. Must not: offer to create a credential over the
MCP server — that puts a live password in this transcript — or record anything but
names. →
`references/interview.md`.

**5. The depth sheet.** Decides the fifteen policy rows, presented **pre-filled
in one pass** and marked so the operator's eye goes to the guesses. Enforce the
`[?]` cap mechanically, take the surfaced rows strictly in the stated priority
order, and carry every unsurfaced row forward as deferred — never
dropped. This step also classifies which rows have a product surface; steps 7 and
10 must agree with that classification. → `references/interview.md`.

**6. Write gates.** Decides what actually gets built — environments, URL rows,
agent instructions, mabl branches, the CI deployment-event patch. **DataTables are
not on this list.** Test data is a test-authoring decision: the question is not
"does a DataTable exist" but "does this test need one, and does an existing one
already cover it" — which cannot be answered before any test exists. Carry it to
step 9 and to the authoring hand-off, and record D7 as policy here.
One write, one gate, one approval; never batched. Show the exact command, put
each irreversibility disclosure in the gate where the yes happens, emit the write
log line the moment the command returns, and verify with a read-back because exit
codes lie in both directions. Must not: invent a subcommand or a flag, or run a
diagnostic write ungated. → `references/write-gates.md` for the discipline;
`references/cli-surface.md` for the commands, flag types and footguns.

**7. Record the policy that has no product surface.** Everything the depth sheet
classified as text-only, plus the unenforced half of every partly-enforced row,
goes to a durable file at the project root under the `## mabl testing` heading,
named **by path** in the report. That file is committed and team-shared, so it is
its own gated write in one of three modes, resolved and shown before writing.
Must not: write on an inferred yes, write to an unresolved path, silently swap one
mode for another, or let a skipped write leave the policy with no durable home
unsaid. → `references/write-gates.md`.

**8. Gate C5 — hand persistence to `mabl-init`.**

**Requires `mabl-init`.** If that skill isn't there, say which skill is missing,
then take branch C — write the minimum `## mabl testing` section yourself through
step 7's gate, marker comment included. Don't attempt its job as written, and
don't guess how to install it: that depends on how this skill was installed.

Check its preconditions, then
take the branch the MCP state and tooling select. Invoke it **by name** as a
skill, never by a file path inside its folder. Must not: hand off blind,
hard-fail, or skip persistence silently on any branch, including D. →
`references/mcp-and-handoff.md` for what `mabl-init` owns and this skill does not,
why a path breaks where a name doesn't, the preconditions, the handoff block, the
four branches, and the fallback section with the marker comment that lets a later
`mabl-init` replace rather than append.

**9. Optional hand-offs — each one a question first, named not invented.**

- **App exploration.** If the human wants coverage designed from the real app
  rather than from the repo, hand off to **`mabl-test-coverage-design`**, which
  explores a feature black-box in a real browser. **Do not build a crawler.**

  **Requires `mabl-test-coverage-design`.** If it isn't there, say which skill is
  missing and stop — don't explore their app yourself, and don't guess how to
  install it, because that depends on how this skill was installed.
  Say plainly that this run read the repo and asked questions, and did not crawl
  their app.

- **Authoring — ask what to test before proposing anything.** Discovery can tell
  you what an app *has*: routes, categories, a cart, a locale path. It cannot tell
  you what is **worth verifying**, which is a judgment with an owner. Reading the
  nav and inventing a suite from it produces tests that look reasonable and were
  never sanctioned.

  So: put the candidates forward **as a proposal**, shortest list that covers the
  critical journeys, each with the one sentence of why. Then wait. Only after the
  operator has picked, cut or replaced does anything reach
  **`mabl-test-authoring`** (one test) or `mabl-test-coverage-design` (a suite).
  This is stricter than a per-batch kickoff confirmation: that one gates *when* an
  approved test is built, this one gates *what the tests are at all*.

  **Requires `mabl-test-authoring`.** If it isn't there, say which skill is
  missing and leave the approved list with the operator — don't author the test
  yourself, and don't guess how to install it.

- **Plans — only after tests exist, and only after asking how to group.** Two hard
  preconditions: a plan needs at least one test id, so a day-one workspace cannot
  have one; and the grouping is the operator's call, never inferred. **Group by
  product module, not by test tier** — smoke/regression/nightly says *when* a test
  runs, not *what it covers*. Look for a grouping that already exists (their Jira
  components and process docs first, an existing test-case folder layout second —
  those folders **are** the plans) before proposing your own. Plan labels carry the
  suite and module; test labels carry the features that test covers; a test belongs
  to **one** plan per suite, the closest to what it validates. **Never schedule a
  plan or attach a trigger.** → `references/interview.md`.

- **Migration (D1).** If existing suites were **confirmed** by a config file,
  offer to mirror those specs. Never offer to migrate a dependency-only hit. →
  `references/workspace-and-repo.md` for the two-tier CONFIRMED / WEAK / nothing
  rule that decides which of those a hit is. A confirmed suite's **folder layout
  is also the plan grouping** above — read it before proposing one.

**10. The closing report.** The last step of the run, and the only report it
emits. Must not: run before `mabl-init` has returned, cut anything, or take a
count from memory. → `references/closing-report.md` for its timing, the two tiers
and how they are ranked, the write-log-derived counts, and the must-hold ledger.

## Resources

Everything below ships in this folder. Open the file named at the current step;
the `§` numbers inside these files refer to the numbered steps above.

| File | What it holds | Steps |
|---|---|---|
| `references/cli-surface.md` | the verified CLI surface: which commands create and which only read, exact flag names and types, the version floor and its evidence, every footgun with its consequence, the stdout-pollution hazards and their required `sed`, the commands that reject `--output`, the silent 10-result list cap, and which footguns cannot be observed on a day-one workspace | 0, 6 |
| `references/write-gates.md` | the write-gate discipline: the gate template, the write log, per-entity gates and caveats, read-back verification, the irreversibility disclosures and where each must appear, the machine-install gate, the committed-file gate with its three modes, the **irreversibility preflight probe**, **duplicate recovery and its `to-delete` reporting**, and the **verify-from-a-different-source** table with the list-cap and shell-splitting traps | 0, 6, 7, 9 |
| `references/interview.md` | gather-then-confirm mechanics, the correction ledger and its honest-zero renderings, gates C3/C4 drafting content, the fifteen-row depth sheet with its markers, cap and full priority order, and the **plan-grouping doctrine** (module not tier, the existing-taxonomy search order, the plan/test label split, never schedule) | 3, 4, 5, 9 |
| `references/mcp-and-handoff.md` | the three MCP states and each one's remedy, the probe and multi-server ruling-out, the application routes, and gate C5: preconditions, handoff block, four branches, and the fallback `## mabl testing` section with its marker comment | 0, 1, 3, 8 |
| `references/closing-report.md` | the two-tier report spec: the tier-1 closed list with its binding budgets and eviction order, tier-2 sections A–G, the write-log-derived counts, and the full must-hold ledger | 10 |
| `references/workspace-and-repo.md` | gate C1 (role resolution, counted emptiness, the seeded demo files, the three-way new-workspace route with its hedges and the account-admin/company-owner distinction) and gate C2 (the enumerating floor, the reading done directly, the closing draft, and the **related-repo search** that supplies the full environment list) | 1, 2 |

Finding things inside the four long files:

```bash
grep -n 'reject `--output`' references/cli-surface.md   # the four that hard-fail
grep -n 'unobservable'      references/cli-surface.md   # the day-one-invisible footguns
grep -n 'WRITE LOG'         references/write-gates.md   # the log's rules
grep -n 'THREE modes'       references/write-gates.md   # CREATE / APPEND / REPLACE
grep -n 'delete: NO'        references/write-gates.md   # the irreversibility probe
grep -n 'to-delete'         references/write-gates.md   # duplicate recovery + reporting
grep -n 'different source'  references/write-gates.md   # the read-back table
grep -n 'already exists, in this order' references/interview.md   # plan grouping search
grep -n 'Never schedule'    references/interview.md     # the no-trigger rule
grep -n 'Related repos'     references/workspace-and-repo.md      # sibling-checkout search
grep -n 'Needs authentication' references/mcp-and-handoff.md   # state 2
grep -n '^\*\*[A-D]\.'      references/mcp-and-handoff.md      # the four branches
grep -n 'Must-hold'         references/closing-report.md       # the ledger
grep -n '^| \*\*[A-G]\*\*'  references/closing-report.md       # tier-2 sections
```
