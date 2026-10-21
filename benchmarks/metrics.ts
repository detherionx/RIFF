export type Event = { midi: number; time: number };

/** Maximum one-to-one onset/pitch matching; duplicates cannot inflate recall. */
export function metrics(expected: Event[], observed: Event[], tolerance = 0.1) {
  const owner = new Map<number, number>();
  const match = (i: number, seen: Set<number>): boolean => {
    const candidates = observed.map((note, j) => ({ note, j }))
      .filter(({ note }) => note.midi === expected[i].midi && Math.abs(note.time - expected[i].time) <= tolerance)
      .sort((a, b) => Math.abs(a.note.time - expected[i].time) - Math.abs(b.note.time - expected[i].time));
    for (const { j } of candidates) {
      if (seen.has(j)) continue;
      seen.add(j);
      if (!owner.has(j) || match(owner.get(j)!, seen)) { owner.set(j, i); return true; }
    }
    return false;
  };
  expected.forEach((_, i) => match(i, new Set()));
  const truePositive = owner.size;
  const errors = [...owner].map(([j, i]) => Math.abs(observed[j].time - expected[i].time) * 1000);
  return {
    expected: expected.length, observed: observed.length, truePositive,
    falsePositive: observed.length - truePositive, falseNegative: expected.length - truePositive,
    precision: observed.length ? truePositive / observed.length : null,
    recall: expected.length ? truePositive / expected.length : null,
    onsetMaeMs: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
  };
}
