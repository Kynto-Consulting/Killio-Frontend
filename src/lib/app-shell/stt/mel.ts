// Whisper audio front end: 80-bin log-mel spectrogram of a 30 s window, as in openai/whisper `whisper/audio.py`
// (log_mel_spectrogram): 16 kHz mono, periodic Hann window of 400 samples, hop 160, centred STFT with reflect
// padding, power spectrum, last frame dropped, slaney mel filterbank (librosa.filters.mel(sr=16000, n_fft=400,
// n_mels=80)), log10 clamped at 1e-10, floor at (max - 8), then (x + 4) / 4.
// The filterbank is computed here; test/mel.test.ts checks it against the reference mel_filters.npz.
// Dependency-free; runs in a browser, a worker or Node.

export const SAMPLE_RATE = 16000;
export const N_FFT = 400;
export const HOP_LENGTH = 160;
export const N_MELS = 80;
export const N_SAMPLES = 480000; // 30 s
export const N_FRAMES = 3000;
const N_BINS = N_FFT / 2 + 1; // 201

// ---- mixed-radix complex FFT of size 400 = 2*2*2*2*5*5 (kissfft-style decimation in time) ----
const FACTORS = [5, 5, 2, 2, 2, 2];
const TW_RE = new Float64Array(N_FFT);
const TW_IM = new Float64Array(N_FFT);
for (let i = 0; i < N_FFT; i++) {
  TW_RE[i] = Math.cos((-2 * Math.PI * i) / N_FFT);
  TW_IM[i] = Math.sin((-2 * Math.PI * i) / N_FFT);
}
const scratchRe = new Float64Array(5);
const scratchIm = new Float64Array(5);

function fftWork(inp: Float64Array, outRe: Float64Array, outIm: Float64Array, outOff: number, inOff: number, stride: number, fi: number, n: number): void {
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
  // generic radix-p butterfly: X[u + q1*m] = sum_q out[u + q*m] * w^(stride * q * (u + q1*m))
  for (let u = 0; u < m; u++) {
    for (let q = 0; q < p; q++) {
      scratchRe[q] = outRe[outOff + u + q * m];
      scratchIm[q] = outIm[outOff + u + q * m];
    }
    for (let q1 = 0; q1 < p; q1++) {
      const k = u + q1 * m;
      let accRe = scratchRe[0], accIm = scratchIm[0];
      let tw = 0;
      const step = (stride * k) % N_FFT;
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

/** DFT of a real frame of exactly 400 samples. Writes all 400 bins into outRe / outIm. */
export function fft400(frame: Float64Array, outRe: Float64Array, outIm: Float64Array): void {
  fftWork(frame, outRe, outIm, 0, 0, 1, 0, N_FFT);
}

// ---- slaney mel filterbank (librosa defaults: htk=False, norm='slaney', fmin=0, fmax=sr/2) ----
function hzToMel(f: number): number {
  const fSp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fSp, logStep = Math.log(6.4) / 27;
  return f >= minLogHz ? minLogMel + Math.log(f / minLogHz) / logStep : f / fSp;
}
function melToHz(m: number): number {
  const fSp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fSp, logStep = Math.log(6.4) / 27;
  return m >= minLogMel ? minLogHz * Math.exp(logStep * (m - minLogMel)) : fSp * m;
}

/** Row-major [nMels][201] filterbank, identical (to float32 precision) to Whisper's mel_filters.npz `mel_80`. */
export function melFilterbank(nMels: number = N_MELS): Float32Array {
  const fb = new Float32Array(nMels * N_BINS);
  const melMax = hzToMel(SAMPLE_RATE / 2);
  const pts = new Float64Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) pts[i] = melToHz((melMax * i) / (nMels + 1));
  for (let i = 0; i < nMels; i++) {
    const lo = pts[i], mid = pts[i + 1], hi = pts[i + 2];
    const enorm = 2 / (hi - lo);
    for (let k = 0; k < N_BINS; k++) {
      const f = (k * SAMPLE_RATE) / N_FFT;
      const w = Math.min((f - lo) / (mid - lo), (hi - f) / (hi - mid));
      if (w > 0) fb[i * N_BINS + k] = w * enorm;
    }
  }
  return fb;
}

let cachedFb: { fb: Float32Array; start: Int32Array; end: Int32Array } | null = null;
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

const WINDOW = new Float64Array(N_FFT);
for (let i = 0; i < N_FFT; i++) WINDOW[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT); // torch.hann_window (periodic)

/**
 * Log-mel features for one 30 s Whisper window. `samples` is mono 16 kHz in [-1, 1]; it is zero-padded
 * (or truncated) to 480000 samples. Returns a Float32Array of 80 * 3000 values laid out [mel][frame],
 * i.e. the tensor `input_features` with dims [1, 80, 3000].
 */
export function logMelSpectrogram(samples: Float32Array): Float32Array {
  const n = Math.min(samples.length, N_SAMPLES);
  const { fb, start, end } = filters();
  const out = new Float32Array(N_MELS * N_FRAMES);
  const frame = new Float64Array(N_FFT), re = new Float64Array(N_FFT), im = new Float64Array(N_FFT);
  const power = new Float64Array(N_BINS);
  const half = N_FFT / 2;
  // Frames whose whole window lies in the zero padding have zero power: log10(clamp(0, 1e-10)) = -10 exactly.
  const lastUseful = Math.min(N_FRAMES, Math.ceil((n + half) / HOP_LENGTH));
  let max = -Infinity;
  for (let t = 0; t < lastUseful; t++) {
    const c = t * HOP_LENGTH - half;
    for (let i = 0; i < N_FFT; i++) {
      let idx = c + i;
      if (idx < 0) idx = -idx; // reflect padding at the start (torch.stft center=True, pad_mode='reflect')
      else if (idx >= N_SAMPLES) idx = 2 * (N_SAMPLES - 1) - idx; // and at the end of the padded 30 s signal
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
