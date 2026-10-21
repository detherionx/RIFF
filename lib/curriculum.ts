import type { Exercise, Note, SkillId } from "./types";

export const stages = [
  {
    id: 1,
    title: "Meet your guitar",
    description: "Hear, name and play a steady bass pulse.",
  },
  {
    id: 2,
    title: "Build your fingers",
    description: "Separate the thumb, index and middle fingers.",
  },
  {
    id: 3,
    title: "Understand the music",
    description: "Connect notes, intervals and a rolling 6/8 pulse.",
  },
  {
    id: 4,
    title: "Learn the first phrase",
    description: "Give each note a place in a rolling arpeggio.",
  },
  {
    id: 5,
    title: "Connect the pieces",
    description: "Join changes and shape the sound.",
  },
  {
    id: 6,
    title: "Perform your piece",
    description: "Perform an original eight-bar fingerstyle study.",
  },
];

export const skills: {
  id: SkillId;
  title: string;
  prerequisites: SkillId[];
}[] = [
  { id: "strings", title: "String navigation", prerequisites: [] },
  {
    id: "independence",
    title: "Finger independence",
    prerequisites: ["strings"],
  },
  { id: "rhythm", title: "A steady 6/8 pulse", prerequisites: ["strings"] },
  { id: "theory", title: "Notes in E minor", prerequisites: ["strings"] },
  { id: "intervals", title: "Hear the distance", prerequisites: ["theory"] },
  {
    id: "arpeggios",
    title: "Rolling arpeggios",
    prerequisites: ["independence", "rhythm"],
  },
  {
    id: "transitions",
    title: "Connected changes",
    prerequisites: ["arpeggios", "intervals"],
  },
  { id: "muting", title: "Controlled release", prerequisites: ["transitions"] },
  { id: "performance", title: "Musical fluency", prerequisites: ["muting"] },
];

// Standard tuning, indexed by conventional string number: 1 is the thin E.
const tuning = [0, 64, 59, 55, 50, 45, 40];
type Position = [string: number, fret: number];
const phrase = (positions: Position[], duration = 1): Note[] =>
  positions.map(([string, fret], index) => ({
    midi: tuning[string] + fret,
    beat: index * duration,
    duration,
    string,
    fret,
    ...(fret > 0 ? { finger: Math.min(fret, 4) } : {}),
  }));
const repeat = (positions: Position[], times: number): Position[] =>
  Array.from({ length: times }, () => positions).flat();
const em: Position[] = [
  [6, 0],
  [3, 0],
  [2, 0],
  [1, 0],
  [2, 0],
  [3, 0],
];
const c: Position[] = [
  [5, 3],
  [3, 0],
  [2, 1],
  [1, 0],
  [2, 1],
  [3, 0],
];
const g: Position[] = [
  [6, 3],
  [3, 0],
  [2, 0],
  [1, 3],
  [2, 0],
  [3, 0],
];
const d: Position[] = [
  [4, 0],
  [3, 2],
  [2, 3],
  [1, 2],
  [2, 3],
  [3, 2],
];
const study = [...em, ...c, ...g, ...d, ...em, ...c, ...d, ...em];

function exercise(
  id: string,
  title: string,
  subtitle: string,
  skill: SkillId,
  stage: number,
  positions: Position[],
  instructions: string[],
  why: string,
  bpm = 100,
  duration = 1,
  kind: Exercise["kind"] = "playing",
): Exercise {
  return {
    id,
    title,
    subtitle,
    skill,
    stage,
    bpm,
    beats: positions.length * duration,
    notes: phrase(positions, duration),
    instructions,
    why,
    kind,
  };
}

