/**
 * Online speaker assignment over phrase embeddings.
 *
 * Each speaker is a centroid (duration-weighted sum of L2-normalised embeddings).
 * `assign()` matches a phrase to the most similar centroid by cosine similarity,
 * or opens a new anonymous speaker when nothing is similar enough.
 *
 * Default numbers come from the measurements in scripts/measure.ts (see REPORT in the task
 * hand-off); they are tied to the WeSpeaker ResNet34-LM model and must be re-measured for any other.
 */

export interface SpeakerBookOptions {
  /** Cosine similarity at or above which a phrase joins an existing speaker. */
  threshold: number;
  /** Phrases shorter than this are not labelled at all (`assign` returns null). */
  minSeconds: number;
  /** Phrases shorter than this may join an existing speaker but never open a new one. */
  minSecondsForNewSpeaker: number;
  /** Maximum number of anonymous (un-named) speakers. */
  maxAnonymousSpeakers: number;
  /** Whether matched phrases also move the centroid of enrolled (named) speakers. */
  adaptEnrolled: boolean;
}

export const DEFAULT_SPEAKER_BOOK_OPTIONS: SpeakerBookOptions = {
  threshold: 0.5,
  minSeconds: 2,
  minSecondsForNewSpeaker: 3,
  maxAnonymousSpeakers: 12,
  adaptEnrolled: false,
};

export interface SpeakerAssignment {
  /** Stable id: "anon-<n>" or "named:<name>". */
  speakerId: string;
  /** Display label: "Speaker <n>" or the enrolled name. */
  label: string;
  isNew: boolean;
  /** Cosine similarity to the matched centroid before it was updated (1 for a new speaker). */
  similarity: number;
}

interface SpeakerEntry {
  id: string;
  label: string;
  named: boolean;
  /** Un-normalised weighted sum of embeddings. */
  sum: Float32Array;
  weight: number;
  count: number;
}

export interface SpeakerBookJSON {
  version: 1;
  dim: number;
  nextAnonymous: number;
  options: SpeakerBookOptions;
  speakers: Array<{ id: string; label: string; named: boolean; weight: number; count: number; sum: number[] }>;
}

function norm(v: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  const d = norm(a) * norm(b);
  return d > 0 ? dot / d : 0;
}

export class SpeakerBook {
  readonly options: SpeakerBookOptions;
  private speakers: SpeakerEntry[] = [];
  private nextAnonymous = 1;
  private dim = 0;

  constructor(options: Partial<SpeakerBookOptions> = {}) {
    this.options = { ...DEFAULT_SPEAKER_BOOK_OPTIONS, ...options };
  }

  private checkDim(embedding: ArrayLike<number>): void {
    if (embedding.length === 0) throw new Error('SpeakerBook: empty embedding');
    if (this.dim === 0) this.dim = embedding.length;
    else if (this.dim !== embedding.length) {
      throw new Error(`SpeakerBook: embedding dimension ${embedding.length} != ${this.dim}`);
    }
  }

  private addTo(entry: SpeakerEntry, embedding: ArrayLike<number>, weight: number): void {
    const n = norm(embedding);
    if (!(n > 0)) return;
    for (let i = 0; i < entry.sum.length; i++) entry.sum[i] += (embedding[i] / n) * weight;
    entry.weight += weight;
    entry.count += 1;
  }

  /** Most similar speaker without changing any state. */
  match(embedding: ArrayLike<number>): { speakerId: string; label: string; similarity: number } | null {
    let best: SpeakerEntry | null = null;
    let bestSim = -Infinity;
    for (const s of this.speakers) {
      const sim = cosine(embedding, s.sum);
      if (sim > bestSim) { bestSim = sim; best = s; }
    }
    return best ? { speakerId: best.id, label: best.label, similarity: bestSim } : null;
  }

