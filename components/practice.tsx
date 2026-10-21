"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Play,
  Mic,
  Square,
  Repeat2,
  Download,
  Headphones,
  ChevronDown,
} from "lucide-react";
import {
  AudioEngine,
  analyzeRecording,
  compareMuting,
  detectPitch,
  checkInput,
  type MutingComparison,
} from "@/lib/audio";
import { recommend } from "@/lib/learning";
import { getExercise } from "@/lib/curriculum";
import type { Attempt, Evidence, Exercise, Progress } from "@/lib/types";
import { download, wav } from "@/lib/storage";
import Fretboard, { noteName } from "./fretboard";
import VideoReview from "./video-review";
import AudioSetup from "./audio-setup";
import Notation from "./notation";
import { diagnosticExercise, type Drill } from "@/lib/coaching";
export default function Practice({
  exercise: sourceExercise,
  initialBpm,
  progress,
  onAttempt,
  onBack,
  onSelect,
  inputReady,
  onInputReady: setInputReady,
}: {
  exercise: Exercise;
  initialBpm?: number;
  progress: Progress;
  onAttempt: (a: Attempt) => void;
  onBack: () => void;
  onSelect: (id: string, bpm?: number) => void;
  inputReady: boolean;
  onInputReady: (ready: boolean) => void;
}) {
  const [drill, setDrill] = useState<Drill | null>(null);
  const [targetIndex, setTargetIndex] = useState(0);
  const [inputCheck, setInputCheck] = useState<ReturnType<typeof checkInput> | null>(null);
  const [delayMeasured, setDelayMeasured] = useState(false);
  const [drillPasses, setDrillPasses] = useState<Record<Drill, number>>({ input: 0, note: 0, pulse: 0 });
  const exercise = drill ? diagnosticExercise(sourceExercise, drill, targetIndex) : sourceExercise;
  const beatsPerBar = exercise.meter ?? 6;
  const [assessment, setAssessment] = useState<"separated" | "ringing">(
    "separated",
  );
  const [bpm, setBpm] = useState(initialBpm || exercise.bpm),
    [state, setState] = useState<
      "idle" | "preparing" | "countdown" | "recording" | "analyzing" | "demo"
    >("idle"),
    [pulse, setPulse] = useState(-1),
    [evidence, setEvidence] = useState<Evidence | null>(null),
    [error, setError] = useState(""),
    [wave, setWave] = useState<number[]>([]),
    [pitch, setPitch] = useState("—"),
    [url, setUrl] = useState(""),
    [latency, setLatency] = useState(0),
    [muteStep, setMuteStep] = useState(0),
    [comparison, setComparison] = useState<MutingComparison | null>(null),
    [repeat, setRepeat] = useState(false);
  const engine = useRef<AudioEngine | null>(null),
    phraseBpm = useRef(initialBpm || sourceExercise.bpm),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    audioBlob = useRef<Blob | null>(null),
    urlRef = useRef(""),
    alive = useRef(true),
    offset = useRef(0),
    baseline = useRef<{ samples: Float32Array; rate: number } | null>(null),
    busy = useRef(false),
    finishing = useRef(false),
    generation = useRef(0),
    modeRef = useRef(state);
  modeRef.current = state;
  const tabRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = tabRef.current,
      note = row?.querySelector<HTMLElement>(".current");
    if (
      row &&
      note &&
      (note.offsetLeft < row.scrollLeft ||
        note.offsetLeft + note.offsetWidth > row.scrollLeft + row.clientWidth)
    )
      row.scrollTo({
        left: Math.max(0, note.offsetLeft - row.clientWidth / 3),
        behavior: "smooth",
      });
  }, [pulse]);
  const active = [
      "recording",
      "countdown",
      "preparing",
      "demo",
      "analyzing",
    ].includes(state),
    next = recommend(progress),
    currentNote =
      exercise.notes.findLast((n) => n.beat <= pulse) || exercise.notes[0];
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      discard();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);
  useEffect(() => {
    function visibility() {
      if (document.hidden && busy.current) {
        discard();
        setState("idle");
        setPulse(-1);
        setError(
          "Practice paused when the app went into the background. Start a new take for reliable timing.",
        );
      }
    }
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  function audio() {
    return (engine.current ||= new AudioEngine());
  }
  function clearTimers() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }
  function discard() {
    generation.current++;
    clearTimers();
    const previous = engine.current;
    engine.current = null;
    busy.current = false;
    finishing.current = false;
    void previous?.close().catch(() => {});
  }
  async function demo() {
    if (busy.current) return;
    busy.current = true;
    const run = ++generation.current,
      session = audio();
    setError("");
    setEvidence(null);
    setState("demo");
    try {
      const first = await session.playExercise(exercise, bpm);
      if (!alive.current || run !== generation.current || first === undefined)
        return;
      timer.current = setInterval(() => {
        if (!alive.current || run !== generation.current) return;
        const elapsed = session.currentTime - first;
        setPulse(Math.floor((elapsed * bpm) / 60));
        if (elapsed >= (exercise.beats * 60) / bpm + 0.15) {
          session.stopPlayback();
          clearTimers();
          busy.current = false;
          setState("idle");
          setPulse(-1);
        }
      }, 40);
    } catch (e) {
      if (alive.current && run === generation.current) {
        busy.current = false;
        setState("idle");
        setError(String(e));
      }
    }
  }
  async function start() {
    if (!inputReady) { setError("Complete the quiet and low E checks in Audio setup, then finish setup before playing."); return; }
    if (busy.current) return;
    busy.current = true;
    const run = ++generation.current,
      session = audio();
    setError("");
    setEvidence(null);
    setComparison(null);
    setState("preparing");
    try {
      await session.prepareMicrophone((samples, rate) => {
        if (!alive.current || run !== generation.current) return;
        setWave(
          Array.from(
            { length: 64 },
            (_, i) => samples[Math.floor((i * samples.length) / 64)] || 0,
          ),
        );
        const p = detectPitch(samples, rate);
        setPitch(
          p && p.confidence > 0.8
            ? noteName(Math.round(69 + 12 * Math.log2(p.frequency / 440)))
            : "—",
        );
      });
      if (!alive.current || run !== generation.current) {
        await session.close();
        return;
      }
      const capture = session.startCapture(),
        first = await session.startMetronome(bpm, beatsPerBar),
        boundary = first + (beatsPerBar * 60) / bpm;
      if (!alive.current || run !== generation.current) {
        await session.close();
        return;
      }
      offset.current = boundary - capture;
      setPulse(-beatsPerBar);
      setState("countdown");
      timer.current = setInterval(() => {
        if (!alive.current || run !== generation.current) return;
        const elapsed = session.currentTime - boundary,
          p = Math.floor((elapsed * bpm) / 60);
        setPulse(p);
        if (p >= 0) setState("recording");
        if (elapsed >= (exercise.beats * 60) / bpm + 0.2)
          void finish(false, session, run);
      }, 40);
    } catch (e) {
      await session.close().catch(() => {});
      if (engine.current === session) engine.current = null;
      if (alive.current && run === generation.current) {
        busy.current = false;
        setState("idle");
        setError(
          e instanceof Error
            ? e.message
            : "Microphone access failed. Check browser permissions and try again.",
        );
      }
    }
  }
  async function finish(
    cancel = false,
    session = engine.current,
    run = generation.current,
  ) {
    if (!session || finishing.current || run !== generation.current) return;
    finishing.current = true;
    clearTimers();
    session.stopMetronome();
    session.stopPlayback();
    if (modeRef.current === "demo") {
      generation.current++;
      finishing.current = false;
      busy.current = false;
      setState("idle");
      setPulse(-1);
      return;
    }
    setState("analyzing");
    try {
      const captured = await session.stopCapture();
      await session.close();
      if (engine.current === session) engine.current = null;
      if (!alive.current || run !== generation.current || cancel) return;
      const from = Math.max(
          0,
          Math.round(offset.current * captured.sampleRate),
        ),
        to =
          from +
          Math.round(((exercise.beats * 60) / bpm + 0.2) * captured.sampleRate),
        samples = captured.samples.slice(from, to);
      audioBlob.current = wav(samples, captured.sampleRate);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(audioBlob.current);
      setUrl(urlRef.current);
      const result = analyzeRecording(
        samples,
        captured.sampleRate,
        exercise,
        bpm,
        delayMeasured ? latency : null,
        assessment,
      );
      if (drill === "input") {
        const quiet = captured.samples.slice(Math.max(0, from - captured.sampleRate * 2), from);
        const checked = checkInput(samples, quiet, captured.sampleRate);
        setInputCheck(checked);
        setDrillPasses((counts) => ({ ...counts, input: checked.passed ? counts.input + 1 : 0 }));
        return;
      }
      setEvidence(result);
      if (drill) {
        const passed = result.diagnostic !== "input" && result.diagnostic !== "overlap" && result.matched === 4 && result.extra === 0 &&
          (drill !== "pulse" || (result.consistency ?? 0) >= 90);
        setDrillPasses((counts) => ({ ...counts, [drill]: passed ? counts[drill] + 1 : 0 }));
      }
      if (!drill) onAttempt({
        id: crypto.randomUUID(),
        exerciseId: exercise.id,
        skill: exercise.skill,
        at: new Date().toISOString(),
        bpm,
        seconds: Math.round(samples.length / captured.sampleRate),
        evidence: result,
      });
      if (!drill && exercise.kind === "muting") {
        if (muteStep === 0 && result.confidence !== "low") {
          baseline.current = { samples, rate: captured.sampleRate };
          setMuteStep(1);
        } else if (
          baseline.current &&
          baseline.current.rate === captured.sampleRate
        ) {
          const compared = compareMuting(
            baseline.current.samples,
            samples,
            captured.sampleRate,
          );
          setComparison(compared);
          if (muteStep === 1 && compared.confidence !== "low") setMuteStep(2);
        }
      }
    } catch (e) {
      if (alive.current && run === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "The recording could not be analyzed. Please retry.",
        );
    } finally {
      if (run === generation.current) {
        busy.current = false;
        finishing.current = false;
        if (alive.current) {
          setState("idle");
          setPulse(-1);
          setWave([]);
          setPitch("—");
        }
      }
    }
  }
  function chooseDrill(value: Drill | null) {
    if (busy.current) return;
    if (value && !drill) phraseBpm.current = bpm;
    if (value) setTargetIndex(evidence?.diagnostic === "overlap" ? Math.max(0, sourceExercise.notes.findIndex((n) => n.midi === 48)) : evidence?.weakestTransition ?? (sourceExercise.notes.length > 1 ? 1 : 0));
    setDrill(value);
    setAssessment("separated");
    setBpm(value ? 60 : phraseBpm.current);
    setEvidence(null);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";
    audioBlob.current = null;
    setUrl("");
  }
  const previous = progress.attempts
      .filter((a) => a.exerciseId === exercise.id && a.evidence.score !== null)
      .slice(-2),
    change =
      previous.length === 2
        ? previous[1].evidence.score! - previous[0].evidence.score!
        : null;
  const phraseId = sourceExercise.id.replace(/-transition-\d+$/, "");
  const transition = getExercise(phraseId === sourceExercise.id ? `${phraseId}-transition-${Math.max(1, targetIndex)}` : phraseId);
  return (
    <section className="practice-page">
      <button className="text-button back" onClick={onBack}>
        <ArrowLeft size={16} /> Back to your journey
      </button>
      <div className="section-heading">
        <div>
          <div className="eyebrow">
            PRACTICE ROOM / STAGE {exercise.stage.toString().padStart(2, "0")}
          </div>
          <h1>{exercise.title}</h1>
          <p className="lede">{exercise.subtitle}</p>
        </div>
        <span className="pill">
          <span
            className={`status-dot ${state === "recording" ? "live" : ""}`}
          />
          {state === "recording" ? "Recording locally" : "On-device analysis"}
        </span>
      </div>
      <div hidden={active}><AudioSetup onReady={setInputReady} /></div>
      {!inputReady && <p role="status">Complete Audio setup before your first practice take.</p>}
      <div className="why-note" aria-label="Diagnostic coach">
        <strong>{drill ? "Work on one thing, then return to the phrase." : next.mode === "diagnostic" ? "Pause the retry loop: check what RIFF is hearing." : "Check the sound before changing your playing."}</strong>
        <p>First check four isolated low E plucks. Then isolate a note or practise the pulse. Extra detections cannot tell us which hand movement caused them.</p>
        <div className="button-row">
          <button className="button secondary" disabled={active} onClick={() => chooseDrill("input")}>1. Check input</button>
          <button className="button secondary" disabled={active} onClick={() => chooseDrill("note")}>2. Isolate target note</button>
          <button className="button secondary" disabled={active} onClick={() => chooseDrill("pulse")}>3. Isolate pulse</button>
          {transition && <button className="button secondary" disabled={active} onClick={() => onSelect(transition.id, drill ? phraseBpm.current : bpm)}>{phraseId === sourceExercise.id ? "Practise this change" : "Return to full phrase"}</button>}
          {drill && <button className="button secondary" disabled={active} onClick={() => chooseDrill(null)}>Return to {sourceExercise.title}</button>}
        </div>
        {inputCheck && <p role="status"><strong>{inputCheck.passed ? "Input check passed. " : "Input needs checking. "}</strong>{inputCheck.message}</p>}
        {drill === "input" && inputCheck && url && <audio src={url} controls aria-label="Input check playback" />}
        {drill && <p>Play four times at 60 pulses/min. Aim for four matching events and no extras on two tries before returning. {Math.min(2, drillPasses[drill])}/2 checks passed in a row{drill === "pulse" ? " (also requires attack evenness of at least 90/100)" : ""}. These drills do not award mastery.</p>}
      </div>
      <div className="practice-layout">
        <div>
          <div className="practice-score">
            <div className="section-heading">
              <span className="eyebrow">
                {state === "countdown"
                  ? `COUNT IN · ${Math.min(beatsPerBar, Math.max(1, pulse + beatsPerBar + 1))} / ${beatsPerBar} · WAIT`
                  : state === "recording"
                    ? `YOUR TURN · BAR ${Math.min(Math.ceil(exercise.beats / beatsPerBar), Math.floor(pulse / beatsPerBar) + 1)} / ${Math.ceil(exercise.beats / beatsPerBar)}`
                    : state === "demo"
                      ? "LISTEN & FOLLOW"
                      : "YOUR NEXT NOTES"}
              </span>
              <span className="mono">
                {beatsPerBar === 4 ? "4/4 · ONE CLICK = ONE BEAT" : "6/8 · E MINOR"}
              </span>
            </div>
            {beatsPerBar === 4 && <Notation exercise={exercise} pulse={pulse} />}
            {beatsPerBar === 4 && <p className="rhythm-help">{state === "countdown" ? "Wait through 1 · 2 · 3 · 4, then pick on the next 1." : drill ? "Filled note = 1 beat; the following symbol is a 1-beat rest. Pick on 1 and 3; rest on 2 and 4." : "Open notehead + stem = half note = 2 beats. Pick once; let it sound for two clicks. Stop just before the next note."} Bass clef shows the sounding pitches.</p>}
            <div
              ref={tabRef}
              className="tablature"
              aria-label="Exercise tablature, horizontally scrollable"
            >
              <div className="tab-labels">
                {["e", "B", "G", "D", "A", "E"].map((s, i) => (
                  <span key={i}>{s}</span>
                ))}
              </div>
              {exercise.notes.map((n, i) => (
                <div
                  key={i}
                  className={`tab-note ${pulse >= n.beat && pulse < n.beat + n.duration ? "current" : ""} ${n.beat % beatsPerBar === 0 ? "bar-line" : ""}`}
                >
                  <div className="tab-count">{(n.beat % beatsPerBar) + 1}</div>
                  {Array.from({ length: 6 }, (_, s) => (
                    <span key={s}>
                      {n.string === s + 1 ? <b>{n.fret}</b> : <i />}
                    </span>
                  ))}
                  <small>{n.finger || "○"}</small>
                  {beatsPerBar === 4 && <small className="note-length">{n.duration === 2 ? "Half note" : "Quarter note"}<br />{n.duration} {n.duration === 1 ? "beat" : "beats"}</small>}
                </div>
              ))}
            </div>
            <Fretboard
              selected={pulse >= 0 ? [currentNote] : exercise.notes.slice(0, 1)}
              labels={false}
            />
            <div className="score-legend">
              <span>Numbers = frets</span>
              <span>○ = open string</span>
              <span>Below = fretting finger</span>
            </div>
          </div>
          <div className="transport">
            <div className="tempo-control">
              <label htmlFor="tempo">
                PULSE / MIN <strong>{bpm}</strong>
              </label>
              <input
                id="tempo"
                type="range"
                min="40"
                max="200"
                step="5"
                disabled={active || !!drill}
                value={bpm}
                onChange={(e) => setBpm(+e.target.value)}
              />
              <small>
                {beatsPerBar === 4 ? "Quarter-note beats per minute · count 1, 2, 3, 4" : `Eighth-note pulse · ${Math.round(bpm / 3)} dotted-quarter beats/min`}
              </small>
            </div>
            <div className="button-row">
              {!active ? (
                <>
                  <button className="button primary large" disabled={!inputReady} onClick={start}>
                    <Mic size={20} />
                    {evidence ? "Record another take" : "Let’s play"}
                  </button>
                  <button className="button secondary large" onClick={demo}>
                    <Play size={19} /> Hear it first
                  </button>
                </>
              ) : (
                <button
                  disabled={state === "analyzing" || state === "preparing"}
                  className="button primary large"
                  onClick={() => void finish(true)}
                >
                  <Square size={18} />
                  {state === "analyzing"
                    ? "Listening back…"
                    : state === "preparing"
                      ? "Opening microphone…"
                      : "Stop"}
                </button>
              )}
            </div>
            <button
              className={`repeat-toggle ${repeat ? "selected" : ""}`}
              aria-pressed={repeat}
              title="Keep the next action on this phrase; recording always starts manually"
              onClick={() => setRepeat((r) => !r)}
            >
              <Repeat2 size={16} />{" "}
              {repeat ? "Stay on this phrase: on" : "Stay on this phrase"}
            </button>
          </div>
          {!drill && (
            <div className="why-note">
              <label htmlFor="assessment-mode">
                <strong>How are you playing this take?</strong>
              </label>
              <select
                id="assessment-mode"
                disabled={active}
                value={assessment}
                onChange={(e) => {
                  setAssessment(e.target.value as "separated" | "ringing");
                  setEvidence(null);
                }}
              >
                <option value="separated">Separated notes (scored)</option>
                <option value="ringing">Let notes ring (review only)</option>
              </select>
              <p>
                For scored takes, release each note before the next. Natural
                ringing performance can be recorded for listening, but cannot be
                reliably scored.
              </p>
            </div>
          )}
          <div className="input-monitor">
            <span className="mono">INPUT</span>
            <svg
              viewBox="0 0 640 40"
              aria-label={
                wave.length ? "Live microphone waveform" : "Microphone inactive"
              }
              preserveAspectRatio="none"
            >
              <line x1="0" y1="20" x2="640" y2="20" stroke="#41413c" />
              <polyline
                points={wave
                  .map((v, i) => `${i * 10},${20 + v * 65}`)
                  .join(" ")}
                fill="none"
                stroke="#e8a270"
                strokeWidth="2"
              />
            </svg>
            <strong>{pitch}</strong>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {evidence && (
            <div
              className={`performance-result ${evidence.score === null ? "uncertain" : ""}`}
              role="status"
            >
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    {assessment === "ringing"
                      ? "RECORDING FOR YOUR REVIEW"
                      : `WHAT WE HEARD · ${evidence.confidence.toUpperCase()} CONFIDENCE`}
                  </span>
                  <h2>
                    {evidence.score === null
                      ? assessment === "ringing"
                        ? "Your performance, ready to hear."
                        : evidence.diagnostic === "overlap" ? "Possible extra string heard." : evidence.diagnostic === "timing" ? "Notes measured; timing is provisional." : "Let’s get a clearer take."
                      : evidence.score >= 85
                        ? "The phrase is coming together."
                        : "Here’s your next small step."}
                  </h2>
                </div>
                {evidence.score !== null && (
                  <div className="result-score">
                    {evidence.score}
                    <small>/100</small>
                  </div>
                )}
              </div>
              <p>{evidence.message}</p>
              <div className="result-metrics">
                <span>
                  <strong>
                    {evidence.matched !== undefined ? `${evidence.matched} / ${evidence.expected}` : "—"}
                  </strong>
                  Target pitches detected
                </span>
                <span>
                  <strong>
                    {evidence.timingMs === null
                      ? "—"
                      : `${Math.round(evidence.timingMs)} ms`}
                  </strong>
                  {delayMeasured ? "Timing deviation" : "Timing + unknown device delay"}
                </span>
                <span>
                  <strong>
                    {evidence.observed === undefined && evidence.score === null ? "—" : evidence.missed}
                  </strong>
                  Missed notes
                </span>
                <span>
                  <strong>
                    {evidence.observed === undefined && evidence.score === null ? "—" : evidence.extra}
                  </strong>
                  Extra separate attacks detected
                </span>
              </div>
              {evidence.matched !== undefined && <p>Pitch matches: {evidence.matched} / {evidence.expected} expected notes. Detected events: {evidence.observed}. Confidence describes the signal, not certainty about your technique.</p>}
              {evidence.matched !== undefined && <p><strong>Extra strings are not verified.</strong> This detector follows one pitch at a time. It can find the target note while missing another string sounding with it. These counts do not establish a clean take.</p>}
              {evidence.diagnostic === "timing" && <p>Timing is uncalibrated, so this take has no combined score and does not change mastery. Use the pulse drill to practise even gaps; do not adjust the delay to improve the result.</p>}
              {drill === "pulse" && evidence.consistency !== null && <p>Attack evenness: {evidence.consistency}/100. This measures variation around the pulse, not absolute lateness. Listen for equal gaps, then repeat at this tempo.</p>}
              {change !== null && (
                <p className="muted">
                  {change > 0
                    ? `Up ${change}`
                    : change < 0
                      ? `Down ${Math.abs(change)}`
                      : "Unchanged"}{" "}
                  points from your previous scored take.
                </p>
              )}
              {url && (
                <div className="recording-playback">
                  <audio src={url} controls />
                  <button
                    className="icon-button"
                    aria-label="Download take"
                    onClick={() =>
                      audioBlob.current &&
                      download("riff-take.wav", audioBlob.current)
                    }
                  >
                    <Download size={18} />
                  </button>
                </div>
              )}
              {!drill && <button
                className="text-button"
                onClick={() =>
                  evidence.diagnostic === "overlap" ? chooseDrill("note") : repeat ? void start() : next.mode === "diagnostic" ? chooseDrill(evidence.diagnostic === "timing" ? evidence.weakestTransition !== undefined ? "note" : "pulse" : "input") : onSelect(next.exerciseId, next.bpm)
                }
              >
                {evidence.diagnostic === "overlap" ? "Next: isolate C3" : repeat
                  ? "Repeat this phrase"
                  : next.mode === "diagnostic" ? evidence.diagnostic === "timing" ? "Next: focused drill" : "Next: check input" : `Next: ${getExercise(next.exerciseId)?.title || "focused practice"}`}{" "}
                <ArrowRight size={17} />
              </button>}
              <p className="muted small">
                {repeat
                  ? "Same phrase, same tempo. Aim for three consistent takes."
                  : next.reason}
              </p>
            </div>
          )}
          {exercise.kind === "muting" && (
            <div className="muting-panel">
              <span className="eyebrow">COMPARE YOUR OWN SOUND</span>
              <h2>
                {
                  [
                    "1. Open and ringing",
                    "2. Light palm mute",
                    "3. Stronger palm mute",
                  ][muteStep]
                }
              </h2>
              <p>
                Play this same pattern{" "}
                {
                  [
                    "without muting to establish your baseline",
                    "with the side of your palm lightly touching the strings near the bridge",
                    "with a little more contact near the bridge",
                  ][muteStep]
                }
                . Keep microphone position, gain and tempo unchanged. We compare
                decay, not hand position.
              </p>
              {comparison && (
                <div className="feedback">
                  <strong>
                    {comparison.reductionPercent === null
                      ? "Not enough clear attacks"
                      : `${Math.round(comparison.reductionPercent)}% shorter decay than your baseline`}
                  </strong>
                  <p>{comparison.message}</p>
                  <small>
                    {comparison.confidence} confidence · compression and room
                    echo can change this measurement
                  </small>
                </div>
              )}
              <button
                className="text-button"
                disabled={active}
                onClick={() => {
                  setMuteStep(0);
                  baseline.current = null;
                  setComparison(null);
                }}
              >
                Reset baseline <Repeat2 size={16} />
              </button>
            </div>
          )}
        </div>
        <aside className="teacher-notes">
          <span className="eyebrow">ON YOUR MUSIC STAND</span>
          <h2>One note at a time.</h2>
          <ol>
            {exercise.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <div className="why-note">
            <span className="eyebrow">THE CONNECTION</span>
            <p>{exercise.why}</p>
          </div>
          <p className="headphone-note">
            <Headphones size={22} /> Use headphones so the metronome doesn’t
            enter your recording. Play with a clean tone.
          </p>
          <details>
            <summary>
              Input & timing <ChevronDown size={14} />
            </summary>
            <p className="muted">
              Use your device microphone or an audio interface selected in your
              browser. Acoustic arrival and interface delay affect timing.
              Prefer wired headphones.
            </p>
            <label htmlFor="latency">Known input delay: {latency} ms</label>
            <label><input type="checkbox" checked={delayMeasured} disabled={active} onChange={(e) => setDelayMeasured(e.target.checked)} /> I independently measured this setup’s delay (including a measured 0 ms).</label>
            <input
              id="latency"
              type="range"
              min="0"
              max="250"
              step="5"
              value={latency}
              disabled={active}
              onChange={(e) => setLatency(+e.target.value)}
            />
            <p className="small muted">
              Leave at 0 unless you have measured your setup’s delay. RIFF never
              silently shifts your take to make timing look better.
              A pluck-to-click exercise includes your reaction time and cannot measure hardware delay. Recheck after changing devices or Bluetooth connections.
            </p>
          </details>
        </aside>
      </div>
      <VideoReview captureActive={state === "countdown" || state === "recording"} />
      {exercise.skill === "performance" && (
        <div className="reference-audio">
          <h2>The complete First Light study</h2>
          <p className="muted">
            Original synthesized reference · E minor · 100 eighth-note
            pulses/min
          </p>
          <audio controls src="/first-light.wav" preload="none" />
          <a className="text-button" href="/first-light.wav" download>
            Download reference WAV <Download size={16} />
          </a>
        </div>
      )}
    </section>
  );
}
