import { DateTime } from "../datetime.ts";
import { NaiveDate } from "../naive-date.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { NaiveTime } from "../naive-time.ts";
import { Time } from "../time.ts";
import { TimezoneRegion } from "../timezone-region.ts";
import type { FixedOffset, Utc } from "../timezone.ts";
import type { MsSinceEpoch } from "../units/units.ts";
import { Weekday } from "../units/weekday.ts";
import { RRuleInstances } from "./instances.ts";
import { RRule } from "./rrule.ts";

const SAMOA_SKIP = NaiveDate.parse("2012-01-01");
const SAMOA_AFTER = SAMOA_SKIP.addDays(1);

export function resolveGraphWallTime(
  zone: TimezoneRegion,
  local: NaiveDateTime,
): DateTime<FixedOffset> {
  const resolved = zone.toRfc5545WallClock(local);
  const shift = zone.toTz(resolved).ndt.mse - local.mse;
  // Graph advances by an hour through Lord Howe's half-hour gap.
  return shift === Time.MS_PER_HR / 2
    ? zone.toRfc5545WallClock(local.add({ ms: Time.MS_PER_HR }))
    : resolved;
}

/** A Windows zone that keeps a single offset throughout the captured history. */
export function graphFixedOffset(zone: TimezoneRegion, offset: string): TimezoneRegion {
  const epoch = "0001-01-01T00:00:00" + offset;
  const abbreviation = offset.endsWith(":00") ? offset.slice(0, 3) : offset.replace(":", "");
  return new TimezoneRegion(zone.fullname, [TimezoneRegion.Transition.parse({
    before: epoch,
    after: epoch,
    before_tz_abbr: abbreviation,
    after_tz_abbr: abbreviation,
  }, zone.fullname)]);
}

/** Use a fixed Windows offset before the first captured IANA transition year. */
export function graphFixedOffsetBefore(
  zone: TimezoneRegion,
  offset: string,
  firstYear: number,
): TimezoneRegion {
  const standard = graphFixedOffset(zone, offset);
  return new TimezoneRegion(zone.fullname, [
    ...standard.transitions,
    ...zone.transitions.filter(({ before }) =>
      before.time.ndt.date.yr >= firstYear
    ),
  ]);
}

const PYONGYANG_EARLY_SHIFT = NaiveDate.parse("2013-08-10").dse;
const PYONGYANG_EARLY_SHIFT_END = NaiveDate.parse("2014-01-01").dse;
const PYONGYANG_RANGE_REPAIR = NaiveDate.parse("2014-01-03").dse;

/** Graph advances the range date for masters stored on January 2. */
export function graphNorthKoreaAnchor(
  startDay: NaiveDate,
  local: NaiveDateTime,
): NaiveDateTime {
  return startDay.dse === PYONGYANG_RANGE_REPAIR &&
      local.date.dse === startDay.dse - 1
    ? local.add({ days: 1 })
    : local;
}

/** Expand the historical Windows rule in the wall-clock frame stored on the master. */
export function resolveGraphNorthKoreaWallTime(
  zone: TimezoneRegion,
  local: NaiveDateTime,
): DateTime<FixedOffset> {
  const day = local.date.dse;
  if (day >= PYONGYANG_EARLY_SHIFT && day < PYONGYANG_EARLY_SHIFT_END) {
    // Graph projects these civil dates at UTC+09:30 while storing starts at UTC+09.
    return local.add({ ms: -570 * Time.MS_PER_MIN }).asUtc();
  }
  // A series crossing this date projects 00:00–00:29 one hour later.
  const wall = day === PYONGYANG_EARLY_SHIFT_END + 1 &&
      local.time.toMs < 30 * Time.MS_PER_MIN
    ? local.add({ ms: Time.MS_PER_HR })
    : local;
  return resolveGraphWallTime(zone, wall);
}

/** Windows Baghdad starts its captured daylight-saving history on April 3, 2003. */
export function graphBaghdad(zone: TimezoneRegion): TimezoneRegion {
  const history = graphFixedOffsetBefore(zone, "+03:00", 2004);
  return new TimezoneRegion(zone.fullname, [
    ...history.transitions,
    TimezoneRegion.Transition.parse({
      before: "2003-04-03T03:00:00+03:00",
      after: "2003-04-03T04:00:00+04:00",
      before_tz_abbr: "+03",
      after_tz_abbr: "+04",
    }, zone.fullname),
    TimezoneRegion.Transition.parse({
      before: "2003-10-03T04:00:00+04:00",
      after: "2003-10-03T03:00:00+03:00",
      before_tz_abbr: "+04",
      after_tz_abbr: "+03",
    }, zone.fullname),
  ]);
}

/** Graph advances the UTC occurrence clock during Tonga's early November–January season. */
export function resolveGraphTongaWallTime(zone: TimezoneRegion, wall: NaiveDateTime): DateTime<FixedOffset> {
  const instant = resolveGraphWallTime(zone, wall);
  const { yr, month1, day1 } = wall.date;
  if (yr >= 2015 || (month1 > 1 && month1 < 11)) return instant;
  if (month1 === 1) {
    const january = NaiveDate.fromYmd1Exp(yr, 1, 1);
    const standard = january.addDays((7 + Weekday.FRI.isoDow1 - january.dayOfWeek.isoDow1) % 7);
    if (day1 >= standard.day1) return instant;
  } else if (month1 === 11) {
    const november = NaiveDate.fromYmd1Exp(yr, 11, 1);
    const firstSunday = november.addDays((7 - november.dayOfWeek.isoDow1) % 7);
    if (day1 < firstSunday.day1 ||
        (day1 === firstSunday.day1 && wall.time.toMs < 2 * Time.MS_PER_HR)) return instant;
  }
  return instant.add({ ms: Time.MS_PER_HR });
}

/** Early Windows Hovd uses the last Saturdays in March and September. */
export function graphHovd(zone: TimezoneRegion, startYear: number): TimezoneRegion {
  if (startYear >= 2007) return zone;
  const transitions = [...graphFixedOffset(zone, "+07:00").transitions];
  for (let year = Math.max(1, startYear); year < 2007; year++) {
    const march = NaiveDate.fromYmd1Exp(year, 3, 31);
    const september = NaiveDate.fromYmd1Exp(year, 9, 30);
    const spring = march.addDays(-((march.dayOfWeek.isoDow1 + 1) % 7));
    const autumn = september.addDays(-((september.dayOfWeek.isoDow1 + 1) % 7));
    transitions.push(
      TimezoneRegion.Transition.parse({
        before: spring + "T02:00:00+07:00",
        after: spring + "T03:00:00+08:00",
        before_tz_abbr: "+07",
        after_tz_abbr: "+08",
      }, zone.fullname),
      TimezoneRegion.Transition.parse({
        before: autumn + "T02:00:00+08:00",
        after: autumn + "T01:00:00+07:00",
        before_tz_abbr: "+08",
        after_tz_abbr: "+07",
      }, zone.fullname),
    );
  }
  return new TimezoneRegion(zone.fullname, [
    ...transitions,
    ...zone.transitions.filter(({ before }) => before.time.ndt.date.yr >= 2007),
  ]);
}

