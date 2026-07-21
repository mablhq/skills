---
name: add-mabl-skill
description: >-
  Add a skill to the mablhq/skills repo — intentionally and correctly. Gates the
  candidate first (does it duplicate a shipped skill, an open PR, or an existing
  draft? is it distinct enough to be worth adding?), and only if it clears the bar
  promotes it: places it at plugins/mabl/skills/<slug>/SKILL.md, keeps the
  install-surface manifests in parity, bumps the version, adds the CHANGELOG entry
  and README row, runs the CI validators locally, and prepares a single focused,
  human-written PR. Never auto-promotes and never auto-pushes — it emits a verdict
  and a reviewable plan and stops for a human. Use when someone says "add a skill
  to mablhq/skills", "contribute a skill", "promote this draft skill", "ship this
  skill", or "should this skill go in the repo?".
allowed-tools: Bash
---

# Add a skill to mablhq/skills

A structured way to contribute a skill to this repo — for mablers and outside
contributors alike. It answers two questions in order: **should this skill be
added at all?**, then, only if yes, **how do I add it correctly?** The first is
judgment; the second is a deterministic checklist. Most of the value is the gate:
the common failure isn't a malformed skill, it's one that shouldn't have shipped —
a duplicate of an open PR, a near-copy of a skill already here, or a big branch
that also quietly reverts unrelated files.

