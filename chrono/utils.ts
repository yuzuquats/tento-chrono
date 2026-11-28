import type { Option } from "./option.ts";

export namespace TentoMath {
  /**
   * The quotient rounded toward negative infinity: `floorDiv(-1, 4) === -1`,
   * `floorDiv(-4, 4) === -1`, `floorDiv(-5, 4) === -2`. Exact for safe
   * integers: the remainder is taken off before dividing, so the division
   * never rounds.
   *
   * @example
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { TentoMath } from "./utils.ts";
   * assertEquals(TentoMath.floorDiv(7, 4), 1);
   * assertEquals(TentoMath.floorDiv(-1, 4), -1);
   * assertEquals(TentoMath.floorDiv(-4, 4), -1);
   * assertEquals(TentoMath.floorDiv(-5, 4), -2);
   * ```
   */
  export function floorDiv(dividend: number, divisor: number): number {
    const remainder = dividend % divisor;
    const quotient = (dividend - remainder) / divisor;
    return remainder !== 0 && (remainder < 0) !== (divisor < 0) ? quotient - 1 : quotient;
  }

  export function mod(n: number, mod: number): number {
    if (n > 0) return n % mod;
    return (mod - (-n % mod)) % mod;
  }

  export function numberOrNull(n: Option<number>): Option<number> {
    if (n == null || n === undefined) return null;
    if (Number.isNaN(n)) return null;
    return n;
  }

  export function int(s: Option<string>): number {
    if (!s) return 0;
    let n = Number.parseInt(s);
    if (Number.isNaN(n)) return 0;
    return n;
  }

  export function parseOpt(s: Option<string>): Option<number> {
    if (!s) return null;
    const n = Number.parseInt(s);
    if (Number.isNaN(n) || !Number.isFinite(n)) return null;
    return n;
  }
}

const DIGIT_PAIRS = Array.from({ length: 100 }, (_, n) => String(n).padStart(2, "0"));

/** @internal Format a numeric calendar field with at least two digits. */
export function formatDigitPair(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < 100 ? DIGIT_PAIRS[n] : String(n).padStart(2, "0");
}

/** @internal Read exactly two ASCII decimal digits, or return NaN. */
export function readAsciiDigitPair(text: string, index: number): number {
  const tens = text.charCodeAt(index) - 48;
  const ones = text.charCodeAt(index + 1) - 48;
  return tens >= 0 && tens <= 9 && ones >= 0 && ones <= 9 ? tens * 10 + ones : NaN;
}
