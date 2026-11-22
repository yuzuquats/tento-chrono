# Chrono keeps recurrence and window inputs intact

Status: First-principles review reproduced five defects on published Chrono `9e3de56`.

A 09:00 Los Angeles recurrence became 09:00 UTC when the caller omitted a region. The generator has the parsed DTSTART region available and should use it. Without a region it should keep DTSTART's fixed offset across rule instances, floating RDATEs, and timed UNTIL comparisons.

Property dispatch discarded lowercase calendar lines before their parsers could read them. Dispatch by the complete case-insensitive property name. Deterministic serialization should walk each EXDATE and RDATE once in input order, so saving and reopening an event keeps its exclusions stable.

Naive timestamp parsing used duration parsing, which wraps some invalid clock values and drops milliseconds. Read a bounded clock value and return an empty option on malformed input. The date parser should require all input to be part of the date.

Fragment clipping should return the intersection, with an empty range at the nearest boundary when the window misses. Calendar's existing overnight display can extend a fragment that reaches the day's end. The shift at a transition should compare full wall datetimes so a midnight fold keeps the sign.

Regression tests cover the five examples, and the full Deno suite checks calendar rules, timezone behavior, and overnight display fixtures.
