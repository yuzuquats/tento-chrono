# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from datetime import datetime, date
import unittest
from six import PY2

from dateutil import tz
from dateutil.rrule import (
    rrule, rruleset, rrulestr,
    YEARLY, MONTHLY, WEEKLY, DAILY,
    HOURLY, MINUTELY, SECONDLY,
    MO, TU, WE, TH, FR, SA, SU
)

from freezegun import freeze_time

import pytest


@pytest.mark.rrule
class RRuleTest(unittest.TestCase):
    def _rrulestr_reverse_test(self, rule):
        """
        Call with an `rrule` and it will test that `str(rrule)` generates a
        string which generates the same `rrule` as the input when passed to
        `rrulestr()`
        """
        rr_str = str(rule)
        rrulestr_rrule = rrulestr(rr_str)

        self.assertEqual(list(rule), list(rrulestr_rrule))

    def testStrAppendRRULEToken(self):
        # `_rrulestr_reverse_test` does not check if the "RRULE:" prefix
        # property is appended properly, so give it a dedicated test
        self.assertEqual(str(rrule(YEARLY,
                             count=5,
                             dtstart=datetime(1997, 9, 2, 9, 0))),
                         "DTSTART:19970902T090000\n"
                         "RRULE:FREQ=YEARLY;COUNT=5")

        rr_str = (
          'DTSTART:19970105T083000\nRRULE:FREQ=YEARLY;INTERVAL=2'
        )
        self.assertEqual(str(rrulestr(rr_str)), rr_str)

    def testStr(self):
        self.assertEqual(list(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RRULE:FREQ=YEARLY;COUNT=3\n"
                              )),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1998, 9, 2, 9, 0),
                          datetime(1999, 9, 2, 9, 0)])

    def testStrWithTZID(self):
        NYC = tz.gettz('America/New_York')
        self.assertEqual(list(rrulestr(
                              "DTSTART;TZID=America/New_York:19970902T090000\n"
                              "RRULE:FREQ=YEARLY;COUNT=3\n"
                              )),
                         [datetime(1997, 9, 2, 9, 0, tzinfo=NYC),
                          datetime(1998, 9, 2, 9, 0, tzinfo=NYC),
                          datetime(1999, 9, 2, 9, 0, tzinfo=NYC)])

    def testStrWithTZIDMapping(self):
        rrstr = ("DTSTART;TZID=Eastern:19970902T090000\n" +
                 "RRULE:FREQ=YEARLY;COUNT=3")

        NYC = tz.gettz('America/New_York')
        rr = rrulestr(rrstr, tzids={'Eastern': NYC})
        exp = [datetime(1997, 9, 2, 9, 0, tzinfo=NYC),
               datetime(1998, 9, 2, 9, 0, tzinfo=NYC),
               datetime(1999, 9, 2, 9, 0, tzinfo=NYC)]

        self.assertEqual(list(rr), exp)

    def testStrWithTZIDCallable(self):
        rrstr = ('DTSTART;TZID=UTC+04:19970902T090000\n' +
                 'RRULE:FREQ=YEARLY;COUNT=3')

        TZ = tz.tzstr('UTC+04')
        def parse_tzstr(tzstr):
            if tzstr is None:
                raise ValueError('Invalid tzstr')

            return tz.tzstr(tzstr)

        rr = rrulestr(rrstr, tzids=parse_tzstr)

        exp = [datetime(1997, 9, 2, 9, 0, tzinfo=TZ),
               datetime(1998, 9, 2, 9, 0, tzinfo=TZ),
               datetime(1999, 9, 2, 9, 0, tzinfo=TZ),]

        self.assertEqual(list(rr), exp)

    def testStrWithTZIDCallableFailure(self):
        rrstr = ('DTSTART;TZID=America/New_York:19970902T090000\n' +
                 'RRULE:FREQ=YEARLY;COUNT=3')

        class TzInfoError(Exception):
            pass

        def tzinfos(tzstr):
            if tzstr == 'America/New_York':
                raise TzInfoError('Invalid!')
            return None

        with self.assertRaises(TzInfoError):
            rrulestr(rrstr, tzids=tzinfos)

    def testStrWithConflictingTZID(self):
        # RFC 5545 Section 3.3.5, FORM #2: DATE WITH UTC TIME
        # https://tools.ietf.org/html/rfc5545#section-3.3.5
        # The "TZID" property parameter MUST NOT be applied to DATE-TIME
        with self.assertRaises(ValueError):
            rrulestr("DTSTART;TZID=America/New_York:19970902T090000Z\n"+
                     "RRULE:FREQ=YEARLY;COUNT=3\n")

    def testStrType(self):
        self.assertEqual(isinstance(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RRULE:FREQ=YEARLY;COUNT=3\n"
                              ), rrule), True)

    def testStrForceSetType(self):
        self.assertEqual(isinstance(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RRULE:FREQ=YEARLY;COUNT=3\n"
                              , forceset=True), rruleset), True)

    def testStrSetType(self):
        self.assertEqual(isinstance(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RRULE:FREQ=YEARLY;COUNT=2;BYDAY=TU\n"
                              "RRULE:FREQ=YEARLY;COUNT=1;BYDAY=TH\n"
                              ), rruleset), True)

    def testStrCase(self):
        self.assertEqual(list(rrulestr(
                              "dtstart:19970902T090000\n"
                              "rrule:freq=yearly;count=3\n"
                              )),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1998, 9, 2, 9, 0),
                          datetime(1999, 9, 2, 9, 0)])

    def testStrSpaces(self):
        self.assertEqual(list(rrulestr(
                              " DTSTART:19970902T090000 "
                              " RRULE:FREQ=YEARLY;COUNT=3 "
                              )),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1998, 9, 2, 9, 0),
                          datetime(1999, 9, 2, 9, 0)])

    def testStrSpacesAndLines(self):
        self.assertEqual(list(rrulestr(
                              " DTSTART:19970902T090000 \n"
                              " \n"
                              " RRULE:FREQ=YEARLY;COUNT=3 \n"
                              )),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1998, 9, 2, 9, 0),
                          datetime(1999, 9, 2, 9, 0)])

    def testStrNoDTStart(self):
        self.assertEqual(list(rrulestr(
                              "RRULE:FREQ=YEARLY;COUNT=3\n"
                              , dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1998, 9, 2, 9, 0),
                          datetime(1999, 9, 2, 9, 0)])

    def testStrValueOnly(self):
        self.assertEqual(list(rrulestr(
                              "FREQ=YEARLY;COUNT=3\n"
                              , dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1998, 9, 2, 9, 0),
                          datetime(1999, 9, 2, 9, 0)])

    def testStrUnfold(self):
        self.assertEqual(list(rrulestr(
                              "FREQ=YEA\n RLY;COUNT=3\n", unfold=True,
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1998, 9, 2, 9, 0),
                          datetime(1999, 9, 2, 9, 0)])

    def testStrSet(self):
        self.assertEqual(list(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RRULE:FREQ=YEARLY;COUNT=2;BYDAY=TU\n"
                              "RRULE:FREQ=YEARLY;COUNT=1;BYDAY=TH\n"
                              )),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 4, 9, 0),
                          datetime(1997, 9, 9, 9, 0)])

    def testStrSetDate(self):
        self.assertEqual(list(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RRULE:FREQ=YEARLY;COUNT=1;BYDAY=TU\n"
                              "RDATE:19970904T090000\n"
                              "RDATE:19970909T090000\n"
                              )),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 4, 9, 0),
                          datetime(1997, 9, 9, 9, 0)])

    def testStrSetExRule(self):
        self.assertEqual(list(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RRULE:FREQ=YEARLY;COUNT=6;BYDAY=TU,TH\n"
                              "EXRULE:FREQ=YEARLY;COUNT=3;BYDAY=TH\n"
                              )),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 9, 9, 0),
                          datetime(1997, 9, 16, 9, 0)])

    def testStrSetExDate(self):
        self.assertEqual(list(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RRULE:FREQ=YEARLY;COUNT=6;BYDAY=TU,TH\n"
                              "EXDATE:19970904T090000\n"
                              "EXDATE:19970911T090000\n"
                              "EXDATE:19970918T090000\n"
                              )),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 9, 9, 0),
                          datetime(1997, 9, 16, 9, 0)])

    def testStrSetExDateMultiple(self):
        rrstr = ("DTSTART:19970902T090000\n"
                 "RRULE:FREQ=YEARLY;COUNT=6;BYDAY=TU,TH\n"
                 "EXDATE:19970904T090000,19970911T090000,19970918T090000\n")

        rr = rrulestr(rrstr)
        assert list(rr) == [datetime(1997, 9, 2, 9, 0),
                            datetime(1997, 9, 9, 9, 0),
                            datetime(1997, 9, 16, 9, 0)]

    def testStrSetExDateWithTZID(self):
        BXL = tz.gettz('Europe/Brussels')
        rr = rrulestr("DTSTART;TZID=Europe/Brussels:19970902T090000\n"
                      "RRULE:FREQ=YEARLY;COUNT=6;BYDAY=TU,TH\n"
                      "EXDATE;TZID=Europe/Brussels:19970904T090000\n"
                      "EXDATE;TZID=Europe/Brussels:19970911T090000\n"
                      "EXDATE;TZID=Europe/Brussels:19970918T090000\n")

        assert list(rr) == [datetime(1997, 9, 2, 9, 0, tzinfo=BXL),
                            datetime(1997, 9, 9, 9, 0, tzinfo=BXL),
                            datetime(1997, 9, 16, 9, 0, tzinfo=BXL)]

    def testStrSetExDateValueDateTimeNoTZID(self):
        rrstr = '\n'.join([
            "DTSTART:19970902T090000",
            "RRULE:FREQ=YEARLY;COUNT=4;BYDAY=TU,TH",
            "EXDATE;VALUE=DATE-TIME:19970902T090000",
            "EXDATE;VALUE=DATE-TIME:19970909T090000",
        ])

        rr = rrulestr(rrstr)
        assert list(rr) == [datetime(1997, 9, 4, 9), datetime(1997, 9, 11, 9)]

    def testStrSetExDateValueMixDateTimeNoTZID(self):
        rrstr = '\n'.join([
            "DTSTART:19970902T090000",
            "RRULE:FREQ=YEARLY;COUNT=4;BYDAY=TU,TH",
            "EXDATE;VALUE=DATE-TIME:19970902T090000",
            "EXDATE:19970909T090000",
        ])

        rr = rrulestr(rrstr)
        assert list(rr) == [datetime(1997, 9, 4, 9), datetime(1997, 9, 11, 9)]

    def testStrSetExDateValueDateTimeWithTZID(self):
        BXL = tz.gettz('Europe/Brussels')
        rrstr = '\n'.join([
            "DTSTART;VALUE=DATE-TIME;TZID=Europe/Brussels:19970902T090000",
            "RRULE:FREQ=YEARLY;COUNT=4;BYDAY=TU,TH",
            "EXDATE;VALUE=DATE-TIME;TZID=Europe/Brussels:19970902T090000",
            "EXDATE;VALUE=DATE-TIME;TZID=Europe/Brussels:19970909T090000",
        ])

        rr = rrulestr(rrstr)
        assert list(rr) == [datetime(1997, 9, 4, 9, tzinfo=BXL),
                            datetime(1997, 9, 11, 9, tzinfo=BXL)]

    def testStrSetExDateValueDate(self):
        rrstr = '\n'.join([
            "DTSTART;VALUE=DATE:19970902",
            "RRULE:FREQ=YEARLY;COUNT=4;BYDAY=TU,TH",
            "EXDATE;VALUE=DATE:19970902",
            "EXDATE;VALUE=DATE:19970909",
        ])

        rr = rrulestr(rrstr)
        assert list(rr) == [datetime(1997, 9, 4), datetime(1997, 9, 11)]

    def testStrSetDateAndExDate(self):
        self.assertEqual(list(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RDATE:19970902T090000\n"
                              "RDATE:19970904T090000\n"
                              "RDATE:19970909T090000\n"
                              "RDATE:19970911T090000\n"
                              "RDATE:19970916T090000\n"
                              "RDATE:19970918T090000\n"
                              "EXDATE:19970904T090000\n"
                              "EXDATE:19970911T090000\n"
                              "EXDATE:19970918T090000\n"
                              )),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 9, 9, 0),
                          datetime(1997, 9, 16, 9, 0)])

    def testStrSetDateAndExRule(self):
        self.assertEqual(list(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RDATE:19970902T090000\n"
                              "RDATE:19970904T090000\n"
                              "RDATE:19970909T090000\n"
                              "RDATE:19970911T090000\n"
                              "RDATE:19970916T090000\n"
                              "RDATE:19970918T090000\n"
                              "EXRULE:FREQ=YEARLY;COUNT=3;BYDAY=TH\n"
                              )),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 9, 9, 0),
                          datetime(1997, 9, 16, 9, 0)])

    def testStrKeywords(self):
        self.assertEqual(list(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RRULE:FREQ=YEARLY;COUNT=3;INTERVAL=3;"
                                    "BYMONTH=3;BYWEEKDAY=TH;BYMONTHDAY=3;"
                                    "BYHOUR=3;BYMINUTE=3;BYSECOND=3\n"
                              )),
                         [datetime(2033, 3, 3, 3, 3, 3),
                          datetime(2039, 3, 3, 3, 3, 3),
                          datetime(2072, 3, 3, 3, 3, 3)])

    def testStrNWeekDay(self):
        self.assertEqual(list(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RRULE:FREQ=YEARLY;COUNT=3;BYDAY=1TU,-1TH\n"
                              )),
                         [datetime(1997, 12, 25, 9, 0),
                          datetime(1998, 1, 6, 9, 0),
                          datetime(1998, 12, 31, 9, 0)])

    def testStrUntil(self):
        self.assertEqual(list(rrulestr(
                              "DTSTART:19970902T090000\n"
                              "RRULE:FREQ=YEARLY;"
                              "UNTIL=19990101T000000;BYDAY=1TU,-1TH\n"
                              )),
                         [datetime(1997, 12, 25, 9, 0),
                          datetime(1998, 1, 6, 9, 0),
                          datetime(1998, 12, 31, 9, 0)])

    def testStrValueDatetime(self):
        rr = rrulestr("DTSTART;VALUE=DATE-TIME:19970902T090000\n"
                       "RRULE:FREQ=YEARLY;COUNT=2")

        self.assertEqual(list(rr), [datetime(1997, 9, 2, 9, 0, 0),
                                    datetime(1998, 9, 2, 9, 0, 0)])

    def testStrValueDate(self):
        rr = rrulestr("DTSTART;VALUE=DATE:19970902\n"
                       "RRULE:FREQ=YEARLY;COUNT=2")

        self.assertEqual(list(rr), [datetime(1997, 9, 2, 0, 0, 0),
                                    datetime(1998, 9, 2, 0, 0, 0)])

    def testStrMultipleDTStartComma(self):
        with pytest.raises(ValueError):
            rr = rrulestr("DTSTART:19970101T000000,19970202T000000\n"
                          "RRULE:FREQ=YEARLY;COUNT=1")

    def testStrInvalidUntil(self):
        with self.assertRaises(ValueError):
            list(rrulestr("DTSTART:19970902T090000\n"
                          "RRULE:FREQ=YEARLY;"
                          "UNTIL=TheCowsComeHome;BYDAY=1TU,-1TH\n"))

    def testStrUntilMustBeUTC(self):
        with self.assertRaises(ValueError):
            list(rrulestr("DTSTART;TZID=America/New_York:19970902T090000\n"
                          "RRULE:FREQ=YEARLY;"
                          "UNTIL=19990101T000000;BYDAY=1TU,-1TH\n"))

    def testStrUntilWithTZ(self):
        NYC = tz.gettz('America/New_York')
        rr = list(rrulestr("DTSTART;TZID=America/New_York:19970101T000000\n"
                          "RRULE:FREQ=YEARLY;"
                          "UNTIL=19990101T000000Z\n"))
        self.assertEqual(list(rr), [datetime(1997, 1, 1, 0, 0, 0, tzinfo=NYC),
                                    datetime(1998, 1, 1, 0, 0, 0, tzinfo=NYC)])

    def testStrEmptyByDay(self):
        with self.assertRaises(ValueError):
            list(rrulestr("DTSTART:19970902T090000\n"
                          "FREQ=WEEKLY;"
                          "BYDAY=;"         # This part is invalid
                          "WKST=SU"))

    def testStrInvalidByDay(self):
        with self.assertRaises(ValueError):
            list(rrulestr("DTSTART:19970902T090000\n"
                          "FREQ=WEEKLY;"
                          "BYDAY=-1OK;"         # This part is invalid
                          "WKST=SU"))

    def testBadBySetPos(self):
        self.assertRaises(ValueError,
                          rrule, MONTHLY,
                                 count=1,
                                 bysetpos=0,
                                 dtstart=datetime(1997, 9, 2, 9, 0))

    def testBadBySetPosMany(self):
        self.assertRaises(ValueError,
                          rrule, MONTHLY,
                                 count=1,
                                 bysetpos=(-1, 0, 1),
                                 dtstart=datetime(1997, 9, 2, 9, 0))

    # Tests to ensure that str(rrule) works
    def testToStrYearly(self):
        rule = rrule(YEARLY, count=3, dtstart=datetime(1997, 9, 2, 9, 0))
        self._rrulestr_reverse_test(rule)

    def testToStrYearlyInterval(self):
        rule = rrule(YEARLY, count=3, interval=2,
                     dtstart=datetime(1997, 9, 2, 9, 0))
        self._rrulestr_reverse_test(rule)

    def testToStrYearlyByMonth(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                                          count=3,
                                          bymonth=(1, 3),
                                          dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByMonthDay(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                                          count=3,
                                          bymonthday=(1, 3),
                                          dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByMonthAndMonthDay(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                                          count=3,
                                          bymonth=(1, 3),
                                          bymonthday=(5, 7),
                                          dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByWeekDay(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                                          count=3,
                                          byweekday=(TU, TH),
                                          dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByNWeekDay(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                                          count=3,
                                          byweekday=(TU(1), TH(-1)),
                                          dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByNWeekDayLarge(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byweekday=(TU(3), TH(-3)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByMonthAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByMonthAndNWeekDay(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByMonthAndNWeekDayLarge(self):
        # This is interesting because the TH(-3) ends up before
        # the TU(3).
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU(3), TH(-3)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByMonthAndMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByYearDay(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=4,
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=4,
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByMonthAndYearDay(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=4,
                              bymonth=(4, 7),
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByMonthAndYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=4,
                              bymonth=(4, 7),
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByWeekNo(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byweekno=20,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByWeekNoAndWeekDay(self):
        # That's a nice one. The first days of week number one
        # may be in the last year.
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byweekno=1,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByWeekNoAndWeekDayLarge(self):
        # Another nice test. The last days of week number 52/53
        # may be in the next year.
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byweekno=52,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByWeekNoAndWeekDayLast(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byweekno=-1,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByEaster(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byeaster=0,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByEasterPos(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byeaster=1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByEasterNeg(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byeaster=-1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByWeekNoAndWeekDay53(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byweekno=53,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByHour(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byhour=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByMinute(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyBySecond(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByHourAndMinute(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByHourAndSecond(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byhour=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyByHourAndMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrYearlyBySetPos(self):
        self._rrulestr_reverse_test(rrule(YEARLY,
                              count=3,
                              bymonthday=15,
                              byhour=(6, 18),
                              bysetpos=(3, -3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthly(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyInterval(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              interval=2,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyIntervalLarge(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              interval=18,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByMonth(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              bymonth=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByMonthDay(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              bymonthday=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByMonthAndMonthDay(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(5, 7),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByWeekDay(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

        # Third Monday of the month
        self.assertEqual(rrule(MONTHLY,
                         byweekday=(MO(+3)),
                         dtstart=datetime(1997, 9, 1)).between(datetime(1997,
                                                                        9,
                                                                        1),
                                                               datetime(1997,
                                                                        12,
                                                                        1)),
                         [datetime(1997, 9, 15, 0, 0),
                          datetime(1997, 10, 20, 0, 0),
                          datetime(1997, 11, 17, 0, 0)])

    def testToStrMonthlyByNWeekDay(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByNWeekDayLarge(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byweekday=(TU(3), TH(-3)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByMonthAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByMonthAndNWeekDay(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByMonthAndNWeekDayLarge(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU(3), TH(-3)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByMonthAndMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByYearDay(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=4,
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=4,
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByMonthAndYearDay(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=4,
                              bymonth=(4, 7),
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByMonthAndYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=4,
                              bymonth=(4, 7),
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByWeekNo(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byweekno=20,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByWeekNoAndWeekDay(self):
        # That's a nice one. The first days of week number one
        # may be in the last year.
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byweekno=1,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByWeekNoAndWeekDayLarge(self):
        # Another nice test. The last days of week number 52/53
        # may be in the next year.
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byweekno=52,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByWeekNoAndWeekDayLast(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byweekno=-1,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByWeekNoAndWeekDay53(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byweekno=53,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByEaster(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byeaster=0,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByEasterPos(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byeaster=1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByEasterNeg(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byeaster=-1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByHour(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byhour=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByMinute(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyBySecond(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByHourAndMinute(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByHourAndSecond(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byhour=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyByHourAndMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMonthlyBySetPos(self):
        self._rrulestr_reverse_test(rrule(MONTHLY,
                              count=3,
                              bymonthday=(13, 17),
                              byhour=(6, 18),
                              bysetpos=(3, -3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeekly(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyInterval(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              interval=2,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyIntervalLarge(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              interval=20,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByMonth(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              bymonth=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByMonthDay(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              bymonthday=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByMonthAndMonthDay(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(5, 7),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByWeekDay(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByNWeekDay(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByMonthAndWeekDay(self):
        # This test is interesting, because it crosses the year
        # boundary in a weekly period to find day '1' as a
        # valid recurrence.
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByMonthAndNWeekDay(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByMonthAndMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByYearDay(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=4,
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=4,
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByMonthAndYearDay(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=4,
                              bymonth=(1, 7),
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByMonthAndYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=4,
                              bymonth=(1, 7),
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByWeekNo(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byweekno=20,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByWeekNoAndWeekDay(self):
        # That's a nice one. The first days of week number one
        # may be in the last year.
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byweekno=1,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByWeekNoAndWeekDayLarge(self):
        # Another nice test. The last days of week number 52/53
        # may be in the next year.
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byweekno=52,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByWeekNoAndWeekDayLast(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byweekno=-1,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByWeekNoAndWeekDay53(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byweekno=53,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByEaster(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byeaster=0,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByEasterPos(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byeaster=1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByEasterNeg(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byeaster=-1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByHour(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byhour=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByMinute(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyBySecond(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByHourAndMinute(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByHourAndSecond(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byhour=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyByHourAndMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrWeeklyBySetPos(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              byweekday=(TU, TH),
                              byhour=(6, 18),
                              bysetpos=(3, -3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDaily(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyInterval(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              interval=2,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyIntervalLarge(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              interval=92,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByMonth(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              bymonth=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByMonthDay(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              bymonthday=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByMonthAndMonthDay(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(5, 7),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByWeekDay(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByNWeekDay(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByMonthAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByMonthAndNWeekDay(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByMonthAndMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByYearDay(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=4,
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=4,
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByMonthAndYearDay(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=4,
                              bymonth=(1, 7),
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByMonthAndYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=4,
                              bymonth=(1, 7),
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByWeekNo(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byweekno=20,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByWeekNoAndWeekDay(self):
        # That's a nice one. The first days of week number one
        # may be in the last year.
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byweekno=1,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByWeekNoAndWeekDayLarge(self):
        # Another nice test. The last days of week number 52/53
        # may be in the next year.
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byweekno=52,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByWeekNoAndWeekDayLast(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byweekno=-1,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByWeekNoAndWeekDay53(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byweekno=53,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByEaster(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byeaster=0,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByEasterPos(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byeaster=1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByEasterNeg(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byeaster=-1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByHour(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byhour=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByMinute(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyBySecond(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByHourAndMinute(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByHourAndSecond(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byhour=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyByHourAndMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrDailyBySetPos(self):
        self._rrulestr_reverse_test(rrule(DAILY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(15, 45),
                              bysetpos=(3, -3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourly(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyInterval(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              interval=2,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyIntervalLarge(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              interval=769,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByMonth(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              bymonth=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByMonthDay(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              bymonthday=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByMonthAndMonthDay(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(5, 7),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByWeekDay(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByNWeekDay(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByMonthAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByMonthAndNWeekDay(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByMonthAndMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByYearDay(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=4,
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=4,
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByMonthAndYearDay(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=4,
                              bymonth=(4, 7),
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByMonthAndYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=4,
                              bymonth=(4, 7),
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByWeekNo(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byweekno=20,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByWeekNoAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byweekno=1,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByWeekNoAndWeekDayLarge(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byweekno=52,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByWeekNoAndWeekDayLast(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byweekno=-1,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByWeekNoAndWeekDay53(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byweekno=53,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByEaster(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byeaster=0,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByEasterPos(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byeaster=1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByEasterNeg(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byeaster=-1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByHour(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byhour=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByMinute(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyBySecond(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByHourAndMinute(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByHourAndSecond(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byhour=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyByHourAndMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrHourlyBySetPos(self):
        self._rrulestr_reverse_test(rrule(HOURLY,
                              count=3,
                              byminute=(15, 45),
                              bysecond=(15, 45),
                              bysetpos=(3, -3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutely(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyInterval(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              interval=2,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyIntervalLarge(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              interval=1501,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByMonth(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              bymonth=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByMonthDay(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              bymonthday=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByMonthAndMonthDay(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(5, 7),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByWeekDay(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByNWeekDay(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByMonthAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByMonthAndNWeekDay(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByMonthAndMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByYearDay(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=4,
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=4,
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByMonthAndYearDay(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=4,
                              bymonth=(4, 7),
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByMonthAndYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=4,
                              bymonth=(4, 7),
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByWeekNo(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byweekno=20,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByWeekNoAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byweekno=1,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByWeekNoAndWeekDayLarge(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byweekno=52,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByWeekNoAndWeekDayLast(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byweekno=-1,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByWeekNoAndWeekDay53(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byweekno=53,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByEaster(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byeaster=0,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByEasterPos(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byeaster=1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByEasterNeg(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byeaster=-1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByHour(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byhour=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByMinute(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyBySecond(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByHourAndMinute(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByHourAndSecond(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byhour=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyByHourAndMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrMinutelyBySetPos(self):
        self._rrulestr_reverse_test(rrule(MINUTELY,
                              count=3,
                              bysecond=(15, 30, 45),
                              bysetpos=(3, -3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondly(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyInterval(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              interval=2,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyIntervalLarge(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              interval=90061,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByMonth(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              bymonth=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByMonthDay(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              bymonthday=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByMonthAndMonthDay(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(5, 7),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByWeekDay(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByNWeekDay(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByMonthAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByMonthAndNWeekDay(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByMonthAndMonthDayAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByYearDay(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=4,
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=4,
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByMonthAndYearDay(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=4,
                              bymonth=(4, 7),
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByMonthAndYearDayNeg(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=4,
                              bymonth=(4, 7),
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByWeekNo(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byweekno=20,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByWeekNoAndWeekDay(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byweekno=1,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByWeekNoAndWeekDayLarge(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byweekno=52,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByWeekNoAndWeekDayLast(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byweekno=-1,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByWeekNoAndWeekDay53(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byweekno=53,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByEaster(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byeaster=0,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByEasterPos(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byeaster=1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByEasterNeg(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byeaster=-1,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByHour(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byhour=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByMinute(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyBySecond(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByHourAndMinute(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByHourAndSecond(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byhour=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByHourAndMinuteAndSecond(self):
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrSecondlyByHourAndMinuteAndSecondBug(self):
        # This explores a bug found by Mathieu Bridon.
        self._rrulestr_reverse_test(rrule(SECONDLY,
                              count=3,
                              bysecond=(0,),
                              byminute=(1,),
                              dtstart=datetime(2010, 3, 22, 12, 1)))

    def testToStrWithWkSt(self):
        self._rrulestr_reverse_test(rrule(WEEKLY,
                              count=3,
                              wkst=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0)))

    def testToStrLongIntegers(self):
        if PY2:  # There are no longs in python3
            self._rrulestr_reverse_test(rrule(MINUTELY,
                                  count=long(2),
                                  interval=long(2),
                                  bymonth=long(2),
                                  byweekday=long(3),
                                  byhour=long(6),
                                  byminute=long(6),
                                  bysecond=long(6),
                                  dtstart=datetime(1997, 9, 2, 9, 0)))

            self._rrulestr_reverse_test(rrule(YEARLY,
                                  count=long(2),
                                  bymonthday=long(5),
                                  byweekno=long(2),
                                  dtstart=datetime(1997, 9, 2, 9, 0)))

    def testReplaceIfSet(self):
        rr = rrule(YEARLY,
                   count=1,
                   bymonthday=5,
                   dtstart=datetime(1997, 1, 1))
        newrr = rr.replace(bymonthday=6)
        self.assertEqual(list(rr), [datetime(1997, 1, 5)])
        self.assertEqual(list(newrr),
                             [datetime(1997, 1, 6)])

    def testReplaceIfNotSet(self):
        rr = rrule(YEARLY,
           count=1,
           dtstart=datetime(1997, 1, 1))
        newrr = rr.replace(bymonthday=6)
        self.assertEqual(list(rr), [datetime(1997, 1, 1)])
        self.assertEqual(list(newrr),
                             [datetime(1997, 1, 6)])


@pytest.mark.rrule
@freeze_time(datetime(2018, 3, 6, 5, 36, tzinfo=tz.UTC))
def test_generated_aware_dtstart():
    dtstart_exp = datetime(2018, 3, 6, 5, 36, tzinfo=tz.UTC)
    UNTIL = datetime(2018, 3, 6, 8, 0, tzinfo=tz.UTC)

    rule_without_dtstart = rrule(freq=HOURLY, until=UNTIL)
    rule_with_dtstart = rrule(freq=HOURLY, dtstart=dtstart_exp, until=UNTIL)
    assert list(rule_without_dtstart) == list(rule_with_dtstart)


@pytest.mark.rrule
@pytest.mark.rrulestr
@pytest.mark.xfail(reason="rrulestr loses time zone, gh issue #637")
@freeze_time(datetime(2018, 3, 6, 5, 36, tzinfo=tz.UTC))
def test_generated_aware_dtstart_rrulestr():
    rrule_without_dtstart = rrule(freq=HOURLY,
                                  until=datetime(2018, 3, 6, 8, 0,
                                                 tzinfo=tz.UTC))
    rrule_r = rrulestr(str(rrule_without_dtstart))

    assert list(rrule_r) == list(rrule_without_dtstart)


@pytest.mark.rruleset
class RRuleSetTest(unittest.TestCase):
    def testSet(self):
        rrset = rruleset()
        rrset.rrule(rrule(YEARLY, count=2, byweekday=TU,
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        rrset.rrule(rrule(YEARLY, count=1, byweekday=TH,
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        self.assertEqual(list(rrset),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 4, 9, 0),
                          datetime(1997, 9, 9, 9, 0)])

    def testSetDate(self):
        rrset = rruleset()
        rrset.rrule(rrule(YEARLY, count=1, byweekday=TU,
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        rrset.rdate(datetime(1997, 9, 4, 9))
        rrset.rdate(datetime(1997, 9, 9, 9))
        self.assertEqual(list(rrset),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 4, 9, 0),
                          datetime(1997, 9, 9, 9, 0)])

    def testSetExRule(self):
        rrset = rruleset()
        rrset.rrule(rrule(YEARLY, count=6, byweekday=(TU, TH),
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        rrset.exrule(rrule(YEARLY, count=3, byweekday=TH,
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        self.assertEqual(list(rrset),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 9, 9, 0),
                          datetime(1997, 9, 16, 9, 0)])

    def testSetExDate(self):
        rrset = rruleset()
        rrset.rrule(rrule(YEARLY, count=6, byweekday=(TU, TH),
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        rrset.exdate(datetime(1997, 9, 4, 9))
        rrset.exdate(datetime(1997, 9, 11, 9))
        rrset.exdate(datetime(1997, 9, 18, 9))
        self.assertEqual(list(rrset),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 9, 9, 0),
                          datetime(1997, 9, 16, 9, 0)])

    def testSetExDateRevOrder(self):
        rrset = rruleset()
        rrset.rrule(rrule(MONTHLY, count=5, bymonthday=10,
                          dtstart=datetime(2004, 1, 1, 9, 0)))
        rrset.exdate(datetime(2004, 4, 10, 9, 0))
        rrset.exdate(datetime(2004, 2, 10, 9, 0))
        self.assertEqual(list(rrset),
                         [datetime(2004, 1, 10, 9, 0),
                          datetime(2004, 3, 10, 9, 0),
                          datetime(2004, 5, 10, 9, 0)])

    def testSetDateAndExDate(self):
        rrset = rruleset()
        rrset.rdate(datetime(1997, 9, 2, 9))
        rrset.rdate(datetime(1997, 9, 4, 9))
        rrset.rdate(datetime(1997, 9, 9, 9))
        rrset.rdate(datetime(1997, 9, 11, 9))
        rrset.rdate(datetime(1997, 9, 16, 9))
        rrset.rdate(datetime(1997, 9, 18, 9))
        rrset.exdate(datetime(1997, 9, 4, 9))
        rrset.exdate(datetime(1997, 9, 11, 9))
        rrset.exdate(datetime(1997, 9, 18, 9))
        self.assertEqual(list(rrset),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 9, 9, 0),
                          datetime(1997, 9, 16, 9, 0)])

    def testSetDateAndExRule(self):
        rrset = rruleset()
        rrset.rdate(datetime(1997, 9, 2, 9))
        rrset.rdate(datetime(1997, 9, 4, 9))
        rrset.rdate(datetime(1997, 9, 9, 9))
        rrset.rdate(datetime(1997, 9, 11, 9))
        rrset.rdate(datetime(1997, 9, 16, 9))
        rrset.rdate(datetime(1997, 9, 18, 9))
        rrset.exrule(rrule(YEARLY, count=3, byweekday=TH,
                           dtstart=datetime(1997, 9, 2, 9, 0)))
        self.assertEqual(list(rrset),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 9, 9, 0),
                          datetime(1997, 9, 16, 9, 0)])

    def testSetCount(self):
        rrset = rruleset()
        rrset.rrule(rrule(YEARLY, count=6, byweekday=(TU, TH),
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        rrset.exrule(rrule(YEARLY, count=3, byweekday=TH,
                           dtstart=datetime(1997, 9, 2, 9, 0)))
        self.assertEqual(rrset.count(), 3)

    def testSetCachePre(self):
        rrset = rruleset()
        rrset.rrule(rrule(YEARLY, count=2, byweekday=TU,
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        rrset.rrule(rrule(YEARLY, count=1, byweekday=TH,
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        self.assertEqual(list(rrset),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 4, 9, 0),
                          datetime(1997, 9, 9, 9, 0)])

    def testSetCachePost(self):
        rrset = rruleset(cache=True)
        rrset.rrule(rrule(YEARLY, count=2, byweekday=TU,
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        rrset.rrule(rrule(YEARLY, count=1, byweekday=TH,
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        for x in rrset: pass
        self.assertEqual(list(rrset),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 4, 9, 0),
                          datetime(1997, 9, 9, 9, 0)])

    def testSetCachePostInternal(self):
        rrset = rruleset(cache=True)
        rrset.rrule(rrule(YEARLY, count=2, byweekday=TU,
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        rrset.rrule(rrule(YEARLY, count=1, byweekday=TH,
                          dtstart=datetime(1997, 9, 2, 9, 0)))
        for x in rrset: pass
        self.assertEqual(list(rrset._cache),
                         [datetime(1997, 9, 2, 9, 0),
                          datetime(1997, 9, 4, 9, 0),
                          datetime(1997, 9, 9, 9, 0)])

    def testSetRRuleCount(self):
        # Test that the count is updated when an rrule is added
        rrset = rruleset(cache=False)
        for cache in (True, False):
            rrset = rruleset(cache=cache)
            rrset.rrule(rrule(YEARLY, count=2, byweekday=TH,
                              dtstart=datetime(1983, 4, 1)))
            rrset.rrule(rrule(WEEKLY, count=4, byweekday=FR,
                              dtstart=datetime(1991, 6, 3)))

            # Check the length twice - first one sets a cache, second reads it
            self.assertEqual(rrset.count(), 6)
            self.assertEqual(rrset.count(), 6)

            # This should invalidate the cache and force an update
            rrset.rrule(rrule(MONTHLY, count=3, dtstart=datetime(1994, 1, 3)))

            self.assertEqual(rrset.count(), 9)
            self.assertEqual(rrset.count(), 9)

    def testSetRDateCount(self):
        # Test that the count is updated when an rdate is added
        rrset = rruleset(cache=False)
        for cache in (True, False):
            rrset = rruleset(cache=cache)
            rrset.rrule(rrule(YEARLY, count=2, byweekday=TH,
                              dtstart=datetime(1983, 4, 1)))
            rrset.rrule(rrule(WEEKLY, count=4, byweekday=FR,
                              dtstart=datetime(1991, 6, 3)))

            # Check the length twice - first one sets a cache, second reads it
            self.assertEqual(rrset.count(), 6)
            self.assertEqual(rrset.count(), 6)

            # This should invalidate the cache and force an update
            rrset.rdate(datetime(1993, 2, 14))

            self.assertEqual(rrset.count(), 7)
            self.assertEqual(rrset.count(), 7)

    def testSetExRuleCount(self):
        # Test that the count is updated when an exrule is added
        rrset = rruleset(cache=False)
        for cache in (True, False):
            rrset = rruleset(cache=cache)
            rrset.rrule(rrule(YEARLY, count=2, byweekday=TH,
                              dtstart=datetime(1983, 4, 1)))
            rrset.rrule(rrule(WEEKLY, count=4, byweekday=FR,
                              dtstart=datetime(1991, 6, 3)))

            # Check the length twice - first one sets a cache, second reads it
            self.assertEqual(rrset.count(), 6)
            self.assertEqual(rrset.count(), 6)

            # This should invalidate the cache and force an update
            rrset.exrule(rrule(WEEKLY, count=2, interval=2,
                               dtstart=datetime(1991, 6, 14)))

            self.assertEqual(rrset.count(), 4)
            self.assertEqual(rrset.count(), 4)

    def testSetExDateCount(self):
        # Test that the count is updated when an rdate is added
        for cache in (True, False):
            rrset = rruleset(cache=cache)
            rrset.rrule(rrule(YEARLY, count=2, byweekday=TH,
                              dtstart=datetime(1983, 4, 1)))
            rrset.rrule(rrule(WEEKLY, count=4, byweekday=FR,
                              dtstart=datetime(1991, 6, 3)))

            # Check the length twice - first one sets a cache, second reads it
            self.assertEqual(rrset.count(), 6)
            self.assertEqual(rrset.count(), 6)

            # This should invalidate the cache and force an update
            rrset.exdate(datetime(1991, 6, 28))

            self.assertEqual(rrset.count(), 5)
            self.assertEqual(rrset.count(), 5)


class WeekdayTest(unittest.TestCase):
    def testInvalidNthWeekday(self):
        with self.assertRaises(ValueError):
            FR(0)

    def testWeekdayCallable(self):
        # Calling a weekday instance generates a new weekday instance with the
        # value of n changed.
        from dateutil.rrule import weekday
        self.assertEqual(MO(1), weekday(0, 1))

        # Calling a weekday instance with the identical n returns the original
        # object
        FR_3 = weekday(4, 3)
        self.assertIs(FR_3(3), FR_3)

    def testWeekdayEquality(self):
        # Two weekday objects are not equal if they have different values for n
        self.assertNotEqual(TH, TH(-1))
        self.assertNotEqual(SA(3), SA(2))

    def testWeekdayEqualitySubclass(self):
        # Two weekday objects equal if their "weekday" and "n" attributes are
        # available and the same
        class BasicWeekday(object):
            def __init__(self, weekday):
                self.weekday = weekday

        class BasicNWeekday(BasicWeekday):
            def __init__(self, weekday, n=None):
                super(BasicNWeekday, self).__init__(weekday)
                self.n = n

        MO_Basic = BasicWeekday(0)

        self.assertNotEqual(MO, MO_Basic)
        self.assertNotEqual(MO(1), MO_Basic)

        TU_BasicN = BasicNWeekday(1)

        self.assertEqual(TU, TU_BasicN)
        self.assertNotEqual(TU(3), TU_BasicN)

        WE_Basic3 = BasicNWeekday(2, 3)
        self.assertEqual(WE(3), WE_Basic3)
        self.assertNotEqual(WE(2), WE_Basic3)

    def testWeekdayReprNoN(self):
        no_n_reprs = ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU')
        no_n_wdays = (MO, TU, WE, TH, FR, SA, SU)

        for repstr, wday in zip(no_n_reprs, no_n_wdays):
            self.assertEqual(repr(wday), repstr)

    def testWeekdayReprWithN(self):
        with_n_reprs = ('WE(+1)', 'TH(-2)', 'SU(+3)')
        with_n_wdays = (WE(1), TH(-2), SU(+3))

        for repstr, wday in zip(with_n_reprs, with_n_wdays):
            self.assertEqual(repr(wday), repstr)