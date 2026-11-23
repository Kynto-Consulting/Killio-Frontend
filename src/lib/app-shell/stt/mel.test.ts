// Run: node --experimental-strip-types --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fft400, logMelSpectrogram, melFilterbank, N_FRAMES, N_MELS } from './mel.ts';

const refs = join(dirname(fileURLToPath(import.meta.url)), 'refs');

/** Reads one float32 array out of an .npz (zip of .npy) file. */
function readNpz(path: string, member: string): { shape: number[]; data: Float32Array } {
  const b = readFileSync(path);
  let pos = 0;
  while (b.readUInt32LE(pos) === 0x04034b50) {
    const method = b.readUInt16LE(pos + 8), csize = b.readUInt32LE(pos + 18), nameLen = b.readUInt16LE(pos + 26), extraLen = b.readUInt16LE(pos + 28);
    const name = b.toString('utf8', pos + 30, pos + 30 + nameLen);
    const start = pos + 30 + nameLen + extraLen;
    if (name === member) {
      const raw = method === 8 ? inflateRawSync(b.subarray(start, start + csize)) : b.subarray(start, start + csize);
      const major = raw[6];
      const headerLen = major === 1 ? raw.readUInt16LE(8) : raw.readUInt32LE(8);
      const dataStart = (major === 1 ? 10 : 12) + headerLen;
      const header = raw.toString('latin1', major === 1 ? 10 : 12, dataStart);
      assert.match(header, /'descr': '<f4'/);
      assert.match(header, /'fortran_order': False/);
      const shape = /'shape': \(([^)]*)\)/.exec(header)![1].split(',').map((s) => s.trim()).filter(Boolean).map(Number);
      const data = new Float32Array(shape.reduce((a, c) => a * c, 1));
      for (let i = 0; i < data.length; i++) data[i] = raw.readFloatLE(dataStart + i * 4);
      return { shape, data };
    }
    pos = start + csize;
  }
  throw new Error('member not found: ' + member);
}

test('mel filterbank equals the reference mel_filters.npz (mel_80) from openai/whisper', () => {
  const ref = readNpz(join(refs, 'mel_filters.npz'), 'mel_80.npy');
  assert.deepEqual(ref.shape, [80, 201]);
  const fb = melFilterbank(80);
  assert.equal(fb.length, ref.data.length);
  let maxDiff = 0, maxRef = 0;
  for (let i = 0; i < fb.length; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(fb[i] - ref.data[i]));
    maxRef = Math.max(maxRef, ref.data[i]);
  }
  console.log(`  max |computed - reference| = ${maxDiff.toExponential(2)} (largest reference weight ${maxRef.toFixed(5)})`);
  assert.ok(maxDiff < 1e-6, `max diff ${maxDiff}`);
});

test('fft400 matches a direct DFT', () => {
  const x = new Float64Array(400);
  let seed = 12345;
  for (let i = 0; i < 400; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; x[i] = seed / 0x7fffffff - 0.5; }
  const re = new Float64Array(400), im = new Float64Array(400);
  fft400(x, re, im);
  for (const k of [0, 1, 2, 7, 50, 199, 200, 201, 399]) {
    let r = 0, i2 = 0;
    for (let n = 0; n < 400; n++) { r += x[n] * Math.cos((2 * Math.PI * k * n) / 400); i2 -= x[n] * Math.sin((2 * Math.PI * k * n) / 400); }
    assert.ok(Math.abs(re[k] - r) < 1e-9 && Math.abs(im[k] - i2) < 1e-9, `bin ${k}`);
  }
});

test('log-mel: shape, range and floor for silence', () => {
  const mel = logMelSpectrogram(new Float32Array(16000));
  assert.equal(mel.length, N_MELS * N_FRAMES);
  // all-zero audio: every value is log10(1e-10) = -10 -> (-10 + 4) / 4 = -1.5
  for (let i = 0; i < mel.length; i += 997) assert.equal(mel[i], -1.5);
});

test('log-mel: a 1 kHz tone peaks in the right mel band, dynamic range is clamped to 8 decades, padding is at the floor', () => {
  const x = new Float32Array(32000);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / 16000);
  const mel = logMelSpectrogram(x);
  let max = -Infinity, min = Infinity;
  for (const v of mel) { if (v > max) max = v; if (v < min) min = v; }
  assert.ok(Math.abs(max - min - 2) < 1e-5, `range ${max - min} should be 8 / 4 = 2`);
  // frame 100 (1 s in): the strongest band must be the one whose triangle covers 1000 Hz
  const fb = melFilterbank(80);
  let bestBand = 0, bestV = -Infinity, expected = 0, expW = 0;
  for (let m = 0; m < 80; m++) {
    const v = mel[m * N_FRAMES + 100];
    if (v > bestV) { bestV = v; bestBand = m; }
    const w = fb[m * 201 + 25]; // bin 25 = 1000 Hz
    if (w > expW) { expW = w; expected = m; }
  }
  assert.equal(bestBand, expected);
  assert.equal(bestV, max);
  // frames well past the 2 s of audio are zero padding -> floor value
  assert.equal(mel[10 * N_FRAMES + 2500], min);
  // direct check of one value against an independent slow computation (frame 100, band `expected`)
  const win = new Float64Array(400);
  for (let i = 0; i < 400; i++) win[i] = x[100 * 160 - 200 + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 400));
  let acc = 0;
  for (let k = 0; k <= 200; k++) {
    let r = 0, im = 0;
    for (let n = 0; n < 400; n++) { r += win[n] * Math.cos((2 * Math.PI * k * n) / 400); im -= win[n] * Math.sin((2 * Math.PI * k * n) / 400); }
    acc += fb[expected * 201 + k] * (r * r + im * im);
  }
  assert.ok(Math.abs((Math.log10(acc) + 4) / 4 - bestV) < 1e-5);
});

test('log-mel: audio longer than 30 s is truncated, exactly 30 s works', () => {
  const x = new Float32Array(500000);
  for (let i = 0; i < x.length; i++) x[i] = Math.sin(i * 0.3) * 0.1;
  const a = logMelSpectrogram(x), b = logMelSpectrogram(x.subarray(0, 480000));
  assert.deepEqual(a, b);
  assert.ok(Number.isFinite(a[80 * 3000 - 1]));
});
