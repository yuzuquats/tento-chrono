def testYearlyByEaster(self):
    self.assertEqual(list(rrule(YEARLY,
                            count=3,
                            byeaster=0,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 12, 9, 0),
                        datetime(1999, 4, 4, 9, 0),
                        datetime(2000, 4, 23, 9, 0)])

def testYearlyByEasterPos(self):
    self.assertEqual(list(rrule(YEARLY,
                            count=3,
                            byeaster=1,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 13, 9, 0),
                        datetime(1999, 4, 5, 9, 0),
                        datetime(2000, 4, 24, 9, 0)])

def testYearlyByEasterNeg(self):
    self.assertEqual(list(rrule(YEARLY,
                            count=3,
                            byeaster=-1,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 11, 9, 0),
                        datetime(1999, 4, 3, 9, 0),
                        datetime(2000, 4, 22, 9, 0)])

# Third Monday of the month
def testMonthlyByNWeekDayMO(self):
    self.assertEqual(rrule(MONTHLY,
                        byweekday=(MO(+3)),
                        dtstart=datetime(1997, 9, 1)).between(datetime(1997, 9, 1),
                                                            datetime(1997, 12, 1)),
                        [datetime(1997, 9, 15, 0, 0),
                        datetime(1997, 10, 20, 0, 0),
                        datetime(1997, 11, 17, 0, 0)])

def testMonthlyByEaster(self):
    self.assertEqual(list(rrule(MONTHLY,
                            count=3,
                            byeaster=0,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 12, 9, 0),
                        datetime(1999, 4, 4, 9, 0),
                        datetime(2000, 4, 23, 9, 0)])

def testMonthlyByEasterPos(self):
    self.assertEqual(list(rrule(MONTHLY,
                            count=3,
                            byeaster=1,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 13, 9, 0),
                        datetime(1999, 4, 5, 9, 0),
                        datetime(2000, 4, 24, 9, 0)])

def testMonthlyByEasterNeg(self):
    self.assertEqual(list(rrule(MONTHLY,
                            count=3,
                            byeaster=-1,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 11, 9, 0),
                        datetime(1999, 4, 3, 9, 0),
                        datetime(2000, 4, 22, 9, 0)])

def testWeeklyByEaster(self):
    self.assertEqual(list(rrule(WEEKLY,
                            count=3,
                            byeaster=0,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 12, 9, 0),
                        datetime(1999, 4, 4, 9, 0),
                        datetime(2000, 4, 23, 9, 0)])

def testWeeklyByEasterPos(self):
    self.assertEqual(list(rrule(WEEKLY,
                            count=3,
                            byeaster=1,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 13, 9, 0),
                        datetime(1999, 4, 5, 9, 0),
                        datetime(2000, 4, 24, 9, 0)])

def testWeeklyByEasterNeg(self):
    self.assertEqual(list(rrule(WEEKLY,
                            count=3,
                            byeaster=-1,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 11, 9, 0),
                        datetime(1999, 4, 3, 9, 0),
                        datetime(2000, 4, 22, 9, 0)])


def testDailyByEaster(self):
    self.assertEqual(list(rrule(DAILY,
                            count=3,
                            byeaster=0,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 12, 9, 0),
                        datetime(1999, 4, 4, 9, 0),
                        datetime(2000, 4, 23, 9, 0)])

def testDailyByEasterPos(self):
    self.assertEqual(list(rrule(DAILY,
                            count=3,
                            byeaster=1,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 13, 9, 0),
                        datetime(1999, 4, 5, 9, 0),
                        datetime(2000, 4, 24, 9, 0)])

def testDailyByEasterNeg(self):
    self.assertEqual(list(rrule(DAILY,
                            count=3,
                            byeaster=-1,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 11, 9, 0),
                        datetime(1999, 4, 3, 9, 0),
                        datetime(2000, 4, 22, 9, 0)])

def testDailyByHour(self):
    self.assertEqual(list(rrule(DAILY,
                            count=3,
                            byhour=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 18, 0),
                        datetime(1997, 9, 3, 6, 0),
                        datetime(1997, 9, 3, 18, 0)])

