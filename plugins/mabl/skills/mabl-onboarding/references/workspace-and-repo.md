# The workspace picture, and reading the repo

Gate C1 (caller, role, counted emptiness, the fresh-workspace baseline and the three-way new-workspace route) and gate C2 (the enumerating floor, the reading you do yourself, and the draft that closes the gate).

## 1. Gate C1 — the caller, their role, and which workspace

Resolve the role deterministically rather than asking:

```bash
mabl workspaces list --output json --limit 100
mabl users list -w "$WS" --output json --limit 200   # roles[].role ∈ {owner, editor, viewer}
```

Match the caller's email from `mabl auth info` against `users list` to get their
workspace role.

> **`mabl users list` returns *other people's* real names and email addresses.**
> Use those in-session only, to route the human-only items. **Never write any
> other user's name or address to any file** — not the committed file in §7, not
> the file `mabl-init` writes, not the report.
>
> **Scoped deliberately to *other* users, because the operator's own identity is a
> required output.** §10's card names the caller's email and resolved role, and the
> report is a file. That is not a leak and not an exception grudgingly made: it is
> the one line that tells the lead who ran this and with what authority, it is the
> operator's own identity, and they are the person the report is written to. So:
> **the caller's own email and role — yes, in the report header. Every other row of
> `users list` — nowhere, in any file.** The rule and the template do not conflict;
> read them as one rule with a named subject.

Then measure emptiness **from counted entities**, never from the workspace
record's `onboarded` boolean. That flag tracks the onboarding *flow*, not
content: a freshly created workspace reads `onboarded: false`, but so does one
someone has already filled with tests by hand. Count instead:

```bash
mabl applications list  -w "$WS" --output json --limit 100
mabl environments list  -w "$WS" --output json --limit 100
mabl credentials list   -w "$WS" --output json --limit 100 2>/dev/null \
  | sed '/^Cloud credentials are not available for local runs\.$/d' | jq '.'
```

That `sed` is required, not cosmetic: `credentials list` prints a human line to
**stdout after the closing bracket**, so piping it straight to `jq` fails at
exactly the moment you are recording credentials.

Those three counts are the emptiness signal, and they are deliberately the only
ones. **A brand-new workspace is not literally empty** — mabl seeds it with a
few demo mobile build files (`Wikipedia.apk`, `Wikipedia.app.zip`, `Demo.apk`,
served from a `mobile-onboarding-demo` path). They are mabl's, not the team's.
Never count them toward emptiness, never list them back as workspace content,
and never imply you created them. If you ever surface them, say what they are.

**The command that reads them is `mabl mobile-build-files list`** (group alias
`app-files`), and it is workspace-scoped:

```bash
mabl mobile-build-files list -w "$WS" --output json --limit 100   # or: mabl app-files list
```

**Do not reach for `mabl environments build-files list` for this.** That
subcommand takes a **required environment id** positional
(`mabl environments build-files list <id>`), so a workspace-wide call hard-fails
with `Not enough non-option arguments` — verified against
`mabl environments build-files --help`. The `environments build-files` group is
about *associating* a build file with an environment, which is a different job
from listing what the workspace holds.

This read is **optional** — the three counts above are the emptiness signal and
this is not one of them. Run it only if you are going to say something about
mobile, and if you do run it, attribute every row to mabl's seeding.

### The three-way new-workspace route

If the human needs a *new* workspace, route on what they are. **Never claim you
can create one.**

| The caller is | Route |
|---------------|-------|
| an account/company admin | web app → the **workspace dropdown** → **"{Company} Dashboard"** → **Create workspace** |
| not an account admin | ask whoever administers the account, or the CSM |
| has no mabl account at all | sign up at mabl.com, or talk to a CSM |

