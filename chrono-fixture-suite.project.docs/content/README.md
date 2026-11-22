# Recurrence examples belong in fixtures

Status: The vendored Python file has 562 named tests. The timed JSON file contains 121 rows, and another reference port embeds fixed examples in TypeScript.

Keep cases that exercise the public API's state and lifecycle in focused TypeScript tests. Move fixed input/output examples to domain JSON fixtures and run them through the existing recurrence and shared fixture runners. Preserve the entry point used by a migrated case, including direct date filters.

Use the vendored `tests/reference_tests/test_rrule.py` as the pinned reference. Track its class and test names so a gap is visible. Preserve Python's expected values, describe runtime differences explicitly, and keep Python-only API cases in the inventory. Run the committed fixtures using Deno.

Keep generated property checks separate from the fixed fixtures. Report seeds and inputs on failure, and use integer PRNG arithmetic so the samples exercise more than a narrow subset of values.
