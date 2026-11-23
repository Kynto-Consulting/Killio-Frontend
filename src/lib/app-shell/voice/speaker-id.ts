/**
 * Who is speaking, worked out on the device.
 *
 * Each phrase of active listening is turned into a voice print (a list of 256 numbers) by a small
 * model that runs in the page, in a worker. Voice prints that resemble each other are the same
 * person: the first time a voice is heard it becomes "Person 1", the next new one "Person 2", and
 * the person using the app can give them names. Only the resulting label travels with the phrase.
 *
 * The audio and the voice prints never leave the device: the prints live in this browser profile's
 * storage and are what `clear()` deletes. Voice prints identify people, so this is off until the
 * person turns it on.
 *
 * Limits, from the measurements the thresholds come from (clean read speech, 14 speakers): phrases
 * under 2 seconds are not labelled, a new person needs a phrase of 3 seconds, and two voices that
 * sound alike can be taken for one. A phrase where two people speak gets one label.
 */
import { computeFbank } from "./fbank.ts";
import { l2Normalize, MIN_SAMPLES, SAMPLE_RATE } from "./speaker-embedding.ts";
import { SpeakerBook, type SpeakerBookJSON } from "./speaker-book.ts";

const ENABLED_KEY = "killio_speaker_id";
const BOOK_KEY = "killio_speaker_book";
const WORKER_URL = "/voice/speaker-worker.mjs";
/** The first phrase also waits for the model (about 40 MB with its runtime) to download. */
const FIRST_TIMEOUT_MS = 180_000;
const TIMEOUT_MS = 30_000;
const MAX_SECONDS = 30;

export interface KnownSpeaker {
  speakerId: string;
  /** The name the person gave, or null for a voice not named yet. */
  name: string | null;
  /** 1, 2, 3… for voices not named yet. */
  number: number | null;
  phrases: number;
}

export interface SpeakerLabel {
  speakerId: string;
  /** The given name, or null when the voice has none yet (see `number`). */
  name: string | null;
  number: number | null;
}

function describe(entry: { speakerId: string; label: string; named: boolean }): SpeakerLabel {
  const anonymous = /^anon-(\d+)$/.exec(entry.speakerId);
  return { speakerId: entry.speakerId, name: entry.named ? entry.label : null, number: anonymous ? Number(anonymous[1]) : null };
}

class SpeakerId {
  private worker: Worker | null = null;
  private readonly pending = new Map<number, { resolve: (e: Float32Array) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private warm = false;
  private book: SpeakerBook | null = null;
  private readonly listeners = new Set<() => void>();
  /** Why the last phrase could not be identified, if it could not. */
  lastError: string | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private changed(): void {
    this.listeners.forEach((listener) => listener());
  }

  get enabled(): boolean {
    try { return localStorage.getItem(ENABLED_KEY) === "1"; } catch { return false; }
  }

  setEnabled(on: boolean): void {
    try {
      if (on) localStorage.setItem(ENABLED_KEY, "1");
      else localStorage.removeItem(ENABLED_KEY);
    } catch { /* stays off */ }
    if (!on) this.release();
    this.changed();
  }

  private load(): SpeakerBook {
    if (this.book) return this.book;
    try {
      const saved = localStorage.getItem(BOOK_KEY);
      if (saved) this.book = SpeakerBook.fromJSON(JSON.parse(saved) as SpeakerBookJSON);
    } catch { /* unreadable: start over */ }
    return (this.book ??= new SpeakerBook());
  }

  private save(): void {
    try { if (this.book) localStorage.setItem(BOOK_KEY, JSON.stringify(this.book.toJSON())); } catch { /* kept in memory only */ }
    this.changed();
  }

  private release(): void {
    this.worker?.terminate();
    this.worker = null;
    this.warm = false;
    this.pending.forEach((p) => p.reject(new Error("stopped")));
    this.pending.clear();
  }

  private embed(samples: Float32Array): Promise<Float32Array> {
    if (!this.worker) {
      const worker = new Worker(WORKER_URL, { type: "module" });
      worker.onmessage = (event: MessageEvent<{ id: number; embedding?: Float32Array; error?: string }>) => {
        const waiting = this.pending.get(event.data.id);
        if (!waiting) return;
        this.pending.delete(event.data.id);
        if (event.data.embedding) { this.warm = true; waiting.resolve(event.data.embedding); }
        else waiting.reject(new Error(event.data.error || "The voice model failed."));
      };
      worker.onerror = (event) => {
        const error = new Error(event.message || "The voice model could not start.");
        this.pending.forEach((p) => p.reject(error));
        this.pending.clear();
        this.worker = null;
        this.warm = false;
      };
      this.worker = worker;
    }
    const feats = computeFbank(samples);
    if (feats.numFrames === 0) return Promise.reject(new Error("too short"));
    const id = this.nextId++;
    return new Promise<Float32Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error("The voice model took too long."));
      }, this.warm ? TIMEOUT_MS : FIRST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (e) => { clearTimeout(timer); resolve(e); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.worker!.postMessage({ id, feats: feats.data, frames: feats.numFrames, bins: feats.numMelBins }, [feats.data.buffer]);
    });
  }

  /**
   * Who said this phrase (mono, 16 kHz), or null when it is off, the phrase is too short to tell, or
   * the model could not run. Never throws: a phrase without a label is still a phrase.
   */
  async identify(samples: Float32Array): Promise<SpeakerLabel | null> {
    if (!this.enabled || typeof Worker === "undefined" || samples.length < MIN_SAMPLES) return null;
    try {
      let pcm = samples;
      const max = MAX_SECONDS * SAMPLE_RATE;
      if (pcm.length > max) {
        const start = (pcm.length - max) >> 1;
        pcm = pcm.subarray(start, start + max);
      }
      // A copy: the caller still needs its samples after the features' buffer is handed to the worker.
      const embedding = l2Normalize(await this.embed(new Float32Array(pcm)));
      const book = this.load();
      const assigned = book.assign(embedding, samples.length / SAMPLE_RATE);
      this.lastError = null;
      if (!assigned) return null;
      this.save();
      return describe({ speakerId: assigned.speakerId, label: assigned.label, named: assigned.speakerId.startsWith("named:") });
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.changed();
      return null;
    }
  }

  list(): KnownSpeaker[] {
    return this.load().list().map((s) => ({ ...describe(s), phrases: s.phrases }));
  }

  /** Gives a voice a name. Throws when another voice already has it. */
  rename(speakerId: string, name: string): void {
    const clean = name.replace(/[\u0000-\u001f\u007f\[\]:@*_`<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!clean) return;
    this.load().rename(speakerId, clean);
    this.save();
  }

  forget(speakerId: string): void {
    if (this.load().remove(speakerId)) this.save();
  }

  /** Deletes every voice print kept on this device. */
  clear(): void {
    this.book = new SpeakerBook();
    try { localStorage.removeItem(BOOK_KEY); } catch { /* nothing stored */ }
    this.changed();
  }
}

/** One per page: one microphone, one set of voices. */
export const speakerId = new SpeakerId();
