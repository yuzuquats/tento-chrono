# Recurrence examples belong in fixtures

Status: The vendored Python file has 562 named tests. The timed JSON file contains 121 rows, and another reference port embeds fixed examples in TypeScript.

Keep cases that exercise the public API's state and lifecycle in focused TypeScript tests. Move fixed input/output examples to domain JSON fixtures and run them through the existing recurrence and shared fixture runners. Preserve the entry point used by a migrated case, including direct date filters.

Use the vendored `tests/reference_tests/test_rrule.py` as the pinned reference. Track its class and test names so a gap is visible. Preserve Python's expected values, describe runtime differences explicitly, and keep Python-only API cases in the inventory. Run the committed fixtures using Deno.

Keep generated property checks separate from the fixed fixtures. Report seeds and inputs on failure, and use integer PRNG arithmetic so the samples exercise more than a narrow subset of values.

## Implemented suite

The dateutil fixture file runs 455 rows covering 452 named tests from the vendored reference. Most rows expand concrete RRULE inputs or check serialization round trips. The inventory records the other 110 named tests, including 42 Python API contracts and 68 unsupported or differing behaviors. A Deno test checks the exact source IDs and pinned file hash, so every reference test has a disposition.

The imported Python expectations come from the vendored literal assertions and, for serialization-only checks, dateutil 2.8.2. The maximum-year case explicitly bounds the Chrono search at the end of year 9999. The microsecond case retains both the Python result and Chrono's documented millisecond-preserving result. For future parity work, the inventory retains inputs and Python outcomes for BYEASTER, the BYWEEKDAY alias, and several validation differences. The compiler and test runners require Deno only.

The existing filter runner now owns 106 migrated examples that still call `NaiveDate.range`. The two independent rrule.js subsecond rows and the narrow API tests remain. The formatter and regional property tests use a reproducible 32-bit PRNG in `tests/fuzz/`.

Deno type checking passed. The full run passed 96 tests in the documentation and co-located test command, plus 918 suite tests with 308 steps and seven existing ignores. The implementation is committed locally under Change-Id `I103465865a484d41a9a70d398351bbc`.

## Test structure follow-up

Fixed parser, iCalendar, and fragment examples now use the shared fixture helper. The existing recurrence runner covers the timezone precedence and incremental DST cases, and the date-filter fixtures exercise the daily, weekly, and yearly range boundaries directly. The TypeScript date-range test covers the unchecked-start contract. Fixture discovery fails when a corpus is missing or a matched file contains no cases.

Regional fuzzing compares Chrono's local date and time to `Intl.DateTimeFormat`, then checks that the civil-day fragments include the original instant. The four configured zones yielded 239 offset transitions in the test window, giving 1,195 boundary probes in addition to 4,096 seeded random instants on the owner host.

Deno type checking passed. The full run passed 96 documentation and co-located tests plus 931 suite tests with 319 steps and seven existing ignores. The follow-up is in local Change-Id `I555e48b8de684651bcfdf092c8c971fd`.

## Publication review fix

Ten imported Python rows retain ordinal BYDAY tokens on weekly through secondly rules. Python's serializer normalizes those tokens away, but the source cases exercise how the engine handles them. The expected dates are unchanged. A focused API test pins default date step and range exhaustion.

The regional fuzz comparison uses the runtime IANA data for its wall-clock oracle. A future timezone data update can change the expected clock fields without a Chrono code change.

## Generated correctness checks

The Gregorian check compares 8,192 reproducible inputs with JavaScript UTC Date, including pre-epoch and early four-digit years, month-end clamping, negative arithmetic, and time crossing midnight. The recurrence checks enumerate every day or second in a bounded window using independent arithmetic. They cover 320 date rules through the date generator, event generator, and instance expander, plus 120 subdaily rules through incremental reads with COUNT, EXDATE and RDATE. These test combinations beyond the existing fixed Python, Google Calendar, parser, and timezone fixtures.

Deno type checking passed. The complete Deno run passed 96 documentation and co-located tests and 935 suite tests with 319 steps and seven existing ignores. Rust passed 44 tests and two doctests with eight existing ignores from a clean export of published `afa37fe`. The added checks are TypeScript tests only. The Rust and Deno logs are in `~/workspace/fleet/evidence/chrono-fixture-suite/correctness-*.log` on yuzuquats.

## Live Google Calendar expansions

The rwc-04 tester used the dedicated test-events calendar and the
event-instances command from tento-google commit `77f899aac5`. Google accepted
all 16 synthetic series across six groups, returning 111 occurrence starts.
The operator test calendar was checked for absence after removing each series.

`tests/fixtures/google-expansion.rwc04.json` preserves the submitted and
returned recurrence lines, the master start and timezone, the UTC query
window, and the recorded starts. The shared fixture runner compares one-shot
and incremental Chrono expansion using the same regional start conversion as
the Calendar caller. Eight rows match Google directly. Eight record the exact
current Chrono output alongside Google's result, with a reason. These cases
fail when the mismatch changes or disappears, so a parity fix must remove the
known-difference entry.

The mismatches cover mixed BYWEEKNO with WKST and COUNT, explicit INTERVAL
on monthly and weekly BYWEEKNO, two near-boundary times on Lord Howe's
30-minute spring transition, and BYSETPOS with BYHOUR. The BYWEEKNO with
EXDATE and COUNT and the RDATE/EXDATE precedence cases match Google.

The sanitized Google response and the Chrono comparison are retained on
yuzuquats in `~/workspace/fleet/evidence/chrono-fixture-suite/google-expansion-rwc04-*`.