  /**
   * Label one phrase. Returns null when the phrase cannot be trusted: shorter than `minSeconds`,
   * or unmatched while too short / over the anonymous cap to open a new speaker.
   */
  assign(embedding: ArrayLike<number>, durationSeconds: number): SpeakerAssignment | null {
    const o = this.options;
    if (!(durationSeconds >= o.minSeconds)) return null;
    this.checkDim(embedding);
    if (!(norm(embedding) > 0)) return null;

    const best = this.match(embedding);
    if (best && best.similarity >= o.threshold) {
      const entry = this.speakers.find((s) => s.id === best.speakerId)!;
      if (!entry.named || o.adaptEnrolled) this.addTo(entry, embedding, durationSeconds);
      return { speakerId: entry.id, label: entry.label, isNew: false, similarity: best.similarity };
    }

    if (durationSeconds < o.minSecondsForNewSpeaker) return null;
    if (this.anonymousCount() >= o.maxAnonymousSpeakers) return null;

    const n = this.nextAnonymous++;
    const entry: SpeakerEntry = {
      id: `anon-${n}`, label: `Speaker ${n}`, named: false,
      sum: new Float32Array(this.dim), weight: 0, count: 0,
    };
    this.addTo(entry, embedding, durationSeconds);
    this.speakers.push(entry);
    return { speakerId: entry.id, label: entry.label, isNew: true, similarity: 1 };
  }

  /** Create or replace a named speaker from one or more enrolment embeddings. */
  enroll(name: string, embeddings: ArrayLike<number>[]): string {
    if (!name) throw new Error('SpeakerBook: name required');
    if (embeddings.length === 0) throw new Error('SpeakerBook: at least one embedding required');
    for (const e of embeddings) this.checkDim(e);
    const id = `named:${name}`;
    this.speakers = this.speakers.filter((s) => s.id !== id);
    const entry: SpeakerEntry = { id, label: name, named: true, sum: new Float32Array(this.dim), weight: 0, count: 0 };
    for (const e of embeddings) this.addTo(entry, e, 1);
    this.speakers.push(entry);
    return id;
  }

  /** Turn an anonymous speaker into a named one, keeping its centroid. Returns the new id. */
  rename(speakerId: string, name: string): string {
    const entry = this.speakers.find((s) => s.id === speakerId);
    if (!entry) throw new Error(`SpeakerBook: unknown speaker ${speakerId}`);
    const id = `named:${name}`;
    if (this.speakers.some((s) => s.id === id && s !== entry)) throw new Error(`SpeakerBook: ${name} already exists`);
    entry.id = id;
    entry.label = name;
    entry.named = true;
    return id;
  }

  remove(speakerId: string): boolean {
    const before = this.speakers.length;
    this.speakers = this.speakers.filter((s) => s.id !== speakerId);
    return this.speakers.length < before;
  }

  anonymousCount(): number {
    let n = 0;
    for (const s of this.speakers) if (!s.named) n++;
    return n;
  }

  list(): Array<{ speakerId: string; label: string; named: boolean; phrases: number; seconds: number }> {
    return this.speakers.map((s) => ({
      speakerId: s.id, label: s.label, named: s.named, phrases: s.count, seconds: s.named ? 0 : s.weight,
    }));
  }

  toJSON(): SpeakerBookJSON {
    return {
      version: 1,
      dim: this.dim,
      nextAnonymous: this.nextAnonymous,
      options: { ...this.options },
      speakers: this.speakers.map((s) => ({
        id: s.id, label: s.label, named: s.named, weight: s.weight, count: s.count,
        sum: Array.from(s.sum, (x) => Math.round(x * 1e6) / 1e6),
      })),
    };
  }

  /** Restore from `toJSON()` output. `options` override the stored ones. */
  static fromJSON(json: SpeakerBookJSON, options: Partial<SpeakerBookOptions> = {}): SpeakerBook {
    if (!json || json.version !== 1) throw new Error('SpeakerBook: unsupported snapshot');
    const book = new SpeakerBook({ ...json.options, ...options });
    book.dim = json.dim;
    book.nextAnonymous = json.nextAnonymous;
    book.speakers = json.speakers.map((s) => {
      if (s.sum.length !== json.dim) throw new Error('SpeakerBook: corrupt snapshot');
      return { id: s.id, label: s.label, named: s.named, weight: s.weight, count: s.count, sum: Float32Array.from(s.sum) };
    });
    return book;
  }
}
