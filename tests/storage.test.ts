import test from 'node:test';
import assert from 'node:assert/strict';
import { initialProgress, recordAttempt } from '../lib/learning';
import { readProgress, saveProgress, validProgress } from '../lib/storage';
import type { Attempt, Progress } from '../lib/types';
import { NextRequest } from 'next/server';
import { POST, PUT, GET } from '../app/api/cloud/[...path]/route';

const take: Attempt = {
  id: 'test-take', exerciseId: 'first-light-bass', skill: 'strings', at: '2026-10-18T10:00:00Z', bpm: 100, seconds: 20,
  evidence: { confidence: 'high', score: 95, pitchAccuracy: 95, timingMs: 30, missed: 0, extra: 0, consistency: 95, message: 'Clear take.' },
};
const saved = () => recordAttempt(initialProgress(), structuredClone(take));

test('validates real progress, quiz tempo zero and optional measurements', () => {
  assert.ok(validProgress(initialProgress()));
  assert.ok(validProgress(saved()));
  assert.ok(validProgress({ ...initialProgress(), attempts: [{ ...take, exerciseId: 'theory-note', skill: 'theory', bpm: 0 }] }));
  assert.ok(validProgress({ ...initialProgress(), attempts: [{ ...take, evidence: { ...take.evidence, score: null, pitchAccuracy: null, consistency: null, timingMs: null } }] }));
  assert.ok(validProgress({ ...initialProgress(), attempts: [{ ...take, evidence: { ...take.evidence, weakestTransition: undefined } }] }));
});

test('backup proxy checks path, method, origin and streaming byte size before forwarding', async () => {
  const originalFetch = globalThis.fetch;
  const originalApi = process.env.RIFF_API_URL;
  const originalOrigin = process.env.PUBLIC_ORIGIN;
  process.env.RIFF_API_URL = 'http://private-api:8000';
  delete process.env.PUBLIC_ORIGIN;
  const calls: RequestInit[] = [];
  globalThis.fetch = async (_url, options) => { calls.push(options!); return Response.json({ token: 'test' }, { status: 201 }); };
  const context = (name: string) => ({ params: Promise.resolve({ path: [name] }) });
  const request = (method: string, headers = {}, body?: string) => new NextRequest('http://internal:3000/api/cloud/progress', { method, headers: { Host: 'riff.example', Origin: 'https://riff.example', 'Content-Type': 'application/json', ...headers }, body });
  try {
    assert.equal((await POST(request('POST'), context('sessions'))).status, 201);
    assert.equal(calls[0].redirect, 'error');
    assert.equal(calls[0].cache, 'no-store');
    assert.equal((await POST(request('POST'), context('progress'))).status, 405);
    assert.equal((await GET(request('GET'), context('__proto__'))).status, 404);
    assert.equal((await POST(request('POST', { Origin: 'https://evil.example', 'X-Forwarded-Host': 'evil.example' }), context('sessions'))).status, 403);
    assert.equal((await PUT(request('PUT', {}, '🎸'.repeat(300_000)), context('progress'))).status, 413);
    assert.equal(calls.length, 1);
    process.env.PUBLIC_ORIGIN = 'https://public.example';
    assert.equal((await POST(request('POST', { Origin: 'https://public.example', Host: 'internal:3000' }), context('sessions'))).status, 201);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApi === undefined) delete process.env.RIFF_API_URL; else process.env.RIFF_API_URL = originalApi;
    if (originalOrigin === undefined) delete process.env.PUBLIC_ORIGIN; else process.env.PUBLIC_ORIGIN = originalOrigin;
  }
});

test('rejects malformed mastery, foreign fields and unknown skill keys', () => {
  const base = saved();
  for (const invalid of [
    null, [], {}, { ...base, version: 2 }, { ...base, extra: true },
    { ...base, mastery: [] }, { ...base, mastery: { strings: null } },
    { ...base, mastery: { unknown: base.mastery.strings } },
    { ...base, mastery: { strings: { ...base.mastery.strings, skill: 'theory' } } },
    { ...base, mastery: { strings: { ...base.mastery.strings, value: 1e100 } } },
    { ...base, mastery: { strings: { ...base.mastery.strings, errors: [null] } } },
    { ...base, mastery: { strings: { ...base.mastery.strings, attempts: -1 } } },
    { ...base, mastery: { strings: { ...base.mastery.strings, reviewAt: 'tomorrow' } } },
    JSON.parse('{"version":1,"profile":null,"attempts":[],"mastery":{"__proto__":{}}}'),
  ]) assert.equal(validProgress(invalid), false);
});

test('rejects malformed attempts and bounded fields', () => {
  const invalid = [
    { ...take, skill: 'unknown' }, { ...take, at: 'yesterday' }, { ...take, at: 123 },
    { ...take, at: '2026-02-30T10:00:00Z' }, { ...take, at: '2026-10-18T24:00:00Z' },
    { ...take, bpm: Infinity }, { ...take, bpm: 301 }, { ...take, seconds: 1e100 },
    { ...take, evidence: null }, { ...take, extra: true }, { ...take, id: '' },
    { ...take, evidence: { ...take.evidence, score: NaN } },
    { ...take, evidence: { ...take.evidence, score: 101 } },
    { ...take, evidence: { ...take.evidence, score: '95' } },
    { ...take, evidence: { ...take.evidence, missed: 0.5 } },
    { ...take, evidence: { ...take.evidence, message: 'a'.repeat(501) } },
    { ...take, evidence: { ...take.evidence, weakestTransition: null } },
    { ...take, evidence: { ...take.evidence, surprise: true } },
  ];
  for (const attempt of invalid) assert.equal(validProgress({ ...initialProgress(), attempts: [attempt] }), false);
  assert.equal(validProgress({ ...initialProgress(), attempts: [take, take] }), false);
  assert.equal(validProgress({ ...initialProgress(), attempts: Array.from({ length: 501 }, (_, index) => ({ ...take, id: String(index) })) }), false);
  const profile = { instrument: 'electric', experience: 'returning', goal: 'First Light', styles: ['Metal'], minutes: 10 };
  assert.ok(validProgress({ ...initialProgress(), profile }));
  for (const change of [{ minutes: 0 }, { minutes: 1e100 }, { styles: [null] }, { goal: '' }, { extra: true }]) {
    assert.equal(validProgress({ ...initialProgress(), profile: { ...profile, ...change } }), false);
  }
});

test('bad saved JSON never overwrites existing bytes and invalid writes preserve progress', () => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  try {
    assert.equal(readProgress(), null);
    values.set('riff.progress.v1', '{broken');
    assert.throws(readProgress, /Import a valid backup/);
    assert.equal(values.get('riff.progress.v1'), '{broken');
    saveProgress(saved());
    const before = values.get('riff.progress.v1');
    assert.deepEqual(readProgress(), saved());
    assert.throws(() => saveProgress({ ...saved(), mastery: { strings: null } } as unknown as Progress), /Invalid progress/);
    assert.equal(values.get('riff.progress.v1'), before);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
