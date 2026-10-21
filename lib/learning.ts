import { exercises, getExercise, skills } from "./curriculum";
import type {
  Attempt,
  Mastery,
  Progress,
  Recommendation,
  SkillId,
} from "./types";

export const initialProgress = (): Progress => ({
  version: 1,
  profile: null,
  attempts: [],
  mastery: {},
});
const trusted = (attempt: Attempt) =>
  attempt.evidence.diagnostic !== "input" &&
  attempt.evidence.diagnostic !== "timing" &&
  attempt.evidence.diagnostic !== "overlap" &&
  attempt.evidence.extra < Math.max(3, (getExercise(attempt.exerciseId)?.notes.length ?? Infinity) / 2) &&
  ["high", "medium"].includes(attempt.evidence.confidence) &&
  attempt.evidence.score !== null &&
  Number.isFinite(attempt.evidence.score) &&
  attempt.evidence.score >= 0 &&
  attempt.evidence.score <= 100;
const clean = (attempt: Attempt) =>
  trusted(attempt) && attempt.evidence.score! >= 85;
const baseId = (id: string) => id.replace(/-transition-\d+$/, "");
const masteryFor = (skill: SkillId): Mastery => ({
  skill,
  value: 0,
  attempts: 0,
  streak: 0,
  bestBpm: 0,
  lastPracticed: null,
  reviewAt: null,
  errors: [],
});
const unlocked = (progress: Progress, skill: SkillId) =>
  skills
    .find((item) => item.id === skill)
    ?.prerequisites.every((id) => (progress.mastery[id]?.value ?? 0) >= 80) ??
  false;
const quizSkills: Record<string, SkillId> = {
  "theory-note": "theory",
  "theory-scale": "theory",
  "theory-chord": "theory",
  "theory-interval": "intervals",
  "theory-rhythm": "rhythm",
};

export function recordAttempt(progress: Progress, attempt: Attempt): Progress {
  // Reject malformed or duplicated boundary data without changing saved progress.
  const exercise = getExercise(attempt.exerciseId);
  const quiz = quizSkills[attempt.exerciseId];
  if (
    (!exercise && !quiz) ||
    (exercise?.skill ?? quiz) !== attempt.skill ||
    !attempt.id ||
    progress.attempts.some((item) => item.id === attempt.id) ||
    !Number.isFinite(Date.parse(attempt.at)) ||
    !Number.isFinite(attempt.bpm) ||
    attempt.bpm < (quiz && attempt.exerciseId !== "theory-rhythm" ? 0 : 30) ||
    attempt.bpm > 300 ||
    !Number.isFinite(attempt.seconds) ||
    attempt.seconds < 0
  )
    return progress;
  // Theory answers are useful evidence, but cannot establish guitar-playing mastery.
  if (quiz)
    return {
      ...progress,
      attempts: [...progress.attempts, attempt].slice(-500),
    };
  const previous = progress.mastery[attempt.skill] ?? masteryFor(attempt.skill);
  const next = {
    ...previous,
    attempts: previous.attempts + 1,
    lastPracticed: attempt.at,
  };
  const sufficient = trusted(attempt);
  const success = clean(attempt);
  const isolated = baseId(attempt.exerciseId) !== attempt.exerciseId;
  if (sufficient && !isolated && unlocked(progress, attempt.skill)) {
    next.streak = success ? previous.streak + 1 : 0;
    next.value = Math.max(
      0,
      Math.min(100, previous.value + (success ? 30 : -10)),
    );
    next.bestBpm = success
      ? Math.max(previous.bestBpm, attempt.bpm)
      : previous.bestBpm;
    const days = success ? [1, 3, 7, 14][Math.min(next.streak - 1, 3)] : 1;
    next.reviewAt = new Date(
      Date.parse(attempt.at) + days * 86_400_000,
    ).toISOString();
  } else if (!sufficient) {
    // A noisy take is not evidence of either mastery or regression.
    next.streak = previous.streak;
  }
  next.errors = !sufficient
    ? ["Input or timing needs checking before this take can assess progress."]
    : success
      ? []
      : [
          attempt.evidence.weakestTransition !== undefined
            ? `Transition into note ${attempt.evidence.weakestTransition + 1} needs attention.`
            : "Repeat slowly with clear, evenly spaced notes.",
        ];
  return {
    ...progress,
    attempts: [...progress.attempts, attempt].slice(-500),
    mastery: { ...progress.mastery, [attempt.skill]: next },
  };
}

