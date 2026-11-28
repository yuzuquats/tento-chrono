type Less<T> = (a: T, b: T) => boolean;

interface Run {
  start: number;
  end: number;
  power: number;
}

const INITIAL_GALLOP = 7;

/**
 * Reproduce CPython 3.12 list.sort's comparison order for dateutil's
 * explicit dates. Same-zone wall order and cross-zone instant order can
 * disagree, so another stable sort can change the recurrence set.
 * The run schedule and gallop searches follow CPython's Objects/listsort.txt.
 */
export function sortDateutilDates<T>(values: T[], less: Less<T>): T[] {
  const length = values.length;
  let minRun = length;
  let roundUp = 0;
  while (minRun >= 64) {
    roundUp |= minRun % 2;
    minRun = Math.floor(minRun / 2);
  }
  minRun += roundUp;

  const pending: Run[] = [];
  const threshold = { wins: INITIAL_GALLOP };
  const mergeAt = (i: number) => {
    const first = pending[i];
    const second = pending[i + 1];
    mergeRuns(values, first.start, second.start, second.end, less, threshold);
    first.end = second.end;
    pending.splice(i + 1, 1);
  };

  for (let start = 0; start < length;) {
    const end = prepareRun(values, start, minRun, less);
    const previous = pending.at(-1);
    if (previous != null) {
      const power = midpointPower(previous.start, start, end, length);
      while (pending.length > 1 && pending[pending.length - 2].power > power) {
        mergeAt(pending.length - 2);
      }
      pending[pending.length - 1].power = power;
    }
    pending.push({ start, end, power: 0 });
    start = end;
  }
  while (pending.length > 1) {
    let i = pending.length - 2;
    const earlier = pending[i - 1];
    const later = pending[i + 1];
    if (
      earlier != null && earlier.end - earlier.start < later.end - later.start
    ) {
      i--;
    }
    mergeAt(i);
  }
  return values;
}

function prepareRun<T>(
  values: T[],
  start: number,
  minimum: number,
  less: Less<T>,
) {
  let end = start + 1;
  if (end < values.length) {
    const descending = less(values[end], values[start]);
    for (end++; end < values.length; end++) {
      if (less(values[end], values[end - 1]) !== descending) break;
    }
    if (descending) {
      for (let left = start, right = end - 1; left < right; left++, right--) {
        const item = values[left];
        values[left] = values[right];
        values[right] = item;
      }
    }
  }
  const limit = Math.min(start + minimum, values.length);
  for (; end < limit; end++) {
    const item = values[end];
    let lo = start;
    let hi = end;
    while (lo < hi) {
      const middle = lo + Math.floor((hi - lo) / 2);
      if (less(item, values[middle])) hi = middle;
      else lo = middle + 1;
    }
    values.copyWithin(lo + 1, lo, end);
    values[lo] = item;
  }
  return end;
}

function midpointPower(
  start: number,
  middle: number,
  end: number,
  length: number,
) {
  // Compare successive binary digits of the two normalized run midpoints.
  let a = start + middle;
  let b = middle + end;
  for (let depth = 1;; depth++) {
    if (a >= length) {
      a -= length;
      b -= length;
    } else if (b >= length) {
      return depth;
    }
    a *= 2;
    b *= 2;
  }
}

/** Locate the partition, using the same probes even for inconsistent order. */
function gallop(
  start: number,
  end: number,
  hint: number,
  precedes: (index: number) => boolean,
) {
  const right = precedes(hint);
  const room = right ? end - hint : hint - start + 1;
  let last = 0;
  let distance = 1;
  while (
    distance < room &&
    precedes(hint + (right ? distance : -distance)) === right
  ) {
    last = distance;
    distance = 2 * distance + 1;
  }
  distance = Math.min(distance, room);
  let lo = right ? hint + last + 1 : hint - distance + 1;
  let hi = right ? hint + distance : hint - last;
  while (lo < hi) {
    const middle = lo + Math.floor((hi - lo) / 2);
    if (precedes(middle)) lo = middle + 1;
    else hi = middle;
  }
  return lo;
}

function mergeRuns<T>(
  values: T[],
  start: number,
  middle: number,
  end: number,
  less: Less<T>,
  threshold: { wins: number },
) {
  const first = gallop(
    start,
    middle,
    start,
    (i) => !less(values[middle], values[i]),
  );
  if (first === middle) return;
  const last = gallop(
    middle,
    end,
    end - 1,
    (i) => less(values[i], values[middle - 1]),
  );
  if (last === middle) return;

  const makeRun = (from: number, to: number) => ({
    items: values.slice(from, to),
    lo: 0,
    hi: to - from,
  });
  const a = makeRun(first, middle);
  const b = makeRun(middle, last);
  const forward = a.hi <= b.hi;
  const terminal = forward ? a : b;
  const other = forward ? b : a;
  let out = forward ? first : last - 1;
  const size = (run: typeof a) => run.hi - run.lo;
  const index = (run: typeof a) => forward ? run.lo : run.hi - 1;
  const head = (run: typeof a) => run.items[index(run)];
  const copy = (run: typeof a, count: number) => {
    for (let i = 0; i < count; i++) {
      if (forward) values[out++] = run.items[run.lo++];
      else values[out--] = run.items[--run.hi];
    }
  };
  const canCompare = () => size(terminal) > 1 && size(other) > 0;
  const blockSize = (run: typeof a, precedes: (i: number) => boolean) => {
    const boundary = gallop(run.lo, run.hi, index(run), precedes);
    return forward ? boundary - run.lo : run.hi - boundary;
  };

  // The initial gallops place the first item of the opposite run here.
  copy(other, 1);
  while (canCompare()) {
    let aWins = 0;
    let bWins = 0;
    while (canCompare() && Math.max(aWins, bWins) < threshold.wins) {
      if (less(head(b), head(a)) === forward) {
        copy(b, 1);
        bWins++;
        aWins = 0;
      } else {
        copy(a, 1);
        aWins++;
        bWins = 0;
      }
    }
    if (!canCompare()) break;

    let wins = threshold.wins + 1;
    do {
      wins = Math.max(1, wins - 1);
      threshold.wins = wins;
      aWins = blockSize(a, (i) => !less(head(b), a.items[i]));
      copy(a, aWins);
      if (!canCompare()) break;
      copy(b, 1);
      if (!canCompare()) break;
      bWins = blockSize(b, (i) => less(b.items[i], head(a)));
      copy(b, bWins);
      if (!canCompare()) break;
      copy(a, 1);
    } while (canCompare() && Math.max(aWins, bWins) >= INITIAL_GALLOP);
    if (canCompare()) threshold.wins = wins + 1;
  }
  copy(other, size(other));
  copy(terminal, size(terminal));
}
