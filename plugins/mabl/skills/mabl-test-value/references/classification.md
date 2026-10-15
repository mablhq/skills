# Classification rules

Apply in order. The first rule that matches decides the class. Record the rule
number with the class so the reader can check it.

Rules 1 to 8 need only the inventory from step 2 and a name and label match
against the critical journeys, so step 3 applies them to the whole catalog.
Tests they decide skip the deeper reads. Rules 9 onward need steps 4 to 6.

## Keep (protected)

1. Named in intake as protected or run by hand on purpose. Checked first, so no
   later rule can retire it.

## Question (disabled but expected)

2. The test is disabled but sits in an enabled plan with a schedule or
   deployment trigger. Someone expects that plan to run it. Report the plan too,
   since a plan whose tests are all disabled fires nothing.

## Retire

3. The test is disabled.

## Fix (unguarded)

4. It matches a critical journey and had no plan runs in the window. The
   journey is covered on paper and protected by nothing.

## Question

5. It is in an enabled plan that has a schedule or deployment trigger, and it
   had no plan runs in the window. The plan does not fire, or fires somewhere
   the test never runs.
6. Gate is None, no plan runs in the window, and it was created or edited in the
   last 30 days. It is being built, or was abandoned partway.

## Retire

7. Gate is None, no plan runs in the window, and not edited in the last 30 days.
8. It ran in the window, never passed, gate is None or on demand, it matches no
   critical journey, and it was not edited in the last 30 days. A recently
   edited test that has not passed yet is still being built, and rule 18 puts
   it in Question.

## Keep

9. It has a confirmed catch in the window and cost is not high. Checked before
   Merge so the test that has caught real changes is never merged away.

## Merge

10. It belongs to an overlap group and is not that group's strongest member.

## Keep

11. It is a built-in test with no authored steps (the default page-load and link
    crawl tests), its gate is Deployment or Schedule, and cost is low or medium.
    Assertion rules do not apply to these. Copies of the same built-in test
    across several plans are a plan cleanup note, not a test class.
12. Gate is Deployment or Schedule, assertions are strong, and cost is low.
13. It matches a critical journey, gate is Deployment or Schedule, assertions
    are strong or adequate, and cost is low or medium.

## Fix

14. It matches a critical journey or has a confirmed catch, and cost is high.
15. It matches a critical journey and assertions are weak.
16. Gate is Deployment and cost is high. A noisy gate trains people to ignore it.

## Question

17. Gate is Deployment or Schedule and assertions are weak. It runs and proves
    little.
18. Gate is None or on demand and it ran in the window. Someone runs it, but
    nothing depends on it.
19. It matches no critical journey and has no catch, whatever its gate. Ask
    what it protects. This rule only applies when intake supplied journeys.

## Keep (default)

20. Anything left. Say which signals were missing.

## Reading the result

Retire and Merge free cost without losing protection. Fix protects what matters
better. Question is a conversation with the team, not a deletion list. The
answer is often that the test should be strengthened, that its plan needs
repairing, or that it covers a journey nobody thought to name.
