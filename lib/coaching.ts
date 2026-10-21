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
    notes: Array.from({ length: 4 }, (_, i) => ({ ...target, beat: i * 2, duration: 1 })),
    instructions: [
      "Keep the strings silent during the six-pulse count-in. Wear headphones.",
      `Pick string ${target.string}, fret ${target.fret === 0 ? "0 (open)" : target.fret}, once on pulses 1, 3, 5 and 7.`,
      "Stop each note after one pulse. Leave a silent pulse before the next pick.",
    ],
    why: drill === "input" ? "Four plucks should produce four low E events. A mismatch is a reason to check detection, not blame your hands." :
      drill === "note" ? "Check this note alone before combining the two strings. If the heard pitch disagrees, check tuning and listen to the reference." :
      "Remove the string change so you can listen for even gaps. Device delay affects absolute timing; picking does not calibrate it.",
  };
}
