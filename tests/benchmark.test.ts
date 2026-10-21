import test from "node:test";
import assert from "node:assert/strict";
import { metrics } from "../benchmarks/metrics";
test("benchmark matches notes once and penalizes duplicates and wrong pitches", () => {
  const result = metrics([{ midi: 40, time: 0 }], [{ midi: 40, time: 0.01 }, { midi: 40, time: 0.02 }, { midi: 45, time: 0 }]);
  assert.equal(result.truePositive, 1);
  assert.equal(result.falsePositive, 2);
  assert.equal(result.onsetMaeMs, 10);
  assert.equal(metrics([{ midi: 40, time: 0 }], []).falseNegative, 1);
  assert.equal(metrics([], []).precision, null);
});
