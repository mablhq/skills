# Gather-then-confirm: the gates and the depth sheet

The interview mechanics for gates C1-C5, the correction ledger, the drafting content of gates C3 and C4, and the full fifteen-row depth sheet with its markers, cap and priority order.

Gates C1–C5 are confirmed **one at a time**, because a wrong inference in any of
them poisons every write downstream. The depth layer is **one sheet**, edited in
a single pass.

**Every gate is gather-then-confirm.** Do the deterministic work first, present
what you already worked out as a filled-in draft, and let the operator correct,
redirect, clarify, or approve in their own words. Never emit a wall of
questions. **Never put more than six unanswered questions in a row anywhere** —
§5 carries the only structural guard for this, because §5 is the only place that
can produce more than six at once.

### Keep a correction ledger, as it happens

Every gate exists because your inferences can be wrong. So **record each one the
operator corrects, at the moment they correct it** — not reconstructed at the end
from memory. Append a line to an in-session ledger the instant it happens:

```
CORRECTION <n>   gate <C1|C2|C3|C4|C5|depth D<n>|write <n>>
  I inferred     <what you had drafted, in one line>
  You corrected  <what they actually said, in their terms>
  Downstream     <the concrete consequence: a topic dropped, an entity not
                 created, an environment renamed before the write, an
                 instruction rewritten, an order changed, a question retired>
```

A correction with no stated downstream effect is an incomplete ledger entry —
go find the effect or record `Downstream  none, the draft was already correct in
substance` and don't count it as a correction.

**The ledger reports what happened, and only what happened.** If the operator
corrected nothing, the ledger is empty and §10 says so in one line. Never
manufacture a correction to fill a template, and never re-describe your own
second thoughts as the operator's correction. Same rule for the write tally in
§10: it reports the actual counts, including zero.

#### Never print a quoted human utterance when no human spoke

The `You corrected` line is a **quotation**. It is the one line in this skill that
puts words in a person's mouth, and a fabricated one fails this skill's own
contract while an honest zero passes it. So two hard rules, and the second is the
one that has already been broken:

1. **No quote without a human.** If nobody answered — an unattended run, a
   simulated operator, a validation pass, a self-issued approval — there is no
   `You corrected` line to write, because there is no utterance. Not a paraphrase
   of what a plausible operator would have said. Not a reconstruction of your own
   reasoning attributed to them. Nothing.
2. **Any quote whose speaker is not a live human carries its marker *inside the
   entry*, adjacent to the quotation itself** — never as a caveat at the top of the
   section. This skill insists everywhere else that hedges belong where they are
   emitted rather than in a preamble (UI paths, unverified writes, unobservable
   footguns); the ledger gets no exemption. A blanket "note: this run was
   unattended" three screens above a quotation does not travel with the quotation
   when someone reads, copies or forwards that line.

**The legitimate zero renderings.** These are correct outcomes, not gaps to be
filled, and each is **one line**:

```
CORRECTION LEDGER   none. A human answered every gate and corrected nothing;
                    every draft was approved as drafted.
```

```
CORRECTION LEDGER   none, and no human was present. This run was unattended:
                    every gate was answered on self-issued approval, so there
                    are no operator corrections and no operator utterances to
                    quote. Nothing below is a human's words.
```

Use the second whenever the `Writes` line reads `<n> applied on self-issued
approval`. The two must agree: a self-issued-approval header beside a ledger of
quoted operator dialogue is a self-contradicting report, and the ledger is the half
that is lying.

If a genuinely unattended run *did* substitute an inferred answer at some gate and
you want that on the record, it is **not** a correction and it does not get a quote.
Record it in its own shape, which attributes nothing to anyone:

```
INFERRED <n>    gate <…>   ⚠ NO HUMAN ANSWERED THIS GATE
  I drafted     <what you had>
  I assumed     <the answer you supplied to yourself, in your own voice>
  Downstream    <the concrete consequence>
```

## 3. Gate C3 — the drafting half

Gate C3 has two halves in two files. Its **application routes** — route 1 over the
hosted MCP server, route 1A, route 2 through the human — live in
`references/mcp-and-handoff.md`, because which route applies is decided by the MCP
state. This file holds the **drafting** half: what to put in front of the operator
once that route has resolved.