> This skill drives `git` / `gh` / `node`, not the mabl CLI, so it carries no
> mabl-CLI prerequisite block (see the note on the repo's prereq-block rule below).

## When to use

- "Add / contribute a skill to mablhq/skills."
- "Promote this draft (`drafts/skills/…`) into a real skill."
- "Should this skill go in the repo, or does it overlap something?"
- After writing a candidate skill, to add it the right way.

To scaffold a *new* skill for your own workflow from scratch, that's a different
task — this skill is about getting a finished candidate into *this* repo cleanly.

## Prerequisites

```bash
# Run from inside a clone of mablhq/skills.
REPO="$(git rev-parse --show-toplevel)"
test -f "$REPO/.claude-plugin/marketplace.json" || { echo "not a mablhq/skills clone"; exit 1; }
gh auth status      # the PR step needs the GitHub CLI, authenticated
node --version      # the validators need Node (CI uses 22)
git -C "$REPO" fetch origin --quiet
git -C "$REPO" switch -c add-skill-<slug> origin/main    # fresh branch off CURRENT main
```

Always cut the branch from **current `origin/main`**. A commit or squash built on a
stale base silently reverts whatever moved on main since — the exact way a branch
ends up dropping a version, deleting the CHANGELOG, or removing a server without
anyone deciding to.

## Step 1 — The intentionality gate (before touching anything)

Enumerate the live landscape *at run time* — never a remembered list:

```bash
gh pr list --repo mablhq/skills --state open --limit 50 \
  --json number,title,headRefName --jq '.[] | "#\(.number) \(.headRefName)  \(.title)"'
git -C "$REPO" ls-tree origin/main --name-only plugins/mabl/skills/   # shipped skills
ls "$REPO"/drafts/skills/ 2>/dev/null                                 # staged candidates
```

Read the frontmatter `description` of each neighbor and judge the candidate:

- **Trigger-surface overlap.** If the candidate's triggers and outcome
  substantially overlap a neighbor (rule of thumb: >50% of what it does is already
  covered), it is **not** distinct — fold it in or decline.
- **Already in flight.** If an open PR already adds this skill (by name or scope),
  the answer is *that PR*, not a second copy.
- **Already shipped.** If a `plugins/mabl/skills/<slug>` already covers it, this is
  an *edit to that skill*, not a new one.
- **Clears the bar.** CLI-first (or a clearly justified MCP dependency), read-only
  or explicitly gated writes, self-contained (one folder), and carries its own
  two-way `## Validation` (a contract check + a discriminating expected-output
  case — pass = the right information surfaced, never a green status).

**Emit a verdict, not an action:** `promote` / `keep-as-draft` /
`merge-into <existing>` / `decline`, each with a one-line reason. Default to *not*
adding unless the candidate clearly clears the gate. If the verdict is anything but
a clean `promote`, stop here and hand it to a human.

## Step 2 — Promote (only a cleared candidate)

- **Placement:** `plugins/mabl/skills/<slug>/SKILL.md`. From a staged draft folder:
  `git -C "$REPO" mv drafts/skills/<slug> plugins/mabl/skills/<slug>`. From a flat
  `DRAFT-skill-<slug>.md`: move its content into `plugins/mabl/skills/<slug>/SKILL.md`.
- **Folder name == frontmatter `name`** (lowercase, hyphenated). A mismatch or a
  `mabl/…` / `mabl:…` prefix silently fails to load in Copilot.
- **Self-contained.** Everything the skill needs lives inside its own folder —
  `gh skill install` copies one folder at a time. No references outside it.
- **Prereq block** per the repo's rule (see the note at the end).

## Step 3 — The consumer-visible-change ritual

Adding a skill is consumer-visible, so all three are required — this is exactly
what a stale-base commit silently *undoes*:

```bash
# 1. Bump version everywhere it appears — DISCOVER the files, don't hardcode them:
git -C "$REPO" grep -l '"version"' -- '*plugin*.json' '*marketplace.json'
#    Today that's the 4 plugin manifests (CI parity-checked) plus the
#    .claude-plugin and .cursor-plugin marketplace files. The Codex marketplace
#    (.agents/plugins/marketplace.json) has no version field. Bump all to the
#    same new version.
# 2. Add a CHANGELOG.md entry at the top — Keep-a-Changelog: "## [<ver>] - <date>"
#    then "### Added" and a one-line, user-facing description.
# 3. Add or refresh the skill's row in README.md.
```

If you touch MCP config, keep `plugins/mabl/mcp.json` byte-identical to
`plugins/mabl/.mcp.json` (Cursor demands that filename; CI enforces the match).

## Step 4 — Run the validators locally (all green before any push)

```bash
cd "$REPO"
pnpm dlx @anthropic-ai/claude-code plugin validate --strict .          # marketplace + Claude manifest
pnpm dlx @anthropic-ai/claude-code plugin validate plugins/mabl/.claude-plugin/plugin.json
node .github/scripts/validate-copilot-manifest.mjs                     # root plugin.json (Copilot) + parity
node scripts/validate-template.mjs                                     # Cursor (official; "no hooks" warning is expected)
node .github/scripts/validate-cursor-parity.mjs                        # mcp.json == .mcp.json + Cursor/Claude parity
node .github/scripts/validate-codex-parity.mjs                         # Codex/Claude parity + marketplace
```

(`claude plugin validate …` also works if the CLI is installed.) CI runs this
identical set on the PR via `.github/workflows/validate-plugin.yml`; every one must
pass locally first.

## Step 5 — One focused PR — prepare it, then stop for go-ahead

Opening a PR is an outward action on a public repo. Prepare everything locally,
then present the plan and the exact commands and **wait for explicit approval** —
don't push or open the PR autonomously.

- **One skill per PR.** Match the existing per-skill PRs; never a multi-skill dump.
- **Short, human PR.** Lead with what changed and why, in plain sentences. No
  `### Testing` / `### Follow-up` scaffolding, no "This PR introduces…", no
  generated-by footer, no emoji section markers.
- **Open, never merge.** A human reviews and merges.

```bash
# Present these; run only on go-ahead:
git -C "$REPO" add -A && git -C "$REPO" commit -m "Add <slug> skill"
git -C "$REPO" push -u origin add-skill-<slug>
gh pr create --repo mablhq/skills --title "Add <slug> skill" --body "<short human paragraph>"
```

## Hard rules

- **Gate before mechanics.** No promotion until Step 1 returns a clean `promote`.
- **Live enumeration.** Overlap discovery and version-file discovery run at
  execution time; never hardcode PR numbers, the shipped set, or the file list.
- **Never revert unrelated files.** Before committing, diff against main —
  `git -C "$REPO" diff --stat origin/main` must show *only* your skill's folder,
  the version bumps, `CHANGELOG.md`, and `README.md`. A version going *down*, a
  deleted CHANGELOG, or a touched shipped skill means a stale base — stop and
  rebuild the branch from current `origin/main`.
- **Recommend, don't act.** Emit a verdict and a reviewable plan; a human approves
  the promotion and the push/PR, and merges.
- **Self-contained skills only**, and **folder name == frontmatter name.**

## Validation

**Contract check.** The validator commands in Step 4 exist and run against a clean
checkout of `mablhq/skills` (Node 22), and `gh pr list --json number,title,headRefName`
returns the shape Step 1 parses. Grounded in this repo's
`.github/workflows/validate-plugin.yml` and `CLAUDE.md`.

**Expected-output check (anchored to external, verifiable facts — not a
self-invented fixture).** Run the Step 1 gate against two candidates whose correct
verdict is fixed by facts outside this skill:

- **A candidate that matches an open PR → must return `decline` / `merge`.** Its
  correctness is checkable with `gh pr list` (the PR exists), so a gate that says
  "add it" has demonstrably failed.
- **A candidate that no shipped skill and no open PR covers → must return
  `promote`.**

Pass = the gate reproduces both known-correct verdicts *because* the answer comes
from the live PR list and shipped set, not from criteria the skill invents for
itself. Recorded run (2026-07-21): `mabl-run-digest` (matched the then-open
`skill-mabl-run-digest` PR) → correctly declined; `mabl-convention-guide` (covered
by nothing) → correctly promoted. Re-run whenever the shipped set or open PRs move.

## Note — the prereq-block rule

This repo's `CLAUDE.md` currently says *every* skill starts with the mabl-CLI
prerequisite block. A skill with no mabl dependency (this one, and the shipped
`quality-metrics-glossary`) omits it, because a "install the mabl CLI" prerequisite
on a skill that never calls mabl is misleading. When you promote a skill, follow
the written rule for a mabl-using skill; for a generic one, omit the block and call
it out for the reviewer rather than resolving the rule silently either way.
