import type { Attempt } from "./types";

export const theoryModes = ["note", "interval", "scale", "rhythm", "chord"] as const;
export type TheoryMode = (typeof theoryModes)[number];
type Review = { streak: number; dueAt: number | null; due: boolean };

export function theoryReviews(attempts: Attempt[], now = Date.now()) {
  const reviews = Object.fromEntries(
    theoryModes.map((mode) => [mode, { streak: 0, dueAt: null, due: false }]),
  ) as Record<TheoryMode, Review>;
  const chronological = attempts
    .filter((attempt) => {
      const at = Date.parse(attempt.at);
      return Number.isFinite(at) && at <= now;
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const attempt of chronological) {
    const mode = theoryModes.find((id) => attempt.exerciseId === `theory-${id}`);
    const score = attempt.evidence.score;
    if (
      !mode ||
      !["high", "medium"].includes(attempt.evidence.confidence) ||
      score === null ||
      !Number.isFinite(score) ||
      score < 0 ||
      score > 100
    ) continue;
    const review = reviews[mode];
    review.streak = score >= 85 ? review.streak + 1 : 0;
    const days = review.streak ? [1, 3, 7, 14][Math.min(review.streak - 1, 3)] : 0;
    review.dueAt = Date.parse(attempt.at) + days * 86_400_000;
    review.due = review.dueAt <= now;
  }
  return reviews;
}

export function nextTheoryReview(reviews: ReturnType<typeof theoryReviews>): TheoryMode {
  return theoryModes
    .filter((mode) => reviews[mode].due)
    .sort((a, b) => reviews[a].dueAt! - reviews[b].dueAt!)[0] ?? "note";
}