def testDailyByMinute(self):
    self.assertEqual(list(rrule(DAILY,
                            count=3,
                            byminute=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 6),
                        datetime(1997, 9, 2, 9, 18),
                        datetime(1997, 9, 3, 9, 6)])

def testDailyBySecond(self):
    self.assertEqual(list(rrule(DAILY,
                            count=3,
                            bysecond=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0, 6),
                        datetime(1997, 9, 2, 9, 0, 18),
                        datetime(1997, 9, 3, 9, 0, 6)])

def testDailyByHourAndMinute(self):
    self.assertEqual(list(rrule(DAILY,
                            count=3,
                            byhour=(6, 18),
                            byminute=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 18, 6),
                        datetime(1997, 9, 2, 18, 18),
                        datetime(1997, 9, 3, 6, 6)])

def testDailyByHourAndSecond(self):
    self.assertEqual(list(rrule(DAILY,
                            count=3,
                            byhour=(6, 18),
                            bysecond=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 18, 0, 6),
                        datetime(1997, 9, 2, 18, 0, 18),
                        datetime(1997, 9, 3, 6, 0, 6)])

def testDailyByMinuteAndSecond(self):
    self.assertEqual(list(rrule(DAILY,
                            count=3,
                            byminute=(6, 18),
                            bysecond=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 6, 6),
                        datetime(1997, 9, 2, 9, 6, 18),
                        datetime(1997, 9, 2, 9, 18, 6)])

def testDailyByHourAndMinuteAndSecond(self):
    self.assertEqual(list(rrule(DAILY,
                            count=3,
                            byhour=(6, 18),
                            byminute=(6, 18),
                            bysecond=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 18, 6, 6),
                        datetime(1997, 9, 2, 18, 6, 18),
                        datetime(1997, 9, 2, 18, 18, 6)])

def testDailyBySetPos(self):
    self.assertEqual(list(rrule(DAILY,
                            count=3,
                            byhour=(6, 18),
                            byminute=(15, 45),
                            bysetpos=(3, -3),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 18, 15),
                        datetime(1997, 9, 3, 6, 45),
                        datetime(1997, 9, 3, 18, 15)])

def testHourly(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0),
                        datetime(1997, 9, 2, 10, 0),
                        datetime(1997, 9, 2, 11, 0)])

def testHourlyInterval(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            interval=2,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0),
                        datetime(1997, 9, 2, 11, 0),
                        datetime(1997, 9, 2, 13, 0)])

def testHourlyIntervalLarge(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            interval=769,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0),
                        datetime(1997, 10, 4, 10, 0),
                        datetime(1997, 11, 5, 11, 0)])

def testHourlyByMonth(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            bymonth=(1, 3),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 1, 1, 0, 0),
                        datetime(1998, 1, 1, 1, 0),
                        datetime(1998, 1, 1, 2, 0)])

def testHourlyByMonthDay(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            bymonthday=(1, 3),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 3, 0, 0),
                        datetime(1997, 9, 3, 1, 0),
                        datetime(1997, 9, 3, 2, 0)])

def testHourlyByMonthAndMonthDay(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            bymonth=(1, 3),
                            bymonthday=(5, 7),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 1, 5, 0, 0),
                        datetime(1998, 1, 5, 1, 0),
                        datetime(1998, 1, 5, 2, 0)])

def testHourlyByWeekDay(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byweekday=(TU, TH),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0),
                        datetime(1997, 9, 2, 10, 0),
                        datetime(1997, 9, 2, 11, 0)])

def testHourlyByNWeekDay(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byweekday=(TU(1), TH(-1)),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0),
                        datetime(1997, 9, 2, 10, 0),
                        datetime(1997, 9, 2, 11, 0)])

def testHourlyByMonthAndWeekDay(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            bymonth=(1, 3),
                            byweekday=(TU, TH),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 1, 1, 0, 0),
                        datetime(1998, 1, 1, 1, 0),
                        datetime(1998, 1, 1, 2, 0)])

