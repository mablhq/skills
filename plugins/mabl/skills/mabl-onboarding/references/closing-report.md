# The closing report

The two-tier report spec: the tier-1 card with its closed list and binding budgets, the tier-2 sections A-G, the write-log-derived counts, and the full must-hold ledger.

## 10. The closing report

One report, at the end, after `mabl-init` returns.

**Written to the operator, shaped for their lead.** Both readers were named in
SKILL.md's opening paragraph, "**Two readers, and the whole skill is shaped by the
split**", and both constrain this section: the second person is the
operator ("you created this, not me", "<N> things still on you"), and the
structure is for **the lead who was not in the session** — someone who has to sign
off on the rollout and has not read a line of the transcript. When they conflict,
structure follows the lead and voice follows the operator.

**The report has two tiers, and the ranking is the point.** A lead reads the top
card and stops; that card is the report as far as most readers are concerned. The
detail lives below it in collapsed sections and is **just as mandatory** — nothing
here is cut, everything is ranked. If you find yourself deciding what to leave
out, you have misread this section: you are deciding what goes **down a tier**.

### The two tiers, and the length tie-break that decides between them

This skill's opening paragraph resolves structure-versus-voice. It said nothing
about **length**, and that silence is what produced a 666-line, ~6000-word report
describing four created entities, with the blocking items restated three times.
So length is resolved here, with numbers — and with a matching rule against
repetition, because a short card that says one fact four times fails the same way at
a smaller scale.

- **Tier 1 — the top card. Two ceilings: 25 source lines and 1,600 characters.**
  Readable in well under a minute by someone who has read no transcript. It carries
  four things and only four: whether the run is **complete or blocked and on what**,
  the **real counts**, **what exists in mabl now**, and **the one next action**.
- **Tier 2 — the detail, below the card, in collapsed sections.** Every remaining
  must-hold lives here, in the closed set of sections A–G below, and every one of
  them is still required.

**The tie-break, with teeth: inside the card, length wins.** A must-hold that does
not fit the budget **moves down to tier 2**, to a named section. It does not get the
card widened for it, it does not get squeezed in as a parenthetical, and it does not
get dropped. Tier 2 has no length budget, so there is always somewhere for it to
go — which is why the card's budget can be absolute, and which is why **every
eviction below names its destination**. An eviction with no destination is a
deletion, and deletion is what this ranking exists to avoid.

**The unit is source lines, not rendered lines.** A "line" is one newline-terminated
line as you write it. **Soft wrapping in the reader's viewport is not a breach**, is
not counted, and is not something to optimise against — you cannot know their column
width, and writing to an imagined one is how a card gets mangled into abbreviations.
So the 25 is a structural backstop on the closed list, and the **character budget is
the ceiling that actually bites on prose**.

**How the ceilings bind.** Do these four things mechanically, before you emit
anything:

1. **The card's contents are a closed list** — the eleven lines named in the
   template below (the title, seven header fields, `State`, `Your next action`,
   and the one-line pointer into tier 2), nothing else. A sentence that is not
   one of those eleven lines does not belong in the card, however good it is.
   That is the first check, and it removes most overflow before you count.
2. **Count source lines**, blank lines and the title included. Over 25 is a defect,
   not a judgement call. A card built from the closed list comes out at 14, so this
   check fires only when something got in that check 1 should have stopped — that is
   exactly what it is for.
3. **Count characters** over the whole card, title through pointer line (`wc -c` on
   the block, or count them). **Over 1,600 is a defect, not a judgement call.** For
   calibration: a real branch-D card, with a long absolute repo path, a full
   workspace id, the state-2 `Tooling` clause and the self-issued-approval clause,
   measures about **1,400 characters** — so the budget leaves roughly 15% for a
   longer attribution or a longer path, and it bites on **wordiness**, which is the
   failure mode the 666-line report actually had. It is the check that can fire while
   the closed list is intact, so it is the one to take seriously.