/** Windows Fiji uses UTC+12 in historical captures before DST resumed in 2009. */
export function graphFiji(zone: TimezoneRegion): TimezoneRegion {
  const standard = TimezoneRegion.Transition.parse({
    before: "1900-01-01T12:00:00+12:00",
    after: "1900-01-01T12:00:00+12:00",
    before_tz_abbr: "+12",
    after_tz_abbr: "+12",
  }, zone.fullname);
  const restart = DateTime.fromRfc3339("2009-11-28T14:00:00Z").exp().mse;
  return new TimezoneRegion(zone.fullname, [
    standard,
    ...zone.transitions.filter(({ before }) => before.mse >= restart),
  ]);
}

/** Windows Egypt keeps daylight time through the 2010 and 2014 Ramadan suspensions. */
export function graphEgypt(zone: TimezoneRegion): TimezoneRegion {
  const firstSuspension = DateTime.fromRfc3339("2010-08-10T21:00:00Z").exp().mse;
  // The archived Cairo data omits the 2010 return to standard time.
  const standard = TimezoneRegion.Transition.parse({
    before: "2010-10-01T00:00:00+03:00",
    after: "2010-09-30T23:00:00+02:00",
    before_tz_abbr: "EEST",
    after_tz_abbr: "EET",
  }, zone.fullname);
  const spring = TimezoneRegion.Transition.parse({
    before: "2014-05-16T00:00:00+02:00",
    after: "2014-05-16T01:00:00+03:00",
    before_tz_abbr: "EET",
    after_tz_abbr: "EEST",
  }, zone.fullname);
  const autumn = TimezoneRegion.Transition.parse({
    before: "2014-09-26T00:00:00+03:00",
    after: "2014-09-25T23:00:00+02:00",
    before_tz_abbr: "EEST",
    after_tz_abbr: "EET",
  }, zone.fullname);
  return new TimezoneRegion(zone.fullname, [
    ...zone.transitions.filter(({ before }) => before.mse < firstSuspension),
    standard,
    spring,
    autumn,
    ...zone.transitions.filter(({ before }) => before.mse > autumn.before.mse),
  ]);
}

/** Windows Newfoundland advances one hour during the 1988 DST season. */
export function graphNewfoundland(zone: TimezoneRegion): TimezoneRegion {
  const spring = TimezoneRegion.Transition.parse({
    before: "1988-04-03T00:01:00-03:30",
    after: "1988-04-03T01:01:00-02:30",
    before_tz_abbr: "NST",
    after_tz_abbr: "NDT",
  }, zone.fullname);
  const autumn = TimezoneRegion.Transition.parse({
    before: "1988-10-30T00:01:00-02:30",
    after: "1988-10-29T23:01:00-03:30",
    before_tz_abbr: "NDT",
    after_tz_abbr: "NST",
  }, zone.fullname);
  return new TimezoneRegion(zone.fullname, [
    ...zone.transitions.filter(({ before }) =>
      before.mse < spring.before.mse || before.mse > autumn.before.mse
    ),
    spring,
    autumn,
  ]);
}

/** Graph uses the regular April–October season before 1996 and in 2001. */
export function graphMexico(
  zone: TimezoneRegion,
  standardHoursWest: 6 | 7,
  { firstYear = 1900, cancun = false } = {},
): TimezoneRegion {
  const central = standardHoursWest === 6;
  const standardOffset = central ? "-06:00" : "-07:00";
  const summerOffset = central ? "-05:00" : "-06:00";
  const standardAbbr = central ? "CST" : "MST";
  const summerAbbr = central ? "CDT" : "MDT";
  const epoch = NaiveDate.fromYmd1Exp(firstYear, 1, 1) + "T00:00:00" +
    standardOffset;
  const transitions = [TimezoneRegion.Transition.parse({
    before: epoch,
    after: epoch,
    before_tz_abbr: standardAbbr,
    after_tz_abbr: standardAbbr,
  }, zone.fullname)];

  const addSeason = (year: number) => {
    const april = NaiveDate.fromYmd1Exp(year, 4, 1);
    const october = NaiveDate.fromYmd1Exp(year, 10, 31);
    const spring = april.addDays((7 - april.dayOfWeek.isoDow1) % 7).toString();
    const autumn = october.addDays(-(october.dayOfWeek.isoDow1 % 7)).toString();
    transitions.push(
      TimezoneRegion.Transition.parse({
        before: spring + "T02:00:00" + standardOffset,
        after: spring + "T03:00:00" + summerOffset,
        before_tz_abbr: standardAbbr,
        after_tz_abbr: summerAbbr,
      }, zone.fullname),
      TimezoneRegion.Transition.parse({
        before: autumn + "T02:00:00" + summerOffset,
        after: autumn + "T01:00:00" + standardOffset,
        before_tz_abbr: summerAbbr,
        after_tz_abbr: standardAbbr,
      }, zone.fullname),
    );
  };
  const regularSeasons = new Set([2001]);
  // Windows Cancún kept the central Mexico season through the temporary
  // 1997–98 switch to Eastern Time in the IANA record.
  if (cancun) {
    regularSeasons.add(1997);
    regularSeasons.add(1998);
  }
  for (let year = firstYear; year < 1996; year++) addSeason(year);
  for (const year of regularSeasons) addSeason(year);
  for (const transition of zone.transitions) {
    const year = transition.before.time.ndt.date.yr;
    if (year >= 1996 && !regularSeasons.has(year)) transitions.push(transition);
  }
  return new TimezoneRegion(zone.fullname, transitions);
}

/** Windows Israel repeats its 2004 transition pattern in the sampled earlier years. */
export function graphIsrael(zone: TimezoneRegion): TimezoneRegion {
  const epoch = "1900-01-01T00:00:00+02:00";
  const transitions = [TimezoneRegion.Transition.parse({
    before: epoch,
    after: epoch,
    before_tz_abbr: "IST",
    after_tz_abbr: "IST",
  }, zone.fullname)];
  const wednesday = Weekday.WED.isoDow1;
  for (let year = 1900; year < 2004; year++) {
    // First Wednesday in April and fourth Wednesday in September.
    const april = NaiveDate.fromYmd1Exp(year, 4, 1);
    const september = NaiveDate.fromYmd1Exp(year, 9, 22);
    const spring = april.addDays((wednesday + 7 - april.dayOfWeek.isoDow1) % 7);
    const autumn = september.addDays((wednesday + 7 - september.dayOfWeek.isoDow1) % 7);
    transitions.push(
      TimezoneRegion.Transition.parse({
        before: spring + "T01:00:00+02:00",
        after: spring + "T02:00:00+03:00",
        before_tz_abbr: "IST",
        after_tz_abbr: "IDT",
      }, zone.fullname),
      TimezoneRegion.Transition.parse({
        before: autumn + "T01:00:00+03:00",
        after: autumn + "T00:00:00+02:00",
        before_tz_abbr: "IDT",
        after_tz_abbr: "IST",
      }, zone.fullname),
    );
  }
  const historical = new TimezoneRegion(zone.fullname, [
    ...transitions,
    ...zone.transitions.filter(({ before }) => before.time.ndt.date.yr >= 2004),
  ]);
  return graphLevantFuture(historical, true);
}

