# Classification rules

Apply in order. The first rule that matches decides the class. Record the rule
number with the class so the reader can check it.

## Keep (protected)

1. Named in intake as protected or run by hand on purpose. Checked first, so no
   later rule can retire it.

## Retire

2. The test is disabled.
3. Gate is None, no plan runs in the window, and not edited in 6 months.
4. It never passed in the window, gate is None or on demand, and it matches no
   critical journey.

## Merge

5. It belongs to an overlap group and is not that group's strongest member.

## Keep

6. It has a confirmed catch in the window and cost is not high.
7. Gate is Deployment or Schedule, assertions are strong, and cost is low.
8. It matches a critical journey, gate is Deployment or Schedule, assertions are
   strong or adequate, and cost is low or medium.

## Fix

9. It matches a critical journey or has a confirmed catch, and cost is high.
10. It matches a critical journey and assertions are weak.
11. Gate is Deployment and cost is high. A noisy gate trains people to ignore it.

## Question

12. Gate is Deployment or Schedule and assertions are weak. It runs and proves
    little.
13. Gate is None or on demand and it ran in the window. Someone runs it, but
    nothing depends on it.
14. It matches no critical journey and has no catch, whatever its gate. Ask
    what it protects. This rule only applies when intake supplied journeys.

## Keep (default)

15. Anything left. Say which signals were missing.

## Reading the result

Retire and Merge free cost without losing protection. Fix protects what matters
better. Question is a conversation with the team, not a deletion list. The
answer is often that the test should be strengthened or that it covers a journey
nobody thought to name.
