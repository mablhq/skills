# When the mabl server can't be reached

You got here because `get_current_user` isn't in your tool list, or the call
failed. Either way you have already stopped: write nothing. Work out which case
this is, and tell the user only what fits it.

## No mabl tools

`get_current_user` isn't in your tool list. You usually can't see the host's MCP
server list yourself, so you can't tell which of these it is — give the user
both, and let them check their list:

- **No `mabl` server listed** (common when this skill was installed on its own,
  without the plugin): add `https://mcp.mabl.com/mcp`, type http, the way their
  agent host configures MCP servers.
- **`mabl` listed but needing sign-in**: authenticate it from that list. Sign-in
  is a browser OAuth flow, so it takes an interactive session; a headless run
  can't complete it.

Always tell the user mabl needs an account, and include the free-trial link:
https://www.mabl.com/trial-registration. Once the server is connected, they
can run this skill again.

## The call failed

- **Authentication error** (401, or the client reports the `mabl` server as
  unauthenticated or needing sign-in): give the sign-in and account advice above.
- **Anything else** (a timeout, a 5xx, a network error): this is not an account
  problem, so don't send the user to sign up or re-authenticate. Report the error
  as it came back, say setup didn't start, and suggest trying again shortly.
