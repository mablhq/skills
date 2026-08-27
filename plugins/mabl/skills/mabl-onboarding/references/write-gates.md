# The write-gate discipline

The whole gate contract: the gate template, the write log, per-write caveats, read-back verification, the irreversibility disclosures and where each must appear, plus the committed-file gate of §7.

## 6. Write gates — draft, show, apply on an explicit yes

**Read paths verify freely. Write paths earn trust one at a time.** Never batch
approvals. Show the exact command before running it.

**Two of the writes this skill makes cannot be undone, and each one's caveat
belongs in the gate where the operator says yes — not only in the prose below.**
State each up front, then repeat it verbatim in that gate's `caveats` block:

| Write | The disclosure that must appear in its gate |
|---|---|
| `environments urls add` | **no upsert, no edit, no delete** from the CLI; a re-run adds a second row and a wrong row is a permanent human cleanup task |
| `create_mabl_application` (MCP) | an application cannot be deleted by the CLI *or* by the MCP server, and the call also creates a URL row carrying the disclosure above |

**The two irreversible writes this skill does *not* make are DataTables.**
`mabl datatables` is `create` / `describe` / `export` / `list` / `scenarios` /
`update` — verify with `mabl datatables --help`, **there is no `delete`** —
and `datatables update` deletes every row absent from the file. Neither is in
scope: §6 defers test data to authoring, so an onboarding run creates no
DataTable at all. They are named here because the §0 probe covers them, because
"never create one diagnostically" below is a rule rather than an omission, and
because the report inherits both footguns for whoever authors the first test.
This is not hypothetical: a validation run of this skill created one and could
not remove it, which is where the scope cut came from.

Present every write in this shape:

```
WRITE 3 of 9    URL row: `staging` -> `Acme Portal`                 not applied
                @ https://staging.acme.example

command   mabl environments urls add <ENVIRONMENT_ID> \
            --application-id <APPLICATION_ID> \
            --app-url https://staging.acme.example

caveats   - ⚠ THIS ONE CANNOT BE UNDONE BY ME OR BY YOU FROM THE CLI.
            `mabl environments urls` is `add` and `list` — no upsert, no
            edit, no delete. A wrong row stays, and a re-run adds a SECOND
            row rather than correcting the first. Removing one is a manual
            job in the web app. Approving this is approving something
            permanent from my side.
          - It exits 0 even when every URL association silently failed —
            the error is caught, logged and resolved. So this gate is not
            closed by the exit code; it is closed by the read-back below.
          - If it does fail, the retry line the CLI prints is wrong on both
            halves: `environments add-url` is not a subcommand and the flag
            is `--application-id`, not `--applicationId`. The real retry is
            this same command.
          - `--application-id` is required, so this row cannot exist before
            the application does. That is why build-out is
            application-first (§3), not a preference.

verify    mabl environments urls list <ENVIRONMENT_ID> --output json --limit 100
          Expect exactly one row for <APPLICATION_ID> at that URL. Two rows
          means the re-run hazard above already fired; report the extra as a
          human cleanup task with both ids.

          approve / edit / skip / why?
```

The four-way choice is the contract: **approve**, **edit**, **skip**, or
**why?**. `why?` gets a real answer, not a re-prompt.

### The write log — opened at the first write, appended at every write

**On approve, run the command and then emit its log line before you say anything
else about the write** — before the read-back, before the next gate, before any
prose. §10's header counts are produced by counting these lines, so the log has to
be written *while the run happens*; a log assembled at report time is the thing §10
forbids. This is the step that closes the gate:

```
WRITE LOG <k>   <mabl | committed file | untracked file | machine | session>
  command    <exactly what ran, including any required sed>
  result     <the id returned, or FAILED — nothing created, or the error>
  approved   <human yes | self-issued — no human answered this gate>
```

- **The log opens at the run's first applied write, whichever gate that is** — §0's
  CLI install, §0's state-1 add, §0's state-2 sign-in, §3 route 1's environment +
  `create_mabl_application` pair, any write in this section, §7's file write, §8
  branch B's or C's write. Whichever fires first prints `WRITE LOG 1`. There is no
  separate "start the log" step and no gate that is exempt.
