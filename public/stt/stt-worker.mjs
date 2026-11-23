// Built from src/lib/app-shell/stt/worker-entry.ts with esbuild (see that file). Do not edit.

// src/lib/app-shell/stt/mel.ts
var SAMPLE_RATE = 16e3;
var N_FFT = 400;
var HOP_LENGTH = 160;
var N_MELS = 80;
var N_SAMPLES = 48e4;
var N_FRAMES = 3e3;
var N_BINS = N_FFT / 2 + 1;
var FACTORS = [5, 5, 2, 2, 2, 2];
var TW_RE = new Float64Array(N_FFT);
var TW_IM = new Float64Array(N_FFT);
for (let i = 0; i < N_FFT; i++) {
  TW_RE[i] = Math.cos(-2 * Math.PI * i / N_FFT);
  TW_IM[i] = Math.sin(-2 * Math.PI * i / N_FFT);
}
var scratchRe = new Float64Array(5);
var scratchIm = new Float64Array(5);
function fftWork(inp, outRe, outIm, outOff, inOff, stride, fi, n) {
  const p = FACTORS[fi];
  const m = n / p;
  if (m === 1) {
    for (let k = 0; k < p; k++) {
      outRe[outOff + k] = inp[inOff + k * stride];
      outIm[outOff + k] = 0;
    }
  } else {
    for (let k = 0; k < p; k++) fftWork(inp, outRe, outIm, outOff + k * m, inOff + k * stride, stride * p, fi + 1, m);
  }
  for (let u = 0; u < m; u++) {
    for (let q = 0; q < p; q++) {
      scratchRe[q] = outRe[outOff + u + q * m];
      scratchIm[q] = outIm[outOff + u + q * m];
    }
    for (let q1 = 0; q1 < p; q1++) {
      const k = u + q1 * m;
      let accRe = scratchRe[0], accIm = scratchIm[0];
      let tw = 0;
      const step = stride * k % N_FFT;
      for (let q = 1; q < p; q++) {
        tw += step;
        if (tw >= N_FFT) tw -= N_FFT;
        accRe += scratchRe[q] * TW_RE[tw] - scratchIm[q] * TW_IM[tw];
        accIm += scratchRe[q] * TW_IM[tw] + scratchIm[q] * TW_RE[tw];
      }
      outRe[outOff + k] = accRe;
      outIm[outOff + k] = accIm;
    }
  }
}
function fft400(frame, outRe, outIm) {
  fftWork(frame, outRe, outIm, 0, 0, 1, 0, N_FFT);
}
function hzToMel(f) {
  const fSp = 200 / 3, minLogHz = 1e3, minLogMel = minLogHz / fSp, logStep = Math.log(6.4) / 27;
  return f >= minLogHz ? minLogMel + Math.log(f / minLogHz) / logStep : f / fSp;
}
function melToHz(m) {
  const fSp = 200 / 3, minLogHz = 1e3, minLogMel = minLogHz / fSp, logStep = Math.log(6.4) / 27;
  return m >= minLogMel ? minLogHz * Math.exp(logStep * (m - minLogMel)) : fSp * m;
}
function melFilterbank(nMels = N_MELS) {
  const fb = new Float32Array(nMels * N_BINS);
  const melMax = hzToMel(SAMPLE_RATE / 2);
  const pts = new Float64Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) pts[i] = melToHz(melMax * i / (nMels + 1));
  for (let i = 0; i < nMels; i++) {
    const lo = pts[i], mid = pts[i + 1], hi = pts[i + 2];
    const enorm = 2 / (hi - lo);
    for (let k = 0; k < N_BINS; k++) {
      const f = k * SAMPLE_RATE / N_FFT;
      const w = Math.min((f - lo) / (mid - lo), (hi - f) / (hi - mid));
      if (w > 0) fb[i * N_BINS + k] = w * enorm;
    }
  }
  return fb;
}
var cachedFb = null;
function filters() {
  if (!cachedFb) {
    const fb = melFilterbank(N_MELS);
    const start = new Int32Array(N_MELS), end = new Int32Array(N_MELS);
    for (let i = 0; i < N_MELS; i++) {
      let s = 0, e = N_BINS;
      while (s < N_BINS && fb[i * N_BINS + s] === 0) s++;
      while (e > s && fb[i * N_BINS + e - 1] === 0) e--;
      start[i] = s;
      end[i] = e;
    }
    cachedFb = { fb, start, end };
  }
  return cachedFb;
}
var WINDOW = new Float64Array(N_FFT);
for (let i = 0; i < N_FFT; i++) WINDOW[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N_FFT);
function logMelSpectrogram(samples) {
  const n = Math.min(samples.length, N_SAMPLES);
  const { fb, start, end } = filters();
  const out = new Float32Array(N_MELS * N_FRAMES);
  const frame = new Float64Array(N_FFT), re = new Float64Array(N_FFT), im = new Float64Array(N_FFT);
  const power = new Float64Array(N_BINS);
  const half = N_FFT / 2;
  const lastUseful = Math.min(N_FRAMES, Math.ceil((n + half) / HOP_LENGTH));
  let max = -Infinity;
  for (let t = 0; t < lastUseful; t++) {
    const c = t * HOP_LENGTH - half;
    for (let i = 0; i < N_FFT; i++) {
      let idx = c + i;
      if (idx < 0) idx = -idx;
      else if (idx >= N_SAMPLES) idx = 2 * (N_SAMPLES - 1) - idx;
      frame[i] = idx < n ? samples[idx] * WINDOW[i] : 0;
    }
    fft400(frame, re, im);
    for (let k = 0; k < N_BINS; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    for (let m = 0; m < N_MELS; m++) {
      let acc = 0;
      const row = m * N_BINS;
      for (let k = start[m]; k < end[m]; k++) acc += fb[row + k] * power[k];
      const v = Math.log10(Math.max(acc, 1e-10));
      out[m * N_FRAMES + t] = v;
      if (v > max) max = v;
    }
  }
  if (lastUseful < N_FRAMES) {
    if (-10 > max) max = -10;
    for (let m = 0; m < N_MELS; m++) out.fill(-10, m * N_FRAMES + lastUseful, (m + 1) * N_FRAMES);
  }
  const floor = max - 8;
  for (let i = 0; i < out.length; i++) out[i] = (Math.max(out[i], floor) + 4) / 4;
  return out;
}

// src/lib/app-shell/stt/tokenizer.ts
function buildByteDecoder() {
  const bs = [];
  for (let b = 33; b <= 126; b++) bs.push(b);
  for (let b = 161; b <= 172; b++) bs.push(b);
  for (let b = 174; b <= 255; b++) bs.push(b);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n++);
    }
  }
  const map = /* @__PURE__ */ new Map();
  for (let i = 0; i < bs.length; i++) map.set(String.fromCharCode(cs[i]), bs[i]);
  return map;
}
function createTokenizer(vocab, addedTokens = {}) {
  const byteDecoder = buildByteDecoder();
  const idToTok = [];
  const tokToId = /* @__PURE__ */ new Map();
  for (const [tok, id] of Object.entries(vocab)) {
    idToTok[id] = tok;
    tokToId.set(tok, id);
  }
  for (const [tok, id] of Object.entries(addedTokens)) {
    idToTok[id] = tok;
    tokToId.set(tok, id);
  }
  const eot = tokToId.get("<|endoftext|>");
  if (eot === void 0) throw new Error("vocabulary has no <|endoftext|> token");
  const utf8 = new TextDecoder("utf-8");
  return {
    vocabSize: idToTok.length,
    eot,
    tokenToId: (t) => tokToId.get(t),
    idToToken: (id) => idToTok[id],
    decode(ids) {
      const bytes = [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id >= eot) continue;
        const tok = idToTok[id];
        if (tok === void 0) continue;
        for (const ch of tok) {
          const b = byteDecoder.get(ch);
          if (b !== void 0) bytes.push(b);
        }
      }
      return utf8.decode(new Uint8Array(bytes));
    }
  };
}

