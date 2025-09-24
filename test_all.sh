#!/bin/sh

# This script runs all tests for the tento-chrono library
# It tests the core time components and their interactions

set -e # Exit on any failure

./test.sh tests/test_datetime.deno.ts
./test.sh tests/test_debug.deno.ts
./test.sh tests/test_duration.deno.ts
# ./test.sh tests/test_easter.deno.ts #todo
# ./test.sh tests/test_generator_hms.deno.ts #todo
# ./test.sh tests/test_generator_naivedate_setpos.deno.ts #todo
./test.sh tests/test_generator_naivedate.deno.ts
./test.sh tests/test_generator_naivedate_py.deno.ts
./test.sh tests/test_ical_date_line.deno.ts
./test.sh tests/test_ical_recurrence_generate.deno.ts
# ./test.sh tests/test_ical_recurrence_real_data.deno.ts
./test.sh tests/test_ical_recurrence.deno.ts
./test.sh tests/test_ical_rrule_generate.deno.ts
./test.sh tests/test_ical_rrule.deno.ts
./test.sh tests/test_naivedate.deno.ts
./test.sh tests/test_naivetime.deno.ts
./test.sh tests/test_time_of_day.deno.ts
./test.sh tests/test_time_point.deno.ts
./test.sh tests/test_tz.deno.ts
./test.sh tests/test_utils.deno.ts
./test.sh tests/test_weekday.deno.ts
./test.sh tests/test_year_month.deno.ts