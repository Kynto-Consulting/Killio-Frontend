/**
 * Cuts a microphone stream into spoken phrases. Pure, no imports: audio frames go in, finished phrases
 * come out. Silence never leaves the device, and what is sent to be transcribed is only speech.
 *
 * Voice is told from silence by loudness against a noise floor that follows the room: a fan or street
 * noise raises the floor instead of counting as speech. A phrase starts when sound stays above the floor
 * for a moment, and ends after a pause or when it reaches the maximum length.
 */

export interface SegmenterOptions {
  sampleRate: number;
  /** Sound must stay above the floor this long to count as the start of speech. */
  startMs?: number;
  /** A pause this long ends the phrase. */
  endSilenceMs?: number;
  /** Audio kept from just before speech was detected, so the first syllable is not cut off. */
  preRollMs?: number;
  /** Shorter phrases are dropped: coughs, clicks, a door. */
  minSpeechMs?: number;
  /** Longer phrases are cut here and continue as a new one. */
  maxSegmentMs?: number;
  /** How many times louder than the room's noise counts as voice. */
  ratio?: number;
  /** Never treat anything quieter than this (RMS, 0..1) as voice, however quiet the room. */
  minLevel?: number;
}

export interface SpeechSegment {
  samples: Float32Array;
  /** Time the phrase started, as given to `push`. */
  startedAt: number;
  durationMs: number;
}

export function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

export class SpeechSegmenter {
  private readonly o: Required<SegmenterOptions>;
  private floor = 0.002;
  private preRoll: Float32Array[] = [];
  private preRollSamples = 0;
  private current: Float32Array[] = [];
  private currentSamples = 0;
  private speaking = false;
  private loudMs = 0;
  private quietMs = 0;
  private voicedMs = 0;
  private startedAt = 0;

  constructor(options: SegmenterOptions) {
    this.o = { startMs: 120, endSilenceMs: 900, preRollMs: 300, minSpeechMs: 350, maxSegmentMs: 30_000, ratio: 3, minLevel: 0.008, ...options };
  }

  /** True while a phrase is being collected. */
  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Feeds one frame captured at `now` (ms). Returns the phrase it completed, if any. */
  push(frame: Float32Array, now: number): SpeechSegment | null {
    const ms = (frame.length / this.o.sampleRate) * 1000;
    const level = rms(frame);
    const loud = level > Math.max(this.o.minLevel, this.floor * this.o.ratio);

    if (!this.speaking) {
      // The floor follows the room only while nobody is speaking: quickly down, slowly up.
      this.floor = level < this.floor ? level * 0.5 + this.floor * 0.5 : this.floor * 0.98 + level * 0.02;
      this.preRoll.push(frame);
      this.preRollSamples += frame.length;
      const keep = (this.o.preRollMs / 1000) * this.o.sampleRate;
      while (this.preRoll.length > 1 && this.preRollSamples - this.preRoll[0].length >= keep) this.preRollSamples -= this.preRoll.shift()!.length;
      this.loudMs = loud ? this.loudMs + ms : 0;
      if (this.loudMs >= this.o.startMs) {
        this.speaking = true;
        this.current = this.preRoll;
        this.currentSamples = this.preRollSamples;
        this.startedAt = now - (this.preRollSamples / this.o.sampleRate) * 1000;
        this.voicedMs = this.loudMs;
        this.preRoll = [];
        this.preRollSamples = 0;
        this.loudMs = 0;
        this.quietMs = 0;
      }
      return null;
    }

    this.current.push(frame);
    this.currentSamples += frame.length;
    if (loud) {
      this.voicedMs += ms;
      this.quietMs = 0;
    } else this.quietMs += ms;

    const length = (this.currentSamples / this.o.sampleRate) * 1000;
    if (this.quietMs >= this.o.endSilenceMs || length >= this.o.maxSegmentMs) return this.finish();
    return null;
  }

  /** Ends the phrase in progress (the person stopped listening). */
  flush(): SpeechSegment | null {
    return this.speaking ? this.finish() : null;
  }

  private finish(): SpeechSegment | null {
    const samples = new Float32Array(this.currentSamples);
    let offset = 0;
    for (const frame of this.current) {
      samples.set(frame, offset);
      offset += frame.length;
    }
    const voiced = this.voicedMs;
    const startedAt = this.startedAt;
    this.speaking = false;
    this.current = [];
    this.currentSamples = 0;
    this.quietMs = 0;
    this.voicedMs = 0;
    this.loudMs = 0;
    if (voiced < this.o.minSpeechMs) return null;
    return { samples, startedAt, durationMs: (samples.length / this.o.sampleRate) * 1000 };
  }
}

/** Averages groups of samples to go down to `to` Hz (speech recognition wants 16 kHz, microphones give 44.1 or 48). */
export function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/** 16-bit mono WAV, the plainest container a transcription service accepts. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}