export function graphWestBank(zone: TimezoneRegion): TimezoneRegion {
  return graphLevantFuture(zone, false);
}

function graphLevantFuture(zone: TimezoneRegion, israel: boolean): TimezoneRegion {
  const firstYear = israel ? 2041 : 2035;
  const standard = israel ? "IST" : "EET";
  const daylight = israel ? "IDT" : "EEST";
  return TimezoneRegion.withFutureRecurrence(zone, firstYear, (year) => {
    if (year > 9999) return [];
    // Israel starts on March's fourth Friday. West Bank uses its last
    // Saturday. Autumn ends on the last Sunday or Saturday of October.
    const march = NaiveDate.fromYmd1Exp(year, 3, israel ? 22 : 31);
    const october = NaiveDate.fromYmd1Exp(year, 10, 31);
    const spring = israel
      ? march.addDays((Weekday.FRI.isoDow1 + 7 - march.dayOfWeek.isoDow1) % 7)
      : march.addDays(-((march.dayOfWeek.isoDow1 + 7 - Weekday.SAT.isoDow1) % 7));
    const autumnDow = israel ? Weekday.SUN.isoDow1 : Weekday.SAT.isoDow1;
    const autumn = october.addDays(-((october.dayOfWeek.isoDow1 + 7 - autumnDow) % 7));
    return [
      TimezoneRegion.Transition.parse({
        before: spring + "T02:00:00+02:00",
        after: spring + "T03:00:00+03:00",
        before_tz_abbr: standard,
        after_tz_abbr: daylight,
      }, zone.fullname),
      TimezoneRegion.Transition.parse({
        before: autumn + "T02:00:00+03:00",
        after: autumn + "T01:00:00+02:00",
        before_tz_abbr: daylight,
        after_tz_abbr: standard,
      }, zone.fullname),
    ];
  });
}

/** These Russian Windows zones repeat the 2004 season in earlier captures. */
export function graphRussianSeasons(
  zone: TimezoneRegion,
  standardHours: number,
  startYear: number,
): TimezoneRegion {
  const standard = "+" + String(standardHours).padStart(2, "0");
  const daylight = "+" + String(standardHours + 1).padStart(2, "0");
  const firstYear = Math.max(1, startYear);
  const epoch = NaiveDate.fromYmd1Exp(firstYear, 1, 1) + "T00:00:00" + standard + ":00";
  const transitions = [TimezoneRegion.Transition.parse({
    before: epoch,
    after: epoch,
    before_tz_abbr: standard,
    after_tz_abbr: standard,
  }, zone.fullname)];
  for (let year = firstYear; year < 2004; year++) {
    const march = NaiveDate.fromYmd1Exp(year, 3, 31);
    const october = NaiveDate.fromYmd1Exp(year, 10, 31);
    const spring = march.addDays(-(march.dayOfWeek.isoDow1 % 7));
    const autumn = october.addDays(-(october.dayOfWeek.isoDow1 % 7));
    transitions.push(
      TimezoneRegion.Transition.parse({
        before: spring + "T02:00:00" + standard + ":00",
        after: spring + "T03:00:00" + daylight + ":00",
        before_tz_abbr: standard,
        after_tz_abbr: daylight,
      }, zone.fullname),
      TimezoneRegion.Transition.parse({
        before: autumn + "T03:00:00" + daylight + ":00",
        after: autumn + "T02:00:00" + standard + ":00",
        before_tz_abbr: daylight,
        after_tz_abbr: standard,
      }, zone.fullname),
    );
  }
  return new TimezoneRegion(zone.fullname, [
    ...transitions,
    ...zone.transitions.filter(({ before }) => before.time.ndt.date.yr >= 2004),
  ]);
}

const AUSTRALIAN_OFFSETS = {
  east: {
    standard: "+10:00",
    daylight: "+11:00",
    standardAbbr: "AEST",
    daylightAbbr: "AEDT",
  },
  central: {
    standard: "+09:30",
    daylight: "+10:30",
    standardAbbr: "ACST",
    daylightAbbr: "ACDT",
  },
  "lord-howe": {
    standard: "+10:30",
    daylight: "+11:00",
    standardAbbr: "LHST",
    daylightAbbr: "LHDT",
  },
};

/** Match the captured early Windows seasons and mainland/Tasmania's 2006 autumn boundary. */
export function graphAustralianSeasons(
  zone: TimezoneRegion,
  startYear: number,
  season: keyof typeof AUSTRALIAN_OFFSETS | "tasmania",
): TimezoneRegion {
  const { standard, daylight, standardAbbr, daylightAbbr } =
    AUSTRALIAN_OFFSETS[season === "tasmania" ? "east" : season];
  const lordHowe = season === "lord-howe";
  const beforeFold = lordHowe ? "T02:00:00" : "T03:00:00";
  const afterFold = lordHowe ? "T01:30:00" : "T02:00:00";
  const afterGap = lordHowe ? "T02:30:00" : "T03:00:00";
  function autumnTransition(year: number): TimezoneRegion.Transition {
    const march = NaiveDate.fromYmd1Exp(year, 3, 31);
    const autumn = march.addDays(-(march.dayOfWeek.isoDow1 % 7));
    return TimezoneRegion.Transition.parse({
      before: autumn + beforeFold + daylight,
      after: autumn + afterFold + standard,
      before_tz_abbr: daylightAbbr,
      after_tz_abbr: standardAbbr,
    }, zone.fullname);
  }

  const transitions: TimezoneRegion.Transition[] = [];
  if (startYear < 2004) {
    const firstYear = Math.max(1, startYear);
    const epoch = NaiveDate.fromYmd1Exp(firstYear, 1, 1) + "T00:00:00" +
      daylight;
    transitions.push(TimezoneRegion.Transition.parse({
      before: epoch,
      after: epoch,
      before_tz_abbr: daylightAbbr,
      after_tz_abbr: daylightAbbr,
    }, zone.fullname));
    for (let year = firstYear; year < 2004; year++) {
      const october = NaiveDate.fromYmd1Exp(
        year,
        10,
        season === "tasmania" ? 1 : 31,
      );
      const weekday = october.dayOfWeek.isoDow1 % 7;
      const spring = october.addDays(
        season === "tasmania" ? (7 - weekday) % 7 : -weekday,
      );
      transitions.push(
        autumnTransition(year),
        TimezoneRegion.Transition.parse({
          before: spring + "T02:00:00" + standard,
          after: spring + afterGap + daylight,
          before_tz_abbr: standardAbbr,
          after_tz_abbr: daylightAbbr,
        }, zone.fullname),
      );
    }
  }

  // Lord Howe keeps IANA's 2006 date. The other zones use the previous week.
  const ianaAutumn2006 = NaiveDate.fromYmd1Exp(2006, 4, 2);
  for (const transition of zone.transitions) {
    const day = transition.before.time.ndt.date;
    if (startYear < 2004 && day.yr < 2004) continue;
    transitions.push(
      !lordHowe && day.equals(ianaAutumn2006)
        ? autumnTransition(2006)
        : transition,
    );
  }
  return TimezoneRegion.forPlatformRecurrence(
    new TimezoneRegion(zone.fullname, transitions),
    {
      extendServedFuture: true,
    },
  );
}

