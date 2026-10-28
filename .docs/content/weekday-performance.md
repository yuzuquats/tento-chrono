# Weekday lookup can be faster without limiting the date range

The weekday helper currently returns 0 for Saturday even though its public
DayOfWeek1 type uses Sunday=1 through Saturday=7. The Ymd1Like caller repairs
that value, but direct name lookup returns undefined for Saturday. Separately,
an instance's weekday getter calculates days since the epoch from its fields
even when its dse property has already cached the result.

The October 5 investigation on rwc-01 (Apple M4, Deno 2.9.2 / V8 14.9) measured
fresh date construction and weekday access at about 28 ns with the current
implementation and 21 ns with a guarded multiply-and-shift implementation.
Reading dse and then the weekday fell from about 40 ns to 24 ns when the getter
also reused dse. These measurements cover date property access, not complete
recurrence generation; cached weekday access remained roughly 5 ns.

Use Ben Joffe's full signed 32-bit shift algorithm with Math.imul, arithmetic
input shifts and an unsigned output shift. Its zero-based Sunday result gains
one to match the library's public numbering. The guard dse === (dse | 0)
confines fixed-width arithmetic to exact signed 32-bit integers. Other inputs
use remainder arithmetic, reducing dse before adding the epoch offset so large
safe integers cannot lose precision from that addition.

The restricted algorithm is unsuitable as a general replacement: it stops being
accurate near +/-89 million days, within JavaScript Date's +/-100 million-day
domain. No narrower date range is introduced by this change.

The instance getter should read this.dse and preserve its existing weekday
cache. Plain Ymd1Like values continue to calculate dse from their fields, and
their weekday helper no longer needs to repair Saturday's zero.

Validation covers explicit names for all weekdays, one Gregorian 400-year cycle
against UTC Date, signed 32-bit and fallback boundaries, sampled signed inputs,
and a regression that counts date-field reads to prove cached dse reuse.
Existing date and recurrence tests exercise downstream behavior.

The implemented source passed 72 relevant runtime tests, including eight new
weekday regressions. The pre-existing setpos placeholder is listed in the
package's skipped_tests.json and remains excluded. The root Deno type check
reports two timer-type errors in unchanged tracing.ts and fastdom.ts; runtime
tests ran with --no-check. The retained benchmark measured 21.6 ns for fresh
weekday access and 24.4 ns after reading dse.

Algorithm source: https://www.benjoffe.com/fast-day-of-week#fn=32unix

The adapted algorithm is distributed under this license:

Copyright (c) 2026 - Ben Joffe <https://www.benjoffe.com/>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
