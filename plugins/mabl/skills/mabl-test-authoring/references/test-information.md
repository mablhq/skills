# Test information for `mabl agent authoring initiate`

`--test-information` takes a JSON object with these fields:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Human-readable test name |
| `test_case` | yes | Free-text description of what the test should do. Be detailed: list the steps, what to click, what to verify. The more specific, the better the generated test. |
| `url_override` | one of these | Direct URL to test against. Use for arbitrary URLs not configured in mabl. |
| `deployment_id` | one of these | Deployment ID from mabl. Resolves to the correct URL + app + environment automatically. Preferred when the URL is already configured. |
| `application_id` | no | Application ID. Resolved automatically when using `deployment_id`. Only needed with `url_override` if you want the test scoped to a specific app. |
| `environment_id` | no | Environment ID. Same as above — automatic with `deployment_id`. |
| `credentials_id` | no | Credentials ID for authenticated tests. Omit if the test doesn't require login. |
| `source_test_id` | no | An existing test to copy as the starting point for a new test; the source is never modified. `test_case` then describes only what differs. |

Example:

```json
{
  "name": "Checkout flow - guest user",
  "test_case": "Navigate to the product page, add an item to cart, proceed to checkout as a guest, fill in shipping details, and verify the order confirmation page shows a confirmation number.",
  "url_override": "https://staging.shop.example.com"
}
```

## Finding the ids

With no planner in the loop, nothing picks the application, environment, or
credentials for you. Find them in this order, and stop at the first that
answers:

1. **The project's saved mabl settings.** If the project's agent memory file
   (`CLAUDE.md`, `AGENTS.md`, or the equivalent) has a mabl section, use the
   workspace, application, environment, and credential ids saved there.
2. **Look them up.** Run `mabl <command> --help` first to confirm the command
   exists in this CLI, then:

   ```bash
   mabl applications list            # application ids
   mabl environments list            # environment ids
   mabl environments describe <id>   # an environment's URLs, for url_override
   mabl credentials list             # credential names and ids
   ```

   With the mabl MCP server connected, `list_mabl_applications` (each
   application carries its environments and their deployment URLs),
   `list_mabl_environments`, and `list_mabl_credentials` answer the same.
3. **Ask the user** whenever more than one candidate fits — two credentials
   for the app, two environments with a URL. Show the names and ids and let
   them pick.

`initiate` needs `url_override` or `deployment_id` to create a test, so an
application and environment alone aren't enough: pass the environment's URL as
`url_override` alongside `application_id` and `environment_id`.

**Never guess a credential.** A wrong one authors a test that logs in as the
wrong account and passes. If the test needs a login and you can't tell which
credential, ask. If it needs no login, leave `credentials_id` out. Pass ids
only — never a username, password, or other secret.
