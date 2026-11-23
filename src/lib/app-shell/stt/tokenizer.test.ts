// Run: node --experimental-strip-types --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTokenizer } from './tokenizer.ts';
import { createWhisperModel, trailingLoop, transcribe } from './whisper.ts';
import type { TensorLike, WhisperRuntime } from './whisper.ts';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'public', 'stt');
const j = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

test('byte-level decoding with a tiny hand-made vocabulary', () => {
  // "Ġ" (U+0120) is the space byte; "Ã±" are the two UTF-8 bytes of ñ in the GPT-2 alphabet.
  const tok = createTokenizer({ 'Ġni': 0, 'Ã': 1, '±': 2, 'o': 3, 'Ġ': 4, '<|endoftext|>': 5 }, { '<|startoftranscript|>': 6 });
  assert.equal(tok.decode([0, 1, 2, 3]), ' niño');
  assert.equal(tok.decode([6, 0, 3, 5]), ' nio'); // special tokens skipped
  assert.equal(tok.eot, 5);
  assert.equal(tok.tokenToId('<|startoftranscript|>'), 6);
});

test('real Whisper vocabulary: specials, Spanish accents split across tokens', { skip: !existsSync(join(dir, 'vocab.json')) }, () => {
  const vocab = j('vocab.json') as Record<string, number>;
  const tok = createTokenizer(vocab, j('added_tokens.json'));
  assert.equal(tok.vocabSize, 51865);
  assert.equal(tok.eot, 50257);
  assert.equal(tok.tokenToId('<|es|>'), 50262);
  assert.equal(tok.tokenToId('<|en|>'), 50259);
  assert.equal(tok.tokenToId('<|notimestamps|>'), 50363);
  // encode by hand with single-byte tokens, then decode: must round-trip any UTF-8 text
  const text = ' ¿Cuántos años tiene el pingüino? Ñandú, 100%';
  const alphabet = new Map<number, string>();
  const bs: number[] = [];
  for (let b = 33; b <= 126; b++) bs.push(b);
  for (let b = 161; b <= 172; b++) bs.push(b);
  for (let b = 174; b <= 255; b++) bs.push(b);
  let n = 0;
  for (let b = 0; b < 256; b++) alphabet.set(b, bs.includes(b) ? String.fromCharCode(b) : String.fromCharCode(256 + n++));
  const ids = [...new TextEncoder().encode(text)].map((b) => {
    const id = vocab[alphabet.get(b)!];
    assert.notEqual(id, undefined, `single-byte token for byte ${b}`);
    return id;
  });
  assert.equal(tok.decode(ids), text);
  // a multi-character token
  assert.equal(tok.decode([vocab['Ġhello'], vocab['Ġworld']]), ' hello world');
});

test('model description: prompt ids and suppression list', { skip: !existsSync(join(dir, 'vocab.json')) }, () => {
  const m = createWhisperModel({ vocab: j('vocab.json'), addedTokens: j('added_tokens.json'), config: j('config.json'), generationConfig: j('generation_config.json') });
  assert.deepEqual([m.sot, m.languages.es, m.languages.en, m.transcribe, m.noTimestamps, m.noSpeech, m.eot], [50258, 50262, 50259, 50359, 50363, 50362, 50257]);
  assert.deepEqual([m.numLayers, m.numHeads, m.headDim], [4, 6, 64]);
  assert.ok(!m.suppress.includes(m.eot));
  for (const id of [50258, 50262, 50359, 50362, 50363, 50364, 51864]) assert.ok(m.suppress.includes(id), `id ${id} must be suppressed`);
  assert.deepEqual(m.beginSuppress, [220, 50257]);
});

test('trailingLoop detects repeated blocks only', () => {
  assert.equal(trailingLoop([1, 2, 3, 4, 5, 6, 7, 8]), 0);
  assert.equal(trailingLoop([9, 1, 2, 3, 1, 2, 3, 1, 2, 3]), 3);
  assert.equal(trailingLoop([7, 7, 7]), 0); // "no no no" is legitimate
  assert.equal(trailingLoop([7, 7, 7, 7, 7, 7]), 1);
  assert.equal(trailingLoop([1, 2, 1, 2, 1, 2]), 0);
  assert.equal(trailingLoop([1, 2, 1, 2, 1, 2, 1, 2]), 2);
});

