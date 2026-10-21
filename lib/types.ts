export type SkillId =
  | "strings"
  | "independence"
  | "theory"
  | "intervals"
  | "rhythm"
  | "arpeggios"
  | "transitions"
  | "muting"
  | "performance";
export type Note = {
  midi: number;
  beat: number;
  duration: number;
  string: number;
  fret: number;
  finger?: number;
};
export type Exercise = {
  id: string;
  title: string;
  subtitle: string;
  skill: SkillId;
  stage: number;
  bpm: number;
  beats: number;
  meter?: 4 | 6;
  notes: Note[];
  instructions: string[];
  why: string;
  kind: "playing" | "theory" | "muting";
};
export type DetectedNote = {
  midi: number;
  time: number;
  duration: number;
  confidence: number;
};
export type Evidence = {
  diagnostic?: "input" | "timing" | "practice" | "overlap";
  matched?: number;
  expected?: number;
  observed?: number;
  confidence: "high" | "medium" | "low";
  score: number | null;
  pitchAccuracy: number | null;
  timingMs: number | null;
  missed: number;
  extra: number;
  consistency: number | null;
  weakestTransition?: number;
  message: string;
};
export type Attempt = {
  id: string;
  exerciseId: string;
  skill: SkillId;
  at: string;
  bpm: number;
  evidence: Evidence;
  seconds: number;
};
export type Mastery = {
  skill: SkillId;
  value: number;
  attempts: number;
  streak: number;
  bestBpm: number;
  lastPracticed: string | null;
  reviewAt: string | null;
  errors: string[];
};
export type Profile = {
  instrument: "electric" | "acoustic";
  experience: "new" | "returning";
  styles: string[];
  goal: string;
  minutes: number;
};
export type Progress = {
  version: 1;
  profile: Profile | null;
  attempts: Attempt[];
  mastery: Partial<Record<SkillId, Mastery>>;
};
export type Recommendation = {
  exerciseId: string;
  bpm: number;
  mode:
    | "acquisition"
    | "consolidation"
    | "remediation"
    | "diagnostic"
    | "review"
    | "progression"
    | "performance";
  reason: string;
};
