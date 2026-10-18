"use client";
export const tuning = [64, 59, 55, 50, 45, 40];
export const noteNames = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
export function noteName(midi: number) {
  return `${noteNames[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
export default function Fretboard({
  selected = [],
  onPick,
  frets = 5,
  labels = true,
}: {
  selected?: { string: number; fret: number; finger?: number }[];
  onPick?: (string: number, fret: number, midi: number) => void;
  frets?: number;
  labels?: boolean;
}) {
  return (
    <div
      className="fretboard"
      role="group"
      aria-label="Guitar fretboard, high E string at the top"
    >
      <div className="fret-numbers">
        <span />
        {Array.from({ length: frets + 1 }, (_, f) => (
          <span key={f}>{f === 0 ? "OPEN" : f}</span>
        ))}
      </div>
      {tuning.map((open, s) => (
        <div
          className="guitar-string"
          style={{ "--weight": `${1 + s * 0.35}px` } as React.CSSProperties}
          key={s}
        >
          <span className="string-name">
            {noteNames[open % 12]}
            <small>{s + 1}</small>
          </span>
          {Array.from({ length: frets + 1 }, (_, f) => {
            const active = selected.find(
              (n) => n.string === s + 1 && n.fret === f,
            );
            return (
              <button
                type="button"
                key={f}
                disabled={!onPick}
                aria-label={`String ${s + 1}, fret ${f}, ${noteName(open + f)}`}
                aria-pressed={!!active}
                className={`fret ${f === 0 ? "open" : ""} ${active ? "selected" : ""}`}
                onClick={() => onPick?.(s + 1, f, open + f)}
              >
                <span>
                  {active
                    ? active.finger || noteNames[(open + f) % 12]
                    : labels
                      ? noteNames[(open + f) % 12]
                      : ""}
                </span>
                {s === 2 && [3, 5, 7, 9, 12].includes(f) && <i />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
