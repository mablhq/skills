---
name: mabl-init
description: |
  One-time project setup for mabl. Discover this user's mabl workspace,
  applications, environments, and credentials over the mabl MCP server, then
  save everything an AI agent needs to create and run mabl cloud tests where the
  user wants it — an agent memory file (CLAUDE.md / AGENTS.md /
  .github/copilot-instructions.md), a rule, or a skill.
  Fire when the user says "set up mabl", "mabl init", "initialize mabl",
  "configure mabl for this project", "save my mabl workspace / application /
  environment / credentials", "add mabl to my CLAUDE.md", or "/mabl-init".
  Also fires to set up or check test impact analysis: "set up test impact
  analysis", "is test impact analysis working", "analyze_test_impact is
  missing", "test impact analysis is not enabled". Run once per project, before
  authoring or running tests. For creating a single test use
  mabl-test-authoring; for a whole suite use mabl-test-coverage-design.
allowed-tools: Bash, Read, Write, Edit, mcp__mabl__get_current_user, mcp__plugin_mabl_mabl__get_current_user, mcp__mabl__list_mabl_workspaces, mcp__plugin_mabl_mabl__list_mabl_workspaces, mcp__mabl__list_mabl_applications, mcp__plugin_mabl_mabl__list_mabl_applications, mcp__mabl__list_mabl_environments, mcp__plugin_mabl_mabl__list_mabl_environments, mcp__mabl__list_mabl_credentials, mcp__plugin_mabl_mabl__list_mabl_credentials, mcp__mabl__list_mabl_test_run_summaries, mcp__plugin_mabl_mabl__list_mabl_test_run_summaries
---

# mabl init

Prime a project so any future agent session can create and run mabl tests with
no re-explaining. This skill reads your mabl account through the hosted `mabl`
MCP server, asks you the handful of choices only you can make, and saves the
setup where you want it — an agent memory file, a rule, or a skill.

## Prerequisites

