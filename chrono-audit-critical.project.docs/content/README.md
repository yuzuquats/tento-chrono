# Chrono must reject invalid input and finish bounded iteration

Status: implemented and validated locally above master 199b4e7; audit reference 6e724fa. Ready for parent-owned independent review.

The audit found wrong Sunday-to-Monday alignment, signed rounding, permissive timestamp parsing, endpoint-only containment, a permanently cached host date, recurrence stalls/truncation, thrown parse errors, calendar leap inconsistencies, asymmetric YearMonth serde and overflowing week iteration. These fixes share one contract: valid bounded operations finish with their complete result, and invalid input reaches callers as an error.

Implement arithmetic/parsing/ranges first, recurrence and secondary calendars next, then Rust compatibility and overflow handling. Targeted regression tests accompany each behavior; run the Deno and Rust suites and investigate any fixture changes against independently checked expectations. Region timezones and all DST behavior are excluded. Preserve date-only/zone-less parser compatibility, offset-seconds support, serialized zero recurrence interval, explicit expansion limits and existing calendar epochs.

The owner is yuzuquats, shared master, with no push or branch. Baseline peer changes in examples/months.rs, src/datetime_range.rs, src/year_month_day.rs and bindings/pkg-location.txt are excluded from commits. The preceding benchmark commits remain untouched.

Preflight layout checks failed on existing workspace autophys and undeclared home entries; no layout repair is part of this work. Final results and exact decisions will be recorded here. Independent review is owned by the parent after implementation.

## Implemented behavior

| Surface | Result |
| --- | --- |
| Host date and week arithmetic | Sunday 2024-06-09 starts Monday 06-03; today compares the live host-local Y/M/D before reusing its cache, including backward clock changes. |
| Signed durations | -1600ms rounds/floors to -2000ms and ceils to -1000ms. Zero/nonfinite steps return the original value; step magnitude is positive. |
| Timestamp parser | One complete syntax/range validation path, lowercase t/z, fixed offset seconds retained, fraction rounding carries across the date. Date-only and zone-less timestamp extensions remain accepted. Invalid input returns Err. |
| Ranges | Containment requires both endpoints; strict containment excludes shared bounds. Strict overlap recognizes identical nonempty ranges and interior point ranges; touching boundaries overlap only inclusively. |
| Recurrence | Serialized INTERVAL=0 remains zero but date-level expansion steps by one. Finite reads and incremental event reads no longer truncate at 1000; legacy unbounded materialization retains its default cap. Explicit budgets, COUNT, UNTIL and idle guards remain effective. |
| Parse failures | Invalid EXDATE and UNTIL propagate Err through public Result APIs. Unparseable RDATE is preserved in splitRdatesAt.before. |
| Calendars | Ethiopian leap year is position 3 mod 4, and year starts count the preceding leap day consistently. Islamic civil leap position 16 and its accumulated count agree over the full cycle. Numeric epochs remain 1724221/1948439. |
| Rust | YearMonth reads its existing written object and the string shape, keeping object serialization and OpenAPI unchanged. Week iteration includes the final week and enters an exhausted state on overflow; the minimum boundary also avoids subtraction panic. |

## Decisions for operator review

A1 — **agent-chosen, pending operator review**: preserve parser date-only/zone-less extensions and reject seconds=60, consistent with the existing TimeOfDay representation (0..59). Removing these extensions or modeling leap seconds would be a separate API change. Reverse this choice with a targeted parser change; leap-second representation would require broader work. Timestamp implementation Change-Id: I9c726cc89ee949f6805d85baf168ea02.

A2 — **agent-chosen, pending operator review**: retain the established point-overlap convention. A point strictly inside a nonempty range overlaps exclusively; a point at a bound only overlaps inclusively; two identical points have no exclusive overlap. Both endpoints must satisfy strict containment. The alternative is empty-set interval semantics for points, which would break current point-oriented callers. Reversal is a small method/test change after caller review; same implementation Change-Id as A1.

A3 — **agent-chosen, pending operator review**: retain Islamic epoch JDN 1948439. The old comment called it Friday/July 16 Julian, which actually implies 1948440. Existing fixtures (1446-01-01 = 2024-07-07) agree with 1948439; ICU islamic-civil instead reports 1446-01-01 on 2024-07-08. Moving to that civil epoch would shift every caller by one day and remains unresolved pending an explicit human migration decision. The leap cycle is now position 16, including the matching +14 accumulated-leap formula; existing modern epoch fixtures are unchanged. Reversal of the epoch choice is a one-constant change plus fixture/caller migration, not authorized here.

A4 — **agent-chosen, pending operator review**: on Rust's final representable week, return (current,current) once when the next week's date cannot exist, then exhaust. This preserves the old terminal sentinel for an inclusive end while preventing repeats and retaining a previously dropped final partial week. A checked-result iterator would be the strongest alternative but changes the API. Reversal costs a small iterator/test change; same implementation Change-Id as A1.

The Ethiopian five changed fixtures were independently checked with ICU Ethiopic: 2015-13-06 = 2023-09-11, 2016-01-01 = 2023-09-12, 2016-01-15 = 2023-09-26, 2016-02-01 = 2023-10-12, 2016-13-01 = 2024-09-06. The 2017-01-01 = 2024-09-11 fixture remains unchanged. These are leap-boundary corrections with the numeric epoch retained.

## Validation and evidence

`deno task check` passed. `deno task test` passed: 96 documentation tests, then 656 tests / 202 steps, with 7 existing ignores. The new audit file contributes 9 focused tests, including full Ethiopian and Islamic cycles, error propagation, finite 1096-day expansion, explicit limits, and midnight rollover. Rust `cargo test -p tento-chrono --lib --tests` passed: 44 tests, 8 existing ignores; `cargo test -p tento-chrono --doc` passed 2 doctests. Rust ran in the shared working tree with the three known dirty Rust files present and excluded from commits. An initial Rust attempt failed because SSH PATH lacked Deno; the passing runs include ~/.deno/bin and ~/.cargo/bin.

Only 84 of 588 recurrence digest rows changed: the two unlimited daily rules across all starts/zones. The verification script asserted each old digest equals the new sequence's prefix, then compared every resulting instant against independent calendar-day enumeration using the existing zone resolver. Other 504 rows stayed identical. No DST resolver was changed. Five Ethiopian fixture dates changed only after the independent ICU check above.

Logs and the fixture verifier are ignored owner-host evidence at `~/workspace/fleet/evidence/chrono-audit-critical-{check,deno,rust,rust-doc,fixture-verification}.log` and `chrono-audit-critical-verify-fixture.ts`. Postflight layout/home logs have suffixes `layout-post` and `home-post`. Both checks retain the preflight failures: workspace autophys and 22 undeclared home entries. No new root/home allocation was made.

All requested non-timezone fixes are implemented. Remaining work is the parent's independent Gemini Neon review and the human Islamic epoch decision. Region.today(), toTz(), St John's wall transitions and DST-fold constructors/now remain excluded. No branch, worktree, push, deployment or external communication was used.

No new performance benchmark was run for the consolidated timestamp validation path; the correctness suites pass, but throughput should be reviewed separately if it is material to a caller.