4. **If either count is over, evict in this fixed order, and each eviction lands
   somewhere named** — never arbitrary, never nowhere:

   | # | What goes | Where it lands |
   |---|---|---|
   | 1 | anything not in the closed list | it was never allowed; put it in the tier-2 section that owns the subject |
   | 2 | the `Tooling` line's third clause (`mabl-init <state>`) | **section F**, which already records the handoff or its absence — F states the `mabl-init` state in words in its opening line |
   | 3 | the detail inside `Exists in mabl now`, which becomes bare counts | the names go to **section C** |
   | 4 | the *rationale* attached to `Your next action`, the action itself staying | **section A**, item 1 |

**Four squeezes are forbidden, because each one defeats the budget rather than
respecting it:** no header field may contain a literal newline (one source line
each — soft wrapping is not a breach and not a squeeze); no line may be reflowed
into a run-on to save a count; two header fields may not be merged into one; and the
blocking count, the write counts, the `State` line and the next action may never be
evicted — they are why the card exists. If those four leave you over budget, your
header fields are too wordy, not too many. **And note what the never-evict list does
not protect:** it protects those four *facts*, each in one place. It does not license
a second copy of any of them — a restatement is not eligible for protection, because
it was not allowed into the card in the first place (see "two in-card renderings",
below).

### Tier 1 — the top card

Eleven content lines, in this order — 14 source lines once the blank lines are
counted, and about 1,400 characters with real values in it. The closed list stays
closed whether the card comes out at 14 lines or at 25: the gap under the line
backstop is not budget for extra lines, and the gap under the character budget is
there for a long path or a long attribution, not for another sentence. Substitute
real values everywhere; a bracket that survives into the report is a defect.

```
## mabl onboarding — <build-out complete | BLOCKED on <the specific missing thing>>, <N> items still on you

**Workspace** <name> · `<id>`
**Repo** <path> (<shape>, branch <branch>)
**App in scope** <name> · `<id>` — **you created this, not me** (or **created by me over the hosted mabl MCP server, `create_mabl_application`**) (branch D1: **NOT YET CREATED**; branch D2: **present; no <the missing piece> yet**)
**You** <email> — resolved as **<role> of this workspace**
**Tooling** mabl CLI <version> · hosted `mabl` MCP server <reachable | configured, needs sign-in | not configured — one of §0's three states, by name> · `mabl-init` <state>
**Writes** <n> in mabl <(<m> since deleted) — this parenthetical is required whenever any applied mabl write was removed in-run, e.g. `5 in mabl (1 since deleted)`> · <n> to committed files · <n> to untracked files · <n> machine- or session-level · <n> drafted and left in your hands · <the approval line — see below>
**Exists in mabl now** <counts by entity type, including the zeros that matter: applications, environments, URL rows, agent instructions, branches, DataTables, tests, runs>

**State** <a human answered every gate | unattended — every gate answered on self-issued approval>. <N> items need you; the full ordered list is section A below.
**Your next action** <one item — item 1 of section A — and where they do it. One sentence.>

<one line: everything else is in the collapsed sections below — A the to-do list, B what can and cannot be created, C what I built and how I verified it, D the footguns, E the policy record, F persistence, G how we got here.>
```

Never title a report "complete" when the application / environment / URL-row
chain is incomplete, and never write "only you can do" for a step the MCP route
could have done — the title and the `App in scope` line are the two places that
lie most easily.

#### The blocker gets two in-card renderings, not four

The same discipline as the tier-2 rule below, applied inside the card, because a
221-word card that says "blocked on the application" in four different fields is the
near-identical repetition of the 666-line report at one-thirtieth the scale. On a
blocked run the fact gets **two** renderings and no more:

- **Rendering 1 — the title, with `State` as its continuation, not a second copy.**
  The **title** carries blocked-or-complete, the specific missing thing, and the
  count. `State` then carries what the title cannot: **who answered the gates** — `a
  human answered every gate`, or `unattended — every gate answered on self-issued
  approval` — plus the count restated once as the pointer into section A. **`State`
  does not repeat the blocker phrase.** It used to, and that repetition was one of
  the four.