const NORTH_AMERICAN_WINDOWS_SEASON = {
  ianaFrom: 1987,
  firstApril: true,
  clock: "T02:00:00",
  gapEnd: "T03:00:00",
};

const CENTRAL_EUROPEAN_WINDOWS_SEASON = {
  standard: "+01:00",
  daylight: "+02:00",
  standardAbbr: "CET",
  daylightAbbr: "CEST",
  ianaFrom: 1996,
  firstApril: false,
  clock: "T02:00:00",
  gapEnd: "T03:00:00",
};

const EASTERN_EUROPEAN_WINDOWS_SEASON = {
  ...CENTRAL_EUROPEAN_WINDOWS_SEASON,
  standard: "+02:00",
  daylight: "+03:00",
  standardAbbr: "EET",
  daylightAbbr: "EEST",
  ianaFrom: 1997,
  clock: "T03:00:00",
  gapEnd: "T04:00:00",
};

const HISTORICAL_WINDOWS_SEASONS = new Map([
  ["Alaskan Standard Time", {
    ...NORTH_AMERICAN_WINDOWS_SEASON,
    standard: "-09:00",
    daylight: "-08:00",
    standardAbbr: "AKST",
    daylightAbbr: "AKDT",
  }],
  ["Aleutian Standard Time", {
    ...NORTH_AMERICAN_WINDOWS_SEASON,
    standard: "-10:00",
    daylight: "-09:00",
    standardAbbr: "HST",
    daylightAbbr: "HDT",
  }],
  ["Atlantic Standard Time", {
    standard: "-04:00",
    daylight: "-03:00",
    standardAbbr: "AST",
    daylightAbbr: "ADT",
    ...NORTH_AMERICAN_WINDOWS_SEASON,
  }],
  ["Central Standard Time", {
    standard: "-06:00",
    daylight: "-05:00",
    standardAbbr: "CST",
    daylightAbbr: "CDT",
    ...NORTH_AMERICAN_WINDOWS_SEASON,
  }],
  ["Mountain Standard Time", {
    standard: "-07:00",
    daylight: "-06:00",
    standardAbbr: "MST",
    daylightAbbr: "MDT",
    ...NORTH_AMERICAN_WINDOWS_SEASON,
  }],
  ["Eastern Standard Time", {
    standard: "-05:00",
    daylight: "-04:00",
    standardAbbr: "EST",
    daylightAbbr: "EDT",
    ...NORTH_AMERICAN_WINDOWS_SEASON,
  }],
  ["Pacific Standard Time", {
    standard: "-08:00",
    daylight: "-07:00",
    standardAbbr: "PST",
    daylightAbbr: "PDT",
    ...NORTH_AMERICAN_WINDOWS_SEASON,
  }],
  ["Pacific Standard Time (Mexico)", {
    ...NORTH_AMERICAN_WINDOWS_SEASON,
    standard: "-08:00",
    daylight: "-07:00",
    standardAbbr: "PST",
    daylightAbbr: "PDT",
  }],
  ["Turks And Caicos Standard Time", {
    ...NORTH_AMERICAN_WINDOWS_SEASON,
    standard: "-05:00",
    daylight: "-04:00",
    standardAbbr: "EST",
    daylightAbbr: "EDT",
    ianaFrom: 2015,
    modernUS: true,
  }],
  ["Cuba Standard Time", {
    ...NORTH_AMERICAN_WINDOWS_SEASON,
    standard: "-05:00",
    daylight: "-04:00",
    standardAbbr: "CST",
    daylightAbbr: "CDT",
    ianaFrom: 2000,
    clock: "T00:00:00",
    gapEnd: "T01:00:00",
    foldClock: "T01:00:00",
  }],
  ["Haiti Standard Time", {
    ...NORTH_AMERICAN_WINDOWS_SEASON,
    standard: "-05:00",
    daylight: "-04:00",
    standardAbbr: "EST",
    daylightAbbr: "EDT",
    ianaFrom: 2007,
    clock: "T00:00:00",
    gapEnd: "T01:00:00",
  }],
  ["Middle East Standard Time", {
    ...EASTERN_EUROPEAN_WINDOWS_SEASON,
    ianaFrom: 1999,
    clock: "T00:00:00",
    gapEnd: "T01:00:00",
    foldClock: "T00:00:00",
  }],
  ["Newfoundland Standard Time", {
    ...NORTH_AMERICAN_WINDOWS_SEASON,
    standard: "-03:30",
    daylight: "-02:30",
    standardAbbr: "NST",
    daylightAbbr: "NDT",
    clock: "T00:01:00",
    gapEnd: "T01:01:00",
  }],
  ["Saint Pierre Standard Time", {
    ...NORTH_AMERICAN_WINDOWS_SEASON,
    standard: "-03:00",
    daylight: "-02:00",
    standardAbbr: "-03",
    daylightAbbr: "-02",
  }],
  ["GMT Standard Time", {
    ...CENTRAL_EUROPEAN_WINDOWS_SEASON,
    standard: "+00:00",
    daylight: "+01:00",
    standardAbbr: "GMT",
    daylightAbbr: "BST",
    clock: "T01:00:00",
    gapEnd: "T02:00:00",
  }],
  ["Central Europe Standard Time", CENTRAL_EUROPEAN_WINDOWS_SEASON],
  ["Central European Standard Time", CENTRAL_EUROPEAN_WINDOWS_SEASON],
  ["Romance Standard Time", CENTRAL_EUROPEAN_WINDOWS_SEASON],
  ["W. Europe Standard Time", CENTRAL_EUROPEAN_WINDOWS_SEASON],
  ["GTB Standard Time", EASTERN_EUROPEAN_WINDOWS_SEASON],
  ["FLE Standard Time", EASTERN_EUROPEAN_WINDOWS_SEASON],
  ["Azerbaijan Standard Time", {
    ...EASTERN_EUROPEAN_WINDOWS_SEASON,
    standard: "+04:00",
    daylight: "+05:00",
    standardAbbr: "+04",
    daylightAbbr: "+05",
    clock: "T04:00:00",
    gapEnd: "T05:00:00",
  }],
  ["Caucasus Standard Time", {
    ...EASTERN_EUROPEAN_WINDOWS_SEASON,
    standard: "+04:00",
    daylight: "+05:00",
    standardAbbr: "+04",
    daylightAbbr: "+05",
    clock: "T02:00:00",
    gapEnd: "T03:00:00",
  }],
  ["Belarus Standard Time", {
    ...EASTERN_EUROPEAN_WINDOWS_SEASON,
    ianaFrom: 1996,
    clock: "T02:00:00",
    gapEnd: "T03:00:00",
  }],
  ["E. Europe Standard Time", {
    ...EASTERN_EUROPEAN_WINDOWS_SEASON,
    clock: "T02:00:00",
    gapEnd: "T03:00:00",
  }],
  ["Azores Standard Time", {
    ...CENTRAL_EUROPEAN_WINDOWS_SEASON,
    standard: "-01:00",
    daylight: "+00:00",
    standardAbbr: "AZOT",
    daylightAbbr: "AZOST",
    clock: "T00:00:00",
    gapEnd: "T01:00:00",
  }],
]);

