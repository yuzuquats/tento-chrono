/** Deterministic xorshift32. Every operation stays in a 32-bit integer. */
export function random32(seed: number): (bound: number) => number {
  let state = seed >>> 0;
  if (state === 0) throw new RangeError("xorshift32 requires a nonzero seed");
  return (bound) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % bound;
  };
}
