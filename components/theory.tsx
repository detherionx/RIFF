'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Ear, RotateCcw, Play } from 'lucide-react';
import type { Attempt, Progress } from '@/lib/types';
import { AudioEngine } from '@/lib/audio';
import Fretboard, { noteNames } from './fretboard';

const modes = [
  { id: 'note', name: 'Find the Note', skill: 'theory' },
  { id: 'interval', name: 'Interval Hunter', skill: 'intervals' },
  { id: 'scale', name: 'Build a Scale', skill: 'theory' },
  { id: 'rhythm', name: 'Rhythm Lab', skill: 'rhythm' },
  { id: 'chord', name: 'Chord Architect', skill: 'theory' },
] as const;
type Mode = (typeof modes)[number]['id'];
export const minorScales = [
  { name: 'E natural minor', notes: [0, 2, 4, 6, 7, 9, 11], spelled: 'E F♯ G A B C D', root: 4 },
  { name: 'A natural minor', notes: [0, 2, 4, 5, 7, 9, 11], spelled: 'A B C D E F G', root: 9 },
  { name: 'D natural minor', notes: [0, 2, 4, 5, 7, 9, 10], spelled: 'D E F G A B♭ C', root: 2 },
];
const chords = [
  { name: 'E minor', notes: [4, 7, 11], major: false },
  { name: 'A minor', notes: [0, 4, 9], major: false },
  { name: 'D minor', notes: [2, 5, 9], major: false },
  { name: 'G major', notes: [2, 7, 11], major: true },
  { name: 'C major', notes: [0, 4, 7], major: true },
];
const intervals = [{ value: 3, name: 'Minor third' }, { value: 7, name: 'Perfect fifth' }, { value: 12, name: 'Octave' }, { value: 5, name: 'Perfect fourth' }, { value: 2, name: 'Major second' }];
export function scoreRhythm(taps: number[], start: number, bpm: number, toleranceMs: number) {
  const deviation = taps.reduce((sum, time, index) => sum + Math.abs(time - start - index * 60 / bpm) * 1000, 0) / taps.length;
  return { deviation, score: Math.max(0, Math.round(100 - deviation * 15 / toleranceMs)), correct: deviation <= toleranceMs };
}