def testHourlyByMonthAndNWeekDay(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            bymonth=(1, 3),
                            byweekday=(TU(1), TH(-1)),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 1, 1, 0, 0),
                        datetime(1998, 1, 1, 1, 0),
                        datetime(1998, 1, 1, 2, 0)])

def testHourlyByMonthDayAndWeekDay(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            bymonthday=(1, 3),
                            byweekday=(TU, TH),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 1, 1, 0, 0),
                        datetime(1998, 1, 1, 1, 0),
                        datetime(1998, 1, 1, 2, 0)])

def testHourlyByMonthAndMonthDayAndWeekDay(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            bymonth=(1, 3),
                            bymonthday=(1, 3),
                            byweekday=(TU, TH),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 1, 1, 0, 0),
                        datetime(1998, 1, 1, 1, 0),
                        datetime(1998, 1, 1, 2, 0)])

def testHourlyByYearDay(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=4,
                            byyearday=(1, 100, 200, 365),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 12, 31, 0, 0),
                        datetime(1997, 12, 31, 1, 0),
                        datetime(1997, 12, 31, 2, 0),
                        datetime(1997, 12, 31, 3, 0)])

def testHourlyByYearDayNeg(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=4,
                            byyearday=(-365, -266, -166, -1),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 12, 31, 0, 0),
                        datetime(1997, 12, 31, 1, 0),
                        datetime(1997, 12, 31, 2, 0),
                        datetime(1997, 12, 31, 3, 0)])

def testHourlyByMonthAndYearDay(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=4,
                            bymonth=(4, 7),
                            byyearday=(1, 100, 200, 365),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 10, 0, 0),
                        datetime(1998, 4, 10, 1, 0),
                        datetime(1998, 4, 10, 2, 0),
                        datetime(1998, 4, 10, 3, 0)])

def testHourlyByMonthAndYearDayNeg(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=4,
                            bymonth=(4, 7),
                            byyearday=(-365, -266, -166, -1),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 10, 0, 0),
                        datetime(1998, 4, 10, 1, 0),
                        datetime(1998, 4, 10, 2, 0),
                        datetime(1998, 4, 10, 3, 0)])

def testHourlyByWeekNo(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byweekno=20,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 5, 11, 0, 0),
                        datetime(1998, 5, 11, 1, 0),
                        datetime(1998, 5, 11, 2, 0)])

def testHourlyByWeekNoAndWeekDay(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byweekno=1,
                            byweekday=MO,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 12, 29, 0, 0),
                        datetime(1997, 12, 29, 1, 0),
                        datetime(1997, 12, 29, 2, 0)])

def testHourlyByWeekNoAndWeekDayLarge(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byweekno=52,
                            byweekday=SU,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 12, 28, 0, 0),
                        datetime(1997, 12, 28, 1, 0),
                        datetime(1997, 12, 28, 2, 0)])

def testHourlyByWeekNoAndWeekDayLast(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byweekno=-1,
                            byweekday=SU,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 12, 28, 0, 0),
                        datetime(1997, 12, 28, 1, 0),
                        datetime(1997, 12, 28, 2, 0)])

def testHourlyByWeekNoAndWeekDay53(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byweekno=53,
                            byweekday=MO,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 12, 28, 0, 0),
                        datetime(1998, 12, 28, 1, 0),
                        datetime(1998, 12, 28, 2, 0)])

def testHourlyByEaster(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byeaster=0,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 12, 0, 0),
                        datetime(1998, 4, 12, 1, 0),
                        datetime(1998, 4, 12, 2, 0)])

def testHourlyByEasterPos(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byeaster=1,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 13, 0, 0),
                        datetime(1998, 4, 13, 1, 0),
                        datetime(1998, 4, 13, 2, 0)])

def testHourlyByEasterNeg(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byeaster=-1,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 11, 0, 0),
                        datetime(1998, 4, 11, 1, 0),
                        datetime(1998, 4, 11, 2, 0)])

def testHourlyByHour(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byhour=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 18, 0),
                        datetime(1997, 9, 3, 6, 0),
                        datetime(1997, 9, 3, 18, 0)])

