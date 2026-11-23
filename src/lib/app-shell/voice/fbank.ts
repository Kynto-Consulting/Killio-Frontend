/**
 * Kaldi-compatible log-mel filterbank ("fbank") features, dependency-free.
 *
 * Defaults reproduce the recipe WeSpeaker uses for its pretrained models
 * (wespeaker/bin/infer_onnx.py, `compute_fbank`):
 *
 *   waveform = waveform * (1 << 15)
 *   kaldi.fbank(waveform, num_mel_bins=80, frame_length=25, frame_shift=10,
 *               dither=0.0, sample_frequency=16000, window_type='hamming',
 *               use_energy=False)
 *   mat = mat - mean(mat, dim=0)        # CMN, no variance normalisation
 *
 * The remaining knobs are the torchaudio.compliance.kaldi.fbank defaults:
 * pre-emphasis 0.97, remove_dc_offset, snip_edges, FFT size rounded up to a
 * power of two (512), power spectrum, low_freq 20 Hz, high_freq = Nyquist,
 * natural log floored at float32 epsilon.
 */

export type WindowType = 'hamming' | 'povey' | 'hanning';

export interface FbankOptions {
  sampleRate: number;
  numMelBins: number;
  frameLengthMs: number;
  frameShiftMs: number;
  preemphasis: number;
  removeDcOffset: boolean;
  window: WindowType;
  lowFreq: number;
  /** <= 0 means "Nyquist + highFreq" (Kaldi convention); 0 = Nyquist. */
  highFreq: number;
  /** Multiplier applied to the samples first. 32768 for models trained on int16-range audio. */
  waveformScale: number;
  /** Subtract the per-utterance mean of every mel bin (CMN). */
  subtractMean: boolean;
}

export const WESPEAKER_FBANK: FbankOptions = {
  sampleRate: 16000,
  numMelBins: 80,
  frameLengthMs: 25,
  frameShiftMs: 10,
  preemphasis: 0.97,
  removeDcOffset: true,
  window: 'hamming',
  lowFreq: 20,
  highFreq: 0,
  waveformScale: 32768,
  subtractMean: true,
};

export interface FbankResult {
  /** Row-major [numFrames, numMelBins]. */
  data: Float32Array;
  numFrames: number;
  numMelBins: number;
}

const FLOAT32_EPSILON = 1.1920928955078125e-7;

function melScale(hz: number): number {
  return 1127 * Math.log(1 + hz / 700);
}

function makeWindow(type: WindowType, n: number): Float64Array {
  const w = new Float64Array(n);
  const a = (2 * Math.PI) / (n - 1);
  for (let i = 0; i < n; i++) {
    if (type === 'hamming') w[i] = 0.54 - 0.46 * Math.cos(a * i);
    else if (type === 'hanning') w[i] = 0.5 - 0.5 * Math.cos(a * i);
    else w[i] = Math.pow(0.5 - 0.5 * Math.cos(a * i), 0.85);
  }
  return w;
}

interface MelBank {
  /** For each mel bin: first FFT bin with non-zero weight and the weights from there. */
  offsets: Int32Array;
  weights: Float64Array[];
}

function makeMelBank(numBins: number, fftSize: number, sampleRate: number, lowFreq: number, highFreq: number): MelBank {
  const nyquist = sampleRate / 2;
  const high = highFreq > 0 ? highFreq : nyquist + highFreq;
  if (lowFreq < 0 || lowFreq >= high || high > nyquist) {
    throw new Error(`fbank: bad frequency range ${lowFreq}..${high}`);
  }
  const numFftBins = fftSize / 2; // Kaldi ignores the Nyquist bin
  const fftBinWidth = sampleRate / fftSize;
  const melLow = melScale(lowFreq);
  const melHigh = melScale(high);
  const melDelta = (melHigh - melLow) / (numBins + 1);
  const offsets = new Int32Array(numBins);
  const weights: Float64Array[] = [];
  for (let b = 0; b < numBins; b++) {
    const left = melLow + b * melDelta;
    const center = left + melDelta;
    const right = center + melDelta;
    let first = -1;
    const w: number[] = [];
    for (let i = 0; i < numFftBins; i++) {
      const mel = melScale(fftBinWidth * i);
      if (mel > left && mel < right) {
        if (first < 0) first = i;
        w.push(mel <= center ? (mel - left) / (center - left) : (right - mel) / (right - center));
      }
    }
    offsets[b] = first < 0 ? 0 : first;
    weights.push(Float64Array.from(w));
  }
  return { offsets, weights };
}