- **Rendering 2 — `App in scope`, which carries the entity, not a verdict.** Either
  the application with its id and its attribution (human, or you over the named MCP
  tool), or, on branch D, the gap itself: D1 `NOT YET CREATED`, D2
  `<name> · <id> — present; no <the missing piece> yet`. **No "this is the blocker"
  clause** — the title already named what the run is blocked on, and this field's own
  name says which entity is being described.
- **`Your next action` is an action, not a third rendering.** It is item 1 of section
  A in one sentence with its location, and it says what to *do*. It carries no
  "because we're blocked on this" clause, no why-it-isn't-mine, no unblocks.

Both renderings are still mandatory — this is a ban on the third and fourth copies,
not permission to drop either of the two. And the never-evict list protects these two
places, not a third one recreated elsewhere in the card.

**The `Tooling` line's MCP clause names one of §0's three states, in words, and
"absent" is reserved for state 1.** `not configured` and `configured, needs sign-in`
are different facts with different next actions, and the lead signing off is
entitled to know which one cost them the MCP route. If the operator declined the
sign-in, that clause reads `configured, you declined the sign-in` — a choice they
made, not a limit they hit. Collapsing state 2 to "absent" here is the same defect
as collapsing it in §3: it sends the reader to an install they don't need.

#### The header counts must be the real counts

A prior run reported `4 applied in mabl` when five mabl-side creates had
happened, and `1 applied to a committed file` for a file git did not track. Both
were derivable from what the run had already done. So derive them:

- **Count the write log's lines.** The log is **§6's `WRITE LOG` block**, opened at
  the run's first applied write and appended at each write the moment that write
  returns — every gate site in this skill says so where the approval happens (§0's
  install, §0's add, §0's sign-in, §3 route 1's pair, §6's writes, §7's file write,
  §8 branch B and C). By the time you write this header the log already exists;
  producing the counts is counting its lines by target. Never from memory, never from
  the tier-2 tables, and never assembled here — a log first written at report time is
  the reconstruction this rule exists to forbid.
- **The log has five targets; the card has four buckets. `machine` and `session` share
  one.** Count `machine` and `session` lines together under `machine- or
  session-level`, which is why that bucket is named for both. The distinction is real
  and the log keeps it — a global install persists, an MCP sign-in lasts the session —
  but the lead does not need it in the card, and inventing a fifth bucket would cost a
  line the closed list does not have. Section F still shows each one separately.
- **Every mabl-side create is in the log, including diagnostic ones.** A throwaway
  probe branch created to check a claim this skill makes about the CLI is a mabl-side
  create, is a **gated** write (§6, "a diagnostic or probe write is a gated write"),
  and is counted. Disclosing it in prose while leaving it out of the count is a wrong
  count. Lines whose `result` says `FAILED — nothing created` are not counted as
  applied.
- **A write you applied and then removed inside the run still counts as applied, and
  the card says so inline.** `Writes` reads `<n> in mabl (<m> since deleted)`, so
  `Writes` and `Exists in mabl now` reconcile for a lead who reads only the card —
  five creates and four survivors is not a contradiction once the card says which. It
  also gets its own row in section C, but the card may not depend on section C to
  stop two numbers looking wrong.
- **If a count disagrees with a tier-2 table, the log wins and the table is
  wrong.** Fix the table; do not adjust the count to match it.
- **Committed means tracked.** Check it — `git ls-files --error-unmatch <path>`.
  A file git does not track gets its own count: `1 applied to an untracked file
  (not in version control)`. Never fold an untracked file into the committed
  count, and never call a file committed because it sits inside a repo.