def testHourlyByMinute(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byminute=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 6),
                        datetime(1997, 9, 2, 9, 18),
                        datetime(1997, 9, 2, 10, 6)])

def testHourlyBySecond(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            bysecond=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0, 6),
                        datetime(1997, 9, 2, 9, 0, 18),
                        datetime(1997, 9, 2, 10, 0, 6)])

def testHourlyByHourAndMinute(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byhour=(6, 18),
                            byminute=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 18, 6),
                        datetime(1997, 9, 2, 18, 18),
                        datetime(1997, 9, 3, 6, 6)])

def testHourlyByHourAndSecond(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byhour=(6, 18),
                            bysecond=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 18, 0, 6),
                        datetime(1997, 9, 2, 18, 0, 18),
                        datetime(1997, 9, 3, 6, 0, 6)])

def testHourlyByMinuteAndSecond(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byminute=(6, 18),
                            bysecond=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 6, 6),
                        datetime(1997, 9, 2, 9, 6, 18),
                        datetime(1997, 9, 2, 9, 18, 6)])

def testHourlyByHourAndMinuteAndSecond(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byhour=(6, 18),
                            byminute=(6, 18),
                            bysecond=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 18, 6, 6),
                        datetime(1997, 9, 2, 18, 6, 18),
                        datetime(1997, 9, 2, 18, 18, 6)])

def testHourlyBySetPos(self):
    self.assertEqual(list(rrule(HOURLY,
                            count=3,
                            byminute=(15, 45),
                            bysecond=(15, 45),
                            bysetpos=(3, -3),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 15, 45),
                        datetime(1997, 9, 2, 9, 45, 15),
                        datetime(1997, 9, 2, 10, 15, 45)])

def testMinutely(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0),
                        datetime(1997, 9, 2, 9, 1),
                        datetime(1997, 9, 2, 9, 2)])

def testMinutelyInterval(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            interval=2,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0),
                        datetime(1997, 9, 2, 9, 2),
                        datetime(1997, 9, 2, 9, 4)])

def testMinutelyIntervalLarge(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            interval=1501,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0),
                        datetime(1997, 9, 3, 10, 1),
                        datetime(1997, 9, 4, 11, 2)])

def testMinutelyByMonth(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            bymonth=(1, 3),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 1, 1, 0, 0),
                        datetime(1998, 1, 1, 0, 1),
                        datetime(1998, 1, 1, 0, 2)])

def testMinutelyByMonthDay(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            bymonthday=(1, 3),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 3, 0, 0),
                        datetime(1997, 9, 3, 0, 1),
                        datetime(1997, 9, 3, 0, 2)])

def testMinutelyByMonthAndMonthDay(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            bymonth=(1, 3),
                            bymonthday=(5, 7),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 1, 5, 0, 0),
                        datetime(1998, 1, 5, 0, 1),
                        datetime(1998, 1, 5, 0, 2)])

def testMinutelyByWeekDay(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byweekday=(TU, TH),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0),
                        datetime(1997, 9, 2, 9, 1),
                        datetime(1997, 9, 2, 9, 2)])

def testMinutelyByNWeekDay(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byweekday=(TU(1), TH(-1)),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0),
                        datetime(1997, 9, 2, 9, 1),
                        datetime(1997, 9, 2, 9, 2)])

def testMinutelyByMonthAndWeekDay(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            bymonth=(1, 3),
                            byweekday=(TU, TH),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 1, 1, 0, 0),
                        datetime(1998, 1, 1, 0, 1),
                        datetime(1998, 1, 1, 0, 2)])

def testMinutelyByMonthAndNWeekDay(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            bymonth=(1, 3),
                            byweekday=(TU(1), TH(-1)),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 1, 1, 0, 0),
                        datetime(1998, 1, 1, 0, 1),
                        datetime(1998, 1, 1, 0, 2)])

def testMinutelyByMonthDayAndWeekDay(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            bymonthday=(1, 3),
                            byweekday=(TU, TH),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 1, 1, 0, 0),
                        datetime(1998, 1, 1, 0, 1),
                        datetime(1998, 1, 1, 0, 2)])

