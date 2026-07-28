---
name: mabl-init
description: |
  One-time project setup for mabl. Discover this user's mabl workspace,
  applications, environments, and credentials over the mabl MCP server, then
  write everything an AI agent needs to create and run mabl cloud tests into
  the project's agent memory file (CLAUDE.md / AGENTS.md /
  .github/copilot-instructions.md).
  Fire when the user says "set up mabl", "mabl init", "initialize mabl",
  "configure mabl for this project", "save my mabl workspace / application /
  environment / credentials", "add mabl to my CLAUDE.md", or "/mabl-init".
  Run this once per project, before authoring or running tests. For creating a
  single test use mabl-test-authoring; for a whole suite use
  mabl-test-coverage-design.
allowed-tools: Bash, Read, Write, Edit, mcp__mabl__get_current_user, mcp__mabl__list_mabl_workspaces, mcp__mabl__list_mabl_applications, mcp__mabl__list_mabl_environments, mcp__mabl__list_mabl_credentials, mcp__mabl__list_mabl_test_run_summaries
---

# mabl init

Prime a project so any future agent session can create and run mabl tests with
no re-explaining. This skill reads your mabl account through the hosted `mabl`
MCP server, asks you the handful of choices only you can make, and writes a
`## mabl testing` section into your project's agent memory file.

## Prerequisites

This skill uses the hosted **`mabl` MCP server** (bundled with this plugin) —
not the mabl CLI. Start by calling `get_current_user` to grab
`defaultWorkspaceId` (the fallback workspace when the user doesn't pick one).

## Workflow

Do these in order. Steps 1–5 gather; step 6 writes.

**Write only what the user chose.** Everything you discover is shown to help
them decide — but the memory file records only the workspace, application(s),
environment(s), and credentials they explicitly selected or confirmed here.
Don't add the ones they didn't pick, and don't editorialize about them (no
"these are the other applications" asides). If you're unsure whether something
belongs, ask — don't pad the file to look complete.

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

One call (default limit 100) is enough for setup — don't chase pagination. A
`nextCursor` can come back even when everything already fit on the first page,
so only fetch another page if the workspace genuinely has more than 100 of
something.

If no applications or environments come back, this workspace isn't set up for
testing yet. Don't write an empty table — tell the user to add an application
and a deployment in mabl first (or that tests can still target an ad-hoc URL via
`urlOverride`), and check they picked the workspace they meant in step 1.

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

**Don't download and dump the whole credential list.** Lead with the
credentials actually used for the app + environment the user chose, and suggest
only those.

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

If a combo has no runs (or no credential on any run) and the user still wants an
authenticated test, ask whether they'd like to pick from the workspace's
credentials — and only then show the `list_mabl_credentials` list. If a test
needs no login, store no credential for it.

Per stored credential: **name, ID, and type** plus the note — never a username
or password (the MCP server never returns those). A credential's *name* can
embed a test-account username, and this file is committed and shared with your
team, so it's fine for IDs and names but never a place for real secrets.

### 5. Pick the memory file for this client

Determine which agent client you are running in (you know your own harness; if
unsure, check env vars like `CLAUDECODE` or `CURSOR_*`, and look for an existing
memory file). Map it to the right file at the project root:

| Client | File |
|--------|------|
| Claude Code | `./CLAUDE.md` |
| Cursor | `./AGENTS.md` |
| GitHub Copilot (VS Code) | `./.github/copilot-instructions.md` |
| OpenAI Codex | `./AGENTS.md` |
| Anything else | `./AGENTS.md` (the cross-agent default) |

Tell the user the resolved path and confirm it before writing.

### 6. Write (or merge) the memory section

- **File exists** → `Read` it first. If it already has a `## mabl testing`
  section, replace just that section. Otherwise append the section. **Never**
  touch unrelated content.
- **File doesn't exist** → create it with the section.

Fill in the template below from what you gathered, honoring the "write only what
the user chose" rule above — no extra applications, environments, or credentials.
For "Choosing an application & environment", keep only the one block that matches
the strategy from step 3, and drop the other two and the `<!-- … -->` picker
markers (guides for you, not content for the file).

### 7. Confirm and suggest a next step

Summarize what you saved (workspace, number of apps and credentials, file path)
and suggest a smoke check, e.g.:

> Try: *"create a mabl test for &lt;a page in your app&gt;"* — I'll use the
> workspace and app you just configured.

---

## Memory section template

Write this as a `## mabl testing` section. Replace every `<…>` and drop rows /
blocks that don't apply. Reference mabl tools by their plain names (the agent
maps them to its own MCP tool names).

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
```
