/**
 * Work-budget exhaustion, never a successful truncated result.
 * `generateEvents`/`generateGoogleEvents` accept a nonnegative safe-integer
 * generationLimit. It bounds buffered instances, examined candidates and
 * examined periods (including rejected/empty periods); zero permits no work.
 * Output limits and COUNT instead bound results and finish normally at zero.
 * Date generators are lazy; event reads eagerly retain their generated buffer.
 * Omit the work budget for complete finite horizons, or supply it when latency
 * and memory must be bounded and handle this error. A lookahead may consume work.
 * Finite timed horizons scan all relevant periods without an implicit idle cap.
 * Unbounded searches without a budget retain graceful idle termination; legacy
 * date-only materialization also retains its default output cap.
 */
export class RecurrenceExpansionLimitError extends Error {
  constructor(readonly limit: number, readonly eventId?: string) {
    super("recurrence expansion limit exceeded");
    this.name = "RecurrenceExpansionLimitError";
  }
}