def testMinutelyByMonthAndMonthDayAndWeekDay(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            bymonth=(1, 3),
                            bymonthday=(1, 3),
                            byweekday=(TU, TH),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 1, 1, 0, 0),
                        datetime(1998, 1, 1, 0, 1),
                        datetime(1998, 1, 1, 0, 2)])

def testMinutelyByYearDay(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=4,
                            byyearday=(1, 100, 200, 365),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 12, 31, 0, 0),
                        datetime(1997, 12, 31, 0, 1),
                        datetime(1997, 12, 31, 0, 2),
                        datetime(1997, 12, 31, 0, 3)])

def testMinutelyByYearDayNeg(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=4,
                            byyearday=(-365, -266, -166, -1),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 12, 31, 0, 0),
                        datetime(1997, 12, 31, 0, 1),
                        datetime(1997, 12, 31, 0, 2),
                        datetime(1997, 12, 31, 0, 3)])

def testMinutelyByMonthAndYearDay(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=4,
                            bymonth=(4, 7),
                            byyearday=(1, 100, 200, 365),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 10, 0, 0),
                        datetime(1998, 4, 10, 0, 1),
                        datetime(1998, 4, 10, 0, 2),
                        datetime(1998, 4, 10, 0, 3)])

def testMinutelyByMonthAndYearDayNeg(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=4,
                            bymonth=(4, 7),
                            byyearday=(-365, -266, -166, -1),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 10, 0, 0),
                        datetime(1998, 4, 10, 0, 1),
                        datetime(1998, 4, 10, 0, 2),
                        datetime(1998, 4, 10, 0, 3)])

def testMinutelyByWeekNo(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byweekno=20,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 5, 11, 0, 0),
                        datetime(1998, 5, 11, 0, 1),
                        datetime(1998, 5, 11, 0, 2)])

def testMinutelyByWeekNoAndWeekDay(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byweekno=1,
                            byweekday=MO,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 12, 29, 0, 0),
                        datetime(1997, 12, 29, 0, 1),
                        datetime(1997, 12, 29, 0, 2)])

def testMinutelyByWeekNoAndWeekDayLarge(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byweekno=52,
                            byweekday=SU,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 12, 28, 0, 0),
                        datetime(1997, 12, 28, 0, 1),
                        datetime(1997, 12, 28, 0, 2)])

def testMinutelyByWeekNoAndWeekDayLast(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byweekno=-1,
                            byweekday=SU,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 12, 28, 0, 0),
                        datetime(1997, 12, 28, 0, 1),
                        datetime(1997, 12, 28, 0, 2)])

def testMinutelyByWeekNoAndWeekDay53(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byweekno=53,
                            byweekday=MO,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 12, 28, 0, 0),
                        datetime(1998, 12, 28, 0, 1),
                        datetime(1998, 12, 28, 0, 2)])

def testMinutelyByEaster(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byeaster=0,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 12, 0, 0),
                        datetime(1998, 4, 12, 0, 1),
                        datetime(1998, 4, 12, 0, 2)])

def testMinutelyByEasterPos(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byeaster=1,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 13, 0, 0),
                        datetime(1998, 4, 13, 0, 1),
                        datetime(1998, 4, 13, 0, 2)])

def testMinutelyByEasterNeg(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byeaster=-1,
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1998, 4, 11, 0, 0),
                        datetime(1998, 4, 11, 0, 1),
                        datetime(1998, 4, 11, 0, 2)])

def testMinutelyByHour(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byhour=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 18, 0),
                        datetime(1997, 9, 2, 18, 1),
                        datetime(1997, 9, 2, 18, 2)])

def testMinutelyByMinute(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byminute=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 6),
                        datetime(1997, 9, 2, 9, 18),
                        datetime(1997, 9, 2, 10, 6)])

def testMinutelyBySecond(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            bysecond=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 9, 0, 6),
                        datetime(1997, 9, 2, 9, 0, 18),
                        datetime(1997, 9, 2, 9, 1, 6)])

