# Fix verified Chrono correctness gaps

Claude and Gemini Neon confirmed five findings against dc64ff8. Correct civil-date membership with exact fragments, reject out-of-range iCalendar clock fields, charge yearly lookbehind only where needed, close composed iterators, and round RFC 3339 decimals without binary floating-point ties.
