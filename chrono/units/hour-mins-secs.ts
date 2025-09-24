import { Time } from "../time";
import { TentoMath } from "../utils";
import { Signed } from "./units";

export namespace Hms {
  export function fromMs(ms: number): Hms.Parts {
    return {
      hrs: Math.floor(ms * Time.MS_PER_HR_INV),
      mins: Math.floor((ms % Time.MS_PER_HR) * Time.MS_PER_MIN_INV),
      secs: Math.floor((ms % Time.MS_PER_MIN) * Time.MS_PER_SEC_INV),
    };
  }

  export function toMs(hms: Hms.Parts.Opt): number {
    return (
      (hms.hrs ?? 0) * Time.MS_PER_HR +
      (hms.mins ?? 0) * Time.MS_PER_MIN +
      (hms.secs ?? 0) * Time.MS_PER_SEC
    );
  }

  export function fromRfc3339(
    format: string,
  ): Optional<Hms.Parts & Signed.Parts> {
    const neg = format.startsWith("-");
    const sign = neg ? -1 : 1;
    neg && (format = format.slice(1));
    format.startsWith("+") && (format = format.slice(1));
    const [hours, mins, seconds] = format.split(":");
    return {
      sign,
      hrs: TentoMath.numberOrNull(Number.parseInt(hours)) ?? 0,
      mins: TentoMath.numberOrNull(Number.parseInt(mins)) ?? 0,
      secs: TentoMath.numberOrNull(Number.parseInt(seconds)) ?? 0,
    };
  }

  export function toRfc3339(hms: Optional<Hms.Parts>): string {
    return [
      hms.hrs ? hms.hrs.toString().padStart(2, "0") : "00",
      hms.mins ? hms.mins.toString().padStart(2, "0") : "00",
      hms.secs ? hms.secs.toString().padStart(2, "0") : "00",
    ].join(":");
  }

  export function isStrict(hms: Hms.Parts): boolean {
    if (hms.mins < 0 || hms.mins >= 60) return false;
    if (hms.secs < 0 || hms.secs >= 60) return false;
    return true;
  }
}

export namespace Hms {
  export type Parts = {
    readonly hrs: number;
    readonly mins: number;
    readonly secs: number;
  };

  export namespace Parts {
    export type Opt = Optional<Parts>;
  }

  export type To = {
    readonly toHrs: number;
    readonly toMins: number;
    readonly toSecs: number;
  };

  export type ToF = {
    readonly toHrsF: number;
    readonly toMinsF: number;
    readonly toSecsF: number;
  };
}
