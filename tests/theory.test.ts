import test from 'node:test';
import assert from 'node:assert/strict';
import { minorScales, scoreRhythm } from '../components/theory';

test('natural minor scales follow the same whole-half step sequence from their root', () => {
  for (const scale of minorScales) {
    const relative = scale.notes.map(note => (note - scale.root + 12) % 12).sort((a, b) => a - b);
    assert.deepEqual(relative, [0, 2, 3, 5, 7, 8, 10]);
  }
  assert.ok(minorScales[0].notes.includes(6));
  assert.ok(!minorScales[0].notes.includes(5));
});
test('rhythm scoring shares the exact metronome clock including its initial scheduling delay', () => {
  const audioStart = 7.05, bpm = 80, firstTap = audioStart + 6 * 60 / bpm;
  const times = Array.from({ length: 12 }, (_, index) => firstTap + index * 60 / bpm);
  assert.equal(scoreRhythm(times, firstTap, bpm, 120).score, 100);
  assert.ok(scoreRhythm(times, firstTap, bpm, 120).correct);
  const late = times.map(time => time + .2);
  assert.equal(scoreRhythm(late, firstTap, bpm, 120).correct, false);
  assert.ok(Math.abs(scoreRhythm(late, firstTap, bpm, 120).deviation - 200) < .001);
});
test('double-speed tapping cannot pass as twelve evenly timed pulses', () => {
  const taps = Array.from({ length: 12 }, (_, index) => 4 + index * .25);
  assert.equal(scoreRhythm(taps, 4, 120, 80).correct, false);
});
