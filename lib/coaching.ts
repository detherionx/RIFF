import type { Exercise } from "./types";

export type Drill = "input" | "note" | "pulse";

export function diagnosticExercise(source: Exercise, drill: Drill, index = 0): Exercise {
  const target = drill === "note" ? source.notes[index] ?? source.notes[0] :
    { midi: 40, string: 6, fret: 0, finger: 0, beat: 0, duration: 1 };
  return {
    ...source,
    title: { input: "Can RIFF hear four plucks?", note: "Find one clear note", pulse: "Keep four attacks even" }[drill],
    subtitle: "Diagnostic drill · does not change mastery",
    bpm: 60,
    beats: 8,
    meter: 4,
    notes: Array.from({ length: 4 }, (_, i) => ({ ...target, beat: i * 2, duration: 1 })),
    instructions: [
      "Listen to four count-in clicks: 1, 2, 3, 4. Start on the next 1.",
      `In each of two bars, pick string ${target.string}, fret ${target.fret === 0 ? "0 (open)" : target.fret}, on beats 1 and 3.`,
      "Each note is a quarter note (one beat). Stop it on beat 2 or 4, then rest until the next pick.",
    ],
    why: drill === "input" ? "Four plucks should produce four low E events. A mismatch is a reason to check detection, not blame your hands." :
      drill === "note" ? "Check this note alone before combining the two strings. If the heard pitch disagrees, check tuning and listen to the reference." :
      "Remove the string change so you can listen for even gaps. Device delay affects absolute timing; picking does not calibrate it.",
  };
}
