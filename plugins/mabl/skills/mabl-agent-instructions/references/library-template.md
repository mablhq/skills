# The library file

mabl is the source of truth for each rule's text, scope and on/off state. A
library file, `agent-instructions-library.md`, is optional and holds what mabl
doesn't store: why each rule exists, its open questions, and the change log.
In a repo, it lets the team review rule changes in a pull request.

Regenerate the whole file from mabl on every run that writes, carrying over the
Purpose, Assumptions, Change Log and Open Questions from the previous copy.
Where the file and mabl disagree on text, scope or state, mabl wins; report
each disagreement to the user.

## Sections, in order

1. **Header:** workspace name and ID, instruction owner, last full review date.
2. **Scope Key:** code to exact mabl application or environment name and ID,
   as the ID convention defines it.
3. **Topic Vocabulary:** topic to what it covers.
4. **Index:** one row per rule:
   `ID | Title | Capability | Applications | Environments | Status | Version | Last reviewed`.
   Status is one of: Proposed, Approved, Live in mabl, Disabled (comparing),
   Disabled, Retired.
5. **Instructions:** one entry per ID with these fields:
   - ID, Version, Title
   - Capability, Applications, Environments (by name)
   - Status
   - mabl instruction ID
   - Purpose: why it exists, for people; not sent to mabl
   - Assumptions and open questions
   - Character count
   - Instruction text: a code block with exactly the text in mabl, starting
     with the ID line
6. **Change Log:** newest first; `date | ID | change | reason`.
7. **Open Questions** for the team.