// A fake decoder that always prefers the same token: the loop must be cut by the repetition guard,
// control tokens must never be chosen, and the decoder must be fed the forced prompt first.
test('decoding loop with a mocked runtime: forced prompt, suppression, repetition guard, EOT', { skip: !existsSync(join(dir, 'vocab.json')) }, async () => {
  const model = createWhisperModel({ vocab: j('vocab.json'), addedTokens: j('added_tokens.json'), config: j('config.json'), generationConfig: j('generation_config.json') });
  const V = model.tokenizer.vocabSize;
  const hello = model.tokenizer.tokenToId('Ġhello')!;
  const world = model.tokenizer.tokenToId('Ġworld')!;
  const seen: number[][] = [];
  const mk = (script: (step: number) => number): WhisperRuntime => {
    let step = 0;
    return {
      model,
      createTensor: (_type, data, dims) => ({ data, dims }),
      encoder: { run: async (f) => { assert.deepEqual(f.input_features.dims, [1, 80, 3000]); return { last_hidden_state: { data: new Float32Array(4), dims: [1, 1, 4] } }; } },
      decoder: {
        run: async (f) => {
          const ids = [...(f.input_ids.data as BigInt64Array)].map(Number);
          seen.push(ids);
          assert.equal((f.use_cache_branch.data as Uint8Array)[0], step === 0 ? 0 : 1);
          const pos = ids.length;
          const logits = new Float32Array(pos * V).fill(-5);
          const off = (pos - 1) * V;
          logits[off + 50364] = 50; // a timestamp token: must be suppressed
          logits[off + model.sot] = 40; // a control token: must be suppressed
          logits[off + script(step)] = 30;
          step++;
          const out: Record<string, TensorLike> = { logits: { data: logits, dims: [1, pos, V] } };
          for (let l = 0; l < model.numLayers; l++) for (const p of ['decoder', 'encoder']) for (const kv of ['key', 'value']) out[`present.${l}.${p}.${kv}`] = { data: new Float32Array(0), dims: [1, 6, 0, 64] };
          return out;
        },
      },
    };
  };
  const audio = new Float32Array(16000 * 10).fill(0.1);
  // The fake decoder scores forbidden tokens very high to prove they are suppressed, which makes the
  // confidence of what is chosen look terrible: the low-confidence guard is switched off here.
  const trusting = { minAvgLogProb: -Infinity };
  // 1) normal ending
  let r = await transcribe(mk((s) => [hello, world, model.eot][s]), audio, { language: 'es', ...trusting });
  assert.equal(r.text, 'hello world');
  assert.equal(r.guard, null);
  assert.deepEqual(seen[0], [50258, 50262, 50359, 50363]);
  assert.deepEqual(seen[1], [hello]);
  // 2) endless repetition of one token
  r = await transcribe(mk(() => hello), audio, { language: 'en', ...trusting });
  assert.equal(r.guard, 'repetition');
  assert.equal(r.text, 'hello');
  // 3) endless repetition of a two-token phrase
  r = await transcribe(mk((s) => (s % 2 ? world : hello)), audio, { language: 'en', ...trusting });
  assert.equal(r.guard, 'repetition');
  assert.equal(r.text, 'hello world');
  // 4) never-ending non-repeating output is cut by the length budget (1 s of audio -> 28 tokens)
  r = await transcribe(mk((s) => 1000 + s), new Float32Array(16000).fill(0.1), { language: 'en', ...trusting });
  assert.equal(r.guard, 'max-length');
  assert.equal(r.tokens.length, 28);
  // 5) digital silence never reaches the model
  r = await transcribe(mk(() => hello), new Float32Array(16000), { language: 'en' });
  assert.equal(r.text, '');
  assert.equal(r.guard, 'silence-rms');
  await assert.rejects(transcribe(mk(() => hello), audio, { language: 'xx' }));
});
