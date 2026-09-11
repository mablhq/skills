# Setup: the checklist, and how to satisfy each row

**Two ways you got here, and they want different things.**

**The user asked you to set this up, or to check it.** Walk the whole checklist below, top to
bottom, skipping only the rows their goal doesn't need. Report every row you checked with its
status — including the ones already satisfied, so they can see what's done. End with the single
thing blocking them, if anything is.

**Something failed mid-workflow** — a tool is missing, a `mabl` command isn't found, a debug
session can't reach the local app. Use the symptom table, fix that row, and go straight back to
`SKILL.md`. Don't walk the rest.

What neither case justifies is opening this file to confirm a working setup works. There's no way
to tell a first run from a hundredth, so absent a request or a failure, start the workflow and let
it tell you.

Keep `SKILL.md` and `references/` together: the body points into these files for procedure that
only matters inside one phase, and flattening or splitting them breaks the routing.

| Symptom | Row |
|---|---|
| The skill fired but `analyze_test_impact` isn't in the tool list | 1, then 2 |
| The tool is there; calling it says not enabled | 2 |
| `mabl: command not found`, or an unknown-command error | 3 |
| "Login has expired" on a CLI command while MCP tools still work | 3 |
| Debug session fails with `ERR_CERT_AUTHORITY_INVALID` | 6 |
| Debug session starts but the agent can't see the page | 5 |
| Sign-in steps pass, then the next step finds nothing | 7 |

---

## The checklist

Rows 1–2 are everything you need to answer *"which tests does this change impact."* Rows 3–7 only
matter once you want to run one. **Don't verify rows you don't need** — if the user only wants the
analysis, the CLI is irrelevant.

| | Must be true | How to check |
|---|---|---|
| 1 | The `mabl` MCP server is reachable | `get_current_user` responds — it's ungated, so it answers whenever the server is up |
| 2 | Test impact analysis is enabled for both workspaces it checks: the tool is *listed* based on your default workspace, and a *call* is checked against the workspace that owns the application | The tool is in the list **and** a call against your real `applicationId` succeeds |
| 3 | mabl CLI at the floor `SKILL.md`'s **Prerequisites** block pins, authenticated | `mabl --version`, `mabl auth info` |
| 4 | The `mabl-debug` skill is installed | `/mabl-debug` resolves |
| 5 | `chrome-for-mabl` points at the debug port | It's in the MCP server list, on `9222` |
| 6 | Local dev server on HTTPS, cert trusted by the OS | `curl` succeeds **without** `-k` |
| 7 | The local origin is registered with the identity provider | A preflight to the IdP accepts that exact scheme + host + port |

---

## 1 · Is the server reachable?

**This row is only about reachability.** Whether `analyze_test_impact` is in your tool list is
row 2's question — it's feature-gated, so its absence says nothing about the connection.

Call **`get_current_user`**. It carries no feature gate, so it answers whenever the server is
reachable.

- **No response, or the client reports the server as unauthenticated** — it never connected. Check
  `/mcp` in Claude Code or `claude mcp list` and look for *needs authentication*. The fix is OAuth
  in an interactive session; a headless one cannot complete it.
- **It answers** — the server is fine. Go to row 2.

Two fields not to read anything into: under API-key auth, `userId` and `email` come back empty,
because a key isn't a person; and `defaultWorkspaceId` is a raw preference that can be empty on a
healthy account, since the server falls back to your first accessible workspace when it is unset.
Neither is evidence of a problem (row 2 covers why the default matters at all).

The server is `https://mcp.mabl.com/mcp`, type http. The plugin ships the entry; otherwise add it
the way your agent host configures MCP servers. Authentication is browser OAuth on the first call.
To pin a session to one workspace instead, send an `x-api-key` header carrying a workspace API
key — and **create a fresh key.** The permission scope
this tool needs was added when the beta was enabled, so an older key passes the connection check
and then fails partway through a real call.

## 2 · Is test impact analysis enabled — and *where*?

Two separate checks run against two possibly-different workspaces. Most confusion here comes from
treating them as one.

| | Gate | What it checks | Workspace it reads |
|---|---|---|---|
| **Seeing the tool** | `tools/list` filter | test impact analysis enabled for the account | Your **default** workspace |
| **Running a call** | the handler | account access **and** GenAI features | The workspace owning the `applicationId` you passed |

So the tool can be visible and every call refused, or invisible while the workspace you actually
care about is fully enabled. Both are normal, and neither is a bug.

**Access can be denied two ways**, which matters because they need different fixes: the account
may not have test impact analysis enabled, **or the workspace may exclude the feature**. Exclusion wins over
everything and is set per workspace, not per account. A workspace with GenAI features disabled
is the classic case — the tool stays visible, because that filter only tests account
access, and every call is refused. Asking support for account access will not fix that;
re-enabling GenAI for the workspace will.

### If the tool is missing from the list

