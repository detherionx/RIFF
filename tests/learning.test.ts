import test from "node:test";
import assert from "node:assert/strict";
import { exercises, getExercise, skills, stages } from "../lib/curriculum";
import { initialProgress, recommend, recordAttempt } from "../lib/learning";
import type { Attempt, Progress } from "../lib/types";

let sequence = 0;
const take = (
  exerciseId = "first-light-bass",
  score: number | null = 95,
  overrides: Partial<Attempt> = {},
): Attempt => ({
  id: `take-${sequence++}`,
  exerciseId,
  skill: getExercise(exerciseId)!.skill,
  at: new Date().toISOString(),
  bpm: 100,
  seconds: 20,
  evidence: {
    confidence: "high",
    score,
    pitchAccuracy: score,
    timingMs: 30,
    missed: 0,
    extra: 0,
    consistency: 95,
    message: "Test take",
  },
  ...overrides,
});
function mastered(): Progress {
  let progress = initialProgress();
  for (const skill of skills)
    for (let i = 0; i < 3; i++)
      progress = recordAttempt(
        progress,
        take(exercises.find((item) => item.skill === skill.id)!.id),
      );
  return progress;
}

test("all six stages include playable notes and the final study is eight 6/8 bars", () => {
  for (const stage of stages)
    assert.ok(
      exercises.some((item) => item.stage === stage.id && item.notes.length),
    );
  const finale = getExercise("first-light-study")!;
  assert.equal(finale.beats, 48);
  assert.equal(finale.notes.length, 48);
  const tuning = [0, 64, 59, 55, 50, 45, 40];
  for (const item of exercises)
    for (const note of item.notes)
      assert.equal(note.midi, tuning[note.string] + note.fret);
});
test("a fresh learner gets the bass and prerequisites cannot be skipped by manual selection", () => {
  let progress = initialProgress();
  assert.equal(recommend(progress).exerciseId, "first-light-bass");
  for (let i = 0; i < 3; i++)
    progress = recordAttempt(progress, take("first-light-study"));
  assert.equal(progress.mastery.performance?.value, 0);
  assert.equal(recommend(progress).exerciseId, "first-light-bass");
});
test("two clean takes increase tempo; three unlock the next skill", () => {
  let progress = recordAttempt(initialProgress(), take());
  assert.equal(recommend(progress).bpm, 100);
  progress = recordAttempt(progress, take());
  assert.equal(recommend(progress).bpm, 105);
  progress = recordAttempt(progress, take());
  assert.equal(recommend(progress).exerciseId, "finger-voices");
});
test("null or low-confidence scores never grant mastery or tempo progress", () => {
  let progress = recordAttempt(
    initialProgress(),
    take("first-light-bass", null),
  );
  const low = take();
  low.evidence.confidence = "low";
  progress = recordAttempt(progress, low);
  assert.equal(progress.mastery.strings?.value, 0);
  assert.equal(progress.mastery.strings?.bestBpm, 0);
  assert.equal(recommend(progress).mode, "diagnostic");
});
test("weak full-phrase transition becomes a playable bridge then rejoins the phrase", () => {
  let progress = mastered();
  const failed = take("first-light-study", 60);
  failed.evidence.weakestTransition = 6;
  progress = recordAttempt(progress, failed);
  const rec = recommend(progress);
  const bridge = getExercise(rec.exerciseId)!;
  assert.equal(rec.exerciseId, "first-light-study-transition-6");
  assert.equal(
    bridge.notes[0].midi,
    getExercise("first-light-study")!.notes[5].midi,
  );
  assert.equal(
    bridge.notes[1].midi,
    getExercise("first-light-study")!.notes[6].midi,
  );
  const value = progress.mastery.performance!.value;
  for (let i = 0; i < 2; i++)
    progress = recordAttempt(progress, take(bridge.id, 95, { bpm: rec.bpm }));
  assert.equal(
    progress.mastery.performance!.value,
    value,
    "bridge cannot falsely master whole performance",
  );
  assert.equal(recommend(progress).exerciseId, "first-light-study");
});
test("interval errors target the specific pair, invalid indexes fall back safely", () => {
  let progress = mastered();
  const failed = take("interval-echo", 60);
  failed.evidence.weakestTransition = 1;
  progress = recordAttempt(progress, failed);
  assert.equal(recommend(progress).exerciseId, "interval-echo-transition-1");
  assert.equal(getExercise("interval-echo-transition-99"), undefined);
  assert.equal(getExercise("interval-echo-transition-0"), undefined);
});
test("an overdue skill is reviewed before a new acquisition", () => {
  let progress = initialProgress();
  for (let i = 0; i < 3; i++) progress = recordAttempt(progress, take());
  progress.mastery.strings!.reviewAt = "2000-01-01T00:00:00.000Z";
  assert.equal(recommend(progress).mode, "review");
  assert.equal(recommend(progress).exerciseId, "first-light-bass");
});
test("duplicate and malformed attempts leave progress intact", () => {
  const attempt = take();
  const progress = recordAttempt(initialProgress(), attempt);
  assert.equal(recordAttempt(progress, attempt), progress);
  assert.equal(
    recordAttempt(progress, take("first-light-bass", 90, { bpm: Number.NaN })),
    progress,
  );
  assert.equal(
    recordAttempt(
      progress,
      take("first-light-bass", 90, { skill: "performance" }),
    ),
    progress,
  );
});
test("theory answers persist without substituting for playing mastery", () => {
  const answer = {
    ...take(),
    exerciseId: "theory-scale",
    skill: "theory" as const,
    bpm: 0,
  };
  const progress = recordAttempt(initialProgress(), answer);
  assert.equal(progress.attempts.length, 1);
  assert.equal(progress.mastery.theory, undefined);
  assert.equal(recommend(progress).exerciseId, "first-light-bass");
  assert.equal(recordAttempt(progress, answer), progress);
});
test("a theory mistake recommends related playing when prerequisites are ready", () => {
  const answer = {
    ...take("interval-echo", 0),
    exerciseId: "theory-interval",
    bpm: 0,
  };
  const progress = recordAttempt(mastered(), answer);
  assert.equal(recommend(progress).exerciseId, "interval-echo");
  assert.equal(recommend(progress).mode, "remediation");
});