Once the application exists — or on branch D, for the parts that don't need it —
draft from gate C2's evidence:

- which environments to create, and which `.env` variants are **not**
  environments (a jest/test harness with no host is not a mabl environment)
- the app URL and API URL per environment, and which URL is canonical when the
  repo suggests several
- which environment is a **preview** environment, created with `--preview` and
  deliberately given **no** URL rows because preview hosts arrive per run
- environment variable names and values (names must match
  `^[a-zA-Z_][a-zA-Z0-9_]*$`)
- **network reach** — is anything behind a VPN or bound to localhost? Which
  environments need tunnelling through mabl Link, and where would the Link agent
  run? You cannot create or deploy a Link agent; `mabl link-agents` is
  `list` / `delete` / `terminate`. That is a human item, and the follow-up
  `environments update` that attaches it is a footgun you must write out in full
  (see §6).

## 4. Gate C4 — authentication and personas

Draft from the auth deps, login files and env **key names** found in gate C2,
then confirm:

- do tests sign in, and by what mechanism (SSO/OIDC/SAML, forms, API token)
- **does any login need MFA**, and is there a temporary inbox for emailed codes
- **will tests be trained or run locally, or only in the cloud** — this decides
  the credential *type*, and it is not reversible by editing a name
- how many roles, and does any single test need two users at once
- which personas are **DataTable rows** (a set of test users driving one flow)
  versus which are genuinely separate **mabl credentials**

**Do not ask whether credentials are per-environment.** They are not: a mabl
credential is workspace-scoped, and the product has no per-environment binding for
one. Asking collects an answer that cannot be implemented and sets an expectation
the workspace will break. Where a login genuinely differs per environment, the
answer is **environment variables** (`environments create --variables`), which are
per-environment by construction — so this belongs in the D7 row, not here.

### Four types, and two of them no agent can create

The type is chosen at creation and decides where the credential may be used, so it
has to be settled in this gate rather than discovered when a local run fails.

| Type | Local training + local runs | Cloud runs | Creatable by an agent |
|---|---|---|---|
| Basic | yes | yes | yes — MCP, `cloudOnly: false` |
| Basic with MFA | yes | yes | **no** |
| Cloud | **no** | yes | yes — MCP, `cloudOnly: true` |
| Cloud with MFA | **no** | yes | **no** |

**MFA is a capability limit, not a decision.** `create_mabl_credentials` takes
`workspaceId`, `name`, `username`, `password`, `cloudOnly` and `description` —
there is **no MFA authenticator-secret parameter on any agent surface**. So a
TOTP credential is web-app-only, full stop. Say that as a limit, and hand them the
create form rather than a shrug:

```
https://app.mabl.com/workspaces/<workspace-id>/configure/credentials/create
```

Do not blur this into the *choice* below, which is a different sentence about a
capability you have and are declining.

**Cloud credentials cannot be used for local training or local execution** — that
includes agent sessions started with "Generate against local app". If the answers
above include any local authoring or any local run, a cloud credential is the
wrong type and picking it strands them.

**When both types are open to them, offer the choice — do not pick.** A workspace
without `require_cloud_only_credentials` can hold either kind, and the trade is a
real one with an owner: Cloud is the stronger posture, because the password can
never be retrieved again by anyone, while Basic is the one that still works for
local training and local runs. Neither is the obvious default, and choosing
silently on their behalf is how a team discovers months later that their
credentials are weaker, or that nobody can train locally, without anyone having
decided it. Put it to them in one line with the cost attached:

> *"Your workspace allows both. **Basic** works everywhere, including local
> training and local runs. **Cloud** is more secure — the password can never be
> read back, by you or by mabl support — but it will not work for anything local.
> Which do you want as the default for this workspace?"*

Only where the C4 answers have already ruled one out — they told you every run is
cloud, or they told you people train locally — say so and name which the answer
settled, rather than asking a question they have effectively answered. And where
`require_cloud_only_credentials` is on, there is no choice to offer at all; say
that the workspace policy already decided it.

### The CLI can't, the MCP server can, and this skill declines anyway