export function recommend(
  progress: Progress,
  minutes = progress.profile?.minutes ?? 10,
): Recommendation {
  const latest = progress.attempts.at(-1);
  const short =
    minutes <= 5 ? " Keep this session to one focused exercise." : "";
  const result = (
    exerciseId: string,
    bpm: number,
    mode: Recommendation["mode"],
    reason: string,
  ): Recommendation => ({
    exerciseId,
    bpm: Math.round(Math.max(40, Math.min(200, bpm))),
    mode,
    reason: reason + short,
  });
  const consecutiveClean = (id: string, bpm: number) => {
    let count = 0;
    for (let i = progress.attempts.length - 1; i >= 0; i--) {
      const attempt = progress.attempts[i];
      if (attempt.exerciseId !== id || attempt.bpm !== bpm || !clean(attempt))
        break;
      count++;
    }
    return count;
  };

  if (
    latest &&
    quizSkills[latest.exerciseId] &&
    !clean(latest) &&
    unlocked(progress, latest.skill)
  ) {
    const exercise = exercises.find((item) => item.skill === latest.skill)!;
    return result(
      exercise.id,
      exercise.bpm,
      "remediation",
      "Connect that theory question to sound: play the related pattern slowly, then return to the quiz.",
    );
  }
  if (
    latest &&
    getExercise(latest.exerciseId) &&
    unlocked(progress, latest.skill)
  ) {
    const exercise = getExercise(latest.exerciseId)!;
    const struggling = progress.attempts.filter((a) => a.exerciseId === exercise.id).slice(-3);
    if (latest.evidence.diagnostic === "overlap")
      return result(exercise.id, latest.bpm, "diagnostic",
        "Possible C3/low-E overlap: replay the flagged moments, then isolate four C3 picks while keeping low E silent. Return to this phrase at the same tempo. This evidence does not identify a hand-position fault.");
    if (latest.evidence.diagnostic === "timing")
      return result(exercise.id, latest.bpm, "diagnostic",
        latest.evidence.weakestTransition !== undefined
          ? "Check the displayed destination note on its own, then return to the phrase. Unknown device delay prevents a timing score."
          : "Compare four isolated picks with four detections, then practise equal gaps in the pulse drill. Timing includes unknown device delay; keep this tempo.");
    if (latest.evidence.diagnostic === "input" ||
        latest.evidence.extra >= Math.max(3, exercise.notes.length / 2) ||
        (struggling.length >= 2 && struggling.every((a) => !clean(a))))
      return result(exercise.id, latest.bpm, "diagnostic",
        "Pause the retry loop. Check four isolated low E plucks, then practise one note or the pulse separately. Unknown input delay must not be treated as late playing.");
    if (!trusted(latest))
      return result(
        exercise.id,
        latest.bpm,
        "consolidation",
        "This recording cannot support a progress decision. Check tuning and microphone level, then try again.",
      );
    const isolated = baseId(exercise.id) !== exercise.id;
    if (isolated) {
      if (consecutiveClean(exercise.id, latest.bpm) >= 2)
        return result(
          baseId(exercise.id),
          latest.bpm,
          "consolidation",
          "Two clear bridge repetitions: reconnect the change inside the full phrase.",
        );
      return result(
        exercise.id,
        clean(latest) ? latest.bpm : latest.bpm - 5,
        "remediation",
        "Keep this two-note bridge until two consecutive takes are clear and steady.",
      );
    }
    if (!clean(latest)) {
      const index = latest.evidence.weakestTransition;
      const isolate =
        index !== undefined && Number.isInteger(index)
          ? getExercise(`${exercise.id}-transition-${index}`)
          : undefined;
      if (isolate)
        return result(
          isolate.id,
          latest.bpm - 15,
          "remediation",
          exercise.skill === "intervals"
            ? "Isolate the interval that needs work. Hear the destination note before you play it."
            : "The change into the highlighted note needs work. Practise that bridge before repeating the whole phrase.",
        );
      return result(
        exercise.id,
        latest.bpm - 10,
        "remediation",
        "Slow the pulse and rebuild a clear, even take before adding speed.",
      );
    }
  }

  const now = Date.now();
  const due = skills
    .filter(
      (item) =>
        unlocked(progress, item.id) &&
        progress.mastery[item.id]?.reviewAt &&
        Date.parse(progress.mastery[item.id]!.reviewAt!) <= now,
    )
    .sort(
      (a, b) =>
        Date.parse(progress.mastery[a.id]!.reviewAt!) -
        Date.parse(progress.mastery[b.id]!.reviewAt!),
    )[0];
  if (due) {
    const exercise = exercises.find((item) => item.skill === due.id)!;
    return result(
      exercise.id,
      progress.mastery[due.id]!.bestBpm || exercise.bpm,
      "review",
      "This skill is due for spaced review. A short recall now helps it stay available next time.",
    );
  }

  const nextSkill = skills.find(
    (item) =>
      unlocked(progress, item.id) &&
      (progress.mastery[item.id]?.value ?? 0) < 80,
  );
  if (nextSkill) {
    const exercise = exercises.find((item) => item.skill === nextSkill.id)!;
    if (
      latest?.skill === nextSkill.id &&
      latest.exerciseId === exercise.id &&
      clean(latest)
    ) {
      const faster = consecutiveClean(exercise.id, latest.bpm) >= 2;
      return result(
        exercise.id,
        latest.bpm + (faster ? 5 : 0),
        faster ? "progression" : "consolidation",
        faster
          ? "Two accurate takes at this pulse: try five pulses per minute faster."
          : "Repeat this at the same pulse. Reliable repetitions matter more than one strong take.",
      );
    }
    return result(
      exercise.id,
      exercise.bpm,
      "acquisition",
      `Your foundations are ready for ${nextSkill.title.toLowerCase()}. Start slowly and listen for clean notes.`,
    );
  }

  const finale = exercises.find((item) => item.skill === "performance")!;
  const lastFinale = [...progress.attempts]
    .reverse()
    .find((item) => item.exerciseId === finale.id);
  const bpm = lastFinale?.bpm ?? finale.bpm;
  const faster =
    latest?.exerciseId === finale.id && consecutiveClean(finale.id, bpm) >= 2;
  return result(
    finale.id,
    Math.min(160, bpm + (faster ? 5 : 0)),
    "performance",
    faster
      ? "Your full study is stable. Add five pulses per minute, keeping the melody relaxed."
      : "Bring the whole study together. Shape the melody and keep the changes connected.",
  );
}
