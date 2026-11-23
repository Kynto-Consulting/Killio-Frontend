import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFbank, melBinCenters, numFramesFor } from './fbank.ts';

function sine(freq: number, seconds: number, amp = 0.5, sr = 16000): Float32Array {
  const x = new Float32Array(Math.round(seconds * sr));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return x;
}

test('shape: 1 s at 16 kHz gives 98 frames x 80 bins (snip_edges)', () => {
  const r = computeFbank(sine(440, 1));
  assert.equal(r.numFrames, 98);
  assert.equal(r.numMelBins, 80);
  assert.equal(r.data.length, 98 * 80);
  assert.equal(numFramesFor(16000), 98);
  assert.equal(numFramesFor(400), 1);
  assert.equal(numFramesFor(399), 0);
});

test('input shorter than one frame gives zero frames', () => {
  const r = computeFbank(new Float32Array(399));
  assert.equal(r.numFrames, 0);
  assert.equal(r.data.length, 0);
});

test('a sine concentrates energy in the mel bin nearest its frequency', () => {
  const centers = melBinCenters();
  for (const freq of [300, 1000, 2500, 5000]) {
    const r = computeFbank(sine(freq, 0.5), { subtractMean: false });
    let expected = 0;
    for (let b = 1; b < centers.length; b++) if (Math.abs(centers[b] - freq) < Math.abs(centers[expected] - freq)) expected = b;
    for (const frame of [0, r.numFrames >> 1, r.numFrames - 1]) {
      let arg = 0;
      for (let b = 1; b < 80; b++) if (r.data[frame * 80 + b] > r.data[frame * 80 + arg]) arg = b;
      assert.ok(Math.abs(arg - expected) <= 1, `freq ${freq}: peak bin ${arg}, expected ${expected}`);
      // the peak must stand well above a far-away bin (> 6 nats ~ 26 dB)
      const far = (expected + 40) % 80;
      assert.ok(r.data[frame * 80 + arg] - r.data[frame * 80 + far] > 6);
    }
  }
});

test('mel bin centres are increasing and span 20 Hz .. Nyquist', () => {
  const c = melBinCenters();
  assert.equal(c.length, 80);
  for (let b = 1; b < 80; b++) assert.ok(c[b] > c[b - 1]);
  assert.ok(c[0] > 20 && c[0] < 100);
  assert.ok(c[79] > 7000 && c[79] < 8000);
});

test('mean normalisation makes every mel bin zero-mean over time', () => {
  const x = sine(700, 1);
  for (let i = 0; i < x.length; i++) x[i] += 0.1 * Math.sin(i * 0.37) * Math.sin(i * 0.011);
  const r = computeFbank(x);
  for (let b = 0; b < 80; b++) {
    let m = 0;
    for (let f = 0; f < r.numFrames; f++) m += r.data[f * 80 + b];
    assert.ok(Math.abs(m / r.numFrames) < 1e-3);
  }
});

test('waveform scale shifts the log energies by 2*ln(scale) and CMN removes it', () => {
  const x = sine(1000, 0.3);
  const a = computeFbank(x, { subtractMean: false, waveformScale: 32768 });
  const b = computeFbank(x, { subtractMean: false, waveformScale: 1 });
  const peak = 25 * 80 + 26;
  let arg = 0;
  for (let k = 1; k < 80; k++) if (a.data[25 * 80 + k] > a.data[25 * 80 + arg]) arg = k;
  assert.ok(Math.abs(a.data[25 * 80 + arg] - b.data[25 * 80 + arg] - 2 * Math.log(32768)) < 1e-3, String(peak));
});

test('silence is finite (floored log), not -Infinity/NaN', () => {
  const r = computeFbank(new Float32Array(16000), { subtractMean: false });
  for (const v of r.data) assert.ok(Number.isFinite(v));
  assert.ok(Math.abs(r.data[0] - Math.log(1.1920928955078125e-7)) < 1e-4);
});
