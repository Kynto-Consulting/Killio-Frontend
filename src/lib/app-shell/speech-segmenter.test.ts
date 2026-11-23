import assert from "node:assert/strict";
import test from "node:test";

import { SpeechSegmenter, downsample, encodeWav, rms } from "./speech-segmenter.ts";

const RATE = 16_000;
const FRAME = 320; // 20 ms
/** A 20 ms frame: a tone at `level` loudness (a stand-in for voice), or near-silence. */
const frame = (level: number) => Float32Array.from({ length: FRAME }, (_, i) => level * Math.sin((2 * Math.PI * 220 * i) / RATE));
const QUIET = 0.001;
const VOICE = 0.2;

/** Feeds `ms` of sound at `level`, collecting the phrases that complete. */
function feed(segmenter: SpeechSegmenter, clock: { t: number }, level: number, ms: number) {
  const out = [];
  for (let elapsed = 0; elapsed < ms; elapsed += 20) {
    const done = segmenter.push(frame(level), clock.t);
    clock.t += 20;
    if (done) out.push(done);
  }
  return out;
}

test("silence alone produces nothing", () => {
  const s = new SpeechSegmenter({ sampleRate: RATE });
  assert.deepEqual(feed(s, { t: 0 }, QUIET, 5000), []);
  assert.equal(s.isSpeaking, false);
  assert.equal(s.flush(), null);
});

test("a phrase is cut at the pause, with a little audio from before it started", () => {
  const s = new SpeechSegmenter({ sampleRate: RATE });
  const clock = { t: 0 };
  feed(s, clock, QUIET, 1000);
  assert.deepEqual(feed(s, clock, VOICE, 1500), []);
  assert.equal(s.isSpeaking, true);
  const [phrase] = feed(s, clock, QUIET, 1200);
  assert.ok(phrase, "the pause ends the phrase");
  assert.equal(s.isSpeaking, false);
  // 1500 ms of voice + up to 300 ms before it + the 900 ms pause that ended it.
  assert.ok(phrase.durationMs > 2300 && phrase.durationMs < 2900, String(phrase.durationMs));
  // It started before the voice did (pre-roll), not after.
  assert.ok(phrase.startedAt < 1000 && phrase.startedAt >= 600, String(phrase.startedAt));
});

test("a cough or a click is dropped", () => {
  const s = new SpeechSegmenter({ sampleRate: RATE });
  const clock = { t: 0 };
  feed(s, clock, QUIET, 1000);
  feed(s, clock, VOICE, 200);
  assert.deepEqual(feed(s, clock, QUIET, 1500), []);
});

test("steady background noise becomes the floor instead of counting as voice", () => {
  const s = new SpeechSegmenter({ sampleRate: RATE });
  const clock = { t: 0 };
  // A fan: constant and clearly audible. It may trip once while the floor catches up, never again.
  feed(s, clock, 0.03, 20_000);
  s.flush();
  assert.deepEqual(feed(s, clock, 0.03, 10_000), []);
  // Voice over the fan is still a phrase.
  feed(s, clock, 0.3, 1200);
  assert.equal(s.isSpeaking, true);
});

test("someone who never pauses is cut at the maximum length and continues", () => {
  const s = new SpeechSegmenter({ sampleRate: RATE, maxSegmentMs: 2000 });
  const clock = { t: 0 };
  feed(s, clock, QUIET, 500);
  const phrases = feed(s, clock, VOICE, 5000);
  assert.ok(phrases.length >= 2, String(phrases.length));
  for (const p of phrases) assert.ok(p.durationMs <= 2040, String(p.durationMs));
});

test("stopping mid-phrase keeps what was said", () => {
  const s = new SpeechSegmenter({ sampleRate: RATE });
  const clock = { t: 0 };
  feed(s, clock, QUIET, 500);
  feed(s, clock, VOICE, 1000);
  const phrase = s.flush();
  assert.ok(phrase && phrase.durationMs >= 1000);
});

test("downsampling keeps the length ratio and the loudness", () => {
  const input = Float32Array.from({ length: 48_000 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 200 * i) / 48_000));
  const out = downsample(input, 48_000, 16_000);
  assert.equal(out.length, 16_000);
  assert.ok(Math.abs(rms(out) - rms(input)) < 0.02);
  assert.equal(downsample(input, 16_000, 16_000), input);
});

test("WAV header describes 16-bit mono at the given rate and clips out-of-range samples", () => {
  const wav = encodeWav(Float32Array.from([0, 1, -1, 2, -2]), RATE);
  const view = new DataView(wav.buffer);
  const tag = (o: number) => String.fromCharCode(...wav.slice(o, o + 4));
  assert.deepEqual([tag(0), tag(8), tag(12), tag(36)], ["RIFF", "WAVE", "fmt ", "data"]);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), RATE);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 10);
  assert.equal(wav.length, 54);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true)), [0, 32767, -32768, 32767, -32768]);
});
