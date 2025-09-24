export namespace TentoMath {
  export function floorDiv(dividend: number, divisor: number): number {
    let quotient = Math.floor(dividend / divisor);
    const remainder = dividend % divisor;
    if (remainder < 0) {
      quotient -= 1;
    }
    return quotient;
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