- **One line per write, at the moment that write returns.** Never batch two writes
  into one line, never emit a line for a write you have not run yet, and never
  reconstruct a line from memory afterwards.
- **A failed write still gets a line**, with `result  FAILED — nothing created`. It
  is evidence, and it does **not** count toward §10's applied tally.
- **A non-zero exit is not proof that nothing was created, and exit 0 is not proof
  that everything landed.** `mabl branches create … | jq` exits 5 with the branch
  created (see the `sed` above), and `environments create` / `urls add` exit 0 with a
  URL association silently failed (see the read-back below). So fill `result` from the
  **read-back**, not from the exit code. Writing `FAILED` over a write that actually
  landed undercounts exactly the way the prior run did.
- **A write you applied and then removed inside the run keeps its line** and stays
  in the applied count; add `, then removed in-run` to `result`. §10's `Writes` line
  annotates that inline and section C carries the row.
- **Skips produce no line.** A skipped gate applied nothing.
- **`approved` is per line, not per run.** If a gate was answered by you on your own
  behalf, that line says so, and §10's approval clause and the zero rendering in
  `references/interview.md` §"Keep a correction ledger, as it happens" must agree
  with what the lines say.

If a count in §10 disagrees with this log, the log is right and the count is wrong.

#### A diagnostic or probe write is a gated write, and it is logged like any other

Running a command **unpiped** to see what lands on stdout is a read, and reads verify
freely. But if the command you reach for in order to check a claim **creates a mabl
entity** — a throwaway branch, an environment you mean to delete afterwards, an
instruction created to watch the server reject a misspelled capability — then it is a
workspace write with the operator on the hook for it, and it gets both halves of the
discipline:

1. **Gate it, before it happens**, in the same `WRITE n of m` shape as every other
   write, with `diagnostic — I am creating this only to check <the claim>` as its
   first caveat and the removal path (or the absence of one) as its second. There is
   no unlabelled-probe exemption anywhere in this skill. **If you cannot get a yes —
   nobody is there to ask — do not make the write.** Prefer the claim's recorded
   provenance, and report the claim as inherited rather than re-derived.
2. **Log it, whether or not it went through a gate.** Any command that creates a mabl
   entity appends its `WRITE LOG` line the moment it returns. This is the rule that
   catches the case gate discipline alone missed: a prior run created a probe branch
   *outside* the numbered gate sequence, disclosed it in prose, and reported 4 mabl
   creates when 5 had happened. The log line is what makes that count right, and it
   is owed at the create, not at the report.
