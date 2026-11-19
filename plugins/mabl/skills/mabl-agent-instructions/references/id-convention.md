# ID convention

Every instruction gets a stable ID that ties the rule in mabl back to its
history:

```
AI-<CAP>-<SCOPE>-<TOPIC>-<NN>
```

- **CAP:** `AUTH` (authoring), `ANLZ` (results analysis), or `BOTH` (rare;
  prefer two instructions).
- **SCOPE:** `WS` for workspace-wide; otherwise an application code, optionally
  with an environment code: `CHKOUT`, `CHKOUT.STG`. Codes are defined in the
  Scope Key and map one to one to exact mabl application and environment names
  and IDs.
- **TOPIC:** one word from the Topic Vocabulary. Add a new topic only when none
  fits, and register it.
- **NN:** two-digit sequence within that CAP-SCOPE-TOPIC.

Examples: `AI-AUTH-WS-NAMING-01`, `AI-AUTH-CHKOUT.STG-DATA-01`,
`AI-ANLZ-WS-FLAKY-01`.

## The ID line

The first line of every instruction's text, and the instruction's `name` in
mabl, is:

```
[<ID> v<N>] <Short title>
```

The line goes into the text so the rule stays traceable wherever it is read,
and it counts toward the 2,000-character limit.

## Versions and retirement

- A text change keeps the ID and bumps the version: `v1`, `v2`, and so on.
- A capability or scope change retires the old ID and issues a new one.
- Retire by switching the rule off and renaming it to start with `[RETIRED] `.
  mabl has no delete. Never reuse a retired ID; read the retired names when
  picking the next `NN`.

## Scope Key

A table of code to the exact mabl name and ID, built from
`list_mabl_applications` and `list_mabl_environments`:

| Code | Kind | mabl name | mabl ID |
|---|---|---|---|
| `CHKOUT` | Application | Checkout | `<application id>` |
| `STG` | Environment | Staging | `<environment id>` |

## Topic Vocabulary

Starting set:

| Topic | Covers |
|---|---|
| `NAMING` | Names for tests, flows and variables |
| `FLOWS` | When to create or reuse a reusable flow |
| `NAV` | How to reach pages and areas |
| `LOGIN` | Signing in, roles, sessions |
| `DATA` | Test data: what to create, reuse, or never touch |
| `WAIT` | Waits for slow pages and async work |
| `ASSERT` | What to assert and how strictly |
| `MODAL` | Modals, banners and other interruptions |
| `LOCATOR` | Preferred attributes and elements to target |
| `ENV` | Differences between environments |
| `TRIAGE` | How to prioritize and frame failures |
| `FLAKY` | Known-flaky areas and their usual causes |
| `REPORT` | How analysis should be worded or structured |