- **Label approvals by who gave them.** `0 applied without a yes` may be printed
  **only** when a human actually answered each gate. If any gate was answered by
  you on your own behalf — an unattended run, a simulated operator, a validation
  pass — the line reads `<n> applied on self-issued approval — no human answered
  these gates`, and the `State` line's first clause is `unattended — every gate
  answered on self-issued approval`. The two are the same fact read off the log's
  `approved` column, so they cannot legitimately disagree. Rendering a
  self-issued yes as `0 applied without a yes` reads as human consent; of every
  count in this header, that is the one that is dishonest rather than merely
  wrong.

### Tier 2 — the detail, in collapsed sections

Seven sections, this closed set, this order. Every one appears in every report;
a section with nothing in it says so in one line rather than being omitted.

| § | Section title | What it holds |
|---|---|---|
| **A** | What still needs you — `<N>` items, in order | **the one authoritative rendering** of the blocking list: each item with where the human does it, **why it isn't mine**, and what it unblocks |
| **B** | What can and cannot be created | the capability statement, and the three-way workspace-creation route |
| **C** | What I built in mabl, and how I verified it | the entity table, the inline read-backs, the unverified-by-design items, the "no test authored, nothing has run" statement |
| **D** | Footguns now written into `<file>` | at least three silent-wrong-result footguns with their consequence, plus the irreversibility record |
| **E** | What got recorded as policy, and where | 3a real entities, 3b the per-row markers, the open questions, the secrets statement |
| **F** | Persistence — handed off to `mabl-init`, or not | **opens by naming `mabl-init`'s state in words** (present and used / present and not usable, with the branch / not installed) — which is also where the `Tooling` line's third clause lands if the card's budget evicts it — then probe, offer, gate, handoff block, independent verify, or branch D's ending. **Anything blocking is cited as "A item `<n>`" and not re-told**; F carries only mechanics A does not (see below) |
| **G** | How we got here | the gates, the correction ledger verbatim, the depth sheet, one full write gate |

**A–G replace the old numbered report sections, so the references made elsewhere
in this skill still resolve:** where §5 and §7 cite *report §1*, read **section
C**; where they cite *report §3b*, read **section E**, part 3b. Those are the same
two agreement checks as before — a row marked `nothing — text only` for an entity
section C lists as built is still the contradiction the marker exists to prevent.

**B comes before C, and A comes before both.** The blocking list sits above the
list of what was built, and the capability statement sits above the first detail
table — those two orderings are the ones the old flat report got right and they
survive the restructure.

#### Collapsed sections must degrade to a sane plain-text document

Not every surface renders `<details>`. Write it so both readings work:

```markdown
<details>
<summary><b>A. What still needs you — 6 items, in order</b></summary>

#### A. What still needs you — 6 items, in order

1. …

</details>
```

- **A blank line after `<summary>` and before `</details>`.** Without them the
  markdown inside does not render on the surfaces that *do* support details.
- **Repeat the title as a plain `####` heading immediately inside.** A reader in
  a terminal then still sees a titled section in the right order; the summary
  line above it is noise they can skip, not the only label.
- **The `<summary>` carries a title and a count, never load-bearing content.** It
  is a label. Nothing a reader must know may exist only there.
- **No nested `<details>`**, and no fence that straddles a `</details>`.
- **The degradation test:** delete every `<details>` and `<summary>` line. What
  is left must read top to bottom as an ordinary document, in the same order,
  with no orphaned sentence and no heading that lost its title. If it doesn't,
  the report is wrong, not the surface.

#### The blocking items get exactly one rendering

The 666-line report stated its six blocking items three times in near-identical
prose: a numbered list, a `do this / where / why not mine / unblocks` table in
"What is still on you", and a re-ordered recap in "Your next step". Two of those
three are now **forbidden**:

- **Section A's ordered list is the single authoritative rendering.** Every
  item's where, why-it-isn't-mine and what-it-unblocks appears there, once.
- **No table restating the list.** The old "What is still on you" table is
  deleted; its four columns are the same four facts as the list items.
- **No closing recap.** The old "Your next step" section is deleted. The card's
  `Your next action` line replaces it and is **item 1 of section A named in one
  sentence** — no "why it isn't mine" clause, no "unblocks" clause, no "then, in
  order" list of the rest. If a reader wants the rest, section A is one line away.
