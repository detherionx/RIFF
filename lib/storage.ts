import { skills } from './curriculum';
import type { Progress } from './types';
const KEY = 'riff.progress.v1';
const limit = 1_048_576;
const skillIds = new Set<string>(skills.map(skill => skill.id));
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fields = (value: Record<string, unknown>, required: string[], optional: string[] = []) => required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const text = (value: unknown, maximum = 500): value is string => typeof value === 'string' && value.length > 0 && value.length <= maximum;
const number = (value: unknown, maximum: number, minimum = 0): value is number => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
const integer = (value: unknown, maximum: number, minimum = 0) => number(value, maximum, minimum) && Number.isInteger(value);
const nullableScore = (value: unknown) => value === null || number(value, 100);
function date(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return Number(value.slice(0, 4)) > 0 && Number(value.slice(11, 13)) < 24
    && new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) === value.slice(0, 10);
}
const strings = (value: unknown, maximum: number) => Array.isArray(value) && value.length <= maximum && value.every(item => text(item));

function profile(value: unknown) {
  return value === null || object(value) && fields(value, ['instrument', 'experience', 'styles', 'goal', 'minutes'])
    && ['electric', 'acoustic'].includes(value.instrument as string) && ['new', 'returning'].includes(value.experience as string)
    && strings(value.styles, 12) && text(value.goal) && integer(value.minutes, 180, 1);
}

function evidence(value: unknown) {
  return object(value) && fields(value, ['confidence', 'score', 'pitchAccuracy', 'timingMs', 'missed', 'extra', 'consistency', 'message'], ['weakestTransition'])
    && ['high', 'medium', 'low'].includes(value.confidence as string) && nullableScore(value.score) && nullableScore(value.pitchAccuracy)
    && (value.timingMs === null || number(value.timingMs, 60_000)) && integer(value.missed, 1_000_000) && integer(value.extra, 1_000_000)
    && nullableScore(value.consistency) && text(value.message) && (value.weakestTransition === undefined || integer(value.weakestTransition, 10_000));
}

function attempt(value: unknown) {
  return object(value) && fields(value, ['id', 'exerciseId', 'skill', 'at', 'bpm', 'evidence', 'seconds'])
    && text(value.id, 100) && text(value.exerciseId, 100) && skillIds.has(value.skill as string)
    && date(value.at) && number(value.bpm, 300) && number(value.seconds, 86_400) && evidence(value.evidence);
}

function mastery(value: unknown, skill: string) {
  return object(value) && fields(value, ['skill', 'value', 'attempts', 'streak', 'bestBpm', 'lastPracticed', 'reviewAt', 'errors'])
    && value.skill === skill && number(value.value, 100) && integer(value.attempts, 1_000_000) && integer(value.streak, 1_000_000)
    && number(value.bestBpm, 300) && (value.lastPracticed === null || date(value.lastPracticed)) && (value.reviewAt === null || date(value.reviewAt))
    && strings(value.errors, 20);
}

export function validProgress(value: unknown): value is Progress {
  if (!object(value) || !fields(value, ['version', 'profile', 'attempts', 'mastery']) || value.version !== 1 || !profile(value.profile)
    || !Array.isArray(value.attempts) || value.attempts.length > 500 || !value.attempts.every(attempt) || !object(value.mastery)) return false;
  return new Set(value.attempts.map(item => item.id)).size === value.attempts.length
    && Object.entries(value.mastery).every(([skill, entry]) => skillIds.has(skill) && mastery(entry, skill));
}
export function readProgress(): Progress | null {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return null;
  try {
    if (new TextEncoder().encode(raw).byteLength > limit) throw new Error('Too large');
    const data: unknown = JSON.parse(raw);
    if (validProgress(data)) return data;
  } catch { /* Keep the original saved bytes intact so the user can recover them. */ }
  throw new Error('Saved progress could not be read. Import a valid backup or reset it in Settings.');
}
export function saveProgress(progress: Progress) {
  const next = { ...progress, attempts: progress.attempts.slice(-500) };
  if (!validProgress(next)) throw new Error('Invalid progress was not saved.');
  const raw = JSON.stringify(next);
  if (new TextEncoder().encode(raw).byteLength > limit) throw new Error('Progress exceeds 1 MiB.');
  localStorage.setItem(KEY, raw);
}
export function download(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function wav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0,'RIFF'); view.setUint32(4,36+samples.length*2,true); text(8,'WAVE'); text(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true); text(36,'data'); view.setUint32(40,samples.length*2,true); samples.forEach((s,i)=>view.setInt16(44+i*2,Math.max(-1,Math.min(1,s))*32767,true)); return new Blob([buffer],{type:'audio/wav'});
}