> **Hedge this path at the point you emit it, every time.** Say, in the report,
> right beside the path: *"nav as of this writing — if the dropdown entry has
> moved, it's the account/company-scoped dashboard you want, not the
> workspace-scoped page of the same name."* Two specific traps here, so do **not**
> reach for a generic "it's under Settings" hedge:
> - **"Usage" exists at two scopes, and the distinction is scope, not the page
>   name.** A **workspace-scoped** Usage page shows that one workspace's credits
>   and has no Create workspace button. The **account/company-scoped** Usage page
>   *is* the dashboard where creation lives. The two are separate URLs, which the
>   operator can read in their own address bar:
>   `/settings/companies/{companyId}/usage` (company-scoped) versus
>   `/settings/accounts/{accountId}/usage/billing`. So **name the scope**; do not
>   tell an admin that Usage is the wrong page. **Every negative claim about a UI
>   path is either checkable by the operator or explicitly marked unverified** —
>   never assert from memory that a button isn't somewhere.
> - **The dropdown entry is company-owner-gated, and that is a different layer
>   from the API's own check.** The menu row is suppressed unless the caller's role
>   *on the company* is owner, and the create endpoint behind it independently
>   requires company admin. *(Both verified by mabl against the product source;
>   not customer-checkable — the checkable consequence is the one below.)* The
>   behavioural test the operator **can** run: if the company entry is missing from
>   the workspace dropdown, they are not in the company-owner role. A **CSM is who
>   arranges that role**; it is not granted page-by-page per user. So a missing
>   menu item reads as "ask your CSM to put you in the company-owner role", not
>   "this skill is wrong" — and until then the caller is functionally the second
>   row of the table above.

Two things to say out loud:

- **A workspace `owner` cannot create a workspace.** Creation is an
  account/company-admin authority; the workspace roles `owner` / `editor` /
  `viewer` don't include it at all. The asymmetry is real: an owner can *delete*
  a workspace but not create one. It is billing-adjacent, because a new
  workspace draws a credit allocation from the account.
- **You cannot see account roles.** `mabl users list` returns *workspace* roles
  only. Do not name the account admins from it and pretend you know. If the
  human named people earlier, that is their information, not your finding.
- Some help-centre pages still say "reach out to your customer success manager".
  That predates the account-admin self-serve path. **Both are true depending on
  the caller's role** — give both, don't pick one.

**`mabl workspaces copy` is not a setup shortcut and not yours to run:** it
prompts interactively, needs the caller to own both workspaces, carries over no
applications or environments, and cannot be safely re-run after a failure.
*(All four verified by mabl in the CLI source — an `inquirer` `confirm` prompt
before the copy, an owner-role check on **both** the `--from` and `--to`
workspaces that rejects otherwise, a logged warning reading "In case of failure,
please DO NOT re-run this command, as it would create duplicate items in the
destination", and a logged note whose unsupported-items list names plans,
applications, environments, coverage and run history. **`mabl workspaces copy
--help` shows none of them** — it lists only `--from`, `--to`,
`--include-defaults`, `--included-tests` and `--excluded-tests`, so do not go to
`--help` to check this claim and do not soften it when `--help` comes back
silent. The customer-runnable check is what the operator sees when they run it:
the confirm prompt and those two yellow lines, before anything is copied.)*
Mention it only if the operator asks about cloning an existing workspace, as a
thing they run.

**Gate C1 does not close here.** Its close depends on which of the three MCP
states applies, so the three state-keyed closing scripts live in
`references/mcp-and-handoff.md`, under "Closing gate C1 — the three state-keyed
scripts". Go there before ending the gate.

## 2. Gate C2 — repo pre-discovery: a thin floor, then you read

The workspace is empty, so **the repo is the only evidence this run has.** Two
layers, never mixed: a shell **floor** that only ENUMERATES, then **you** read the
interesting files. The floor classifies nothing; every judgment below is yours.

