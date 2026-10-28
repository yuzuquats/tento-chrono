# Secondary Calendars

The secondary-calendar modules convert Gregorian dates into alternate calendar
systems for display in calendar cells.

## Supported Converters

The public surface exports converters for:

- lunar;
- Hebrew;
- Islamic;
- Persian;
- Thai;
- Ethiopian;
- Indian.

`calendar-cell-data.ts` collects the display data used by calendar views.

## Boundary

Secondary calendars are display metadata. They should not replace
`NaiveDate`, `DateTime`, or `PartialDate` as the primary domain value for
storage, sync, filtering, or recurrence.

Use them when a user-facing calendar surface needs alternate labels for an
already-known Gregorian date.

## Testing

Fixture coverage lives under `tests/secondary-calendars/`. Add fixture rows
when changing converter behavior so regressions are visible across calendar
systems rather than only through a single example date.