3. **Never create a DataTable diagnostically** — or an application, or a URL row.
   Those three have no delete anywhere on the surface (§"Nothing here can be
   undone"), so a probe leaves a permanent artifact and a human cleanup task. The
   DataTable is doubly out: §6 puts test data out of scope, so there is no gated
   route to one either.
4. **If you removed it again inside the run**, the line stays, `result` says
   `, then removed in-run`, and §10 counts it as applied and annotates it inline.

### Verify writes with a read-back, because exit codes lie

`mabl environments create` and `mabl environments urls add` **exit 0 even when
every URL association silently failed** — the error is caught, logged, and
resolved. Never trust the exit code. Read back.

**And do not copy the retry command the CLI prints on that failure.** It suggests
`mabl environments add-url <env> --applicationId <app> --app-url <url>`; there is
no `environments add-url` subcommand and the flag is `--application-id`, so that
line exits 1. Confirm it yourself with `mabl environments --help`. The correct
retry is the real form: `mabl environments urls add <env> --application-id <app>
--app-url <url>`.

```bash
# environments
mabl environments urls list <ENVIRONMENT_ID> --output json --limit 100
mabl environments describe <ENVIRONMENT_ID> --output json

# agent instructions, branches, plans
mabl agent-instructions list -w <WORKSPACE_ID> --output json --limit 100
mabl agent-instructions describe <INSTRUCTION_ID> --output json
mabl branches list -w <WORKSPACE_ID> --status open --output json --limit 100
mabl plans list -w <WORKSPACE_ID> --output json --limit 100
```

**`environments urls list` is the read-back that proves the row landed** — it
returns the application id and URL of every row on that environment, so it
verifies content, not just that the command exited. Since the `urls add` gate
above is the write this skill shows in full, this is the read-back the report
shows inline. Do **not** fall back to citing *Settings → Environments* in the web
app and calling the evidence thinner: a real verification exists, and reporting
weaker evidence than you can obtain is its own failure. It is also the only way
to catch the exit-0-and-silently-failed case, and the only way to see a duplicate
row before the operator does.

Two limits on environment read-backs, and they pull against each other — resolve
them the honest way, not by weakening the secrets rule:

- `mabl environments list` does not return environment variables at all.
- `mabl environments describe <id> --output json` returns **no variable field
  whatsoever** — not the values, and **not even the key names**. Per its own
  `--help`, `--decrypt` is what *"decrypt[s] and return[s] environment variables as
  part of the payload"* — and **you must never run `environments describe
  --decrypt`**, because it prints secrets in plaintext to stdout and the report may
  be pasted somewhere. *(Verified by mabl in the API source: the undecrypted
  response path nulls both `variables` and `encrypted_variables` before serializing,
  so there is nothing left to read a key name out of. The customer-runnable check is
  simply that `describe --output json` shows no variables key.)*

So a `--variables` write has **no permitted read-back at all**, and this is
stronger than "the values are hidden": **you cannot verify the variables exist.**
Be precise about what you actually know, because it is less than it looks:

| You know | You do **not** know |
|---|---|
| the exact `--variables` arguments you passed | that any variable was stored |
| the command exited 0 and printed no error | how many landed |
| (`environments create` also exits 0 on a *silently failed URL association*, so a 0 here is weak evidence generally) | any key name, from any permitted read |

**So do not report a count as if it were verified.** "I set 2 variables" states a
verified quantity; nothing in the run verifies it. Report it like this instead:

> *"I passed 2 variables to `environments create` for `staging` — `API_BASE_URL`
> and `TENANT_SLUG`. The command exited 0 and printed no error, and that is the
> **entire** extent of the evidence: `environments describe --output json` returns
> no variables field at all, not even key names, and the only flag that would show
> them is `--decrypt`, which prints secrets in plaintext and which I will not run.
> So I cannot confirm they exist, how many exist, or what they are called. **You**
> can, at Settings → Environments → staging (nav as of this writing)."*

Naming the two keys is fine — they came from *you*, they are your own arguments,
and they are what the operator needs in order to check. What is forbidden is the
grammar that turns your arguments into a finding. Do not claim a `describe`
verified them; it never showed them.

**Where you have no permitted read-back for an entity type, say so and name your
actual evidence** — the create-response payload, or the UI location the operator
can look at. Ask the CLI (`mabl <group> --help`) before claiming a read-back
subcommand exists, and before claiming one doesn't. Showing weak evidence
honestly beats inventing a command; claiming weak evidence when a strong one
exists is just as wrong.

### Nothing here can be undone

**There is no unwind command anywhere in this skill's surface.** Named, so an
approver knows what they're approving:

- **URL rows cannot be deleted or edited from the CLI.** `urls add` has no
  upsert; a wrong row stays, and a re-run adds a second one. **Required caveat in
  that gate**, and in the MCP `create_mabl_application` gate, which creates a URL
  binding of its own.
- **An application cannot be deleted** by the CLI or by the MCP server —
  `mabl applications --help` is `list` / `describe` only. If you create one over
  `create_mabl_application`, that is permanent from the agent side too — say so in
  that gate.
- **A DataTable cannot be deleted at all**, and `datatables update` deletes every
  row absent from the file. **This skill creates neither**, so neither is a gate
  it owns; both are carried into the report as inherited footguns for whoever
  authors the first test.

`environments delete` and `agent-instructions delete` do exist, so those two are
the only writes here you can walk back.

Say this in the report, and list any wrong write that survived as a **human
cleanup task** — with the entity name, its id, and where they delete it — rather
than smoothing over it. If a run leaves a wrong URL row behind, that is a
named residue item with no CLI remedy, not a footnote. This is exactly why every
write is gated.

### The machine-level gate in the prerequisites

```
# GATE, only if SKILL.md's probe says NOT INSTALLED or BELOW floor.
WRITE 0 of n   global mabl CLI install/upgrade (machine-level)     not applied

command   npm install -g @mablhq/mabl-cli@latest

caveats   - This is user-global. Every other repo on this machine that pins an
            older mabl CLI moves with it. I cannot scope it to this project.
          - If you'd rather not, say skip: I can still run everything below with
            `npx @mablhq/mabl-cli@latest <cmd>`, or you can upgrade yourself
            later and re-run me.

          approve / edit / skip / why?
```

**On approve: run it, then emit its `WRITE LOG` line immediately (§6).** This is a
machine-level write and it counts in §10's `Writes`. If this is the run's first
applied write, it is `WRITE LOG 1` — the log opens here, not at report time.

## 7. Record the policy that has no product surface

Everything from the depth sheet that §5 classified as `nothing — text only`, plus
the un-enforced half of every `partly` row, is **text, not configuration**. Write
it to a durable file at the project root — normally the agent memory file
(`CLAUDE.md` / `AGENTS.md` / `.github/copilot-instructions.md`), under the
heading `## mabl testing`. Name the file **by path** in the report. Chat
scrollback and the report itself are not durable; the file is.

### This file is committed and team-shared, so it is a gated write

That file is in version control and every teammate and every agent on the project
reads it. It is **not** covered by the workspace-write gate in §6, so it gets its
own — same four-way choice, and **resolve the path before you show it**, matching
what the §8 persistence skill does ("Confirm the format and the resolved path with the user
before writing"):

#### Resolve the path first, then pick one of THREE modes

**There are three modes, not two, and the third is the normal one for this
skill's own target case.** A team new enough to be onboarding to mabl frequently
has **no** agent memory file at all — that is not an edge case, it is the median
day-one repo. On the validated run, no `CLAUDE.md`, `AGENTS.md` or
`.github/copilot-instructions.md` existed anywhere, and a template offering only
APPEND and REPLACE forced the executor to invent CREATE unprompted. So:

```bash
# Resolve, and record which of the three you found. Run from the repo root.
for f in CLAUDE.md AGENTS.md .github/copilot-instructions.md; do
  if [ -e "$f" ]; then
    printf '%s: EXISTS, %s lines' "$f" "$(wc -l < "$f" | tr -d ' ')"
    git ls-files --error-unmatch "$f" >/dev/null 2>&1 \
      && printf ', git-tracked\n' || printf ', NOT git-tracked\n'
    grep -n '^## mabl testing' "$f" 2>/dev/null | cut -d: -f1 \
      | sed 's/^/  already has the `## mabl testing` heading at line /'
  else
    printf '%s: does not exist\n' "$f"
  fi
done
```

| Mode | When | The `mode` line, and the `path` annotation it needs |
|---|---|---|
| **APPEND** | the file exists, no `## mabl testing` heading in it | `APPEND a new '## mabl testing' section` · `<- resolved, exists, 84 lines, git-tracked` |
| **REPLACE** | the file exists **and** already has the heading | `REPLACE the existing '## mabl testing' section, lines 61-84` · `<- resolved, exists, 84 lines, git-tracked, heading at line 61` |
| **CREATE** | none of the three files exists | `CREATE the file — it does not exist yet` · `<- resolved, DOES NOT EXIST, will be created (0 lines today)` |

**CREATE's own gate wording, because it is a different decision from APPEND.**
APPEND asks the operator to accept a section. CREATE asks them to accept a **new
file at the root of their repo, in a filename convention that tells every future
agent which harness this team uses** — a choice they may have opinions about, and
one nobody has made yet. Ask it as that:

```
WRITE n of m   CREATE `CLAUDE.md` with a `## mabl testing` section   not applied

path      <absolute path to their repo>/CLAUDE.md
          <- resolved, DOES NOT EXIST, will be created (0 lines today)
          (searched: CLAUDE.md, AGENTS.md, .github/copilot-instructions.md —
           none of the three exists anywhere in the repo. So this is a NEW
           file, and its name is a choice: CLAUDE.md is read by Claude Code,
           AGENTS.md is the cross-tool convention, and
           .github/copilot-instructions.md is Copilot's. Say which you want —
           I picked CLAUDE.md because <the reason from gate C2>.)
mode      CREATE the file — it does not exist yet

content   <the full rendered file, verbatim, every line including the heading>

caveats   - This creates a new file in your repo root. It is not a section in
            something you already maintain: it is a file your teammates will
            see appear in the next diff, and it will be read by every agent
            anyone points at this project.
          - ⚠ IT IS NOT IN VERSION CONTROL UNTIL YOU COMMIT IT. I create it;
            git does not track it. So my write tally counts this as
            `1 applied to an untracked file`, not as a committed-file write,
            and it stays untracked — and therefore invisible to your teammates
            and to CI — until you `git add` it.
          - No secrets, no credential values, and nothing from
            `mabl users list` — no other user's name or email address.
          - A later run of the §8 persistence skill replaces this section
            in place, by heading.

          approve / edit / skip / why?
```

For APPEND and REPLACE the gate is the same shape with that mode's `path`
annotation and `mode` line, and without the untracked caveat **unless
`git ls-files --error-unmatch` says the existing file is untracked too** — check,
don't assume, and see §10's `Writes` rule, which is the same rule.

**On approve: write the file, run `git ls-files --error-unmatch <path>`, and emit the
`WRITE LOG` line (§6) immediately** — target `committed file` if git tracks it,
`untracked file` if it does not, and `result` carries the resolved path plus the mode
you actually applied. Whichever mode this was, one write, one line, at the moment the
write returns. If the section carries branch C's marker comment, its `grep -n`
read-back (§8) runs next, and what that grep prints is the only thing the report may
quote for it.

If they skip it, the policy has **no durable home** — say so plainly in the
report rather than letting it sit only in scrollback, and offer to write it
somewhere uncommitted instead (a scratch file they move themselves). Never write
into a committed file on an inferred yes, and never write to a path you did not
resolve and show first. **Never silently upgrade CREATE into APPEND or the
reverse**: if the resolution said the file does not exist and you find one when
you go to write, stop and re-show the gate in the right mode.

Render it so it cannot be mistaken for configuration:

- open the section with a plain statement that **mabl has no setting for most of
  these items**, and that the marked exceptions are only partly enforced
- give every row the **enforcement marker §5 assigned it** — `nothing — text
  only`, or `partly — <the entity that does exist, with its id>`. Copy §5's
  classification; do not re-derive it here. D7 and D5 are `partly` whenever
  §6 actually created the corresponding environment variables or
  deployment command — writing `nothing — text only` next to a row
  whose entity is listed in **report section C** is the contradiction this marker exists to
  prevent
- include the CLI footguns from §6, so the next agent inherits them — including
  the four flags `environments update` needs re-passed, the **2000**-character
  instruction-text limit (never the stale 1000 from `--help`), the fact that
  DataTables cannot be deleted and that `datatables update` deletes absent rows,
  that `urls add` has no upsert, the **four** commands that reject `--output`, and
  the two that put prose on stdout and therefore need a `sed` before `jq`
  (`credentials list` after the JSON, `branches create` **before** it)
- record the array-flag punctuation rule **with its scope attached** — it applies to
  `[array]` flags only, and `--instruction-text` is `[string]` where commas are
  fine. An unscoped version of that rule is worse than omitting it: the next agent
  will write comma-free prose for no reason, which is exactly what happened here
- mark the three footguns that **cannot be observed on a day-one workspace** as
  inherited rather than observed (§6), at full strength, so nobody deletes them
  after failing to reproduce them
- include the unanswered depth rows as **open questions**, verbatim, not
  filled in, distinguishing rows the operator declined from `[?] deferred` rows
  the `[?]` cap never surfaced

Secrets never go in this file. Neither does **any other user's** name or email
address from `mabl users list`. Credentials by name only. The operator's own
identity is a separate question and is governed by §1's scoped rule — it belongs in
the report header, and there is no reason to put it in this file at all.


---

## Irreversibility preflight (§0)

`mabl tests`, `mabl datatables` and `mabl applications` have **no delete
subcommand** — anything created is permanent from the CLI. `environments`,
`branches` and `agent-instructions` delete cleanly. Do not carry that table from memory; the
surface moves between versions. Probe it in step 0 and record the result in the
write log, so every later gate can state the true irreversibility:

```bash
# PROBE. Read-only. Which entities can be undone if this run gets one wrong?
for n in applications environments tests datatables branches agent-instructions; do
  printf '%-20s ' "$n"
  mabl "$n" --help 2>&1 | grep -qE '^[[:space:]]+mabl '"$n"' delete' \
    && echo 'delete: YES' || echo 'delete: NO — creation is PERMANENT'
done
```

**Never create anything as a probe in a no-delete family.** If a capability
question can only be answered by creating something permanent, ask the operator
instead of answering it yourself. This rule was written after a capability probe
left an undeletable scratch test in a customer-shaped workspace.

**Never re-issue a create on a status that is not proven terminal.**
`RATE_LIMITED` from cloud authoring is the case that matters: it means the
concurrency quota rejected *this attempt*, not that the session failed. It usually
completes on its own. Wait and re-poll. Re-firing it produced four undeletable
duplicate tests in a real run. Keep concurrent cloud-authoring sessions to about
two or three — concurrency is a performance choice for reads and a **risk** choice
for irreversible writes.

### Recovering a duplicate you cannot delete

The CLI cannot rename a test (`tests edit-metadata` handles labels only). The MCP
tool can: `edit_mabl_test_metadata` supports `set_name`, `set_description` and
`set_enabled`. Recover in one call, then **report it**:

1. rename to `zz-duplicate - <original name>`
2. `set_enabled: false`
3. add the label **`to-delete`**
4. set the description to name the canonical entity's id and why the duplicate exists
5. list every `to-delete` entity in the closing report, under a heading that says
   plainly that **only a human can remove them, in the web app**

Never leave this implicit. A disabled duplicate with no label and no report line is
invisible within weeks, and the next dedupe pass will read it as real coverage.

---

## Verify from a different source than the one that wrote (§6)

Every failure mode this skill has hit in the field **reported success**: `exit 0`,
`OK`, a poll status of `ALL TERMINAL` mid-run, labels "applied" that selected
nothing. None surfaced as an error, and each produced a workspace that *looked*
finished.

**A write's own return value is not evidence the write is correct.** Read it back
through a different surface than the one that made the claim:

| Wrote | Verify with | The failure it catches |
|---|---|---|
| a label | a **filter query** for that label | a suite that selects zero tests |
| a test | an actual run | a test bound to a URL variable that does not resolve |
| a plan | its returned `execution_stages` | ids silently dropped by the API |
| an environment | `describe` | variables or URL rows that never landed |
| a bulk status | per-item re-query | a poll that reports finished while work runs |

### Two traps behind this

**A silent list cap makes "absent" and "truncated" indistinguishable.**
`mabl workspaces list` returns 10 rows with no "showing 10 of N". Every inventory,
dedupe and does-this-already-exist check rests on lists being complete, so pass an
explicit high `--limit` and reconcile the count. Treating "not in the list" as
"does not exist" is how a run creates a duplicate of something it already had.

**Multi-value flags through an unquoted shell variable are unsafe.** zsh does not
word-split unquoted parameter expansions; bash does. So this silently creates ONE
label containing a space:

```sh
L="smoke search"
mabl tests edit-metadata "$ID" --add-labels $L     # -> label literally "smoke search"
```

The tell is that literal words on the command line (`--add-labels smoke search`)
split correctly, so plan labels can be right in the same run that test labels are
wrong. Pass literals, build a real array, or use the MCP tool — never an unquoted
variable. Verify with a filter query, per the table above.
