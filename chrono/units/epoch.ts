import { Time } from "../time";
import { DaysSinceEpoch, MsSinceEpoch } from "./units";
import { TentoMath } from "../utils";

/**
 * Unix Epoch defined as
 *
 * January 1, 1970, 00:00:00 UTC
 */
export namespace Epoch {
  export function currentMse(): MsSinceEpoch {
    return Date.now() as MsSinceEpoch;
  }

  export function mseToDse(mse: MsSinceEpoch): DaysSinceEpoch {
    return TentoMath.floorDiv(mse, Time.MS_PER_DAY) as DaysSinceEpoch;
  }
}