**The CLI cannot create a credential and cannot read one back.** `mabl
credentials` is **`list` only** (`mabl credentials --help`) — no `create`, no
`describe`, no flag that returns a secret. `list` does return the **id**, name,
type, description and created time; it never returns a value.

**The hosted MCP server can create a Basic or a Cloud credential**
(`create_mabl_credentials`) — but **do not offer it**: it would mean the operator
pasting a live password into this session's transcript. Route credentials to the
web app instead, and say *why* you are declining a capability you have: *"I could
create it over the MCP server, but that means your password goes through this
transcript. Create it in the web app and just tell me the name."* Then record it
**by name only**. A credential *name* is often itself a test-account email, which
is fine for a committed file; a value never goes anywhere.

**Hand them the link, not just the instruction.** Substitute the workspace id you
resolved in C1 and give them the URL — it lands directly on the create form, and a
URL survives a nav reshuffle in a way that a menu path does not:

```
https://app.mabl.com/workspaces/<workspace-id>/configure/credentials/create
```

The nav equivalent is **Configuration > Credentials** → **+ New credentials** (as
of this writing; owners and editors only). The **MFA authenticator** and the
**cloud credentials** checkbox are both options on that same form, which is why one
trip covers every type — including the two you cannot create yourself. Never send
them to hunt for "the web app".

### One workspace policy can decide the type for you

A workspace owner can turn on **Require cloud credentials** (`Settings >
Workspace`), and mabl **enforces it in the API**, not just in the create form — so
it applies to the web app, the CLI and the public API alike, for every user and
every API key.

**Read it, don't ask about it** — and read it *before* you raise credential type
at all, because it can settle the question for you:

```bash
mabl workspaces describe <WORKSPACE_ID> --output json \
  | jq '.require_cloud_only_credentials // false'
```

**The key is omitted entirely when the policy is off**, not returned as `false`.
So the `// false` default is load-bearing, and a missing key means *off* rather
than *unknown* — do not report absence as "couldn't tell". (Verified 2026-08-28 on
a workspace with the policy on, where the key is present and `true`.)

**This is a CLI read, not an MCP one.** `list_mabl_workspaces` returns ids and
names only, so a session driving MCP alone cannot see this. Say which surface you
used.

**If the policy is on, it is a hard rejection rather than a silent coercion.** A
create with `cloudOnly: false` fails with `HTTP 400 : This workspace requires
credentials to be created as cloud credentials (set cloud_only: true)` and creates
nothing — no partial state, nothing to clean up. So you cannot end up with a
credential whose type quietly differs from the one that was asked for.

What it means for this gate: if the policy is on, every **new** credential will be
cloud-only, and cloud credentials do not work for local training or local runs. If
the team also authors or runs locally, say that plainly here rather than letting
them meet it as a failed login. Existing credentials are unaffected — the policy
never converts one for you — so a workspace can hold both kinds and only new ones
are constrained.

## 5. The depth sheet — one filled-in pass

Present the fifteen rows **pre-filled, in one pass**, and let the operator edit.
Mark every row so their eye goes to your guesses rather than the whole sheet:

`[read]` I saw it in your repo · `[you]` you told me · `[guess]` I inferred it
and could be wrong · `[?]` I have nothing

### The `[?]` cap — enforce it, don't restate it

A `[?]` row **is** an unanswered question. On the case this skill exists for — a
brand-new workspace and a thin or backend-only repo — most of the sheet comes
back `[?]`, and a fifteen-row sheet then puts a dozen unanswered questions in a
row, breaking the ≤6 rule stated in SKILL.md §"The ordered procedure" and checked
in §10. So enforce it
here, mechanically:

1. Fill every row you can from gates C1–C4 first. Those become `[read]`, `[you]`
   or `[guess]` and **do not count** against the cap.
2. Count the remaining `[?]` rows. **If six or fewer, present the whole sheet in
   one pass.** Done.