This skill uses the hosted **`mabl` MCP server** (bundled with this plugin) —
not the mabl CLI. Start by calling `get_current_user` to grab
`defaultWorkspaceId` (the fallback workspace when the user doesn't pick one).

**Setting up or checking test impact analysis** (`analyze_test_impact` missing
or refused, or "is it working?"): walk `references/test-impact-setup.md`
instead of the workflow below, and report every row with its status.

## Workflow

Do these in order. Steps 1–5 gather; step 6 writes.

**Write only what the user chose.** Show everything you discover, but record only
the workspace, applications, environments, and credentials they selected or
confirmed. No unpicked extras, no "these are the other applications" asides. If
you're unsure whether something belongs, ask; don't pad the file.

### 1. Confirm the workspace

Call `list_mabl_workspaces`.

- **One workspace** → use it.
- **More than one** → show a short numbered list of `name — id` and ask the
  user which one. Default to `defaultWorkspaceId` from the prerequisite check.

Record the chosen `{id, name}`. Use this `workspaceId` on every call below.

### 2. Discover applications, environments, and URLs

Call `list_mabl_applications` with the `workspaceId`. Each application comes
back with its `environments[]`, and **each environment carries the deployment
`url`** — the actual address a test navigates to. This one call gives you apps,
environments, and URLs together.

Also call `list_mabl_environments` (same `workspaceId`) to catch environments
that exist but have no deployment yet (these have a name and id but no URL).

Show the user a table: application → environment → URL. This is the raw
material for the memory file.

One call (default limit 100) is enough; a `nextCursor` can come back even when
everything fit, so page only when the workspace truly has more than 100.

If no applications or environments come back, the workspace isn't set up for
testing. Don't write an empty table: tell the user to add an application and a
deployment in mabl (or target an ad-hoc URL via `urlOverride`), and check the
workspace from step 1. If none has a deployment `url`, there's nothing for
`run_mabl_test_cloud` to resolve: add one, or record that runs pass `urlOverride`.

### 3. Decide how to choose an application & environment

- **Exactly one application with one environment** → use it; skip the question.
- **Otherwise, ask the user how the agent should pick** when there's more than
  one. Offer these three options and record the answer:
  - **(a) One default** — choose a default application + environment now. The
    agent uses it unless told otherwise.
  - **(b) Folder-based** — map repo folders to app/environment pairs (e.g.
    `apps/web/**` → Web App / Staging). Gather one pair per relevant folder.
  - **(c) Ask each time** — no default; the agent asks (or the user names) the
    app/environment for each test.

Whichever they pick, record the specific app + environment combos in play — the
one default for (a), the mapped pairs for (b), or the set worth considering for
(c). Steps 4 and 6 use exactly those combos, nothing more.

### 4. Map credentials

**Don't dump the whole credential list.** Suggest only the credentials actually
used for the app + environment the user chose.

1. For each application + environment the user kept in step 3, call
   `list_mabl_test_run_summaries` with the `workspaceId`, that `applicationId`,
   and that `environmentId`. Each run row carries the `credentialsId` it really
   used (absent when the run needed no login). Collect the credential IDs that
   show up — those are the ones in real use for that combo.
2. Resolve those IDs to a name and type with `list_mabl_credentials` (same
   `workspaceId`) — use it only to look up the credentials you found, not as a
   list to show the user wholesale.
3. Suggest just those credentials, each with a one-line **"use when…"** note
   (e.g. "**Standard user** (`BZDY…`) — used by live runs against **Web App /
   Dev**"). Let the user accept, edit, or skip each, and store only the ones
   they keep.

If a combo has no runs (or no credential on any run) and the user wants an
authenticated test, offer the `list_mabl_credentials` list only then. If a test
needs no login, store no credential for it.

Per stored credential: **name, ID, and type** plus the note — never a username
or password (the MCP server never returns those). A credential's *name* can
embed a test-account username, and this file is committed and shared with your
team, so it's fine for IDs and names but never a place for real secrets.

### 5. Choose how and where to persist the setup

Ask the user how they want it saved — don't assume a file. Offer:

- **(a) Agent memory file** (recommended — always loaded, nothing to invoke
  later). Then ask *where*, the way `#memory` does:
  - **project root** — committed and shared with the team (the usual choice);
  - **user-level** (`~/.claude/CLAUDE.md` and equivalents) — personal; applies
    to every project you open, so only pick it if you use the same workspace
    everywhere (the IDs are workspace-specific);
  - **a specific path** they name (e.g. a subdirectory's memory file).

  The filename follows the client (you know your own harness; if unsure, check
  env vars like `CLAUDECODE` / `CURSOR_*` or an existing file): Claude Code →
  `CLAUDE.md`, Cursor / Codex → `AGENTS.md`, GitHub Copilot →
  `.github/copilot-instructions.md`.
- **(b) A rule** — for clients with path-scoped rules (e.g. Cursor
  `.cursor/rules/mabl.mdc` with `globs`, GitHub Copilot
  `.github/instructions/mabl.instructions.md` with `applyTo`). Pairs naturally
  with the folder-based strategy from step 3 — scope the rule's globs to the
  mapped folders so the right app/environment loads per path.
- **(c) A skill** — a small `mabl-config` skill (e.g.
  `.claude/skills/mabl-config/SKILL.md`) invoked on demand, for when you'd rather
  it not always be in context; the IDs load only when it triggers.

Default to (a) at the project root. Confirm the format and the resolved path
with the user before writing.

### 6. Write (or merge) the setup

Fill in the template below, writing only what the user chose. For "Choosing an
application & environment", keep only the block matching step 3's strategy, and
drop the other two and the `<!-- … -->` markers (guides for you, not content).

Then save it in the format chosen in step 5. The content is identical; only the
wrapper differs:

- **Memory file** → the template as a `## mabl testing` section. If the file
  exists, `Read` it and replace an existing `## mabl testing` section (else
  append) — **never** touch unrelated content. Create the file if it's missing.
- **Rule** → a new rule file with the client's rule frontmatter and the template
  as the body (Cursor `.mdc` with `globs`, Copilot `.instructions.md` with
  `applyTo`). For the folder-based strategy, set the globs to the mapped folders.
- **Skill** → a `SKILL.md` (e.g. `mabl-config`) whose YAML frontmatter (the
  `---` block) has a `name` and a **trigger-first `description`**, with the
  template as the body. The description must fire before any mabl work (e.g.
  "Read before creating or running any mabl test in this project — holds the
  workspace, applications, and credentials to use"); without frontmatter or that
  trigger, the IDs are never in context when tests are authored.

### 7. Confirm and suggest a next step

Summarize what you saved (workspace, apps, credentials, file path) and suggest a smoke check:

> Try: *"create a mabl test for &lt;a page in your app&gt;"* — I'll use the
> workspace and app you just configured.

---

## Setup content template

The content to save (see step 6). Replace every `<…>` and drop rows / blocks
that don't apply. Name mabl tools plainly; the agent maps them to its own names.

```markdown
## mabl testing

This project uses [mabl](https://www.mabl.com) for end-to-end testing, driven
through the hosted `mabl` MCP server. To create, run, or debug a mabl test, use
the mabl MCP tools with the IDs below.

### Workspace
- **<workspace name>** — `<workspaceId>`

Pass `workspaceId: <workspaceId>` on every mabl MCP call. Call
`get_current_user` to double-check the active workspace.

### Applications & environments

<!-- Only the applications/environments the user chose in step 3 — the default
one (a), the mapped ones (b), or the set they want considered (c). Not every
app in the workspace. -->

| Application | Application ID | Environment | Environment ID | URL |
|-------------|----------------|-------------|----------------|-----|
| <App name>  | `<app id>`     | <Env name>  | `<env id>`     | <url> |

### Choosing an application & environment

<!-- (a) One default -->
Default to **<App>** (`<app id>`) on **<Env>** (`<env id>`, <url>) unless I say
otherwise.

<!-- (b) Folder-based -->
Pick the app/environment by the folder the work is in:
- `<glob>` → <App> (`<app id>`) / <Env> (`<env id>`)
- `<glob>` → <App> (`<app id>`) / <Env> (`<env id>`)
If a file isn't covered, ask me.

<!-- (c) Ask each time -->
There are several applications/environments (see the table). Ask me which to
use before creating or running a test.

### Credentials

Credential names, IDs, and types only — never usernames, passwords, or secrets.

| Credential | ID | Type | Use when |
|------------|-----|------|----------|
| <name>     | `<cred id>` | <type> | <use-when note> |

If a test needs no login, omit the credential.

### Create a test
1. `mabl_authoring_plan` — describe the test in plain language (which app/URL,
   the steps, what to verify). Refine with the returned session id if needed.
2. `mabl_authoring_initiate` — generate it in the cloud from that plan.
3. `mabl_authoring_status` — poll until `completed`; you get the created test id.

Or, when you already have the steps, create directly with `create_mabl_test`
(`name`, `testType`, `applicationId`, `environmentId`, plus `credentialsId` for
authenticated tests) and pass the steps as `initial_flow.steps` — without them
it creates an empty, non-runnable test envelope.

### Run a test in the cloud
- One test: `run_mabl_test_cloud` with `testId`, `environmentId`,
  `applicationId`, and a `browsers` list (at least one, e.g. `["chrome"]`) —
  mabl resolves the matching deployment/URL automatically. Pass `urlOverride`
  to run against an ad-hoc URL such as a preview deploy.
- A plan: `run_mabl_plan` with the `planId` (ends in `-p`).

### Test runs
<!-- Optional: only what the user states. Pins and policy, never procedure. -->
- Critical set: label `<label>` always runs.
- Billable GenAI assertions (`--allow-billable-features`) on local runs: <allowed | not allowed>.
- Local dev server: <https://host:port>; served-build check: `<command>`.
- Shared-state runs are approved by <who>.
These notes never demote a safety gate: the ask-first bands, the canary, and
the plan-run rule hold whatever a note says.
```