def testMinutelyByHourAndMinute(self):
    self.assertEqual(list(rrule(MINUTELY,
                            count=3,
                            byhour=(6, 18),
                            byminute=(6, 18),
                            dtstart=datetime(1997, 9, 2, 9, 0))),
                        [datetime(1997, 9, 2, 18, 6),
                        datetime(1997, 9, 2, 18, 18),
                        datetime(1997, 9, 3, 6, 6)])

def testMinutelyByHourAndSecond(self):
    self.assertEqual(list(rrule(MINUTELY,
                              count=3,
                              byhour=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 18, 0, 6),
                          datetime(1997, 9, 2, 18, 0, 18),
                          datetime(1997, 9, 2, 18, 1, 6)])

    def testMinutelyByMinuteAndSecond(self):
        self.assertEqual(list(rrule(MINUTELY,
                              count=3,
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 6, 6),
                          datetime(1997, 9, 2, 9, 6, 18),
                          datetime(1997, 9, 2, 9, 18, 6)])

    def testMinutelyByHourAndMinuteAndSecond(self):
        self.assertEqual(list(rrule(MINUTELY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 18, 6, 6),
                          datetime(1997, 9, 2, 18, 6, 18),
                          datetime(1997, 9, 2, 18, 18, 6)])

    def testMinutelyBySetPos(self):
        self.assertEqual(list(rrule(MINUTELY,
                              count=3,
                              bysecond=(15, 30, 45),
                              bysetpos=(3, -3),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 0, 15),
                          datetime(1997, 9, 2, 9, 0, 45),
                          datetime(1997, 9, 2, 9, 1, 15)])

    def testSecondly(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 0, 0),
                          datetime(1997, 9, 2, 9, 0, 1),
                          datetime(1997, 9, 2, 9, 0, 2)])

    def testSecondlyInterval(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              interval=2,
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 0, 0),
                          datetime(1997, 9, 2, 9, 0, 2),
                          datetime(1997, 9, 2, 9, 0, 4)])

    def testSecondlyIntervalLarge(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              interval=90061,
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 0, 0),
                          datetime(1997, 9, 3, 10, 1, 1),
                          datetime(1997, 9, 4, 11, 2, 2)])

    def testSecondlyByMonth(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              bymonth=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 1, 1, 0, 0, 0),
                          datetime(1998, 1, 1, 0, 0, 1),
                          datetime(1998, 1, 1, 0, 0, 2)])

    def testSecondlyByMonthDay(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              bymonthday=(1, 3),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 3, 0, 0, 0),
                          datetime(1997, 9, 3, 0, 0, 1),
                          datetime(1997, 9, 3, 0, 0, 2)])

    def testSecondlyByMonthAndMonthDay(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(5, 7),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 1, 5, 0, 0, 0),
                          datetime(1998, 1, 5, 0, 0, 1),
                          datetime(1998, 1, 5, 0, 0, 2)])

    def testSecondlyByWeekDay(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 0, 0),
                          datetime(1997, 9, 2, 9, 0, 1),
                          datetime(1997, 9, 2, 9, 0, 2)])

    def testSecondlyByNWeekDay(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 0, 0),
                          datetime(1997, 9, 2, 9, 0, 1),
                          datetime(1997, 9, 2, 9, 0, 2)])

    def testSecondlyByMonthAndWeekDay(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 1, 1, 0, 0, 0),
                          datetime(1998, 1, 1, 0, 0, 1),
                          datetime(1998, 1, 1, 0, 0, 2)])

    def testSecondlyByMonthAndNWeekDay(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              bymonth=(1, 3),
                              byweekday=(TU(1), TH(-1)),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 1, 1, 0, 0, 0),
                          datetime(1998, 1, 1, 0, 0, 1),
                          datetime(1998, 1, 1, 0, 0, 2)])

    def testSecondlyByMonthDayAndWeekDay(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 1, 1, 0, 0, 0),
                          datetime(1998, 1, 1, 0, 0, 1),
                          datetime(1998, 1, 1, 0, 0, 2)])

    def testSecondlyByMonthAndMonthDayAndWeekDay(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              bymonth=(1, 3),
                              bymonthday=(1, 3),
                              byweekday=(TU, TH),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 1, 1, 0, 0, 0),
                          datetime(1998, 1, 1, 0, 0, 1),
                          datetime(1998, 1, 1, 0, 0, 2)])

    def testSecondlyByYearDay(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=4,
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 12, 31, 0, 0, 0),
                          datetime(1997, 12, 31, 0, 0, 1),
                          datetime(1997, 12, 31, 0, 0, 2),
                          datetime(1997, 12, 31, 0, 0, 3)])

    def testSecondlyByYearDayNeg(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=4,
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 12, 31, 0, 0, 0),
                          datetime(1997, 12, 31, 0, 0, 1),
                          datetime(1997, 12, 31, 0, 0, 2),
                          datetime(1997, 12, 31, 0, 0, 3)])

    def testSecondlyByMonthAndYearDay(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=4,
                              bymonth=(4, 7),
                              byyearday=(1, 100, 200, 365),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 4, 10, 0, 0, 0),
                          datetime(1998, 4, 10, 0, 0, 1),
                          datetime(1998, 4, 10, 0, 0, 2),
                          datetime(1998, 4, 10, 0, 0, 3)])

    def testSecondlyByMonthAndYearDayNeg(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=4,
                              bymonth=(4, 7),
                              byyearday=(-365, -266, -166, -1),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 4, 10, 0, 0, 0),
                          datetime(1998, 4, 10, 0, 0, 1),
                          datetime(1998, 4, 10, 0, 0, 2),
                          datetime(1998, 4, 10, 0, 0, 3)])

    def testSecondlyByWeekNo(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byweekno=20,
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 5, 11, 0, 0, 0),
                          datetime(1998, 5, 11, 0, 0, 1),
                          datetime(1998, 5, 11, 0, 0, 2)])

    def testSecondlyByWeekNoAndWeekDay(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byweekno=1,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 12, 29, 0, 0, 0),
                          datetime(1997, 12, 29, 0, 0, 1),
                          datetime(1997, 12, 29, 0, 0, 2)])

    def testSecondlyByWeekNoAndWeekDayLarge(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byweekno=52,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 12, 28, 0, 0, 0),
                          datetime(1997, 12, 28, 0, 0, 1),
                          datetime(1997, 12, 28, 0, 0, 2)])

    def testSecondlyByWeekNoAndWeekDayLast(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byweekno=-1,
                              byweekday=SU,
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 12, 28, 0, 0, 0),
                          datetime(1997, 12, 28, 0, 0, 1),
                          datetime(1997, 12, 28, 0, 0, 2)])

    def testSecondlyByWeekNoAndWeekDay53(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byweekno=53,
                              byweekday=MO,
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 12, 28, 0, 0, 0),
                          datetime(1998, 12, 28, 0, 0, 1),
                          datetime(1998, 12, 28, 0, 0, 2)])

    def testSecondlyByEaster(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byeaster=0,
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 4, 12, 0, 0, 0),
                          datetime(1998, 4, 12, 0, 0, 1),
                          datetime(1998, 4, 12, 0, 0, 2)])

    def testSecondlyByEasterPos(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byeaster=1,
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 4, 13, 0, 0, 0),
                          datetime(1998, 4, 13, 0, 0, 1),
                          datetime(1998, 4, 13, 0, 0, 2)])

    def testSecondlyByEasterNeg(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byeaster=-1,
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1998, 4, 11, 0, 0, 0),
                          datetime(1998, 4, 11, 0, 0, 1),
                          datetime(1998, 4, 11, 0, 0, 2)])

    def testSecondlyByHour(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byhour=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 18, 0, 0),
                          datetime(1997, 9, 2, 18, 0, 1),
                          datetime(1997, 9, 2, 18, 0, 2)])

    def testSecondlyByMinute(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 6, 0),
                          datetime(1997, 9, 2, 9, 6, 1),
                          datetime(1997, 9, 2, 9, 6, 2)])

    def testSecondlyBySecond(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 0, 6),
                          datetime(1997, 9, 2, 9, 0, 18),
                          datetime(1997, 9, 2, 9, 1, 6)])

    def testSecondlyByHourAndMinute(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 18, 6, 0),
                          datetime(1997, 9, 2, 18, 6, 1),
                          datetime(1997, 9, 2, 18, 6, 2)])

    def testSecondlyByHourAndSecond(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byhour=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 18, 0, 6),
                          datetime(1997, 9, 2, 18, 0, 18),
                          datetime(1997, 9, 2, 18, 1, 6)])

    def testSecondlyByMinuteAndSecond(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 9, 6, 6),
                          datetime(1997, 9, 2, 9, 6, 18),
                          datetime(1997, 9, 2, 9, 18, 6)])

    def testSecondlyByHourAndMinuteAndSecond(self):
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              byhour=(6, 18),
                              byminute=(6, 18),
                              bysecond=(6, 18),
                              dtstart=datetime(1997, 9, 2, 9, 0))),
                         [datetime(1997, 9, 2, 18, 6, 6),
                          datetime(1997, 9, 2, 18, 6, 18),
                          datetime(1997, 9, 2, 18, 18, 6)])

    def testSecondlyByHourAndMinuteAndSecondBug(self):
        # This explores a bug found by Mathieu Bridon.
        self.assertEqual(list(rrule(SECONDLY,
                              count=3,
                              bysecond=(0,),
                              byminute=(1,),
                              dtstart=datetime(2010, 3, 22, 12, 1))),
                         [datetime(2010, 3, 22, 12, 1),
                          datetime(2010, 3, 22, 13, 1),
                          datetime(2010, 3, 22, 14, 1)])

    def testHourlyBadRRule(self):
        """
        When `byhour` is specified with `freq=HOURLY`, there are certain
        combinations of `dtstart` and `byhour` which result in an rrule with no
        valid values.

        See https://github.com/dateutil/dateutil/issues/4
        """

        self.assertRaises(ValueError, rrule, HOURLY,
                          **dict(interval=4, byhour=(7, 11, 15, 19),
                                 dtstart=datetime(1997, 9, 2, 9, 0)))

    def testMinutelyBadRRule(self):
        """
        See :func:`testHourlyBadRRule` for details.
        """

        self.assertRaises(ValueError, rrule, MINUTELY,
                          **dict(interval=12, byminute=(10, 11, 25, 39, 50),
                                 dtstart=datetime(1997, 9, 2, 9, 0)))

    def testSecondlyBadRRule(self):
        """
        See :func:`testHourlyBadRRule` for details.
        """

        self.assertRaises(ValueError, rrule, SECONDLY,
                          **dict(interval=10, bysecond=(2, 15, 37, 42, 59),
                                 dtstart=datetime(1997, 9, 2, 9, 0)))

    def testMinutelyBadComboRRule(self):
        """
        Certain values of :param:`interval` in :class:`rrule`, when combined
        with certain values of :param:`byhour` create rules which apply to no
        valid dates. The library should detect this case in the iterator and
        raise a :exception:`ValueError`.
        """

        # In Python 2.7 you can use a context manager for this.
        def make_bad_rrule():
            list(rrule(MINUTELY, interval=120, byhour=(10, 12, 14, 16),
                 count=2, dtstart=datetime(1997, 9, 2, 9, 0)))

        self.assertRaises(ValueError, make_bad_rrule)

    def testSecondlyBadComboRRule(self):
        """
        See :func:`testMinutelyBadComboRRule' for details.
        """

        # In Python 2.7 you can use a context manager for this.
        def make_bad_minute_rrule():
            list(rrule(SECONDLY, interval=360, byminute=(10, 28, 49),
                 count=4, dtstart=datetime(1997, 9, 2, 9, 0)))

        def make_bad_hour_rrule():
            list(rrule(SECONDLY, interval=43200, byhour=(2, 10, 18, 23),
                 count=4, dtstart=datetime(1997, 9, 2, 9, 0)))

        self.assertRaises(ValueError, make_bad_minute_rrule)
        self.assertRaises(ValueError, make_bad_hour_rrule)