3. **If more than six, surface at most six `[?]` rows in this pass** — the
   load-bearing ones, taken **strictly in the total order below**. The order covers
   **all fifteen rows**, not a favoured handful, because "then the rest" is not an
   order and leaves the actual choice to judgment at exactly the moment the cap is
   supposed to be removing it.

   **The total order, and why each row sits where it does:**

   | # | Row | Why here |
   |---|-----|----------|
   | 1 | **D12** Agent Instructions | it *is* a write — the flagship entity of the empty-workspace case |
   | 2 | **D14** Autonomous guardrails | gates everything you do next; a wrong answer invalidates later writes |
   | 3 | **D5** CI/CD triggers | product surface: `deployments create` |
   | 4 | **D7** Test data | product surface: `--variables` (DataTables deferred to authoring) |
   | 5 | **D1** Migration | decides whether authoring seeds from existing specs — reshapes the whole plan, and §9's hand-off |
   | 6 | **D9** Parallelism and flakiness | data isolation constrains D7's answer, so it is worth having early |
   | 7 | **D13** Failure triage | the first thing that happens after the first run; feeds D12's instruction text |
   | 8 | **D2** Cross-browser and visual | nearest thing to a flag: it lands in `deployments create --browsers` |
   | 9 | **D8** Specialized verification | decides whether the browser-only `test_types` scope is even sufficient |
   | 10 | **D3** Cross-application orchestration | needs a *second* application, so it changes §3's route and URL rows |
   | 11 | **D6** Developer experience | shapes what §7 writes into the committed file |
   | 12 | **D10** Governance | only bites once more than one team shares the workspace — not day one |
   | 13 | **D4** Work tracking | only bites at the first failure, and D13 has usually already named the tracker |
   | 14 | **D11** Naming conventions | the product-surface table below rules it **text-only** on this run — nothing to configure |
   | 15 | **D15** Coverage definition | unmeasurable until tests exist, and there are none |

   **Read the order down and take the first six rows that are still `[?]`.** That
   is the whole procedure. It is deterministic, and the case that broke the old list
   is the normal case: on a day-one workspace with a readable repo, five of the six
   old named rows come back already filled from gates C1–C4, so the old list
   resolved **one** row of six and left a seven-row tail undifferentiated. With the
   order above, a pass that starts at row 7 still knows exactly which six it takes.

   **Say which rule you applied, in report section G**: name the six you surfaced
   and the position each came from, so the selection is checkable rather than
   asserted. If you ever deviate from the order, that is a correction — put it in
   the ledger with its reason.
4. Every `[?]` row you did **not** surface is written into the sheet as
   `[?] deferred — open question, not asked this pass` and carried, verbatim, to
   §7's open-questions list. It is **deferred, never dropped**, and §10 reports
   how many were deferred.
5. If the operator wants the rest now, they can ask — that's their call to make,
   not a wall you hand them unprompted.

Splitting the sheet into two passes is an acceptable alternative to step 3 **only
if the operator asks for it**. Defaulting to two passes turns one sheet into two,
which is the thing the single-pass design is avoiding.

| Row | Topic |
|-----|-------|
| D1 | Migration — moving off Playwright / Cypress / Selenium / WDIO, or manual scripts in a test-management tool? Should agents parse the existing tests to seed equivalents? |
| D2 | Cross-browser and visual — mandatory browser/device matrix, visual-diff handling and failure threshold, who approves baseline changes |
| D3 | Cross-application orchestration — flows crossing a web portal into an API, an email, or an admin console |
| D4 | Work tracking — Jira, Linear, GitHub Issues; native or third-party test management |
| D5 | CI/CD triggers — PR preview runs, deployment-event smoke runs, scheduled regression; rerun policy (failed only / whole stage / fail fast); environment warmup before a plan |
| D6 | Developer experience — how devs invoke mabl day to day (from a PR diff, against localhost pre-commit, explaining a failure in the CLI or IDE) |
| D7 | Test data — static DataTables, environment variables, or generated; setup and teardown of data state |
| D8 | Specialized verification — database assertions, email delivery, PDF generation, automated accessibility |
| D9 | Parallelism and flakiness — sequential vs parallel within a plan, how concurrent runs avoid destroying each other's data, flaky policy |
| D10 | Governance — multiple teams sharing the workspace, resource groups / RBAC, branching and merge-conflict resolution |
| D11 | Naming conventions — tests, flows, plans, labels, variable and DataTable case conventions |
| D12 | **In-product Agent Instructions** — what mabl's own AI should follow when generating steps, selector preferences, house standards |
| D13 | Failure triage and issue auto-creation — root-cause analysis, search the tracker before filing, what to attach |
| D14 | Autonomous guardrails — what an agent must NEVER do, what ALWAYS needs approval, budget / run-volume caps |
| D15 | Coverage definition and reporting — route, critical-journey, API endpoint coverage; where metrics get reported |

