import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeakerBook } from './speaker-book.ts';

const DIM = 16;

/** Unit vector near basis axis `k`, with deterministic noise of relative size `noise`. */
function vec(k: number, noise = 0.1, seed = 1): Float32Array {
  const v = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) v[i] = noise * Math.sin(seed * 12.9898 + i * 78.233 + k * 3.7);
  v[k] += 1;
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n);
  return v.map((x) => x / n);
}

test('same voice keeps its id, a different voice opens a new speaker', () => {
  const book = new SpeakerBook({ threshold: 0.5 });
  const a1 = book.assign(vec(0, 0.1, 1), 5)!;
  assert.deepEqual([a1.speakerId, a1.label, a1.isNew, a1.similarity], ['anon-1', 'Speaker 1', true, 1]);
  const a2 = book.assign(vec(0, 0.1, 2), 5)!;
  assert.equal(a2.speakerId, 'anon-1');
  assert.equal(a2.isNew, false);
  assert.ok(a2.similarity > 0.8 && a2.similarity <= 1);
  const b1 = book.assign(vec(1, 0.1, 3), 5)!;
  assert.equal(b1.speakerId, 'anon-2');
  assert.equal(b1.isNew, true);
  assert.equal(book.assign(vec(0, 0.1, 4), 5)!.speakerId, 'anon-1');
  assert.equal(book.list().length, 2);
  assert.equal(book.list()[0].phrases, 3);
});

test('phrases shorter than minSeconds return null and leave no trace', () => {
  const book = new SpeakerBook({ minSeconds: 2, minSecondsForNewSpeaker: 3 });
  assert.equal(book.assign(vec(0), 1.9), null);
  assert.equal(book.assign(vec(0), Number.NaN), null);
  assert.equal(book.list().length, 0);
});

test('a short-ish phrase can join an existing speaker but cannot open one', () => {
  const book = new SpeakerBook({ threshold: 0.5, minSeconds: 2, minSecondsForNewSpeaker: 3 });
  assert.equal(book.assign(vec(0), 2.5), null);
  assert.equal(book.assign(vec(0), 4)!.speakerId, 'anon-1');
  assert.equal(book.assign(vec(0, 0.1, 9), 2.5)!.speakerId, 'anon-1');
  assert.equal(book.assign(vec(1), 2.5), null);
  assert.equal(book.anonymousCount(), 1);
});

test('anonymous cap: unmatched voices beyond the cap return null', () => {
  const book = new SpeakerBook({ threshold: 0.5, maxAnonymousSpeakers: 2 });
  assert.ok(book.assign(vec(0), 5));
  assert.ok(book.assign(vec(1), 5));
  assert.equal(book.assign(vec(2), 5), null);
  assert.equal(book.assign(vec(1, 0.1, 5), 5)!.speakerId, 'anon-2');
  assert.equal(book.anonymousCount(), 2);
});

test('enrolled names win over anonymous numbering and do not count towards the cap', () => {
  const book = new SpeakerBook({ threshold: 0.5, maxAnonymousSpeakers: 1 });
  assert.equal(book.enroll('Ana', [vec(3, 0.1, 1), vec(3, 0.1, 2)]), 'named:Ana');
  const r = book.assign(vec(3, 0.1, 7), 5)!;
  assert.deepEqual([r.speakerId, r.label, r.isNew], ['named:Ana', 'Ana', false]);
  assert.equal(book.assign(vec(4), 5)!.label, 'Speaker 1');
  assert.equal(book.anonymousCount(), 1);
  // re-enrolling replaces, it does not duplicate
  book.enroll('Ana', [vec(5)]);
  assert.equal(book.list().filter((s) => s.label === 'Ana').length, 1);
  assert.equal(book.assign(vec(5, 0.1, 3), 5)!.speakerId, 'named:Ana');
});

test('enrolled centroid is frozen unless adaptEnrolled is set', () => {
  const frozen = new SpeakerBook({ threshold: 0.3 });
  frozen.enroll('Ana', [vec(0, 0)]);
  const before = JSON.stringify(frozen.toJSON().speakers[0].sum);
  frozen.assign(vec(0, 0.5, 4), 5);
  assert.equal(JSON.stringify(frozen.toJSON().speakers[0].sum), before);
  const adaptive = new SpeakerBook({ threshold: 0.3, adaptEnrolled: true });
  adaptive.enroll('Ana', [vec(0, 0)]);
  adaptive.assign(vec(0, 0.5, 4), 5);
  assert.notEqual(JSON.stringify(adaptive.toJSON().speakers[0].sum), before);
});

test('rename promotes an anonymous speaker and keeps matching', () => {
  const book = new SpeakerBook({ threshold: 0.5 });
  const id = book.assign(vec(2), 5)!.speakerId;
  assert.equal(book.rename(id, 'Luis'), 'named:Luis');
  assert.equal(book.assign(vec(2, 0.1, 8), 5)!.label, 'Luis');
  assert.equal(book.anonymousCount(), 0);
  // numbering does not get reused
  assert.equal(book.assign(vec(6), 5)!.label, 'Speaker 2');
});

test('JSON round trip preserves ids, centroids, counter and options', () => {
  const book = new SpeakerBook({ threshold: 0.55, maxAnonymousSpeakers: 3 });
  book.enroll('Ana', [vec(3)]);
  book.assign(vec(0), 5);
  book.assign(vec(1), 5);
  const text = JSON.stringify(book);
  const restored = SpeakerBook.fromJSON(JSON.parse(text));
  assert.equal(restored.options.threshold, 0.55);
  assert.deepEqual(restored.list().map((s) => s.speakerId), ['named:Ana', 'anon-1', 'anon-2']);
  assert.equal(restored.assign(vec(1, 0.1, 5), 5)!.speakerId, 'anon-2');
  assert.equal(restored.assign(vec(3, 0.1, 5), 5)!.speakerId, 'named:Ana');
  assert.equal(restored.assign(vec(7), 5)!.speakerId, 'anon-3');
  assert.equal(SpeakerBook.fromJSON(JSON.parse(text), { threshold: 0.9 }).options.threshold, 0.9);
  assert.throws(() => SpeakerBook.fromJSON({ version: 2 } as never));
});

test('dimension mismatch and zero vectors are rejected', () => {
  const book = new SpeakerBook();
  book.assign(vec(0), 5);
  assert.throws(() => book.assign(new Float32Array(8).fill(1), 5));
  assert.equal(book.assign(new Float32Array(DIM), 5), null);
});

test('centroid is duration weighted', () => {
  const book = new SpeakerBook({ threshold: -1 });
  const x = new Float32Array(DIM); x[0] = 1;
  const y = new Float32Array(DIM); y[1] = 1;
  book.assign(x, 9);
  book.assign(y, 3); // threshold -1 forces the merge
  const sum = book.toJSON().speakers[0].sum;
  assert.deepEqual([sum[0], sum[1]], [9, 3]);
});