/** Replay Windows seasons before the aligned IANA years for these zones. */
export function graphHistoricalWindowsSeasons(
  zone: TimezoneRegion,
  windowsName: string,
  startYear: number,
): TimezoneRegion | undefined {
  const settings = HISTORICAL_WINDOWS_SEASONS.get(windowsName);
  if (settings == null || startYear >= settings.ianaFrom) return undefined;

  const {
    standard,
    daylight,
    standardAbbr,
    daylightAbbr,
    ianaFrom,
    firstApril,
    clock,
    gapEnd,
  } = settings;
  const modernUS = "modernUS" in settings && settings.modernUS === true;
  const foldStart = "foldClock" in settings && typeof settings.foldClock === "string"
    ? settings.foldClock
    : firstApril ? clock : gapEnd;
  const firstYear = Math.max(1, startYear);
  const anchor = NaiveDate.fromYmd1Exp(firstYear, 1, 1) + "T00:00:00" +
    standard;
  const transitions = [TimezoneRegion.Transition.parse({
    before: anchor,
    after: anchor,
    before_tz_abbr: standardAbbr,
    after_tz_abbr: standardAbbr,
  }, zone.fullname)];
  for (let year = firstYear; year < ianaFrom; year++) {
    const springAnchor = NaiveDate.fromYmd1Exp(
      year,
      firstApril && !modernUS ? 4 : 3,
      modernUS ? 8 : firstApril ? 1 : 31,
    );
    const springDow = springAnchor.dayOfWeek.isoDow1 % 7;
    const spring = springAnchor.addDays(
      firstApril ? (7 - springDow) % 7 : -springDow,
    );
    const autumnAnchor = NaiveDate.fromYmd1Exp(
      year,
      modernUS ? 11 : 10,
      modernUS ? 1 : 31,
    );
    const autumnDow = autumnAnchor.dayOfWeek.isoDow1 % 7;
    const autumn = autumnAnchor.addDays(
      modernUS ? (7 - autumnDow) % 7 : -autumnDow,
    );
    const beforeFold = NaiveDateTime.parse(autumn + foldStart)!;
    const afterFold = beforeFold.add({ ms: -Time.MS_PER_HR });

    transitions.push(
      TimezoneRegion.Transition.parse({
        before: spring + clock + standard,
        after: spring + gapEnd + daylight,
        before_tz_abbr: standardAbbr,
        after_tz_abbr: daylightAbbr,
      }, zone.fullname),
      TimezoneRegion.Transition.parse({
        before: beforeFold + daylight,
        after: afterFold + standard,
        before_tz_abbr: daylightAbbr,
        after_tz_abbr: standardAbbr,
      }, zone.fullname),
    );
  }
  return new TimezoneRegion(zone.fullname, [
    ...transitions,
    ...zone.transitions.filter(({ before }) =>
      before.time.ndt.date.yr >= ianaFrom
    ),
  ]);
}

/** Restore the winter offset before Windows resumed its usual seasons in 2018. */
export function graphGrandTurk(zone: TimezoneRegion, startYear: number): TimezoneRegion {
  if (startYear >= 2019) return zone;
  return new TimezoneRegion(zone.fullname, [
    ...zone.transitions.filter(({ before }) => before.time.ndt.date.yr !== 2018 ||
      before.time.ndt.date.month1 > 3),
    TimezoneRegion.Transition.parse({
      before: "2018-01-01T00:00:00-04:00",
      after: "2017-12-31T23:00:00-05:00",
      before_tz_abbr: "AST",
      after_tz_abbr: "EST",
    }, zone.fullname),
    TimezoneRegion.Transition.parse({
      before: "2018-03-11T02:00:00-05:00",
      after: "2018-03-11T03:00:00-04:00",
      before_tz_abbr: "EST",
      after_tz_abbr: "EDT",
    }, zone.fullname),
  ]);
}

/** Match the early Windows seasons before the IANA rules align in 1990. */
export function graphNewZealandHistory(
  zone: TimezoneRegion,
  windowsName: string,
  startYear: number,
): TimezoneRegion | undefined {
  const chatham = windowsName === "Chatham Islands Standard Time";
  if (
    startYear >= 1990 || (!chatham && windowsName !== "New Zealand Standard Time")
  ) {
    return undefined;
  }

  const standard = chatham ? "+12:45" : "+12:00";
  const daylight = chatham ? "+13:45" : "+13:00";
  const standardAbbr = chatham ? "+1245" : "NZST";
  const daylightAbbr = chatham ? "+1345" : "NZDT";
  const standardClock = chatham ? "T02:45:00" : "T02:00:00";
  const daylightClock = chatham ? "T03:45:00" : "T03:00:00";
  const firstYear = Math.max(1, startYear);
  const anchor = NaiveDate.fromYmd1Exp(firstYear, 1, 1) + "T00:00:00" + daylight;
  const transitions = [TimezoneRegion.Transition.parse({
    before: anchor,
    after: anchor,
    before_tz_abbr: daylightAbbr,
    after_tz_abbr: daylightAbbr,
  }, zone.fullname)];

  for (let year = firstYear; year < 1990; year++) {
    const march = NaiveDate.fromYmd1Exp(year, 3, 15);
    const october = NaiveDate.fromYmd1Exp(year, 10, 1);
    const autumn = march.addDays((7 - march.dayOfWeek.isoDow1) % 7);
    const spring = october.addDays((7 - october.dayOfWeek.isoDow1) % 7);
    transitions.push(
      TimezoneRegion.Transition.parse({
        before: autumn + daylightClock + daylight,
        after: autumn + standardClock + standard,
        before_tz_abbr: daylightAbbr,
        after_tz_abbr: standardAbbr,
      }, zone.fullname),
      TimezoneRegion.Transition.parse({
        before: spring + standardClock + standard,
        after: spring + daylightClock + daylight,
        before_tz_abbr: standardAbbr,
        after_tz_abbr: daylightAbbr,
      }, zone.fullname),
    );
  }
  return new TimezoneRegion(zone.fullname, [
    ...transitions,
    ...zone.transitions.filter(({ before }) => before.time.ndt.date.yr >= 1990),
  ]);
}