### Which rows actually have a product surface

**Three rows are actionable, in different amounts. Twelve are not.** Classify each
row here, and carry that classification unchanged into §7's enforcement marker
and into **report section E, part 3b** — those three must agree, or the report says "enforced by
nothing" about a DataTable it also lists as built.

| Row | Product surface | What §6 actually writes | §7 marker |
|-----|-----------------|--------------------------|-----------|
| **D12** In-product Agent Instructions | **fully** | `mabl agent-instructions create` — the row *is* the entity | `the Agent Instruction itself` |
| **D7** Test data | **partly** | `mabl environments create --variables` only, for per-environment values. **DataTables are deliberately NOT built on this run** — whether a test needs one, and whether an existing DataTable already covers it, is a test-authoring decision and there are no tests yet. Setup/teardown of data *state* has no surface at all. | `partly — env variables on <env>; DataTables deferred to authoring` |
| **D5** CI/CD triggers | **partly** | `mabl deployments create` — drafted in §6 as a CI patch. Rerun policy, warmup and scheduling live in **plans**, and a plan needs at least one test, so a day-one workspace has none to configure. | `partly — the deployment-event command in <workflow>` |
| D1–D4, D6, D8–D11, D13–D15 | **none** | nothing | `nothing — text only` |

Don't overstate in the other direction either: a `partly` row is still mostly
policy — the DataTable exists, but nothing in mabl makes anyone *use* it. Say
which half is enforced and which half is a convention people have to follow.
**D11 (naming conventions) is text on this run.** Plan labels are the only naming
surface the CLI has, plans are the one entity a new workspace cannot have yet, so
labelling is out of scope here — not hedged, not offered.

Record which rows the operator left blank, plus every `[?] deferred` row, as
**open questions**. Do not fill them with plausible answers, and name them in the
report as declined-to-fill or deferred, distinguishing the two.


---

## Plan grouping — the questions to ask before any plan exists (§9)

Plans are out of reach on a day-one workspace: `create_mabl_plan` requires at least
one test id. When a later run does have tests, or the operator asks for plans
directly, the grouping is **their** call. Ask before proposing.

### Group by product module, not by test tier

Smoke / regression / nightly is the tempting axis and the wrong one. It describes
*when* a test runs, not *what it covers*, so it tells a reader nothing about which
part of the product is verified, and it collapses as soon as the suite grows past
a handful of tests. Group by the modules of the product.

### Look for a grouping that already exists, in this order

1. **The team's tracker and process docs.** Jira components, epics or labels; the
   ticketing system's module or product-area field; internal engineering and
   quality process documents. If a functional-area taxonomy already exists, **that
   is the grouping** — adopt it. Inventing a parallel one guarantees two
   vocabularies for the same product and no one using either consistently.
2. **An existing test-case folder structure.** If their current test cases live in
   folders, **the folders are the plans**, and each folder's tests go into its
   plan. Do not re-derive a structure the team already maintains.
3. **Only if neither exists**, propose modules from the app's own structure — and
   mark it explicitly as a proposal for them to correct, not a decision.

Do **not** substitute another mabl workspace as the source of a grouping. Reading
another workspace requires asking first (see the standing rule in `SKILL.md`), and
a convention lifted from elsewhere becomes this team's convention without anyone
choosing it.

### The label split

| Level | Carries |
|---|---|
| **Plan labels** | the **test suite**, plus the **module / feature** that plan covers |
| **Test labels** | the **modules / features that test actually covers** — often several |

A test may cover several features and still belongs in **one** plan per suite: the
plan closest to what it validates. Do not fan a test across plans to mirror its
labels — the labels already record the coverage, and duplicated membership makes
every run count that test more than once.

### Never schedule

Creating a plan on request is fine. Deciding **when it runs** is not this skill's
call: a schedule or deployment trigger changes what happens in someone's CI
without them choosing it. Create plans unscheduled, say so, and name the command
or UI path the operator would use to schedule it themselves.
