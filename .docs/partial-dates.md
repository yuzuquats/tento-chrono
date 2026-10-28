# Partial Dates

`PartialDate` represents a calendar bucket rather than a precise instant. It is
used for rollups, calendar navigation, semantic filters, and API values that can
mean "this year", "this month", "this week", or "this day".

## Supported Shapes

| Shape | String | Meaning |
| --- | --- | --- |
| Year | `y-2026` | The whole calendar year |
| Month | `ym-2026-4` | The whole month |
| Week | `yw-2026-18` | ISO week 18 of ISO year 2026 |
| Day | `ymd-2026-4-29` | A single date |

The TypeScript formatter does not pad month, week, or day fields. The Rust
formatter pads month, week, and day fields. Parsers accept the semantic shape,
so callers should compare parsed values rather than relying on exact string
padding outside stable wire formats.

## Range Semantics

Every partial date has an inclusive `start` and exclusive `end`.

```typescript
const month = PartialDate.fromMonth(2026, 4);
const range = month.toRange();
// range.start is 2026-04-01
// range.end is 2026-05-01
```

This exclusive-end model makes adjacent buckets compose cleanly and matches
database/query window patterns.

## Type Conversion

`toType()` projects a partial date to another scale using the start date as the
anchor. `generateSubPartials()` expands a larger bucket into smaller buckets.

```typescript
const year = PartialDate.fromYear(2026);
const months = year.generateSubPartials("month");
const firstMonthAsDays = months[0].generateSubPartials("day");
```

Weeks use ISO week-year semantics. A late-December date can belong to week 1 of
the next ISO year, so use `date.isoYear` and `date.isoWno` when constructing
weekly values from a `NaiveDate`.

## Rust Parity

Rust exposes the same domain idea as:

```rust
pub enum PartialDate {
  Y(i32),
  Ym(YearMonth),
  Ymd(NaiveDate),
  Yw { yr: i32, week: u32 },
}
```

Rust `PartialDate` serializes as a string and deserializes from the same shapes.
`SemanticTime` wraps either a `PartialDate` range or an RFC 3339 point in time,
which lets API models accept both bucket-level and instant-level time values.

## API Guidance

- Use `PartialDate` when a field is intentionally imprecise.
- Use `NaiveDate` when the field is always one date.
- Use `DateTime<Utc>` when the field must identify a real instant.
- Convert to `DateTime` only when a timezone and display window are known.