/** Replay Windows Easter Island's early March and October transitions. */
export function graphEasterIsland(zone: TimezoneRegion, startYear: number): TimezoneRegion {
  if (startYear >= 2008) return zone;
  const transitions = [...graphFixedOffset(zone, "-05:00").transitions];
  for (let year = Math.max(1, startYear); year < 2008; year++) {
    const march = NaiveDate.fromYmd1Exp(year, 3, 8);
    const october = NaiveDate.fromYmd1Exp(year, 10, 8);
    const standard = march.addDays((7 + Weekday.SAT.isoDow1 - march.dayOfWeek.isoDow1) % 7);
    const daylight = october.addDays((7 + Weekday.SAT.isoDow1 - october.dayOfWeek.isoDow1) % 7);
    transitions.push(
      TimezoneRegion.Transition.parse({
        before: standard + "T22:00:00-05:00",
        after: standard + "T21:00:00-06:00",
        before_tz_abbr: "EASST",
        after_tz_abbr: "EAST",
      }, zone.fullname),
      TimezoneRegion.Transition.parse({
        before: daylight + "T22:00:00-06:00",
        after: daylight + "T23:00:00-05:00",
        before_tz_abbr: "EAST",
        after_tz_abbr: "EASST",
      }, zone.fullname),
    );
  }
  return new TimezoneRegion(zone.fullname, [
    ...transitions,
    ...zone.transitions.filter(({ before }) => before.time.ndt.date.yr >= 2008),
  ]);
}

/** Early Windows Montevideo and Windhoek seasons both change at 02:00 local. */
export function graphSouthernSeasons(
  zone: TimezoneRegion,
  startYear: number,
  region: "montevideo" | "windhoek",
): TimezoneRegion {
  const montevideo = region === "montevideo";
  const firstIanaYear = montevideo ? 2006 : 1995;
  if (startYear >= firstIanaYear) return zone;

  const standard = montevideo ? "-03" : "+01";
  const daylight = montevideo ? "-02" : "+02";
  const transitions = [...graphFixedOffset(zone, daylight + ":00").transitions];
  for (let year = Math.max(1, startYear); year < firstIanaYear; year++) {
    const autumn = NaiveDate.fromYmd1Exp(year, montevideo ? 3 : 4, montevideo ? 8 : 1);
    const spring = NaiveDate.fromYmd1Exp(year, montevideo ? 10 : 9, 1);
    const standardDay = autumn.addDays((7 - autumn.dayOfWeek.isoDow1) % 7);
    const daylightDay = spring.addDays((7 - spring.dayOfWeek.isoDow1) % 7);
    transitions.push(
      TimezoneRegion.Transition.parse({
        before: standardDay + "T02:00:00" + daylight + ":00",
        after: standardDay + "T01:00:00" + standard + ":00",
        before_tz_abbr: daylight,
        after_tz_abbr: standard,
      }, zone.fullname),
      TimezoneRegion.Transition.parse({
        before: daylightDay + "T02:00:00" + standard + ":00",
        after: daylightDay + "T03:00:00" + daylight + ":00",
        before_tz_abbr: standard,
        after_tz_abbr: daylight,
      }, zone.fullname),
    );
  }
  return new TimezoneRegion(zone.fullname, [
    ...transitions,
    ...zone.transitions.filter(({ before }) => before.time.ndt.date.yr >= firstIanaYear),
  ]);
}

/** Windows São Paulo repeats the legacy season in the sampled years before 2004. */
export function graphSaoPaulo(zone: TimezoneRegion): TimezoneRegion {
  const transitions = [TimezoneRegion.Transition.parse({
    before: "1900-01-01T00:00:00-02:00",
    after: "1900-01-01T00:00:00-02:00",
    before_tz_abbr: "-02",
    after_tz_abbr: "-02",
  }, zone.fullname)];
  for (let year = 1900; year < 2004; year++) {
    // First Sunday on or after February 9 and first Tuesday in November.
    const february = NaiveDate.fromYmd1Exp(year, 2, 9);
    const november = NaiveDate.fromYmd1Exp(year, 11, 1);
    const standard = february.addDays((7 - february.dayOfWeek.isoDow1) % 7);
    const daylight = november.addDays((9 - november.dayOfWeek.isoDow1) % 7);
    transitions.push(
      TimezoneRegion.Transition.parse({
        before: standard + "T00:00:00-02:00",
        after: standard.addDays(-1) + "T23:00:00-03:00",
        before_tz_abbr: "-02",
        after_tz_abbr: "-03",
      }, zone.fullname),
      TimezoneRegion.Transition.parse({
        before: daylight + "T00:00:00-03:00",
        after: daylight + "T01:00:00-02:00",
        before_tz_abbr: "-03",
        after_tz_abbr: "-02",
      }, zone.fullname),
    );
  }
  return new TimezoneRegion(zone.fullname, [
    ...transitions,
    ...zone.transitions.filter(({ before }) => before.time.ndt.date.yr >= 2004),
  ]);
}

/** Windows Cuiabá uses a November–December season before the IANA-aligned 2004 rules. */
export function graphCuiaba(zone: TimezoneRegion, startYear: number): TimezoneRegion {
  if (startYear >= 2004) return zone;
  const transitions = [...graphFixedOffset(zone, "-04:00").transitions];
  for (let year = Math.max(1, startYear); year < 2004; year++) {
    const november = NaiveDate.fromYmd1Exp(year, 11, 1);
    const daylight = november.addDays((9 - november.dayOfWeek.isoDow1) % 7);
    const january = NaiveDate.fromYmd1Exp(year + 1, 1, 1);
    const standard = january.addDays((7 + Weekday.THU.isoDow1 - january.dayOfWeek.isoDow1) % 7);
    transitions.push(
      TimezoneRegion.Transition.parse({
        before: daylight + "T00:00:00-04:00",
        after: daylight + "T01:00:00-03:00",
        before_tz_abbr: "-04",
        after_tz_abbr: "-03",
      }, zone.fullname),
      TimezoneRegion.Transition.parse({
        before: standard + "T00:00:00-03:00",
        after: standard.addDays(-1) + "T23:00:00-04:00",
        before_tz_abbr: "-03",
        after_tz_abbr: "-04",
      }, zone.fullname),
    );
  }
  return new TimezoneRegion(zone.fullname, [
    ...transitions,
    ...zone.transitions.filter(({ before }) => before.time.ndt.date.yr >= 2004),
  ]);
}

/** Early Bahia and Tocantins shift occurrences later while storing the standard clock. */
export function graphNortheastBrazilWallTime(
  region: "bahia" | "tocantins",
): (zone: TimezoneRegion, wall: NaiveDateTime) => DateTime<FixedOffset> {
  const firstUnshiftedYear = region === "bahia" ? 2010 : 2011;
  const octoberMinimum = region === "bahia" ? 16 : 15;
  const januaryWeekday = region === "bahia" ? Weekday.SAT : Weekday.SUN;
  return (zone: TimezoneRegion, wall: NaiveDateTime) => {
    const instant = resolveGraphWallTime(zone, wall);
    const { yr, month1, day1, dse } = wall.date;
    if (yr >= firstUnshiftedYear || (month1 > 1 && month1 < 10)) return instant;
    if (month1 === 1) {
      const january = NaiveDate.fromYmd1Exp(yr, 1, 1);
      const standard = january.addDays((7 + januaryWeekday.isoDow1 - january.dayOfWeek.isoDow1) % 7);
      if (dse >= standard.dse) return instant;
    } else if (month1 === 10) {
      const october = NaiveDate.fromYmd1Exp(yr, 10, octoberMinimum);
      const shifted = october.addDays((7 - october.dayOfWeek.isoDow1) % 7);
      if (day1 < shifted.day1) return instant;
    }
    return instant.add({ ms: Time.MS_PER_HR });
  };
}