- The card's `State` line carries **the attendance fact and the count**, never a
  second copy of an item. A count is not a restatement (see "two in-card
  renderings", above).
- **Section F cites A by item number and carries only mechanics A does not.** This
  is the third rendering, and on branch D — this skill's headline path — it is the
  one that actually bites: the thing that unblocks the run is already A item 1 (the
  application) and, in state 2, A item 3 (the MCP sign-in). So:
  - **The recovery and resume *steps* live in A**, as items, each with its where,
    its why-it-isn't-mine and what it unblocks: `claude mcp login mabl` (or `/mcp` →
    mabl → Authenticate), the two `/plugin` lines labelled operator-run, the web-app
    application step. A is where a reader is told to do them.
  - **F names them by A's item number and does not re-tell them** — *"persistence
    stopped at branch D, blocked on **A item 1**; the sign-in that would have made it
    mine is **A item 3**."* No second where, no second why-it-isn't-mine, no second
    unblocks clause, no reprinted command that A already carries.
  - **What F *does* carry, because A does not:** the probe reading by state; the
    offer and the gate as it was shown; the handoff block with its pre-supplied
    facts; the fallback section's literal content including its `## mabl testing`
    heading and marker comment; the `grep -n` hit with its line number; and the
    literal **resume command** that is mechanics rather than an instruction to a
    person — `mabl environments urls add <env> --application-id <app> --app-url
    <url>` — attached to the A item it resumes.
  - The test: **delete section A and F must become incomplete, not redundant.** If F
    still reads as a full account of what the human has to do, F has restated A.

### Every must-hold, and the tier it landed in

This is the checklist. It replaces the old flat list of ~30 items — the same
must-holds, ranked rather than pruned. **Nothing in this table is optional**, and
a must-hold in tier 2 is not a weaker requirement, only a lower-placed one.

