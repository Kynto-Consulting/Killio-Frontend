// On-device Whisper transcription (greedy, no timestamps) over ONNX models exported for transformers.js
// (onnx-community/whisper-{tiny,base}: encoder_model*.onnx + decoder_model_merged*.onnx).
// The inference sessions are INJECTED: the same code runs with onnxruntime-node and onnxruntime-web.
// Dependency-free, no Node-only APIs.

import { logMelSpectrogram, N_FRAMES, N_MELS, N_SAMPLES, SAMPLE_RATE } from './mel.ts';
import { createTokenizer } from './tokenizer.ts';
import type { WhisperTokenizer } from './tokenizer.ts';

export interface TensorLike {
  readonly data: unknown;
  readonly dims: readonly number[];
}
export interface SessionLike {
  run(feeds: Record<string, TensorLike>): Promise<Record<string, TensorLike>>;
}
export type TensorData = Float32Array | BigInt64Array | Uint8Array;

/** Static description of one Whisper checkpoint, built from the model repository's JSON files. */
export interface WhisperModel {
  tokenizer: WhisperTokenizer;
  numLayers: number;
  numHeads: number;
  headDim: number;
  sot: number;
  eot: number;
  transcribe: number;
  noTimestamps: number;
  noSpeech: number;
  /** language code ("es", "en", ...) -> token id */
  languages: Record<string, number>;
  /** suppressed at every step (as -inf logits) */
  suppress: number[];
  /** additionally suppressed at the first generated token */
  beginSuppress: number[];
  /** maximum decoder positions (448 for Whisper) */
  maxTargetPositions: number;
}

export interface WhisperRuntime {
  encoder: SessionLike;
  decoder: SessionLike;
  /** e.g. (type, data, dims) => new ort.Tensor(type, data, dims) */
  createTensor(type: 'float32' | 'int64' | 'bool', data: TensorData, dims: number[]): TensorLike;
  model: WhisperModel;
}

export interface TranscribeOptions {
  /** "es", "en", ... (must exist in the model's language table) */
  language: string;
  /** hard cap on generated tokens per 30 s window (default 224) */
  maxNewTokens?: number;
  /** windows with RMS below this are not sent to the model at all (default 1e-4, about -80 dBFS; 0 disables) */
  minRms?: number;
  /** drop the window when P(<|nospeech|>) is above this (default 0.6; a value > 1 disables) */
  noSpeechThreshold?: number;
  /** drop the window when the mean token log-probability is below this (default -1.5; -Infinity disables) */
  minAvgLogProb?: number;
}

export interface TranscribeResult {
  text: string;
  /** diagnostics for the (first) window */
  noSpeechProb: number;
  avgLogProb: number;
  tokens: number[];
  /** why text was emptied or cut: 'silence-rms' | 'no-speech' | 'low-logprob' | 'repetition' | 'max-length' | null */
  guard: string | null;
  timings: { melMs: number; encoderMs: number; decoderMs: number; steps: number };
}

/** Builds the model description from vocab.json, added_tokens.json, config.json and generation_config.json. */
export function createWhisperModel(files: {
  vocab: Record<string, number>;
  addedTokens: Record<string, number>;
  config: { decoder_layers: number; decoder_attention_heads: number; d_model: number; max_target_positions?: number };
  generationConfig: { suppress_tokens?: number[]; begin_suppress_tokens?: number[]; lang_to_id?: Record<string, number> };
}): WhisperModel {
  const tokenizer = createTokenizer(files.vocab, files.addedTokens);
  const need = (t: string): number => {
    const id = tokenizer.tokenToId(t);
    if (id === undefined) throw new Error(`token ${t} missing from vocabulary`);
    return id;
  };
  const languages: Record<string, number> = {};
  for (const [tok, id] of Object.entries(files.generationConfig.lang_to_id ?? {})) languages[tok.slice(2, -2)] = id;
  const eot = tokenizer.eot;
  const noTimestamps = need('<|notimestamps|>');
  // Every id above <|endoftext|> is a control token (start, languages, tasks, no-speech, timestamps): none may be emitted.
  const suppress = new Set<number>(files.generationConfig.suppress_tokens ?? []);
  for (let id = eot + 1; id < tokenizer.vocabSize; id++) suppress.add(id);
  suppress.delete(eot);
  return {
    tokenizer,
    numLayers: files.config.decoder_layers,
    numHeads: files.config.decoder_attention_heads,
    headDim: files.config.d_model / files.config.decoder_attention_heads,
    sot: need('<|startoftranscript|>'),
    eot,
    transcribe: need('<|transcribe|>'),
    noTimestamps,
    noSpeech: tokenizer.tokenToId('<|nospeech|>') ?? need('<|nocaptions|>'),
    languages,
    suppress: [...suppress].sort((a, b) => a - b),
    beginSuppress: files.generationConfig.begin_suppress_tokens ?? [],
    maxTargetPositions: files.config.max_target_positions ?? 448,
  };
}

