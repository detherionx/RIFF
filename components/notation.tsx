"use client";
import { useEffect, useRef, useState } from "react";
import type { Exercise } from "@/lib/types";
import { noteName } from "./fretboard";

export default function Notation({ exercise, pulse }: { exercise: Exercise; pulse: number }) {
  const host = useRef<HTMLDivElement>(null);
  const marks = useRef<{ element: SVGElement; beat: number; duration: number }[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const score = JSON.stringify({ notes: exercise.notes, beats: exercise.beats });
  useEffect(() => {
    let cancelled = false;
    const container = host.current!;
    marks.current = [];
    setError("");
    async function render() {
      // Bundled music fonts: no CDN or third-party runtime requests.
      const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Annotation } = await import("vexflow/bravura");
      await document.fonts.ready;
      if (cancelled) return;
      container.replaceChildren();
      const { notes, beats } = JSON.parse(score) as Pick<Exercise, "notes" | "beats">;
      // honey: quarter/half-note 4/4 drills only; extend engraving before adding other rhythms.
      if (beats % 4 || notes.some((n) => ![1, 2].includes(n.duration) || n.beat % 4 + n.duration > 4))
        throw new Error("Unsupported drill rhythm");
      const bars = beats / 4;
      const renderer = new Renderer(container, Renderer.Backends.SVG);
      renderer.resize(bars * 210 + 70, 190);
      const context = renderer.getContext();
      context.setFillStyle("#172013").setStrokeStyle("#172013");
      for (let bar = 0; bar < bars; bar++) {
        const stave = new Stave(bar ? bar * 210 + 70 : 0, 25, bar ? 210 : 280);
        if (!bar) stave.addClef("bass").addTimeSignature("4/4");
        stave.setContext(context).draw();
        const entries: { note: InstanceType<typeof StaveNote>; beat: number; duration: number }[] = [];
        for (let beat = bar * 4; beat < (bar + 1) * 4;) {
          const source = notes.find((n) => n.beat === beat);
          const duration = source?.duration ?? 1;
          const pitch = source ? ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"][source.midi % 12] : "d";
          const note = new StaveNote({ clef: "bass", keys: [`${pitch}/${source ? Math.floor(source.midi / 12) - 1 : 3}`], duration: `${duration === 2 ? "h" : "q"}${source ? "" : "r"}`, autoStem: true });
          note.setStyle({ fillStyle: "#172013", strokeStyle: "#172013" });
          if (source && pitch.includes("#")) note.addModifier(new Accidental("#"));
          note.addModifier(new Annotation(source ? noteName(source.midi) : "Rest")
            .setVerticalJustification(Annotation.VerticalJustify.BOTTOM).setFont("Arial", 14, "bold"));
          entries.push({ note, beat, duration });
          beat += duration;
        }
        const voice = new Voice({ numBeats: 4, beatValue: 4 }).addTickables(entries.map((e) => e.note));
        new Formatter().joinVoices([voice]).formatToStave([voice], stave);
        voice.draw(context, stave);
        for (const entry of entries) {
          const element = entry.note.getSVGElement();
          if (element) marks.current.push({ element, beat: entry.beat, duration: entry.duration });
        }
      }
      setRevision((n) => n + 1);
    }
    void render().catch(() => { if (!cancelled) setError("Notation could not load. The tab and note lengths remain below."); });
    return () => { cancelled = true; marks.current = []; container.replaceChildren(); };
  }, [score]);
  useEffect(() => {
    for (const mark of marks.current) {
      const active = pulse >= mark.beat && pulse < mark.beat + mark.duration;
      mark.element.classList.toggle("notation-current", active);
      if (active && host.current) {
        const bounds = mark.element.getBoundingClientRect(), visible = host.current.getBoundingClientRect();
        if (bounds.left < visible.left || bounds.right > visible.right)
          host.current.scrollLeft += bounds.left - visible.left - visible.width / 3;
      }
    }
  }, [pulse, revision]);
  return <div>
    <div ref={host} className="notation" role="img" aria-label={`Bass clef, 4/4, sounding pitches. ${exercise.notes.map((n) => `${noteName(n.midi)}, ${n.duration === 2 ? "half note" : "quarter note followed by quarter rest"}`).join("; ")}`} />
    {error && <p role="alert">{error}</p>}
  </div>;
}