export default function Theory({ progress, onAttempt }: { progress: Progress; onAttempt: (attempt: Attempt) => void }) {
  const [mode, setMode] = useState<Mode>('note');
  const completed = (id: Mode) => progress.attempts.filter(a => a.exerciseId === `theory-${id}`);
  const difficulty = (id: Mode) => Math.min(3, 1 + Math.floor(completed(id).filter(a => (a.evidence.score ?? 0) >= 85).length / 4));
  const [level, setLevel] = useState(() => difficulty('note'));
  const [round, setRound] = useState(() => completed('note').length);
  const [picked, setPicked] = useState<number[]>([]), [answer, setAnswer] = useState<boolean | null>(null);
  const [message, setMessage] = useState(''), [tapping, setTapping] = useState(false), [taps, setTaps] = useState<number[]>([]);
  const engine = useRef<AudioEngine | null>(null), origin = useRef(0), timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answered = useRef(false), active = useRef(false), tapTimes = useRef<number[]>([]), generation = useRef(0), startedAt = useRef<number | null>(null);
  const count = completed(mode).length;
  const target = [4, 7, 11, 2, 9, 0, 6][round % 7];
  const availableIntervals = intervals.slice(0, level === 1 ? 2 : level === 2 ? 4 : 5);
  const interval = availableIntervals[round % availableIntervals.length];
  const scale = minorScales[level - 1];
  const chord = chords[round % (level === 1 ? 1 : level === 2 ? 3 : 5)];
  const bpm = [80, 100, 120][level - 1];
  const current = modes.find(m => m.id === mode)!;

  useEffect(() => {
    startedAt.current = performance.now();
    return () => { generation.current++; active.current = false; if (timeout.current) clearTimeout(timeout.current); void engine.current?.close(); };
  }, []);
  function audio() { return engine.current ||= new AudioEngine(); }
  function stop() {
    generation.current++; active.current = false;
    engine.current?.stopMetronome(); engine.current?.stopPlayback();
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
  }
  function reset(nextMode = mode, advance = true) {
    stop(); answered.current = false; tapTimes.current = []; startedAt.current = performance.now();
    setMode(nextMode); setAnswer(null); setPicked([]); setMessage(''); setTaps([]); setTapping(false);
    if (nextMode !== mode) { setLevel(difficulty(nextMode)); setRound(completed(nextMode).length); }
    else if (advance) { setLevel(difficulty(nextMode)); setRound(r => r + 1); }
  }
  function submit(correct: boolean, explanation: string, score = correct ? 100 : 0, timingMs: number | null = null) {
    if (answered.current) return;
    answered.current = true; setAnswer(correct); setMessage(explanation);
    onAttempt({ id: crypto.randomUUID(), exerciseId: `theory-${mode}`, skill: current.skill, at: new Date().toISOString(), bpm: mode === 'rhythm' ? bpm : 0,
      seconds: Math.max(0, (performance.now() - (startedAt.current ?? performance.now())) / 1000),
      evidence: { confidence: 'high', score, pitchAccuracy: mode === 'rhythm' ? null : score, timingMs, missed: 0, extra: 0, consistency: null, message: explanation } });
  }
  async function listen() {
    const token = generation.current;
    try {
      await audio().playExercise({ id: 'interval-preview', title: '', subtitle: '', skill: 'intervals', stage: 3, bpm: 80, beats: 2, instructions: [], why: '', kind: 'playing', notes: [
        { midi: 52, beat: 0, duration: .8, string: 4, fret: 2 }, { midi: 52 + interval.value, beat: 1, duration: 1, string: 1, fret: 0 },
      ] }, 80);
      if (token !== generation.current) engine.current?.stopPlayback();
    } catch { if (token === generation.current) setMessage('Sound could not start. Try Listen again.'); }
  }
  async function startTaps() {
    if (active.current) return;
    stop(); const token = generation.current;
    active.current = true; answered.current = false; tapTimes.current = []; startedAt.current = performance.now();
    setTaps([]); setAnswer(null); setTapping(true); setMessage('Listen to six count-in clicks. Then tap 12 eighth-note pulses.');
    origin.current = Infinity;
    try {
      const start = await audio().startMetronome(bpm);
      if (token !== generation.current) { engine.current?.stopMetronome(); return; }
      origin.current = start + 6 * 60 / bpm;
      timeout.current = setTimeout(() => {
        if (token !== generation.current) return;
        stop(); setTapping(false); setMessage('The round ended before twelve taps. Start a new count-in to try again.');
      }, Math.max(0, (origin.current + 12 * 60 / bpm + 1 - audio().currentTime) * 1000));
    } catch { if (token === generation.current) { stop(); setTapping(false); setMessage('Sound could not start. Try the count-in again.'); } }
  }
  function tap() {
    if (!active.current || answered.current) return;
    const now = audio().currentTime;
    if (now < origin.current - .15) return;
    tapTimes.current = [...tapTimes.current, now]; setTaps(tapTimes.current);
    if (tapTimes.current.length === 12) {
      const result = scoreRhythm(tapTimes.current, origin.current, bpm, 120 - (level - 1) * 20);
      stop(); setTapping(false);
      submit(result.correct, `${Math.round(result.deviation)} ms average distance from the pulse. ${result.correct ? 'Keep that even spacing as you change strings.' : 'Count ONE two three FOUR five six; tap evenly between the accents.'}`, result.score, result.deviation);
    }
  }
  function pickNote(value: number) {
    if (answered.current) return;
    setPicked(notes => notes.includes(value) ? notes.filter(n => n !== value) : [...notes, value]);
    void audio().playTone(60 + value, .3).catch(() => setMessage('Sound is unavailable; you can still answer with the note buttons.'));
  }
  const labels = mode === 'scale' && level === 3 ? noteNames.map((name, index) => index === 10 ? 'B♭' : name) : noteNames;
  return <section className="theory-page">
    <div className="eyebrow">A LITTLE THEORY. A LOT MORE MUSIC.</div><h1>Know what you play.</h1><p className="lede">Small discoveries that make the next phrase click.</p>
    <div className="theory-tabs" role="group" aria-label="Theory exercises">{modes.map(m => <button aria-pressed={mode === m.id} className={mode === m.id ? 'active' : ''} key={m.id} onClick={() => reset(m.id)}>{m.name}</button>)}</div>
    <div className="theory-workbench"><div className="section-heading"><div><span className="eyebrow">LEVEL {level} · BUILD YOUR MUSICIANSHIP</span><h2>{current.name}</h2></div><span className="pill">{count} answers saved</span></div>
      {mode === 'note' && <><p className="exercise-question">Find any <strong>{noteNames[target]}</strong> on the fretboard.</p><p className="muted">High E is at the top. Each fret raises a string by one semitone.</p><Fretboard frets={level * 2 + 2} labels={answer !== null || level === 1} onPick={(string, fret, midi) => submit(midi % 12 === target, `${noteNames[midi % 12]} is on string ${string}, fret ${fret}. ${midi % 12 === target ? 'That note belongs to E natural minor.' : `Find ${noteNames[target]} by counting semitones from the open string.`}`)} /></>}
      {mode === 'interval' && <><p className="exercise-question">How far apart are these two notes?</p><button className="button secondary" onClick={listen}><Ear size={19} /> Listen to the interval</button><div className="interval-visual"><span>E</span><div>{answer === null ? '?' : `${interval.value} semitones`}</div><span>{answer === null ? '?' : noteNames[(4 + interval.value) % 12]}</span></div><div className="answer-options">{availableIntervals.map(option => <button disabled={answer !== null} key={option.value} onClick={() => submit(interval.value === option.value, `The notes are ${interval.value} semitones apart: ${interval.name.toLowerCase()}. ${interval.value === 3 ? 'E to G gives the study its minor character.' : 'Hear the distance, then find those notes on your guitar.'}`)}>{option.name}</button>)}</div></>}
      {(mode === 'scale' || mode === 'chord') && <><p className="exercise-question">Build {mode === 'scale' ? scale.name : chord.name}.</p><p className="muted">{mode === 'scale' ? `Start on ${noteNames[scale.root]}. ${level === 1 ? 'Follow whole, half, whole, whole, half, whole, whole steps.' : 'Choose all seven pitch classes in the natural minor scale.'}` : `${chord.major ? 'A major' : 'A minor'} chord contains a root, ${chord.major ? 'major' : 'minor'} third and perfect fifth.`}</p><div className="piano-choices">{labels.map((name, index) => <button disabled={answer !== null} aria-pressed={picked.includes(index)} className={picked.includes(index) ? 'chosen' : ''} key={name} onClick={() => pickNote(index)}>{name}</button>)}</div><button disabled={answer !== null || !picked.length} className="button primary" onClick={() => {
        const expected = mode === 'scale' ? scale.notes : chord.notes;
        submit(expected.length === picked.length && expected.every(note => picked.includes(note)), mode === 'scale' ? `${scale.name}: ${scale.spelled}. ${level === 1 ? 'F♯ is the one sharp.' : 'The step pattern stays the same when the root changes.'}` : `${chord.name}: ${expected.map(note => noteNames[note]).join(', ')}. Play them separately to hear an arpeggio.`);
      }}>Check my notes <Check size={18} /></button></>}
      {mode === 'rhythm' && <><p className="exercise-question">Twelve pulses. Two flowing bars.</p><p className="muted">{bpm} eighth-note pulses/min. Listen to a six-click count-in, then tap the large pad twelve times. Use headphones to hear each cue clearly.</p><div className="pulse-row">{Array.from({ length: 12 }, (_, index) => <span key={index} className={index < taps.length ? 'hit' : ''}>{index % 6 + 1}</span>)}</div><button className="tap-pad" disabled={!tapping} onPointerDown={event => { event.preventDefault(); tap(); }} onKeyDown={event => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); if (!event.repeat) tap(); } }}>{tapping ? `${taps.length} / 12 · TAP` : 'FEEL THE PULSE'}</button><button disabled={tapping || answer !== null} className="button primary" onClick={startTaps}><Play size={18} /> {answer === null ? 'Start count-in' : 'Round complete'}</button></>}
      {message && <div role="status" className={`feedback ${answer === false ? 'correction' : ''}`}><strong>{answer === null ? 'Your cue' : answer ? 'That connects.' : 'One thing to work on.'}</strong><p>{message}</p>{answer !== null && <button className="text-button" onClick={() => reset(mode, answer)}>{answer ? 'Next challenge' : 'Try again'} {answer ? <ArrowRight size={16} /> : <RotateCcw size={16} />}</button>}</div>}
    </div><p className="privacy-note">Answers are saved on this device. Four accurate answers increase difficulty; theory mistakes guide your next playing review.</p>
  </section>;
}