/** Length of a block repeated at the end of `tokens` often enough to be a hallucination loop, else 0. */
export function trailingLoop(tokens: number[]): number {
  const n = tokens.length;
  for (let len = 1; len <= 16; len++) {
    const repeats = len === 1 ? 6 : len === 2 ? 4 : 3;
    if (n < len * repeats) continue;
    let ok = true;
    for (let i = n - len * repeats; ok && i < n - len; i++) if (tokens[i] !== tokens[i + len]) ok = false;
    if (ok) return len;
  }
  return 0;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function logSumExp(x: Float32Array, off: number, n: number): number {
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (x[off + i] > max) max = x[off + i];
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.exp(x[off + i] - max);
  return max + Math.log(s);
}

async function transcribeWindow(rt: WhisperRuntime, samples: Float32Array, opts: TranscribeOptions): Promise<TranscribeResult> {
  const m = rt.model;
  const lang = m.languages[opts.language];
  if (lang === undefined) throw new Error(`language "${opts.language}" is not in the model's language table`);
  const timings = { melMs: 0, encoderMs: 0, decoderMs: 0, steps: 0 };
  const empty = (guard: string, noSpeechProb = 1, avgLogProb = 0, tokens: number[] = []): TranscribeResult => ({ text: '', noSpeechProb, avgLogProb, tokens, guard, timings });

  const minRms = opts.minRms ?? 1e-4;
  if (minRms > 0) {
    let e = 0;
    for (let i = 0; i < samples.length; i++) e += samples[i] * samples[i];
    if (samples.length === 0 || Math.sqrt(e / samples.length) < minRms) return empty('silence-rms');
  }

  let t = now();
  const mel = logMelSpectrogram(samples);
  timings.melMs = now() - t;

  t = now();
  const encOut = await rt.encoder.run({ input_features: rt.createTensor('float32', mel, [1, N_MELS, N_FRAMES]) });
  const hidden = encOut.last_hidden_state;
  timings.encoderMs = now() - t;

  // Token budget: never more than the decoder can hold, and proportional to the audio length
  // (speech does not exceed ~12 tokens/s; a runaway decode on a short phrase is cut early).
  const seconds = Math.min(samples.length, N_SAMPLES) / SAMPLE_RATE;
  const prompt = [m.sot, lang, m.transcribe, m.noTimestamps];
  const budget = Math.min(opts.maxNewTokens ?? 224, m.maxTargetPositions - prompt.length - 1, Math.ceil(seconds * 12) + 16);

  t = now();
  const V = m.tokenizer.vocabSize;
  const emptyPast = () => rt.createTensor('float32', new Float32Array(0), [1, m.numHeads, 0, m.headDim]);
  let feeds: Record<string, TensorLike> = {
    input_ids: rt.createTensor('int64', BigInt64Array.from(prompt.map((x) => BigInt(x))), [1, prompt.length]),
    encoder_hidden_states: hidden,
    use_cache_branch: rt.createTensor('bool', new Uint8Array([0]), [1]),
  };
  for (let l = 0; l < m.numLayers; l++) {
    for (const part of ['decoder', 'encoder']) for (const kv of ['key', 'value']) feeds[`past_key_values.${l}.${part}.${kv}`] = emptyPast();
  }
  const useCache = rt.createTensor('bool', new Uint8Array([1]), [1]);
  const crossCache: Record<string, TensorLike> = {};
  const tokens: number[] = [];
  let sumLogProb = 0, noSpeechProb = 0, guard: string | null = null, finished = false;
  for (let step = 0; step < budget; step++) {
    const out = await rt.decoder.run(feeds);
    timings.steps++;
    const logits = out.logits.data as Float32Array;
    const positions = out.logits.dims[1];
    if (step === 0) {
      // P(<|nospeech|>) right after <|startoftranscript|>, as in whisper/decoding.py (probs_at_sot).
      noSpeechProb = Math.exp(logits[m.noSpeech] - logSumExp(logits, 0, V));
      for (let l = 0; l < m.numLayers; l++) for (const kv of ['key', 'value']) crossCache[`past_key_values.${l}.encoder.${kv}`] = out[`present.${l}.encoder.${kv}`];
    }
    const off = (positions - 1) * V;
    const lse = logSumExp(logits, off, V); // log-probability is taken before suppression, as in the reference
    for (const id of m.suppress) logits[off + id] = -Infinity;
    if (step === 0) for (const id of m.beginSuppress) logits[off + id] = -Infinity;
    let best = 0, bestV = -Infinity;
    for (let i = 0; i < V; i++) if (logits[off + i] > bestV) { bestV = logits[off + i]; best = i; }
    sumLogProb += bestV - lse;
    if (best === m.eot) { finished = true; break; }
    tokens.push(best);
    const loop = trailingLoop(tokens);
    if (loop > 0) {
      // keep one copy of the repeated block, drop the rest
      let end = tokens.length;
      while (end - 2 * loop >= 0 && tokens.slice(end - 2 * loop, end - loop).every((v, i) => v === tokens[end - loop + i])) end -= loop;
      tokens.length = end;
      guard = 'repetition';
      finished = true;
      break;
    }
    feeds = { input_ids: rt.createTensor('int64', BigInt64Array.from([BigInt(best)]), [1, 1]), encoder_hidden_states: hidden, use_cache_branch: useCache, ...crossCache };
    for (let l = 0; l < m.numLayers; l++) for (const kv of ['key', 'value']) feeds[`past_key_values.${l}.decoder.${kv}`] = out[`present.${l}.decoder.${kv}`];
  }
  if (!finished) guard = 'max-length';
  timings.decoderMs = now() - t;

  const avgLogProb = sumLogProb / (tokens.length + 1);
  // The reference (whisper/transcribe.py) drops a segment only when noSpeechProb > 0.6 AND avgLogProb < -1.0.
  // Measured here, that lets "Thank you." / "you" through on noise, so the two tests are applied independently.
  if (noSpeechProb > (opts.noSpeechThreshold ?? 0.6)) return empty('no-speech', noSpeechProb, avgLogProb, tokens);
  if (avgLogProb < (opts.minAvgLogProb ?? -1.5)) return empty('low-logprob', noSpeechProb, avgLogProb, tokens);
  return { text: m.tokenizer.decode(tokens).trim(), noSpeechProb, avgLogProb, tokens, guard, timings };
}

/**
 * Transcribes mono 16 kHz audio. Audio longer than 30 s is cut into consecutive 30 s windows whose texts
 * are joined with a space (no overlap handling: phrases are expected to be shorter than 30 s).
 */
export async function transcribe(runtime: WhisperRuntime, samples: Float32Array, options: TranscribeOptions): Promise<TranscribeResult> {
  if (samples.length <= N_SAMPLES) return transcribeWindow(runtime, samples, options);
  let first: TranscribeResult | null = null;
  const texts: string[] = [];
  for (let start = 0; start < samples.length; start += N_SAMPLES) {
    const r = await transcribeWindow(runtime, samples.subarray(start, Math.min(samples.length, start + N_SAMPLES)), options);
    if (r.text) texts.push(r.text);
    if (!first) first = r;
    else {
      first.timings.melMs += r.timings.melMs;
      first.timings.encoderMs += r.timings.encoderMs;
      first.timings.decoderMs += r.timings.decoderMs;
      first.timings.steps += r.timings.steps;
    }
  }
  return { ...first!, text: texts.join(' ') };
}
