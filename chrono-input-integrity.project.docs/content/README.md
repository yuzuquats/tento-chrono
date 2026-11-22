# Chrono keeps recurrence and window inputs intact

Status: First-principles review reproduced five defects on published Chrono `9e3de56`.

A 09:00 Los Angeles recurrence became 09:00 UTC when the caller omitted a region. The generator has the parsed DTSTART region available and should use it. Without a region it should keep DTSTART's fixed offset across rule instances, floating RDATEs, and timed UNTIL comparisons.

Property dispatch discarded lowercase calendar lines before their parsers could read them. Dispatch by the complete case-insensitive property name. Deterministic serialization should walk each EXDATE and RDATE once in input order, so saving and reopening an event keeps its exclusions stable.

Naive timestamp parsing used duration parsing, which wraps some invalid clock values and drops milliseconds. Read a bounded clock value and return an empty option on malformed input. The date parser should require all input to be part of the date.

Fragment clipping should return the intersection, with an empty range at the nearest boundary when the window misses. Calendar's existing overnight display can extend a fragment that reaches the day's end. The shift at a transition should compare full wall datetimes so a midnight fold keeps the sign.

Regression tests cover the five examples, and the full Deno suite checks calendar rules, timezone behavior, and overnight display fixtures.

## Implemented behavior

- CI-1 (agent-chosen, pending operator review). An explicit region takes precedence, followed by DTSTART's TZID, the legacy RRULE TZID, and the supplied start's fixed offset. Retaining RRULE priority could preserve behavior for conflicting legacy rules at the cost of ignoring their DTSTART. Reversing the priority would take one lookup reorder and a fixture.
- CI-2 (agent-chosen, pending operator review). Naive timestamps accept one to three fractional digits and the legacy UTC marker used by formula callers. Numeric offsets are rejected because the type carries no timezone. Supporting finer precision would require a rounding policy and a midnight-carry fixture. The parser and its focused test contain the policy.
- CI-3 (agent-chosen, pending operator review). The public clamp returns an empty range at a fragment boundary. That preserves its return type for callers that read endpoints directly. Windowed display retains its existing overnight extension when the fragment reaches next midnight and there is no explicit partial end. Returning an optional range instead would require migrating callers. The clipping helpers and focused tests contain both behaviors.

The implementation commit uses Change-Id `I0095bcddb39f4e878e35e2d84b412809`. All six focused regressions pass. Deno type checking, 96 documentation tests, and 686 suite tests with 202 steps passed with seven existing ignores. The 69 targeted Calendar and formula tests passed against the owner checkout. The implementation is local and ready for publication review.
