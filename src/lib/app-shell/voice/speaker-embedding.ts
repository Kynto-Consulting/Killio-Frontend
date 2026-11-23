/**
 * Speaker embedding for one phrase. The ONNX session is injected, so the same
 * code runs with onnxruntime-node (tests) and onnxruntime-web (browser).
 *
 * Usage (browser):
 *   import * as ort from 'onnxruntime-web';
 *   const session = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
 *   const emb = await computeSpeakerEmbedding(
 *     { session, createTensor: (data, dims) => new ort.Tensor('float32', data, dims) }, samples);
 */
import { computeFbank, WESPEAKER_FBANK } from './fbank.ts';
import type { FbankOptions } from './fbank.ts';

export interface TensorLike {
  data: ArrayLike<number> | unknown;
  dims: readonly number[];
}

export interface InferenceSessionLike {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run(feeds: Record<string, any>): Promise<Record<string, TensorLike>>;
}

export interface EmbeddingRuntime {
  session: InferenceSessionLike;
  /** e.g. `(data, dims) => new ort.Tensor('float32', data, dims)` */
  createTensor: (data: Float32Array, dims: number[]) => unknown;
}

export interface EmbeddingOptions {
  fbank?: Partial<FbankOptions>;
  /** Input tensor name; defaults to the session's first input ("feats" for WeSpeaker). */
  inputName?: string;
  /** Output tensor name; defaults to the session's first output ("embs" for WeSpeaker). */
  outputName?: string;
  /** Phrases longer than this are centre-cropped before feature extraction. Default 30 s. */
  maxSeconds?: number;
}

export const SAMPLE_RATE = 16000;
/** Below this there are too few frames for the model to be meaningful at all. */
export const MIN_SAMPLES = 0.5 * SAMPLE_RATE;

export function l2Normalize(v: ArrayLike<number>): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s);
  const out = new Float32Array(v.length);
  if (n > 0) for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/**
 * Returns the L2-normalised speaker embedding of `samples` (mono, 16 kHz, range [-1, 1]),
 * or `null` when the phrase is shorter than 0.5 s or silent (all-zero embedding / NaN).
 */
export async function computeSpeakerEmbedding(
  runtime: EmbeddingRuntime,
  samples: Float32Array,
  options: EmbeddingOptions = {},
): Promise<Float32Array | null> {
  const sampleRate = options.fbank?.sampleRate ?? WESPEAKER_FBANK.sampleRate;
  const maxSamples = Math.round((options.maxSeconds ?? 30) * sampleRate);
  let pcm = samples;
  if (pcm.length > maxSamples) {
    const start = (pcm.length - maxSamples) >> 1;
    pcm = pcm.subarray(start, start + maxSamples);
  }
  if (pcm.length < MIN_SAMPLES) return null;

  const feats = computeFbank(pcm, options.fbank);
  if (feats.numFrames === 0) return null;

  const { session, createTensor } = runtime;
  const inputName = options.inputName ?? session.inputNames[0];
  const outputName = options.outputName ?? session.outputNames[0];
  const input = createTensor(feats.data, [1, feats.numFrames, feats.numMelBins]);
  const result = await session.run({ [inputName]: input });
  const out = result[outputName];
  if (!out) throw new Error(`speaker-embedding: output "${outputName}" missing`);
  const emb = l2Normalize(out.data as ArrayLike<number>);
  let energy = 0;
  for (let i = 0; i < emb.length; i++) energy += emb[i] * emb[i];
  if (!(energy > 0.5)) return null; // zero vector or NaN
  return emb;
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na * nb);
  return d > 0 ? dot / d : 0;
}
