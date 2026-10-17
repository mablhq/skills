# Fanning out a wave

How to keep a wave of authoring sessions moving: the queue, polling, and launch
failures. The suite strategy itself — which tests go out in which wave — is in
`SKILL.md`.

## The queue and polling

**`rate_limited` is a queue, not a failure, and a wide wave is what fills it.**
The workspace caps how many authoring sessions run at once, so a wave wider than
that cap doesn't fail — the extra sessions queue and are admitted in launch order
as slots free. A wide wave can therefore sit in `rate_limited` far longer than 20
minutes and still be working: it is not wedged, and it must never be re-launched
or you author that test twice in a live workspace.

The queue is first-come-first-served, so work that starts after your sessions
can't push them back, and a slot frees on its own even when whatever holds it is
stuck — that's what makes waiting the right move rather than a gamble. What the
queue won't tell you is how long: a `rate_limited` session's `status` is one
word, no position and no estimate. So read the depth once instead of guessing —
`mabl agent authoring list --status rate_limited` is filtered, so it stays as
small as the stranded sweep in `SKILL.md` — and compare it to your own wave. If most of that
backlog is sessions you didn't launch, you're queued behind someone else's work,
and past about 30 minutes there **stop waiting rather than stop the session**:
report those tests as *queued, not yet started*, leave the sessions running, and
let the user pick them up the way they would a pause. Bound the wait, never the
session. Terminating one to reclaim a slot throws away a test that was about to
run, and polling forever reports nothing at all — the one outcome worse than a
short suite.

Poll a wave's sessions together on the same 30–60s cycle: one
`status --session-id` per session still open, read off the run's ledger (*The
copy graph* in `SKILL.md`). That's N small reads a tick — non-verbose `status` is a
single line of JSON — and it's the only call that carries what you need next:
`createdTestId`, `viewTestUrl`, `reportedTestRunId`, and a pause's `question` +
`loopNumber`. **Non-verbose fills in those ids only for `completed`, `failed`,
and `terminated`**, so when a session stops any other way — `merged`, or a
terminal word you don't recognise — re-read it once with `--verbose` before you
write it off. The ids are there; the short output just doesn't carry them, and
without them a test you did author reports as a test that never got built. Drop
each session from the poll set as it stops; when the set is empty, launch the next
wave.

Don't reach for `mabl agent authoring list --status all` to save those calls:
with no status filter it pages through every authoring session the workspace has
ever run, so a single read can dwarf a whole wave of `status` reads and it still
carries none of those fields. `list` earns its place in the stranded sweep,
where the `needs_attention` filter is what keeps it small.

## Launch failures

Launching a wave is one `initiate` per test, and each can fail on its own — a
wave of six is six chances to end up holding five sessions and a test you stopped
tracking. Confirm every launch returned a session id before you start polling.
Retry a failed launch once, alone — but **look before you relaunch**. A failed
`initiate` doesn't prove nothing was created: a timeout or a dropped response can
leave a session running whose id you never got, and a launch carries no
idempotency key the way an `answer` does. So check first, with the same filtered
reads as the queue check — `mabl agent authoring list --status queued` and `--status
rate_limited`. A session that shows up there seconds after your failed launch
**is** that test: take its id and poll it. Retry only when neither shows one.
Retrying blind is the same double-author `rate_limited` forbids, reached from the
other side. If the retry fails too, that test is **authoring failed** with no
session to resume, and anything parented to it re-parents by the rule in *The
copy graph*.
