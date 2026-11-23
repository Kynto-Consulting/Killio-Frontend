// Runs the speaker-embedding model off the main thread (see src/lib/app-shell/voice/speaker-id.ts).
// In: { id, feats: Float32Array, frames, bins }   Out: { id, embedding: Float32Array } | { id, error }
// The model and the runtime are files of this same site; they are kept in the Cache API after the
// first use so identifying voices keeps working without a connection.
import * as ort from "./ort.wasm.min.mjs";

const here = new URL("./", import.meta.url).href;
ort.env.wasm.wasmPaths = here;
// One thread: more would need cross-origin isolation headers the site does not send.
ort.env.wasm.numThreads = 1;

const MODEL = here + "speaker.onnx";
const CACHE = "killio-voice-v1";

async function modelBytes() {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch { /* no Cache API here: download each time */ }
  const kept = cache ? await cache.match(MODEL) : undefined;
  if (kept) return new Uint8Array(await kept.arrayBuffer());
  const response = await fetch(MODEL);
  if (!response.ok) throw new Error("The voice model could not be downloaded (" + response.status + ").");
  if (cache) { try { await cache.put(MODEL, response.clone()); } catch { /* over quota: fine, download again next time */ } }
  return new Uint8Array(await response.arrayBuffer());
}

let session = null;
function ready() {
  if (!session) {
    session = modelBytes()
      .then((bytes) => ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] }))
      .catch((error) => { session = null; throw error; });
  }
  return session;
}

// One phrase at a time, in order: the runtime is single-threaded anyway.
let queue = Promise.resolve();
self.onmessage = (event) => {
  const { id, feats, frames, bins } = event.data;
  queue = queue.then(async () => {
    try {
      const model = await ready();
      const input = new ort.Tensor("float32", feats, [1, frames, bins]);
      const output = await model.run({ [model.inputNames[0]]: input });
      const embedding = Float32Array.from(output[model.outputNames[0]].data);
      self.postMessage({ id, embedding }, [embedding.buffer]);
    } catch (error) {
      self.postMessage({ id, error: error && error.message ? error.message : String(error) });
    }
  });
};