**Check staleness first.** Your tool list is fixed when the client connects, and flags are
cached about 60 seconds. A flag switched on a minute ago won't show up until you **wait, then
reconnect** — reconnecting too early just re-reads the old list. Do this before concluding
anything. (**→ `SKILL.md`'s preflight section** for the full behavior.)

If it's still missing after a clean reconnect, the filter found test impact analysis unavailable
for your **default** workspace. Note what that means: the default may be one you never chose, since
an unset preference falls back to your first accessible workspace. So "my target workspace is
enabled" and "the tool is missing" are entirely compatible.

**What you cannot determine from here:** whether the flag lookup itself failed. If it does, the
server drops every gated tool rather than erroring — and you have no reliable way to tell that from
a tool list, because nothing marks which tools are gated. Don't guess at it. Report what you
observed and let support look.

**A reconnect and one tool-list read are the whole diagnosis — stop there.** Plugin registries,
marketplace manifests, and MCP log files cannot tell these cases apart, and reading them turns a
ten-second answer into a five-minute excavation. If the tool list doesn't settle it, say so and
ask, rather than digging further.

### If the tool is present but the call is refused

The message names the workspace and the application:

> *Test impact analysis is not enabled for workspace `<id>`, which owns application `<id>` —
> retrying with another application in the same workspace will fail the same way.*

Take that last clause literally. And note the default workspace is **irrelevant** here — the
handler reads only the application's workspace.

**Rule out a server error before calling it an access problem.** A 5xx can arrive late, so a failure
after a long wait isn't automatically an access problem. Retry once. A genuine not-enabled
response returns the message above, not a server error.

**You cannot tell which gate failed.** The handler requires both and returns one combined
message. Nothing distinguishes "GenAI features are off" from "both are off." Don't guess.

### What to hand the user

Only mabl can change these. Give them the message verbatim, the workspace id and application id
from it, and whether the tool was visible — that last one tells support which of the two gates
failed. Ask them to check **both** gates **and** the workspace's feature settings, rather than
naming one you can't identify.

Meanwhile `search_mabl_tests` is the fallback, and everything downstream in this skill works on a
set found that way.

## 3 · The mabl CLI

The Prerequisites block in `SKILL.md` installs or upgrades the CLI. What it can't check is
authentication:

```bash
mabl auth login   # browser OAuth — the user completes this
mabl auth info    # confirm it took
```

**The version floor is real.** Screening uses `mabl tests get-runs`, added at the version the
Prerequisites block pins. On an older CLI it fails as an unknown command, which reads like a
broken recipe rather than a stale install — so when a `mabl tests` subcommand is "unknown",
re-run the Prerequisites block before debugging the recipe.

**CLI auth expires independently of MCP auth.** The MCP tools keep working while `mabl tests run`
fails with "Login has expired." When runs fail but analysis works, check `mabl auth info` first.

## 4 · The `mabl-debug` skill

**Requires `mabl-debug`.** Without it, the CLI's own `mabl agent debug session --help` covers the
same commands.

Only needed to step through a failing test.

## 5 · `chrome-for-mabl`

An MCP entry named `chrome-for-mabl` that runs `chrome-devtools-mcp` against
`http://127.0.0.1:9222`, the debug port. The plugin ships it; otherwise add it the way your agent
host configures MCP servers.

**The port must match.** If you ever pass a non-default `--port` to `session start`, this entry
silently fails to attach. Keep `9222` unless you have a reason.

**This entry is inert without the CLI (row 3)** — it attaches to a session only the CLI can
launch. An installer that wires it can leave setup looking complete when it isn't.

## 6 · Local dev server and certificate trust

Only for running a test against local code.

**Confirm the port.** Many dev servers fall through to the next free port when the default is busy,
so a stale server can keep answering on the expected port while serving a build that predates the
change:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep ':<port-range>'   # macOS/BSD; `ss -ltnp` on Linux
```

**The certificate must be trusted by the OS.** A debug session has no flag to bypass a
certificate error — it simply can't connect. However the dev server generates its cert:

- **macOS:** `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain <cert>`
- **Linux:** copy to `/usr/local/share/ca-certificates/` + `sudo update-ca-certificates`, or
  `trust anchor`. Chrome reads its own NSS store, so you may also need
  `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n <name> -i <cert>`
- **Windows:** import into *Trusted Root Certification Authorities*

These take `sudo` — propose the command, don't run it unattended. Verify by succeeding **without**
`-k`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "https://<host>:<port>/"
```

## 7 · Registered sign-in origin

**If any test signs in, the local origin must be allowlisted with the identity provider.**
Sign-in posts cross-origin, and providers answer only for registered origins.

The symptom is deceptive, which is the reason this row exists: email, password, and *Log in* all
report `passed` — those steps assert that the UI interaction worked, never that a session came
back — and the first element *after* login is never found. It reads as a broken selector.

An origin is scheme + host + port, so a dev server that fell through to the next free port breaks
sign-in while still serving the app perfectly well.

Registering the origin is the user's job — it's their IdP. **→ `references/local-debugging.md`**
for the registered-origin convention and how to check one before spending a run on it.

---

Once the failing row is satisfied, go back to `SKILL.md` and pick up where you stopped.
