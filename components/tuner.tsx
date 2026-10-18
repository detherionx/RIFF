"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2 } from "lucide-react";
import { AudioEngine, detectPitch } from "@/lib/audio";
import { noteName } from "./fretboard";
export default function Tuner() {
  const engine = useRef<AudioEngine | null>(null),
    alive = useRef(true),
    running = useRef(false),
    generation = useRef(0);
  const [active, setActive] = useState(false),
    [pending, setPending] = useState(false),
    [midi, setMidi] = useState<number | null>(null),
    [error, setError] = useState(""),
    [target, setTarget] = useState(40);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      running.current = false;
      void engine.current?.close();
      engine.current = null;
    };
  }, []);
  function stop() {
    generation.current++;
    running.current = false;
    void engine.current?.close();
    engine.current = null;
    setActive(false);
    setPending(false);
    setMidi(null);
  }
  async function start() {
    if (running.current) return;
    running.current = true;
    const token = ++generation.current;
    const device = (engine.current ||= new AudioEngine());
    setPending(true);
    try {
      await device.prepareMicrophone((samples, rate) => {
        if (!alive.current || token !== generation.current) return;
        const pitch = detectPitch(samples, rate);
        setMidi(
          pitch && pitch.confidence > 0.8
            ? 69 + 12 * Math.log2(pitch.frequency / 440)
            : null,
        );
      });
      if (!alive.current || token !== generation.current) {
        await device.close();
        return;
      }
      setActive(true);
      setError("");
    } catch (e) {
      await device.close();
      if (!alive.current || token !== generation.current) return;
      running.current = false;
      if (engine.current === device) engine.current = null;
      setError(
        e instanceof Error
          ? e.message
          : "Microphone unavailable. Check your browser permissions.",
      );
    } finally {
      if (alive.current && token === generation.current) setPending(false);
    }
  }
  const cents = midi === null ? null : Math.round((midi - target) * 100),
    inTune = cents !== null && Math.abs(cents) < 6;
  return (
    <section>
      <div className="eyebrow">SIX STRINGS. A FRESH START.</div>
      <h1>Get in tune.</h1>
      <p className="lede">
        Clean tone, one string at a time. Let the note ring.
      </p>
      <div className="tuner-panel">
        <div className="section-heading">
          <span className="pill">
            <span className={`status-dot ${active ? "live" : ""}`} />{" "}
            {active ? "Listening on this device" : "Microphone off"}
          </span>
          <span className="mono muted">A4 = 440 Hz</span>
        </div>
        <div className={`tuner-note ${inTune ? "in-tune" : ""}`}>
          {midi === null ? "—" : noteName(Math.round(midi))}
          <span>
            {cents === null
              ? "PLAY A SINGLE STRING"
              : inTune
                ? "RIGHT THERE. IN TUNE."
                : Math.abs(cents) > 100
                  ? "CHECK YOUR SELECTED STRING"
                  : cents < 0
                    ? "A LITTLE FLAT · TIGHTEN GENTLY"
                    : "A LITTLE SHARP · LOOSEN GENTLY"}
          </span>
        </div>
        <div className="tuning-meter">
          <span>♭</span>
          <div>
            <i
              style={{
                left: `${50 + Math.max(-50, Math.min(50, cents || 0))}%`,
              }}
            />
            <b />
          </div>
          <span>♯</span>
        </div>
        <div className="mono muted">
          {cents === null
            ? "Waiting for a clear pitch"
            : `${cents > 0 ? "+" : ""}${cents} cents from ${noteName(target)}`}
        </div>
        <div className="tuner-strings">
          {[40, 45, 50, 55, 59, 64].map((n, i) => (
            <button
              key={n}
              className={target === n ? "selected" : ""}
              aria-pressed={target === n}
              onClick={() => setTarget(n)}
            >
              <small>{6 - i}</small>
              {noteName(n)}
              <span>{n === target ? "SELECTED" : "STRING"}</span>
            </button>
          ))}
        </div>
        <div className="button-row">
          <button
            className="button primary"
            disabled={pending}
            onClick={() => (active ? stop() : void start())}
          >
            {active ? <Square size={18} /> : <Mic size={18} />}{" "}
            {pending
              ? "Opening microphone…"
              : active
                ? "Stop listening"
                : "Enable microphone"}
          </button>
          <button
            className="button secondary"
            onClick={() =>
              void (engine.current ||= new AudioEngine())
                .playTone(target, 2)
                .catch(() => {
                  if (alive.current)
                    setError("The reference note could not play. Try again.");
                })
            }
          >
            <Volume2 size={18} /> Reference note
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
      <p className="privacy-note">
        Use a clean guitar signal. Distortion and several ringing strings can
        confuse pitch detection. Mute the other strings.
      </p>
    </section>
  );
}