```bash
REPO=${REPO:-.}
cd "$REPO" || exit 1
say() {   # say <label> <captured output>   — a finding block, or an explicit zero
  if [ -n "$2" ]; then printf '%s:\n' "$1"; printf '%s\n' "$2" | sed 's/^/  /'
  else printf '%s: NOT DETECTED (counted zero)\n' "$1"; fi
}
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT=yes
  printf 'inventory: git-tracked, %s files. Untracked and ignored files are invisible here.\n' \
    "$(git ls-files | wc -l | tr -d ' ')"
else
  GIT=no
  printf 'inventory: NOT A GIT REPO — floor degraded to nothing. Enumerate with Glob\n  yourself, and treat every finding as a candidate, not a confirmation.\n'
fi
g() {   # g <label> <pathspec>...   — quotePath=false so listed paths are Read-able
  L=$1; shift
  if [ "$GIT" = yes ]; then say "$L" "$(git -c core.quotePath=false ls-files -- "$@" 2>/dev/null)"
  else printf '%s: NOT ENUMERATED (no git inventory — Glob for it yourself)\n' "$L"; fi
}
g "package manifests"     'package.json' '*/package.json' 'pubspec.yaml' 'manage.py' 'Gemfile' 'pom.xml' '*build.gradle*' 'requirements.txt' 'pyproject.toml'
g "monorepo/workspace"    'pnpm-workspace.yaml' 'turbo.json' 'nx.json' 'lerna.json' 'rush.json' '*settings.gradle*'
g "index.html"            'index.html' '*/index.html'
g "browser-suite configs" '*playwright*.config.*' '*cypress.config.*' '*cypress.json' '*wdio*.conf*' '*nightwatch.conf*' '*nightwatch.json' '*.testcaferc.json' '*codecept.conf.*' '*protractor.conf.js' '*karma.conf.js' '*.puppeteerrc.*' '*testng.xml'
g "CI config"             '.github/workflows/*' '.github/actions/*' 'Jenkinsfile*' '.gitlab-ci.yml' 'azure-pipelines*' '.circleci/config.yml' 'bitbucket-pipelines.yml' '.buildkite/*' 'cloudbuild.y*ml' '.travis.yml'
g "shell scripts"         '*.sh'
g "framework / container config" '*vite.config.*' '*next.config.*' '*nuxt.config.*' '*svelte.config.*' '*astro.config.*' '*webpack.config.*' '*angular.json' '*docker-compose*.y*ml' 'compose.y*ml'
g "schema / IDL"          '*.graphql' '*.graphqls' '*.gql' '*.proto'
g "env files"             '.env' '.env.*' '*/.env' '*/.env.*'
if [ "$GIT" = yes ]; then           # KEY NAMES ONLY — the sed keeps \2, drops the value
  ENVF=$(git -c core.quotePath=false ls-files -- '.env' '.env.*' '*/.env' '*/.env.*' 2>/dev/null)
  printf '%s\n' "$ENVF" | while IFS= read -r f; do
    [ -n "$f" ] || continue
    if [ -r "$f" ]; then
      K=$(sed -n 's/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}\([A-Za-z_][A-Za-z0-9_]*\)=.*/\2/p' "$f")
      say "  keys in $f" "$(printf '%s' "$K" | tr '\n' ' ')"
    else
      printf '  keys in %s: NOT READABLE (path or file unreadable — Read it yourself)\n' "$f"
    fi
  done
fi
```

**Don't "improve" the floor.** Every check — the env key-name pass included — goes
through `say()` or its own else-branch, so each emits a finding block, a counted
zero, or a named non-answer, never an empty tail or silence. It branches on
captured emptiness, not exit status; quotes every expansion; uses no temp dir;
never calls `grep`; prints key names only; keeps non-ASCII paths Read-able.

### Then read the interesting files yourself

- **Candidate apps** — merge each `package.json`'s dep maps. Candidate = a
  routing-owning framework (`next`, `nuxt`, `@sveltejs/kit`, `astro`, `gatsby`,
  `@remix-run/react`, `@angular/core`, `react-native`, `electron` — no
  `index.html`) *or* a browser framework **plus** that package's own `index.html`.
  react + vite + storybook is a component library. **Show what you demoted and
  why.** Zero apps = *"which frontend consumes this?"* Read only the `packages:`
  key of `pnpm-workspace.yaml`.
- **Suites, two tiers.** Config file = **CONFIRMED**; manifest dep with no config =
  **WEAK**, asked as a question; lockfile-only = nothing. Never a migration topic.
  Puppeteer and bare `selenium-webdriver` have no config convention; an `e2e/`
  directory is a question, not a detection.
- **CI — COMMENTED-OUT CODE IS NOT A FINDING**, and the shell strips no comments, so
  **you** check. Read triggers and deploy/preview job keys, then **follow the call
  one level down**: the real mabl integration usually lives in the script a live line
  invokes (`npx @mablhq/mabl-cli deployments create`), not the YAML. A script named
  only in a comment isn't CI-invoked; one absent from the inventory you cannot read.
  Say that Jenkinsfile and CircleCI readings are less exercised.
- **API specs: content-sniff** `^\s*"?(openapi|swagger)"?\s*[:=]`; a `swagger.*`
  glob finds a fixture and misses the real spec.
- **Env values: you redact, because no shell guard can.** Scheme + host + port only,
  dropping credential-shaped path segments (`xox`/`ghp_`/`sk-`/`eyJ`, long,
  high-entropy). Never print a non-URL value, **say when you withheld one**, and say
  which variants are **not** mabl environments.
