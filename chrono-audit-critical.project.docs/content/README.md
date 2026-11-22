# Chrono must reject invalid input and finish bounded iteration

Status: implementation starting from local master 199b4e7; audit reference 6e724fa.

The audit found wrong Sunday-to-Monday alignment, signed rounding, permissive timestamp parsing, endpoint-only containment, a permanently cached host date, recurrence stalls/truncation, thrown parse errors, calendar leap inconsistencies, asymmetric YearMonth serde and overflowing week iteration. These fixes share one contract: valid bounded operations finish with their complete result, and invalid input reaches callers as an error.

Implement arithmetic/parsing/ranges first, recurrence and secondary calendars next, then Rust compatibility and overflow handling. Targeted regression tests accompany each behavior; run the Deno and Rust suites and investigate any fixture changes against independently checked expectations. Region timezones and all DST behavior are excluded. Preserve date-only/zone-less parser compatibility, offset-seconds support, serialized zero recurrence interval, explicit expansion limits and existing calendar epochs.

The owner is yuzuquats, shared master, with no push or branch. Baseline peer changes in examples/months.rs, src/datetime_range.rs, src/year_month_day.rs and bindings/pkg-location.txt are excluded from commits. The preceding benchmark commits remain untouched.

Preflight layout checks failed on existing workspace autophys and undeclared home entries; no layout repair is part of this work. Final results and exact decisions will be recorded here. Independent review is owned by the parent after implementation.