// src/lib/app-shell/stt/whisper.ts
function createWhisperModel(files) {
  const tokenizer = createTokenizer(files.vocab, files.addedTokens);
  const need = (t) => {
    const id = tokenizer.tokenToId(t);
    if (id === void 0) throw new Error(`token ${t} missing from vocabulary`);
    return id;
  };
  const languages = {};
  for (const [tok, id] of Object.entries(files.generationConfig.lang_to_id ?? {})) languages[tok.slice(2, -2)] = id;
  const eot = tokenizer.eot;
  const noTimestamps = need("<|notimestamps|>");
  const suppress = new Set(files.generationConfig.suppress_tokens ?? []);
  for (let id = eot + 1; id < tokenizer.vocabSize; id++) suppress.add(id);
  suppress.delete(eot);
  return {
    tokenizer,
    numLayers: files.config.decoder_layers,
    numHeads: files.config.decoder_attention_heads,
    headDim: files.config.d_model / files.config.decoder_attention_heads,
    sot: need("<|startoftranscript|>"),
    eot,
    transcribe: need("<|transcribe|>"),
    noTimestamps,
    noSpeech: tokenizer.tokenToId("<|nospeech|>") ?? need("<|nocaptions|>"),
    languages,
    suppress: [...suppress].sort((a, b) => a - b),
    beginSuppress: files.generationConfig.begin_suppress_tokens ?? [],
    maxTargetPositions: files.config.max_target_positions ?? 448
  };
}
function trailingLoop(tokens) {
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
function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function logSumExp(x, off, n) {
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (x[off + i] > max) max = x[off + i];
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.exp(x[off + i] - max);
  return max + Math.log(s);
}
async function transcribeWindow(rt, samples, opts) {
  const m = rt.model;
  const lang = m.languages[opts.language];
  if (lang === void 0) throw new Error(`language "${opts.language}" is not in the model's language table`);
  const timings = { melMs: 0, encoderMs: 0, decoderMs: 0, steps: 0 };
  const empty = (guard2, noSpeechProb2 = 1, avgLogProb2 = 0, tokens2 = []) => ({ text: "", noSpeechProb: noSpeechProb2, avgLogProb: avgLogProb2, tokens: tokens2, guard: guard2, timings });
  const minRms = opts.minRms ?? 1e-4;
  if (minRms > 0) {
    let e = 0;
    for (let i = 0; i < samples.length; i++) e += samples[i] * samples[i];
    if (samples.length === 0 || Math.sqrt(e / samples.length) < minRms) return empty("silence-rms");
  }
  let t = now();
  const mel = logMelSpectrogram(samples);
  timings.melMs = now() - t;
  t = now();
  const encOut = await rt.encoder.run({ input_features: rt.createTensor("float32", mel, [1, N_MELS, N_FRAMES]) });
  const hidden = encOut.last_hidden_state;
  timings.encoderMs = now() - t;
  const seconds = Math.min(samples.length, N_SAMPLES) / SAMPLE_RATE;
  const prompt = [m.sot, lang, m.transcribe, m.noTimestamps];
  const budget = Math.min(opts.maxNewTokens ?? 224, m.maxTargetPositions - prompt.length - 1, Math.ceil(seconds * 12) + 16);
  t = now();
  const V = m.tokenizer.vocabSize;
  const emptyPast = () => rt.createTensor("float32", new Float32Array(0), [1, m.numHeads, 0, m.headDim]);
  let feeds = {
    input_ids: rt.createTensor("int64", BigInt64Array.from(prompt.map((x) => BigInt(x))), [1, prompt.length]),
    encoder_hidden_states: hidden,
    use_cache_branch: rt.createTensor("bool", new Uint8Array([0]), [1])
  };
  for (let l = 0; l < m.numLayers; l++) {
    for (const part of ["decoder", "encoder"]) for (const kv of ["key", "value"]) feeds[`past_key_values.${l}.${part}.${kv}`] = emptyPast();
  }
  const useCache = rt.createTensor("bool", new Uint8Array([1]), [1]);
  const crossCache = {};
  const tokens = [];
  let sumLogProb = 0, noSpeechProb = 0, guard = null, finished = false;
  for (let step = 0; step < budget; step++) {
    const out = await rt.decoder.run(feeds);
    timings.steps++;
    const logits = out.logits.data;
    const positions = out.logits.dims[1];
    if (step === 0) {
      noSpeechProb = Math.exp(logits[m.noSpeech] - logSumExp(logits, 0, V));
      for (let l = 0; l < m.numLayers; l++) for (const kv of ["key", "value"]) crossCache[`past_key_values.${l}.encoder.${kv}`] = out[`present.${l}.encoder.${kv}`];
    }
    const off = (positions - 1) * V;
    const lse = logSumExp(logits, off, V);
    for (const id of m.suppress) logits[off + id] = -Infinity;
    if (step === 0) for (const id of m.beginSuppress) logits[off + id] = -Infinity;
    let best = 0, bestV = -Infinity;
    for (let i = 0; i < V; i++) if (logits[off + i] > bestV) {
      bestV = logits[off + i];
      best = i;
    }
    sumLogProb += bestV - lse;
    if (best === m.eot) {
      finished = true;
      break;
    }
    tokens.push(best);
    const loop = trailingLoop(tokens);
    if (loop > 0) {
      let end = tokens.length;
      while (end - 2 * loop >= 0 && tokens.slice(end - 2 * loop, end - loop).every((v, i) => v === tokens[end - loop + i])) end -= loop;
      tokens.length = end;
      guard = "repetition";
      finished = true;
      break;
    }
    feeds = { input_ids: rt.createTensor("int64", BigInt64Array.from([BigInt(best)]), [1, 1]), encoder_hidden_states: hidden, use_cache_branch: useCache, ...crossCache };
    for (let l = 0; l < m.numLayers; l++) for (const kv of ["key", "value"]) feeds[`past_key_values.${l}.decoder.${kv}`] = out[`present.${l}.decoder.${kv}`];
  }
  if (!finished) guard = "max-length";
  timings.decoderMs = now() - t;
  const avgLogProb = sumLogProb / (tokens.length + 1);
  if (noSpeechProb > (opts.noSpeechThreshold ?? 0.6)) return empty("no-speech", noSpeechProb, avgLogProb, tokens);
  if (avgLogProb < (opts.minAvgLogProb ?? -1.5)) return empty("low-logprob", noSpeechProb, avgLogProb, tokens);
  return { text: m.tokenizer.decode(tokens).trim(), noSpeechProb, avgLogProb, tokens, guard, timings };
}
async function transcribe(runtime2, samples, options) {
  if (samples.length <= N_SAMPLES) return transcribeWindow(runtime2, samples, options);
  let first = null;
  const texts = [];
  for (let start = 0; start < samples.length; start += N_SAMPLES) {
    const r = await transcribeWindow(runtime2, samples.subarray(start, Math.min(samples.length, start + N_SAMPLES)), options);
    if (r.text) texts.push(r.text);
    if (!first) first = r;
    else {
      first.timings.melMs += r.timings.melMs;
      first.timings.encoderMs += r.timings.encoderMs;
      first.timings.decoderMs += r.timings.decoderMs;
      first.timings.steps += r.timings.steps;
    }
  }
  return { ...first, text: texts.join(" ") };
}

// src/lib/app-shell/stt/worker-entry.ts
var ORT_URL = new URL("../voice/ort.wasm.min.mjs", import.meta.url).href;
var MODEL_BASE = new URL("./", import.meta.url).href;
var ENCODER = "encoder_model.onnx";
var DECODER = "decoder_model_merged_quantized.onnx";
var CACHE = "killio-stt-v1";
async function kept(file) {
  const url = MODEL_BASE + file;
  let cache = null;
  try {
    cache = await caches.open(CACHE);
  } catch {
  }
  const hit = cache ? await cache.match(url) : void 0;
  if (hit) return hit;
  const fresh = await fetch(url);
  if (!fresh.ok) throw new Error(`The transcription model could not be downloaded (${fresh.status}).`);
  if (cache) {
    try {
      await cache.put(url, fresh.clone());
    } catch {
    }
  }
  return fresh;
}
var runtime = null;
function load() {
  runtime ?? (runtime = (async () => {
    const ort = await import(
      /* webpackIgnore: true */
      ORT_URL
    );
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = new URL("./", ORT_URL).href;
    const json = async (file) => (await kept(file)).json();
    const bytes = async (file) => new Uint8Array(await (await kept(file)).arrayBuffer());
    const model = createWhisperModel({
      vocab: await json("vocab.json"),
      addedTokens: await json("added_tokens.json"),
      config: await json("config.json"),
      generationConfig: await json("generation_config.json")
    });
    const encoder = await ort.InferenceSession.create(await bytes(ENCODER), { executionProviders: ["wasm"] });
    const decoder = await ort.InferenceSession.create(await bytes(DECODER), { executionProviders: ["wasm"] });
    return { encoder, decoder, model, createTensor: (type, data, dims) => new ort.Tensor(type, data, dims) };
  })().catch((error) => {
    runtime = null;
    throw error;
  }));
  return runtime;
}
var queue = Promise.resolve();
self.onmessage = (event) => {
  const { id, samples, language } = event.data;
  queue = queue.then(async () => {
    try {
      const rt = await load();
      const known = rt.model.languages[language] !== void 0 ? language : "es";
      const result = await transcribe(rt, samples, { language: known });
      self.postMessage({ id, text: result.text });
    } catch (error) {
      self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    }
  });
};
