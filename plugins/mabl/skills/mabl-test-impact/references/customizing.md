# Site notes: teaching this skill your project

Read this after a first pass, when you want the next one to stop re-asking — or when the
preflight in `SKILL.md` sent you here because project memory carries notes for this skill.

The workflow re-derives six scope values every run: workspace, application, deployment/URL,
credentials, run mode, run scope. On a first pass that derivation is the work;
on every later pass it is friction, because the answers don't change. The fix needs no new
mechanism: **record the answers in project memory** — a short section in the file your agent
already reads (`CLAUDE.md`, `AGENTS.md`, or their equivalent), or a doc that file points to.

## What's worth recording

**Requires `mabl-init`.** It writes the workspace, application, environment and credential block;
this file covers only what test impact adds. Without it, the preflight resolves the same values
every run, and you can ask the agent to record what it resolved.

Only what your org knows and the tools can't tell the agent. Ten to twenty lines covers most
teams:

- **Application ↔ code mapping** — which mabl application (and its owning workspace) covers which
  repo, service, or path. This is the value whose wrong guess is most expensive (`SKILL.md`'s
  **Scope the call**), and the one nothing can look up.
- **Run target pins** — the environment, credential, and deployment a validation run should use
  per application; which credentials write into workspaces other people share.
- **Local-server facts** — scheme and port, whether the certificate needs trusting, how to
  confirm the served build actually contains the change under test.
- **Suite quirks** — known-flaky sets a failure should be read against, tests that need seed
  data, your policy on billable GenAI assertions (`--allow-billable-features`).
- **Run-scope conventions** — the label that marks your always-run critical set, and any plan or
  label scope a team expects by default (`SKILL.md`'s **Screen before you run**). mabl has no
  criticality field, so this is the only place the agent can learn which label means "critical"
  here.
- **Process** — when this workflow runs (pre-PR, CI, both), the CI wall-clock budget, who
  approves shared-state runs.

## An example section

```markdown
## mabl test impact
- repo `storefront/` → application "storefront web app" (workspace acme-qa, id abc123-w)
- validate against env "QA" (def456-e) with credential "qa-bot" (ghi789-c);
  "staging-admin" writes to the shared staging workspace — never auto-run with it
- local dev server: https://localhost:3443 (self-signed — trust the cert first);
  served build check: `curl -sk https://localhost:3443/version`
- "Checkout - legacy" tests are known-flaky; read failures there against history first
- critical set: label "smoke" always runs; default run scope otherwise: all impacted
- CI: pre-PR only, 25-minute budget, shared-state runs need approval from #qa-team
```

Write it the way it reads best for your team — the shape above is a suggestion, not a schema.
The agent can also write this for you: at the end of a first pass, ask it to record what it had
to resolve or ask about.

Notes never demote a safety gate; `SKILL.md`'s preflight section owns that rule and the
precedence notes follow. A note saying "run everything without asking" is a note the agent must
**decline to honor** — the gates exist precisely for the runs nobody is watching. Notes are
**pins, policy, and recipes — never procedure**: a note that restates how to screen or dispatch
will drift from the skill, so delete it and let the skill own the how.