export const exercises: Exercise[] = [
  exercise(
    "first-light-bass",
    "First light",
    "The bass line · E, C, G, D",
    "strings",
    1,
    [
      [6, 0],
      [5, 3],
      [6, 3],
      [4, 0],
    ],
    [
      "Standard tuning: E A D G B E, thick to thin.",
      "Use your thumb. Play each bass note on its cue and let it ring.",
      "Count 1 2 3, 4 5 6; each bass lasts three eighth-note pulses.",
    ],
    "This is the bass of your final piece. Four notes already make music.",
    100,
    3,
  ),
  exercise(
    "finger-voices",
    "Three small voices",
    "Thumb, index, middle",
    "independence",
    2,
    repeat(
      [
        [6, 0],
        [3, 0],
        [2, 0],
      ],
      4,
    ),
    [
      "Thumb plays string 6, index string 3, middle string 2.",
      "Keep unused fingers relaxed. Move only the finger that plays.",
      "Make all three notes equally clear.",
    ],
    "Independent fingers turn a pattern into a melody.",
  ),
  exercise(
    "rolling-six",
    "A rolling six",
    "Two gentle waves in every bar",
    "rhythm",
    2,
    repeat(em, 2),
    [
      "Count ONE two three FOUR five six.",
      "Give pulses 1 and 4 a gentle emphasis.",
      "Keep the spaces between notes even.",
    ],
    "Six eighth notes form two groups of three in 6/8.",
  ),
  exercise(
    "minor-map",
    "Meet E minor",
    "E · F♯ · G · A · B · A · G · E",
    "theory",
    3,
    [
      [4, 2],
      [4, 4],
      [3, 0],
      [3, 2],
      [2, 0],
      [3, 2],
      [3, 0],
      [4, 2],
    ],
    [
      "Say each note name as you play.",
      "E to G is a minor third: three semitones.",
      "One fret raises a note by one semitone. Open strings are fret 0.",
    ],
    "Names describe sounds you can already hear and play.",
    90,
  ),
  exercise(
    "interval-echo",
    "Hear the distance",
    "E–G minor third · E–B perfect fifth",
    "intervals",
    3,
    repeat(
      [
        [4, 2],
        [3, 0],
        [4, 2],
        [2, 0],
      ],
      2,
    ),
    [
      "Listen to E–G, then E–B.",
      "The minor third is three semitones; the perfect fifth is seven.",
      "Sing the second note before playing it if comfortable.",
    ],
    "Recognizing intervals helps you predict where a melody is going.",
    90,
    2,
  ),
  exercise(
    "first-light-arpeggio",
    "Let the chord unfold",
    "Two bars of E minor",
    "arpeggios",
    4,
    repeat(em, 2),
    [
      "Thumb on the bass, index on G, middle on B, ring on high E.",
      "For scoring, gently damp the previous string so only one note sounds.",
      "Afterward, explore letting the notes ring together without scoring.",
    ],
    "An arpeggio is a chord played as separate notes.",
  ),
  exercise(
    "first-light-changes",
    "Leave no gaps",
    "E minor → C → G → D",
    "transitions",
    5,
    [...em, ...c, ...g, ...d],
    [
      "Prepare the next bass during the last note of each bar.",
      "For scored takes, release each note before the next; let notes ring in review mode.",
      "If a change breaks the pulse, practise just its last and first notes.",
    ],
    "Smooth changes connect separate patterns into a phrase.",
    90,
  ),
  exercise(
    "soft-edges",
    "Soft edges",
    "Palm mute and release",
    "muting",
    5,
    repeat(
      [
        [6, 0],
        [6, 0],
        [5, 2],
        [5, 2],
        [6, 0],
        [6, 0],
      ],
      2,
    ),
    [
      "Rest the side of your picking hand lightly near the bridge.",
      "Alternate a gently muted note and an open ringing note.",
      "Listen for the contrast. The microphone scores pitch and timing, not mute quality.",
    ],
    "You control when a note ends as well as when it begins.",
    90,
    1,
    "muting",
  ),
  exercise(
    "first-light-study",
    "First Light",
    "Your original eight-bar study · E minor · 6/8",
    "performance",
    6,
    study,
    [
      "Em · C · G · D · Em · C · D · Em: one chord per bar.",
      "Count two groups of three. For scoring, release each note before the next.",
      "In review mode, let notes ring and shape the high melody above the bass.",
      "Start quietly, grow through bar 6, then soften into the final E minor.",
      "Accuracy comes first; increase the pulse only after two clean takes.",
    ],
    "Everything you have practised becomes one complete musical statement.",
    100,
  ),
  exercise(
    "spider-walk",
    "The little spider",
    "1–2–3–4 fretting control",
    "independence",
    2,
    [
      [6, 1],
      [6, 2],
      [6, 3],
      [6, 4],
      [5, 1],
      [5, 2],
      [5, 3],
      [5, 4],
    ],
    [
      "Use index, middle, ring, little finger in order.",
      "Use the least pressure that produces a clear note.",
      "Pause if you feel pain; stretch-free relaxed movement matters more than speed.",
    ],
    "Small controlled movements build reliable fretting.",
    80,
  ),
  exercise(
    "alternate-path",
    "Alternate paths",
    "Down–up picking",
    "rhythm",
    2,
    repeat(
      [
        [3, 0],
        [3, 2],
        [2, 0],
        [3, 2],
      ],
      3,
    ),
    [
      "With a pick, alternate down and up strokes.",
      "Without a pick, alternate index and middle.",
      "Keep every note the same length and volume.",
    ],
    "An efficient return stroke keeps repeated patterns steady.",
  ),
  exercise(
    "power-pairs",
    "Power pairs",
    "Roots and fifths, one note at a time",
    "intervals",
    3,
    repeat(
      [
        [6, 0],
        [5, 2],
        [6, 3],
        [5, 5],
      ],
      2,
    ),
    [
      "E–B and G–D are root-and-fifth pairs used in power chords.",
      "For scoring, play the notes separately at each cue.",
      "You can try both together afterward; this pitch detector does not grade chords.",
    ],
    "Hear the sound of a fifth before combining it into a power chord.",
    90,
  ),
];

export function getExercise(id: string): Exercise | undefined {
  const original = exercises.find((item) => item.id === id);
  if (original) return original;
  const match = /^(.*)-transition-(\d+)$/.exec(id);
  if (!match) return undefined;
  const source = exercises.find((item) => item.id === match[1]);
  const index = Number(match[2]);
  if (!source || index < 1 || index >= source.notes.length) return undefined;
  const pair = source.notes.slice(index - 1, index + 1);
  return {
    ...source,
    id,
    title: "Bridge the gap",
    subtitle: `${source.title} · notes ${index}–${index + 1}`,
    bpm: Math.max(50, source.bpm - 15),
    beats: 16,
    notes: Array.from({ length: 8 }, (_, i) => ({
      ...pair[i % 2],
      beat: i * 2,
      duration: 2,
    })),
    instructions: [
      "Repeat these two notes slowly, with an even gap.",
      "For scoring, stop each note before picking the next string. Open strings need no fretting finger.",
      "Two clean takes will bring you back to the full phrase.",
    ],
    why: `A focused bridge repairs the change at notes ${index}–${index + 1} of ${source.title}.`,
  };
}
