# A copy graph, worked through

The rules are in `SKILL.md` under *The copy graph*. This is one suite laid out by
them.

A five-behavior edit form plus two list checks is two groups: two cold runs and
five copies, instead of seven cold runs — and three waves instead of seven
sessions end to end.

| | Test | Copies from | Wave |
|---|---|---|---|
| 1 | save persists — the central promise | nothing — it's this group's anchor | 1 |
| 2 | loads pre-populated | 1 | 2 |
| 3 | required field blocks save | 1 | 2 |
| 4 | cancel discards changes | 3 — it already leaves the form dirty | 3 |
| 5 | the avatar picker works | 1 — it needs the clean save path | 2 |
| 6 | expected row present | nothing — it's the second group's anchor | 2 |
| 7 | filter narrows the list | 6 | 3 |

Test 4 is the whole point: 3 already clears the required field, so 4 inherits the
dirty form and changes only the ending, where starting from the anchor would mean
re-deriving that setup — and the extra wave that costs is the trade rule 2
already made. Test 6 is the anchor exception — nothing in its group
precedes it, so it copies from nothing and references test 1. That reference is
what puts it in wave 2 rather than in wave 1 beside test 1; it does not wait for
the rest of test 1's group.