/** In-place iterative radix-2 FFT. `re`/`im` length must be a power of two. */
function fft(re: Float64Array, im: Float64Array, cosT: Float64Array, sinT: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const c = cosT[k * step];
        const s = sinT[k * step];
        const a = start + k;
        const b = a + half;
        const xr = re[b] * c + im[b] * s;
        const xi = im[b] * c - re[b] * s;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

interface Plan {
  key: string;
  frameLength: number;
  frameShift: number;
  fftSize: number;
  window: Float64Array;
  mel: MelBank;
  cosT: Float64Array;
  sinT: Float64Array;
}

let cachedPlan: Plan | null = null;

function getPlan(o: FbankOptions): Plan {
  const key = [o.sampleRate, o.numMelBins, o.frameLengthMs, o.frameShiftMs, o.window, o.lowFreq, o.highFreq].join('|');
  if (cachedPlan && cachedPlan.key === key) return cachedPlan;
  const frameLength = Math.round((o.sampleRate * o.frameLengthMs) / 1000);
  const frameShift = Math.round((o.sampleRate * o.frameShiftMs) / 1000);
  let fftSize = 1;
  while (fftSize < frameLength) fftSize <<= 1;
  const cosT = new Float64Array(fftSize / 2);
  const sinT = new Float64Array(fftSize / 2);
  for (let i = 0; i < fftSize / 2; i++) {
    cosT[i] = Math.cos((2 * Math.PI * i) / fftSize);
    sinT[i] = Math.sin((2 * Math.PI * i) / fftSize);
  }
  cachedPlan = {
    key, frameLength, frameShift, fftSize,
    window: makeWindow(o.window, frameLength),
    mel: makeMelBank(o.numMelBins, fftSize, o.sampleRate, o.lowFreq, o.highFreq),
    cosT, sinT,
  };
  return cachedPlan;
}

/** Number of frames Kaldi produces with snip_edges=true. */
export function numFramesFor(numSamples: number, options: Partial<FbankOptions> = {}): number {
  const o = { ...WESPEAKER_FBANK, ...options };
  const frameLength = Math.round((o.sampleRate * o.frameLengthMs) / 1000);
  const frameShift = Math.round((o.sampleRate * o.frameShiftMs) / 1000);
  return numSamples < frameLength ? 0 : 1 + Math.floor((numSamples - frameLength) / frameShift);
}

/**
 * Compute log-mel filterbank features for mono samples in [-1, 1].
 * Returns zero frames when the input is shorter than one frame.
 */
export function computeFbank(samples: Float32Array, options: Partial<FbankOptions> = {}): FbankResult {
  const o: FbankOptions = { ...WESPEAKER_FBANK, ...options };
  const plan = getPlan(o);
  const { frameLength, frameShift, fftSize, window, mel } = plan;
  const numBins = o.numMelBins;
  const numFrames = samples.length < frameLength ? 0 : 1 + Math.floor((samples.length - frameLength) / frameShift);
  const out = new Float32Array(numFrames * numBins);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const power = new Float64Array(fftSize / 2);

  for (let f = 0; f < numFrames; f++) {
    const start = f * frameShift;
    let mean = 0;
    for (let i = 0; i < frameLength; i++) {
      const v = samples[start + i] * o.waveformScale;
      re[i] = v;
      mean += v;
    }
    if (o.removeDcOffset) {
      mean /= frameLength;
      for (let i = 0; i < frameLength; i++) re[i] -= mean;
    }
    if (o.preemphasis !== 0) {
      for (let i = frameLength - 1; i > 0; i--) re[i] -= o.preemphasis * re[i - 1];
      re[0] -= o.preemphasis * re[0];
    }
    for (let i = 0; i < frameLength; i++) re[i] *= window[i];
    for (let i = frameLength; i < fftSize; i++) re[i] = 0;
    im.fill(0);
    fft(re, im, plan.cosT, plan.sinT);
    for (let i = 0; i < fftSize / 2; i++) power[i] = re[i] * re[i] + im[i] * im[i];

    const row = f * numBins;
    for (let b = 0; b < numBins; b++) {
      const w = mel.weights[b];
      const off = mel.offsets[b];
      let e = 0;
      for (let i = 0; i < w.length; i++) e += w[i] * power[off + i];
      out[row + b] = Math.log(e > FLOAT32_EPSILON ? e : FLOAT32_EPSILON);
    }
  }

  if (o.subtractMean && numFrames > 0) {
    for (let b = 0; b < numBins; b++) {
      let m = 0;
      for (let f = 0; f < numFrames; f++) m += out[f * numBins + b];
      m /= numFrames;
      for (let f = 0; f < numFrames; f++) out[f * numBins + b] -= m;
    }
  }
  return { data: out, numFrames, numMelBins: numBins };
}

/** Centre frequency (Hz) of each mel bin, for diagnostics and tests. */
export function melBinCenters(options: Partial<FbankOptions> = {}): Float64Array {
  const o = { ...WESPEAKER_FBANK, ...options };
  const high = o.highFreq > 0 ? o.highFreq : o.sampleRate / 2 + o.highFreq;
  const melLow = melScale(o.lowFreq);
  const delta = (melScale(high) - melLow) / (o.numMelBins + 1);
  const out = new Float64Array(o.numMelBins);
  for (let b = 0; b < o.numMelBins; b++) out[b] = 700 * (Math.exp((melLow + (b + 1) * delta) / 1127) - 1);
  return out;
}
