# Recurrence uses RFC 5545 unless an importer selects a compatibility profile

The audit at `d2df70b` found that a folded rule silently dropped BYHOUR and
the permissive reader accepted weekly BYWEEKNO. Google expands weekly
BYWEEKNO and disregards several accepted time selectors in captured cases.
Parsing and expansion need to agree about which input contract the caller selected.

`Recurrence.fromICalendar` binds a profile, DTSTART and the parsed rules into
one series. The default unfolds and validates RFC recurrence properties.
The Google profile uses the existing provider composition. The dateutil and
rrule.js profiles can union multiple RRULEs, which each pinned library does
in the independent captures. Low-level callers select their composition explicitly.

```review-table
| Input | Verification |
| --- | --- |
| RFC 5545 recurrence properties | Published examples and regressions through the public default. |
| Google Calendar event master | Live Calendar API starts replayed offline. |
| dateutil and rrule.js | Captured expectations from pinned versions, plus the full dateutil inventory. |
| Graph patterned recurrence | Native series and expanded calendarView rows from the tester calendar when available. |
```

Graph captures precede any claim of local Outlook parity. The scope is
occurrence starts, including civil dates and floating start values. Full
VCALENDAR parsing, custom VTIMEZONE definitions, and application of detached
events belong to the calendar import layer.