const ARGENTINA_START_CLOCK_WINDOWS = [
  ["2008-01-01", "2008-01-03"],
  ["2008-03-09", "2008-03-16"],
].map(([start, end]) => [NaiveDate.parse(start).dse, NaiveDate.parse(end).dse] as const);

/** Decode the master's shifted clock in the two early-2008 Windows windows. */
export function graphArgentinaAnchor(
  startDay: NaiveDate,
  local: NaiveDateTime,
  hasRangeZone: boolean,
): NaiveDateTime {
  return ARGENTINA_START_CLOCK_WINDOWS.some(([start, end]) => start <= startDay.dse && startDay.dse < end)
    ? local.add({ ms: hasRangeZone ? Time.MS_PER_HR : -Time.MS_PER_HR })
    : local;
}

const SAO_PAULO_NEW_YEAR = NaiveDate.parse("2019-01-01").dse;

export function resolveGraphSaoPauloWallTime(
  zone: TimezoneRegion,
  local: NaiveDateTime,
): DateTime<FixedOffset> {
  // Graph projects the first hour of New Year's Day one hour later in 2019.
  const wall = local.date.dse === SAO_PAULO_NEW_YEAR &&
      local.time.toMs < Time.MS_PER_HR
    ? local.add({ ms: Time.MS_PER_HR })
    : local;
  return resolveGraphWallTime(zone, wall);
}

const SAO_PAULO_ANCHOR_START = NaiveDate.parse("2018-11-05").dse;

/** Decode the stored clock for the final weeks of Graph's 2018 Brazilian season. */
export function graphBrazil2018Anchor(
  startDay: NaiveDate,
  local: NaiveDateTime,
  hasRangeZone: boolean,
): NaiveDateTime {
  if (
    startDay.dse < SAO_PAULO_ANCHOR_START ||
    startDay.dse >= SAO_PAULO_NEW_YEAR
  ) {
    return local;
  }
  return local.add({ ms: hasRangeZone ? Time.MS_PER_HR : -Time.MS_PER_HR });
}

/** Graph's Windows Morocco definition diverges from IANA starting in 2026. */
export function graphMorocco(zone: TimezoneRegion): TimezoneRegion {
  const changes = ([
    ["2026-01-01T00:00:00+01:00", "2025-12-31T23:00:00+00:00", "+01", "+00"],
    ["2026-03-22T02:00:00+00:00", "2026-03-22T03:00:00+01:00", "+00", "+01"],
    ["2026-09-20T02:00:00+01:00", "2026-09-20T01:00:00+00:00", "+01", "+00"],
  ] as const).map(([before, after, before_tz_abbr, after_tz_abbr]) =>
    TimezoneRegion.Transition.parse({
      before,
      after,
      before_tz_abbr,
      after_tz_abbr,
    }, zone.fullname)
  );
  return new TimezoneRegion(zone.fullname, [
    ...zone.transitions.filter((transition) => transition.before.mse < changes[0]!.before.mse),
    ...changes,
  ]);
}

const MOROCCO_ANCHOR_START = DateTime.fromRfc3339("2025-09-21T01:00:00Z").exp().mse;
const MOROCCO_ANCHOR_END = NaiveDate.parse("2026-01-01").dse;

/** Recover the recurrence clock from Graph's legacy Morocco master encoding. */
export function graphMoroccoAnchor(
  stored: DateTime<Utc>,
  local: NaiveDateTime,
  hasRangeZone: boolean,
): NaiveDateTime {
  if (stored.mse < MOROCCO_ANCHOR_START || local.date.dse >= MOROCCO_ANCHOR_END) {
    return local;
  }
  // Blank ranges use the stored UTC clock as a wall clock. Graph retains a
  // named range when the submitted start had crossed to the prior UTC date,
  // and stores the clock for that form an hour before its ordinary local value.
  if (!hasRangeZone) return stored.ndt;
  const hour = Math.floor(local.time.toMs / Time.MS_PER_HR);
  return hour === 22 ? local.add({ ms: Time.MS_PER_HR }) : local;
}

const VOLGOGRAD_REFORM = NaiveDate.parse("2020-12-27");
const VOLGOGRAD_2020_START = NaiveDate.parse("2020-01-01").dse;
const VOLGOGRAD_2020_END = NaiveDate.parse("2021-01-01").dse;

/** Windows Volgograd used an additional hour throughout Graph's 2020 recurrence calendar. */
export function graphVolgograd(zone: TimezoneRegion): TimezoneRegion {
  const changes = ([
    ["2020-01-01T00:00:00+04:00", "2020-01-01T01:00:00+05:00", "+04", "+05"],
    ["2020-12-27T02:00:00+05:00", "2020-12-27T01:00:00+04:00", "+05", "+04"],
    ["2021-01-01T00:00:00+04:00", "2020-12-31T23:00:00+03:00", "+04", "+03"],
  ] as const).map(([before, after, before_tz_abbr, after_tz_abbr]) =>
    TimezoneRegion.Transition.parse({
      before,
      after,
      before_tz_abbr,
      after_tz_abbr,
    }, zone.fullname)
  );
  return new TimezoneRegion(zone.fullname, [
    ...zone.transitions.filter(({ before }) =>
      before.mse < changes[0]!.before.mse ||
      before.mse > changes[2]!.before.mse
    ),
    ...changes,
  ]);
}

/** Recover the recurrence clock carried by a UTC Volgograd master. */
export function graphVolgogradAnchor(
  stored: DateTime<Utc>,
  startDay: NaiveDate,
  hasRangeZone: boolean,
): NaiveDateTime | undefined {
  if (
    startDay.dse < VOLGOGRAD_2020_START || startDay.dse >= VOLGOGRAD_2020_END
  ) {
    return undefined;
  }
  if (hasRangeZone) {
    const hours = startDay.dse < VOLGOGRAD_REFORM.dse ? 7 : 5;
    return stored.ndt.add({ ms: hours * Time.MS_PER_HR });
  }
  const wall = stored.ndt.add({ ms: 3 * Time.MS_PER_HR });
  // For blank ranges at the two December cutovers, the supplied range
  // date selects the adjacent hour when the stored clock crossed midnight.
  if (startDay.dse === VOLGOGRAD_REFORM.dse && wall.date.dse < startDay.dse) {
    return wall.add({ ms: Time.MS_PER_HR });
  }
  if (startDay.dse === VOLGOGRAD_2020_END - 1 && wall.date.dse > startDay.dse) {
    return wall.add({ ms: -Time.MS_PER_HR });
  }
  return wall;
}

