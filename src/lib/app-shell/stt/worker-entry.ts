// Source of public/stt/stt-worker.mjs. The worker is a plain file of the site, not part of the Next.js
// bundle, so it is built by hand and committed:
//   npx esbuild src/lib/app-shell/stt/worker-entry.ts --bundle --format=esm --target=es2020 --outfile=public/stt/stt-worker.mjs
// Rebuild after changing this file, mel.ts, tokenizer.ts or whisper.ts.
//
// Transcribes phrases on the device, off the main thread: the Whisper model and its vocabulary are files of this same site, kept in the Cache
// API after the first use so transcription keeps working without a connection.
//
// In:  { id, samples: Float32Array (16 kHz mono), language: "es" | "en" | … }
// Out: { id, text } | { id, error }
import { createWhisperModel, transcribe } from "./whisper.ts";
import type { WhisperRuntime } from "./whisper.ts";

// The same ONNX runtime the voice-print model uses (public/voice): one copy for both.
const ORT_URL = new URL("../voice/ort.wasm.min.mjs", import.meta.url).href;
const MODEL_BASE = new URL("./", import.meta.url).href;
const ENCODER = "encoder_model.onnx";
const DECODER = "decoder_model_merged_quantized.onnx";
const CACHE = "killio-stt-v1";

async function kept(file: string): Promise<Response> {
  const url = MODEL_BASE + file;
  let cache: Cache | null = null;
  try { cache = await caches.open(CACHE); } catch { /* no Cache API here: download each time */ }
  const hit = cache ? await cache.match(url) : undefined;
  if (hit) return hit;
  const fresh = await fetch(url);
  if (!fresh.ok) throw new Error(`The transcription model could not be downloaded (${fresh.status}).`);
  if (cache) { try { await cache.put(url, fresh.clone()); } catch { /* over quota: download again next time */ } }
  return fresh;
}

let runtime: Promise<WhisperRuntime> | null = null;
function load(): Promise<WhisperRuntime> {
  runtime ??= (async () => {
    const ort = await import(/* webpackIgnore: true */ ORT_URL);
    // One thread: more would need cross-origin isolation headers the site does not send.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = new URL("./", ORT_URL).href;
    const json = async (file: string) => (await kept(file)).json();
    const bytes = async (file: string) => new Uint8Array(await (await kept(file)).arrayBuffer());
    const model = createWhisperModel({
      vocab: await json("vocab.json"),
      addedTokens: await json("added_tokens.json"),
      config: await json("config.json"),
      generationConfig: await json("generation_config.json"),
    });
    const encoder = await ort.InferenceSession.create(await bytes(ENCODER), { executionProviders: ["wasm"] });
    const decoder = await ort.InferenceSession.create(await bytes(DECODER), { executionProviders: ["wasm"] });
    return { encoder, decoder, model, createTensor: (type, data, dims) => new ort.Tensor(type, data, dims) } as WhisperRuntime;
  })().catch((error) => { runtime = null; throw error; });
  return runtime;
}

// One phrase at a time, in order: a single thread cannot run two anyway.
let queue: Promise<unknown> = Promise.resolve();
self.onmessage = (event: MessageEvent<{ id: number; samples: Float32Array; language: string }>) => {
  const { id, samples, language } = event.data;
  queue = queue.then(async () => {
    try {
      const rt = await load();
      // A language the model does not know falls back to Spanish, the app's first language.
      const known = rt.model.languages[language] !== undefined ? language : "es";
      const result = await transcribe(rt, samples, { language: known });
      self.postMessage({ id, text: result.text });
    } catch (error) {
      self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
  });
};
