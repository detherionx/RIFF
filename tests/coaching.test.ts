import test from "node:test";
import assert from "node:assert/strict";
import { diagnosticExercise } from "../lib/coaching";
import { getExercise } from "../lib/curriculum";
import { initialProgress, recommend, recordAttempt } from "../lib/learning";
import { validProgress } from "../lib/storage";
import type { Attempt } from "../lib/types";

const exercise = getExercise("first-light-bass-transition-1")!;
const screenshot: Attempt = {
  id: "screenshot", exerciseId: exercise.id, skill: exercise.skill,
  at: "2026-10-19T15:42:00Z", bpm: 55, seconds: 17,
  evidence: { confidence: "medium", score: 45, pitchAccuracy: 44,
    timingMs: 429, extra: 8, missed: 0, consistency: 60, message: "Matched 7 of 8 notes." },
};
test("legacy screenshot triggers diagnosis without reducing tempo or mastery", () => {
  const before = initialProgress();
  before.mastery.strings = { skill: "strings", value: 60, attempts: 2, streak: 1, bestBpm: 55,
    lastPracticed: null, reviewAt: null, errors: [] };
  const progress = recordAttempt(before, screenshot);
  assert.equal(progress.mastery.strings?.value, 60);
  assert.equal(progress.mastery.strings?.streak, 1);
  assert.equal(recommend(progress).mode, "diagnostic");
  assert.equal(recommend(progress).bpm, 55);
});
test("provisional timing cannot advance or reduce mastery", () => {
  for (const score of [20, 100]) {
    const attempt: Attempt = { ...screenshot, exerciseId: "first-light-bass",
      evidence: { ...screenshot.evidence, extra: 0, diagnostic: "timing", score } };
    const progress = recordAttempt(initialProgress(), attempt);
    assert.equal(progress.mastery.strings?.value, 0);
    assert.equal(recommend(progress).mode, "diagnostic");
  }
});
test("two failed bridge takes pause the retry loop at the current tempo", () => {
  let progress = initialProgress();
  for (const id of ["a", "b"]) progress = recordAttempt(progress, { ...screenshot, id,
    evidence: { ...screenshot.evidence, extra: 0 } });
  assert.equal(recommend(progress).mode, "diagnostic");
  assert.equal(recommend(progress).bpm, 55);
});
test("drills keep standard tuning and isolate the actual destination note", () => {
  for (const mode of ["input", "pulse"] as const)
    assert.deepEqual(diagnosticExercise(exercise, mode).notes.map((n) => n.midi), [40, 40, 40, 40]);
  const note = diagnosticExercise(exercise, "note", 1);
  assert.ok(note.notes.every((n) => n.midi === exercise.notes[1].midi && n.string === exercise.notes[1].string));
  assert.deepEqual(note.notes.map((n) => n.beat), [0, 2, 4, 6]);
});
test("diagnostic summaries round-trip, while video and unknown fields are rejected", () => {
  const progress = recordAttempt(initialProgress(), { ...screenshot,
    evidence: { ...screenshot.evidence, diagnostic: "input", matched: 7, expected: 8, observed: 16 } });
  assert.equal(validProgress(JSON.parse(JSON.stringify(progress))), true);
  assert.equal(validProgress({ ...progress, video: "blob:private" }), false);
  progress.attempts[0].evidence.matched = -1;
  assert.equal(validProgress(progress), false);
});
