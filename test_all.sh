#!/bin/sh

# This script runs all tests for the tento-chrono library
# It tests the core time components and their interactions

set -e # Exit on any failure

./test.sh tests/test_datetime.deno.test.ts
./test.sh tests/test_debug.deno.test.ts
./test.sh tests/test_duration.deno.test.ts
# ./test.sh tests/test_easter.deno.test.ts #todo
# ./test.sh tests/test_generator_hms.deno.test.ts #todo
# ./test.sh tests/test_generator_naivedate_setpos.deno.test.ts #todo
./test.sh tests/test_generator_naivedate.deno.test.ts
./test.sh tests/test_generator_naivedate_py.deno.test.ts
./test.sh tests/test_ical_date_line.deno.test.ts
./test.sh tests/test_ical_recurrence_generate.deno.test.ts
# ./test.sh tests/test_ical_recurrence_real_data.deno.test.ts
./test.sh tests/test_ical_recurrence.deno.test.ts
./test.sh tests/test_ical_rrule_generate.deno.test.ts
./test.sh tests/test_ical_rrule.deno.test.ts
./test.sh tests/test_naivedate.deno.test.ts
./test.sh tests/test_naivetime.deno.test.ts
./test.sh tests/test_time_of_day.deno.test.ts
./test.sh tests/test_time_point.deno.test.ts
./test.sh tests/test_tz.deno.test.ts
./test.sh tests/test_utils.deno.test.ts
./test.sh tests/test_weekday.deno.test.ts
./test.sh tests/test_year_month.deno.test.ts