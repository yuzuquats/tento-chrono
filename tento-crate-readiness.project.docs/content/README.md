# Chrono exchange readiness

Project: tento-crate-readiness. This owner-side round preserves established Rust and TypeScript text serialization while extending the TypeScript partial-date parser to signed astronomical years, including zero. Positive padded and plus-signed year inputs remain accepted. Regression tests exchange year/month/day/week values at shared chrono year bounds; ordinary BCE/zero day-count ranges are compared through generated Boa output. Terminal range-end fallback and broader formatter parity are outside this change.

Cargo directly discovers individual integration suites. tests/mod.rs no longer imports those suites, so each logical case runs once. Select a suite with `cargo test -p tento-chrono --test test_partial`.

Validation is in progress against a frozen byte-for-byte copy of the actual public workspace manifests, lock/config and source, under owner admission and dedicated approved output storage. No consumer pin, publication or peer source adoption is implied. Final outcome and exact source closure will be recorded here after qualification.

Documentation provider authority for parallel .docs pages has not been established in this round; that folder-structure finding remains open. No provider paths were changed. Agent board unavailable/not used in this bounded child task; parent coordinates nonoverlapping writes.