| Must-hold | Tier | Where |
|---|---|---|
| One report, at the end, after `mabl-init` returns | — | whole section |
| Written to the operator, shaped for the lead; structure follows the lead, voice follows the operator | — | whole report |
| Title says complete-or-blocked, and never "complete" on an incomplete app/env/URL chain | **1** | title line |
| Blocking **count** visible in the first 10 lines | **1** | title, continued by `State` — which carries the attendance fact and the count, never a second copy of the blocker phrase |
| Workspace name and id; repo path, shape and branch; operator email and resolved role; CLI version and MCP state | **1** | header block |
| `mabl-init` state named in words | **1**, evictable to **2** | `Tooling`'s third clause; on eviction it lands in **section F**'s opening line, which is its named home — never dropped |
| The MCP clause names **one of §0's three states in words** — `reachable` / `configured, needs sign-in` (or `configured, you declined the sign-in`) / `not configured`. State 2 never rendered as absent | **1** | `Tooling` |
| `App in scope` carries the **entity**: attributed — human, or me over the named MCP tool — or, on branch D, the gap itself (D1 `NOT YET CREATED`; D2 present-with-the-missing-piece). **No second "this is the blocker" clause** — the title already said it | **1** | `App in scope` |
| Write tally reports the real numbers including zeros, derived by counting §6's `WRITE LOG` lines — which were appended at each write, not assembled here | **1** | `Writes` |
| An applied-then-removed write annotated **inline** in the card: `<n> in mabl (<m> since deleted)`, so `Writes` and `Exists in mabl now` reconcile without section C | **1** | `Writes` |
| Untracked files counted as untracked, never as committed | **1** | `Writes` |
| Self-issued approvals labelled as such, never rendered as `0 applied without a yes` | **1** | `Writes` + `State` |
| What exists in mabl now, with the zeros that matter | **1** | `Exists in mabl now` |
| Exactly one next action, named with its location — an **action**, not a third restatement of the blocker: no why-it-isn't-mine, no unblocks clause | **1** | `Your next action` |
| Card within **both** budgets — ≤ 25 source lines (wrapping does not count) **and** ≤ 1,600 characters; every overflow moves down a tier **to the section named in the eviction table**, never expands the card and never disappears | **1** | the tie-break |
| Scannable by a lead who read no transcript — the old "under two minutes" bar, now met by the card alone, in well under a minute | **1** | the whole card |
| The three-section spine — what is still on you, what I built, what got recorded — survives, distinctly headed and in that order | **2** | A → C → E |
| The full blocking list — each item with where, why-it-isn't-mine, what-it-unblocks — rendered **once** | **2** | A |
| "Why it isn't mine" is either "no agent-reachable tool creates one", or "the CLI can't and you chose the web app over the MCP route", or "the CLI can't and the MCP server is configured but not signed in" — and the third never masquerades as the first | **2** | A |
| Where state 2 blocked something, section A's item is the **sign-in**, with `claude mcp login mabl` (or `/mcp` → mabl → Authenticate) named as the command and what it unblocks — never an install | **2** | A |
| Blocking list above what was built | **2** | A before C |
| Capability statement: no agent path for workspace / Link agent; the CLI can't create application / credential / plan but the hosted MCP server can; which route this run used | **2** | B |
| Zero sentences claim or imply you created a workspace or a Link agent | **2** | B |
| No sentence says an application, credential or plan is uncreatable by agents | **2** | B |
| Capability statement before the first detail table | **2** | B before C |
| Workspace creation routed three ways on role; a workspace owner cannot create one; no claim to know the account admins | **2** | B |
| Every artifact listed with name, identifier and **which tool made it**; human-created ones attributed to the human | **2** | C |
| At least one write verified by a read-back shown inline, with the reason the read-back is necessary; a DataTable verified by `datatables scenarios`, not by a nav path | **2** | C |
| `--variables` reported as unverified by design, with `--decrypt` named and refused — and **as unverified in existence and count, not merely in value**, because `describe` returns no variables field at all. No sentence states a verified variable count | **2** | C |
| Every list carries an explicit `--limit`; the 10-result cap stated once; the **four** no-`--output` commands never shown carrying it; and the two prose-on-stdout commands (`credentials list`, `branches create`) shown **with** their required `sed` | **2** | C |
| `agent-instructions create`'s `test_types: ["browser"]` reported as a response field with **no flag behind it** — not as a scope this run chose, and mobile named as out of reach on the CLI path | **2** | C |
| The mabl MCP servers actually seen are **enumerated**, and any non-hosted one is ruled out by its **read tool inventory** (no application-creation tool), not by connection state. No blanket "no MCP tool was called because the server wasn't authenticated" | **2** | C |
| Diagnostic and probe writes **gated** like any other write, **logged** at the moment they were created whether or not a gate preceded them, disclosed, and counted — including any applied then removed in-run. C names the gate it went through, or — if it was made ungated — says so plainly and lists whatever it left behind as a cleanup task in D | **2** | C (count in 1) |
| No claim that a test was authored or a run passed; if the run ends without a test, say so plainly and offer a named next step | **2** | C |
| At least three silent-wrong-result footguns, each with its consequence | **2** | D |
| The three footguns unobservable on a day-one workspace (`environments update`'s four booleans, the ignored `-w`, mainline-is-`master`) stated as **inherited, not observed**, in one sentence — kept at full strength, never hedged, and never turned into something for the operator to go and check | **2** | D |
| No applied write can be undone; DataTables undeletable from the CLI at all; any survivor listed as a human cleanup task with its id and where to delete it | **2** | D |
| All three irreversible writes carried their disclosure in the gate where the operator said yes — `datatables create`, `datatables update`, `urls add` — plus the MCP application write if used; and the DataTable-before-application trade named if it happened | **2** | D |
| Policy with no product surface is unmistakably not configuration; the durable file named **by path** | **2** | E |
| Per-row enforcement markers, copied from §5, with no row contradicting section C | **2** | E |
| Instruction-text limit reported as **2000**, never the stale 1000 | **2** | E |
| The array-flag punctuation rule recorded **scoped to `[array]` flags**; `--instruction-text` named as `[string]` where commas are fine. The instruction text this run wrote reads as ordinary prose, punctuated normally — comma-avoidant instruction prose is itself the defect | **2** | E |
| Secrets nowhere; credentials by name only; `--decrypt` never run; withheld `.env` values reported as withheld; **no other user's** name or email in any file — the operator's own email and role in the card is required and is not an exception to this | **2** | E |
| The `mabl-init` handoff shown by name with its pre-supplied facts enumerated | **2** | F |
| MCP-not-reachable branch shows probe (by state), the offer, the gate as shown, and the literal fallback content with its `## mabl testing` heading and marker comment. The **recovery step itself is an item in A** — restoring the MCP server as well as the skill, the `/plugin` lines labelled operator-run and gated, a skills-only route labelled as installing no MCP server — and **F cites it as "A item `<n>`" rather than reprinting it** | **2** | F (the step in A) |
| The branch-C marker comment claimed **only** by quoting the `grep -n 'written by mabl-onboarding without the mabl MCP server' <path>` hit with its line number. No grep hit, no claim — and `grep -c '^## mabl testing'` returning ≥2 reported as a cleanup task in D | **2** | F (cleanup in D) |
| The committed-file gate's mode named as **CREATE / APPEND / REPLACE**, with the path annotation that mode requires; a CREATE'd file counted as untracked in `Writes` until the operator commits it | **2** | F (+ count in 1) |
| Branch D shown in the sub-branch matching which count is zero — D1 wording only at 0 applications, D2 otherwise, no "0 applications" sentence on a D2 run — with the state stated, the application-independent writes applied, and the policy persisted with the `Application: …` line. The **blocked step is A's item**; F adds only the literal resume command and the A item number it resumes. A declined MCP route said as a choice, not an impossibility | **2** | F (the item in A) |
| Every command shown exists in the verified surface, **including the non-mabl ones** (`npm install -g`, the plugin lines); `gh skill install` only with its `gh skill --help` version check and never as *the* recovery path | **2** | F |
| Every committed-file write and every machine-level change shown as its own gate with its resolved path or scope; neither inherits the workspace gate | **2** | F (+ G's full gate) |
| The correction ledger as it actually came out, each correction with its downstream effect; an honest zero stated in one line; nothing manufactured | **2** | G |
| **Zero quoted human utterances unless a human spoke.** No `You corrected` line on an unattended run; any quotation whose speaker is not a live human carries its marker adjacent to the quote, never only in a section preamble; the no-human zero rendering used whenever `Writes` says self-issued approval | **2** | G (agrees with 1) |
| Depth-sheet `[read]` / `[you]` / `[guess]` / `[?]` markers; declined-to-fill named; deferred rows counted and listed, distinct from declined | **2** | G |
| If the `[?]` cap bound, the six surfaced rows named **with their position in §5's fifteen-row order**, so the selection is checkable; any deviation logged as a correction | **2** | G |
| Never more than six unanswered questions in a row anywhere in the run, and the deferred count reported | **2** | G |
| **One** write gate shown in full — command, artifact, caveats, four-way choice | **2** | G |
| Confirmed suites distinguished from dependency-only hits, both tiers populated, at least one not-detected reported as a **question**; a commented-out mabl integration never reported as live | **2** | G |
| UI paths hedged where they are emitted, never by a blanket "it's under Settings"; no negative claim about a UI path without a cited source or an explicit "unverified" label | **2** | wherever a path appears |
| No dangling cross-reference | — | see below |

### No dangling cross-references

A prior report promised *"read-back proof is at the end of this report"* and no
such section existed. So:

- **A–G is a closed set.** Every "see …", "below", "above" and "at the end of
  this report" must resolve to one of those seven sections, named by its letter
  and title. A reference to a section this template does not define is forbidden,
  and inventing a section to satisfy a reference you already wrote is worse.
- **Evidence lives in the section that owns the write.** Read-backs and probe
  disclosures go in **C**, next to the write they verify — not forward-referenced
  to a proof appendix. The ledger and the depth sheet go in **G**. There is no
  appendix.
- **Check it before you emit.** Walk every cross-reference in the report and
  confirm its target exists and actually contains what you promised. A promise
  with nothing behind it is the same defect as a fabricated read-back.

