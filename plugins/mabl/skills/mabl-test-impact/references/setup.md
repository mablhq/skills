# Setup: the checklist, and how to satisfy each row

**Two ways you got here, and they want different things.**

**The user asked you to set this up, or to check it.** Walk the whole checklist below, skipping only
the rows their goal doesn't need. Report every row you checked with its status — including the ones
already satisfied, so they can see what's done. End with the single thing blocking them, if anything
is.

**Something failed mid-workflow** — a tool is missing, a `mabl` command isn't found. Use the symptom
table, fix that row, and go straight back to `SKILL.md`. Don't walk the rest.

What neither case justifies is opening this file to confirm a working setup works. There is no way to
tell a first run from a hundredth, so absent a request or a failure, start the workflow and let it
tell you.

| Symptom | Row |
|---|---|
| The skill fired but `analyze_test_impact` isn't in the tool list | 2, then 3 |
| The tool is there; calling it says not enabled | 3 |
| `mabl: command not found`, or an unknown-command error | 4 |
| "Login has expired" on a CLI command while MCP tools still work | 4 |
| A local run or debug session can't reach the app: certificate, port, or sign-in origin | `references/screening.md`, **Local target gates** |

Rows 2 and 3 are everything you need to answer *"which tests does this change impact."* Row 4 only
matters once you want to run one, so **don't verify rows you don't need**.

| | Must be true | How to check |
|---|---|---|
| 2 | The `mabl` MCP server is reachable | `get_current_user` responds — it's ungated, so it answers whenever the server is up |
| 3 | Enabled where it's needed — two gates, two workspaces | The tool is listed (default workspace) **and** a call against your real `applicationId` succeeds (that application's workspace) |
| 4 | mabl CLI at the floor `SKILL.md`'s **Prerequisites** block pins, authenticated | `mabl --version`, `mabl auth info` |

## 2 · Is the server reachable?

**This row is only about reachability.** Whether `analyze_test_impact` is in your tool list is row 3's
question — it's feature-gated, so its absence says nothing about the connection.

Call **`get_current_user`**. It carries no feature gate, so it answers whenever the server is
reachable. No response, or a client reporting the server as unauthenticated, means it never connected:
check your host's MCP server list for *needs authentication*, and note that the fix is OAuth in an
interactive session, which a headless one cannot complete. If it answers, the server is fine — go to
row 3.

Two things not to read into the response. **Under API-key auth, `userId` and `email` come back empty
by design** — that's a correct response, not an identity problem. And **`defaultWorkspaceId` here is
the raw user preference, which can be empty on a perfectly healthy account**: the server does not use
this value directly for gating, falling back to your first accessible workspace when the preference is
unset, so an empty value is not evidence of anything and "set a default workspace" is not a fix you
can conclude from it.

The server is `https://mcp.mabl.com/mcp`, type http. The plugin ships the entry; otherwise add it the
way your agent host configures MCP servers, and authenticate with browser OAuth on the first call. To
pin a session to one workspace instead, send an `x-api-key` header carrying a workspace API key.
Reference that key through your host's environment-variable expansion (`${MABL_API_KEY}` shape), never
as a literal in `.mcp.json` or any other tracked file. **Create a fresh key:** the permission scope
this tool needs was added when the beta was enabled, so an older key passes the connection check and
then fails partway through a real call.

## 3 · Is test impact analysis enabled — and *where*?

Two separate checks run against two possibly-different workspaces. Most confusion here comes from
treating them as one.

| | Gate | What it checks | Workspace it reads |
|---|---|---|---|
| **Seeing the tool** | `tools/list` filter | test impact analysis enabled for the account | Your **default** workspace |
| **Running a call** | the handler | account access **and** GenAI features | The workspace owning the `applicationId` you passed |

So the tool can be visible and every call refused, or invisible while the workspace you actually care
about is fully enabled. Both are normal, and neither is a bug.

**Access can be denied two ways**, which matters because they need different fixes: the account may
not have test impact analysis enabled, **or the workspace may exclude the feature**. Exclusion wins
over everything and is set per workspace, not per account. A workspace with GenAI features disabled is
the classic case — the tool stays visible, because that filter only tests account access, and every
call is refused. Asking support for account access will not fix that; re-enabling GenAI for the
workspace will.

### If the tool is missing from the list

**Check staleness first.** Your tool list is fixed when the client connects, and flags are cached
about 60 seconds; the server declares `listChanged: false`, so it never tells an already-connected
client that the list changed. A flag switched on a minute ago won't show up until you **wait, then
reconnect** — reconnecting too early just re-reads the old list and leaves you tool-less for the rest
of the session.

If it's still missing after a clean reconnect, the filter found test impact analysis unavailable for
your **default** workspace. Note what that means: the default may be one you never chose, since an
unset preference falls back to your first accessible workspace, and an unusable default — none set, or
one you can't reach — reads as *not entitled* rather than as an error. So "my target workspace is
enabled" and "the tool is missing" are entirely compatible.

**What you cannot determine from here:** whether the flag lookup itself failed. If it does, the server
drops every gated tool rather than erroring, and nothing in a tool list marks which tools are gated.
**A reconnect and one tool-list read are the whole diagnosis — stop there.** Plugin registries,
marketplace manifests, and MCP log files cannot tell these cases apart, and reading them turns a
ten-second answer into a five-minute excavation.

### If the tool is present but the call is refused

The message names the workspace and the application:

> *Test impact analysis is not enabled for workspace `<id>`, which owns application `<id>` — retrying
> with another application in the same workspace will fail the same way.*

Take that last clause literally, and note the default workspace is **irrelevant** here — the handler
reads only the application's workspace. **Rule out a server error before calling it an access
problem:** a 5xx can arrive late, so a failure after a long wait isn't automatically an access problem.
Retry once; a genuine not-enabled response returns the message above, not a server error. And **you
cannot tell which gate failed** — the handler requires both and returns one combined message, so don't
guess.

### What to hand the user

Only mabl can change these. Give them the message verbatim, the workspace id and application id from
it, and whether the tool was visible — that last one tells support which of the two gates failed. Ask
them to check **both** gates **and** the workspace's feature settings, rather than naming one you can't
identify. Meanwhile `search_mabl_tests` is the fallback, and everything downstream in this skill works
on a set found that way, reported as a fallback (`SKILL.md`, **Preflight**).

## 4 · The mabl CLI

The Prerequisites block in `SKILL.md` installs or upgrades the CLI. What it can't check is
authentication:

```bash
mabl auth login   # browser OAuth — the user completes this
mabl auth info    # confirm it took
```

**The version floor is real,** and it belongs to one path: the CLI screening fallback uses `mabl tests
get-runs`, added at the version the Prerequisites block pins. On an older CLI it fails as an unknown
command, which reads like a broken recipe rather than a stale install — so when a `mabl tests`
subcommand is "unknown", re-run the Prerequisites block before debugging the recipe.

**CLI auth expires independently of MCP auth.** The MCP tools keep working while `mabl tests run`
fails with "Login has expired." When runs fail but analysis works, check `mabl auth info` first.

---

Once the failing row is satisfied, go back to `SKILL.md` and pick up where you stopped.