- **Auth and test data** — mechanism from merged deps (`next-auth`, `@okta/*`,
  `@auth0/*`, `@azure/msal-*`, `oidc-client-ts`, `passport*`, `keycloak-js`,
  `@clerk/*`, `firebase`); login filenames matched mid-basename (`admin_login.tsx`
  yes, `LoginBanner.tsx` no); the floor's key names; fixture/`__mocks__`/seed dirs;
  a real `msw` import; factories **only inside test dirs**.
- Anything a file cannot settle degrades to **"not detected — ask the human"**.

### Close the gate with a filled-in draft, not raw enumerator output

Floor output is evidence; a draft is a claim, its source, your confidence, and a
way to say no — §6's discipline, applied to reads:

```
GATE C2 — what I read from your repo. Correct anything wrong; I have written
nothing and nothing below is a decision.
                                                                        confidence
project type  pnpm monorepo, 4 packages  (pnpm-workspace.yaml)                read
apps          apps/web    Next.js, routing-owning, no index.html              read
              apps/admin  react + vite + index.html                           read
              packages/ui-kit NOT an app: react+vite+storybook, no
              index.html, no router — component library                      guess
              services/api — backend, no browser framework                    read
suites        CONFIRMED e2e/playwright.config.ts                              read
              WEAK  webdriverio in apps/admin devDependencies, no wdio
                    config — leftover, or a suite I'm missing?             question
CI            Actions (deploy.yml, nightly.yml) + Jenkinsfile.legacy
              stage('Deploy to prod'), Groovy, read less confidently          read
              job `web-ui-deploy-artifacts` = the mabl hook-in point;
              `preview-env-create` exports a per-PR PREVIEW_URL -> a mabl
              `--preview` environment with no URL rows                        read
mabl already? scripts/deploy-web.sh runs `npx @mablhq/mabl-cli deployments
              create` — you ALREADY use mabl in CI; I won't propose it        read
              (COMMENTED mabl action in nightly.yml, COMMENTED
               deploy-legacy-prod job in deploy.yml: neither counted)
env URLs      .env.staging    APP_URL=https://staging.acme…example.com        read
              .env.production APP_URL=https://acme-portal.example.com         read
              .env.test is a localhost unit-test harness — NOT a mabl env     guess
              WEBHOOK_URL had a token in its path: host kept, path
              dropped, value withheld from this draft
not detected  test data beyond e2e/fixtures — how is it managed?          question
              end-to-end/ directory exists — what's in it?                question

           correct / redirect / add / approve?
```

Every row carries its source and a marker (`read` / `guess` / `question`); an
unmarked row is unfinished, and `guess`/`question` rows go where the eye lands.
Counted zeros appear **as rows**, phrased as questions. The four-way affordance is
explicit — "Does that look right?" is not an affordance. Log every correction to
the ledger, with its downstream effect, the moment they say it.


---

## Related repos elsewhere on the machine (§2)

The C2 floor scans the current repo. That is often the wrong repo, or only one of
several: the repository defining the application under test is frequently a
sibling checkout, a directory one level up, or another clone in a multi-repo
workspace. Search for it by product name and by the app's hostname stem:

```bash
# PROBE. Read-only. Sibling and parent checkouts whose path or remote matches.
NEEDLE='<product-or-host-stem>'      # e.g. the stem of shopbricks.example.com
for d in . .. ../..; do
  find "$d" -maxdepth 3 -name .git -type d 2>/dev/null | while read -r g; do
    r=$(git -C "${g%/.git}" remote get-url origin 2>/dev/null)
    case "${g}${r}" in *"$NEEDLE"*) printf '%s\t%s\n' "${g%/.git}" "${r:-no-remote}";; esac
  done
done
```

**Why this matters more than the extra file coverage: a related repo lists the
environments.** Read its CI configuration, compose files and `.env*` filenames for
the deployment targets the team actually has — dev, staging, preview, production —
and carry **all** of them into gate C3, rather than the single public URL the
operator happened to mention in conversation. A run that creates one production
environment when the repo describes four has under-built the workspace, and the
gap is invisible in the closing report unless this step ran.

Finding nothing is a normal outcome and not a failure. Say the repo was not
present locally, say what was searched, and continue with what the operator told
you. Do **not** substitute another mabl workspace for the missing repo — that
needs an explicit ask (standing rule, `SKILL.md`), and it imports conventions
nobody in this run chose.
