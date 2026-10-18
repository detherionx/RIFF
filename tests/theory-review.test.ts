import test from "node:test";
import assert from "node:assert/strict";
import { nextTheoryReview, theoryModes, theoryReviews } from "../lib/theory-review";
import type { Attempt } from "../lib/types";

const day = 86_400_000;
const start = Date.parse("2026-01-01T12:00:00.000Z");
function answer(mode: string, offset: number, score: number | null = 100): Attempt {
  return {
    id: `${mode}-${offset}`, exerciseId: `theory-${mode}`, skill: "theory",
    at: new Date(start + offset * day).toISOString(), bpm: 0, seconds: 10,
    evidence: { confidence: "high", score, pitchAccuracy: score, timingMs: null, missed: 0, extra: 0, consistency: null, message: "Quiz answer" },
  };
}

test("each theory mode has its own review schedule and exact due boundary", () => {
  const attempts = theoryModes.map((mode) => answer(mode, 0));
  for (const mode of theoryModes) {
    assert.equal(theoryReviews(attempts, start + day - 1)[mode].due, false);
    assert.equal(theoryReviews(attempts, start + day)[mode].due, true);
    assert.equal(theoryReviews(attempts, start)[mode].dueAt, start + day);
  }
});

test("chronological clean repetitions expand intervals to 1, 3, 7, 14 days", () => {
  const attempts = [answer("scale", 3), answer("scale", 1), answer("scale", 0), answer("scale", 2)];
  for (const [offset, interval] of [1, 3, 7, 14].entries()) {
    const review = theoryReviews(attempts, start + offset * day).scale;
    assert.equal(review.streak, offset + 1);
    assert.equal(review.dueAt, start + (offset + interval) * day);
  }
  assert.equal(attempts[0].at, answer("scale", 3).at, "input history stays unchanged");
});

test("a failure is due immediately and resets the next success to one day", () => {
  const attempts = [answer("rhythm", 0), answer("rhythm", 1), answer("rhythm", 2, 50)];
  assert.deepEqual(theoryReviews(attempts, start + 2 * day).rhythm, { streak: 0, dueAt: start + 2 * day, due: true });
  attempts.push(answer("rhythm", 3));
  assert.deepEqual(theoryReviews(attempts, start + 3 * day).rhythm, { streak: 1, dueAt: start + 4 * day, due: false });
});

test("inconclusive, future and unrelated attempts cannot alter a review", () => {
  const low = answer("interval", 1, 0);
  low.evidence.confidence = "low";
  const attempts = [answer("interval", 0), low, answer("interval", 2, null), answer("interval", 9, 0), answer("unknown", 1)];
  const reviews = theoryReviews(attempts, start + 2 * day);
  assert.deepEqual(reviews.interval, { streak: 1, dueAt: start + day, due: true });
  assert.deepEqual(reviews.note, { streak: 0, dueAt: null, due: false });
});

test("initial review chooses the oldest due mode, with a stable no-history fallback", () => {
  const reviews = theoryReviews([answer("chord", 1), answer("scale", 0), answer("rhythm", 3, 0)], start + 3 * day);
  assert.equal(nextTheoryReview(reviews), "scale");
  assert.equal(nextTheoryReview(theoryReviews([], start)), "note");
});