/** Graph's legacy Samoa definition skips January 1, 2012. */
export function graphHistoricalSamoa(zone: TimezoneRegion): TimezoneRegion {
  const moved = TimezoneRegion.Transition.parse({
    before: "2012-01-01T00:00:00-10:00",
    after: "2012-01-02T00:00:00+14:00",
    before_tz_abbr: "-10",
    after_tz_abbr: "+14",
  }, zone.fullname);
  const ianaGap = SAMOA_SKIP.addDays(-2).withTime(new NaiveTime(0));
  return new TimezoneRegion(zone.fullname, [
    ...zone.transitions.filter((transition) =>
      transition.before.time.ndt.mse !== ianaGap.mse
    ),
    moved,
  ]);
}

export function needsGraphHistoricalSamoa(start: NaiveDate): boolean {
  return start.dse <= SAMOA_SKIP.dse;
}

function graphViewBound(value: DateTime | string): { instant: DateTime; fractionMs: number } {
  if (typeof value !== "string") return { instant: value, fractionMs: 0 };
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/i.exec(value);
  if (match == null) {
    throw new RangeError("Graph calendarView bounds must be ISO date-time strings");
  }
  const [, clock, fraction = "", offset = "Z"] = match;
  // Graph rounds to the nearest 100 ns, carrying into the next second if needed.
  const roundUp = Number(fraction.charAt(7)) >= 5;
  const ticks = Number(fraction.slice(0, 7).padEnd(7, "0")) + Number(roundUp);
  const instant = DateTime.fromRfc3339(clock + offset).exp().add({ ms: Math.floor(ticks / 10000) });
  return { instant, fractionMs: ticks % 10000 / 10000 };
}

export function graphViewBounds(start: DateTime | string, end: DateTime | string): {
  startMse: MsSinceEpoch;
  endMse: MsSinceEpoch;
  startFractionMs: number;
  endFractionMs: number;
  includesEnd: boolean;
  endDay: NaiveDate;
} {
  const lower = graphViewBound(start);
  const upper = graphViewBound(end);
  const startMse = lower.instant.mse;
  const endMse = upper.instant.mse;
  const wholeDifference = startMse - endMse;
  const fractionalDifference = upper.fractionMs - lower.fractionMs;
  if (wholeDifference > fractionalDifference) {
    throw new RangeError("Graph calendarView end must not precede start");
  }
  return {
    startMse,
    endMse,
    startFractionMs: lower.fractionMs,
    endFractionMs: upper.fractionMs,
    includesEnd: wholeDifference === fractionalDifference,
    endDay: upper.instant.toUtc().ndt.date,
  };
}

export interface GraphViewWindow {
  startMse: number;
  endMse: number;
  startFractionMs?: number;
  endFractionMs?: number;
  includesEnd?: boolean;
  durationMs: number;
  allDaySelection?: (date: NaiveDate) => readonly [startMse: number, endMse: number];
  excludedSlots?: ReadonlySet<number>;
}

export function graphViewOverlaps(
  view: GraphViewWindow,
  startMse: number,
  endMse = startMse + view.durationMs,
): boolean {
  // Compare the remainder separately so a 100 ns tick survives at modern epoch values.
  return graphViewStartsWithinUpperBound(view, startMse) &&
    endMse - view.startMse >= (view.startFractionMs ?? 0);
}

function graphViewStartsWithinUpperBound(view: GraphViewWindow, startMse: number): boolean {
  const fraction = view.endFractionMs ?? 0;
  const difference = startMse - view.endMse;
  return difference < fraction || (view.includesEnd === true && difference === fraction);
}

// The selection clock keeps the historical date line while incorporating
// later seasonal offset changes. The displayed clock follows the splice.
export function graphSamoaSelectionMse(zone: TimezoneRegion, wall: NaiveDateTime): number {
  const offset = wall.date.dse > SAMOA_SKIP.dse ? Time.MS_PER_DAY : 0;
  return resolveGraphWallTime(zone, wall).mse + offset;
}

function* samoaOccurrences(
  rule: RRule,
  start: NaiveDateTime,
  zone: TimezoneRegion,
  allDay: boolean,
  generationLimit?: number,
  view?: GraphViewWindow,
): Generator<NaiveDate | DateTime<Utc>> {
  const options = rule.inner.options;
  let remaining = options?.count ?? Infinity;
  // The rule is selected in civil time before Graph projects the skipped day.
  // A numbered range ending on the skipped day can include the next civil day.
  const wallRule = options?.count == null ? rule : new RRule({
    ...rule.inner,
    options: { ...options, count: undefined },
  });
  for (
    const wall of RRuleInstances.expand(wallRule, start, false, generationLimit)
  ) {
    if (remaining === 0 && wall.date.dse !== SAMOA_AFTER.dse) return;
    const skipped = wall.date.dse === SAMOA_SKIP.dse;
    let selected = true;
    if (view != null) {
      const span = allDay ? view.allDaySelection?.(wall.date) : undefined;
      const selectionMse = span?.[0] ?? graphSamoaSelectionMse(zone, wall);
      if (!graphViewStartsWithinUpperBound(view, selectionMse)) return;
      const endMse = span?.[1] ?? (allDay
        ? graphSamoaSelectionMse(zone, wall.add({ days: view.durationMs / Time.MS_PER_DAY }))
        : undefined);
      const slot = allDay ? wall.date.dse : selectionMse;
      selected = !view.excludedSlots?.has(slot) && graphViewOverlaps(view, selectionMse, endMse);
    }
    if (selected && allDay) {
      yield skipped ? SAMOA_AFTER : wall.date;
    } else if (selected) {
      const local = skipped
        ? SAMOA_AFTER.withTime(new NaiveTime(wall.time.mins * Time.MS_PER_MIN))
        : wall;
      yield resolveGraphWallTime(zone, local).toUtc();
    }
    if (--remaining <= 0 && !skipped) return;
  }
}

export function graphSamoaGenerator(
  rule: RRule,
  start: NaiveDateTime,
  zone: TimezoneRegion,
  allDay: boolean,
  generationLimit?: number,
  view?: GraphViewWindow,
): {
  generateUpToDate(through: NaiveDate): (NaiveDate | DateTime<Utc>)[];
} {
  const occurrences = samoaOccurrences(
    rule,
    start,
    zone,
    allDay,
    generationLimit,
    view,
  );
  let next: IteratorResult<NaiveDate | DateTime<Utc>> | undefined;
  let failure: Error | undefined;
  return {
    generateUpToDate(through: NaiveDate): (NaiveDate | DateTime<Utc>)[] {
      if (failure != null) throw failure;
      const dates: (NaiveDate | DateTime<Utc>)[] = [];
      try {
        next ??= occurrences.next();
        while (!next.done) {
          const occurrence = next.value;
          const date = "ndt" in occurrence ? occurrence.ndt.date : occurrence;
          if (date.dse > through.dse) break;
          dates.push(occurrence);
          next = occurrences.next();
        }
        return dates;
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
        throw failure;
      }
    },
  };
}
