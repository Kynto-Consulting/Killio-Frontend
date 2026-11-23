/**
 * Transcription on the device, as a choice.
 *
 * When the person turns it on, the phrases of active listening are turned into text by a small
 * Whisper model that runs in the page (in a worker) instead of by the server. What that buys: the
 * audio never leaves the device, no credits are spent, and it works without a connection. What it
 * costs, from the measurements the model was chosen with (clean read speech, a laptop): about one
 * word in seven wrong in Spanish and one in sixteen in English, where the server does much better,
 * and 3 to 5 seconds per phrase; a phone is slower. The first use downloads about 65 MB.
 *
 * Off by default. When it is on and fails, the phrase is lost rather than sent to the server: the
 * person chose not to send audio.
 */

const ENABLED_KEY = "killio_local_stt";
const WORKER_URL = "/stt/stt-worker.mjs";
/** The first phrase also waits for the model to download. */
const FIRST_TIMEOUT_MS = 300_000;
const TIMEOUT_MS = 90_000;

class LocalStt {
  private worker: Worker | null = null;
  private readonly pending = new Map<number, { resolve: (text: string) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private warm = false;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  get enabled(): boolean {
    try { return localStorage.getItem(ENABLED_KEY) === "1"; } catch { return false; }
  }

  setEnabled(on: boolean): void {
    try {
      if (on) localStorage.setItem(ENABLED_KEY, "1");
      else localStorage.removeItem(ENABLED_KEY);
    } catch { /* stays off */ }
    if (!on) this.release();
    this.listeners.forEach((listener) => listener());
  }

  private release(): void {
    this.worker?.terminate();
    this.worker = null;
    this.warm = false;
    this.pending.forEach((p) => p.reject(new Error("stopped")));
    this.pending.clear();
  }

  /** The text of one phrase (mono, 16 kHz); empty when nothing intelligible was said. Throws when the model cannot run. */
  transcribe(samples: Float32Array, language: string): Promise<string> {
    if (typeof Worker === "undefined") return Promise.reject(new Error("This device cannot run the transcription model."));
    if (!this.worker) {
      const worker = new Worker(WORKER_URL, { type: "module" });
      worker.onmessage = (event: MessageEvent<{ id: number; text?: string; error?: string }>) => {
        const waiting = this.pending.get(event.data.id);
        if (!waiting) return;
        this.pending.delete(event.data.id);
        if (typeof event.data.text === "string") { this.warm = true; waiting.resolve(event.data.text); }
        else waiting.reject(new Error(event.data.error || "The transcription model failed."));
      };
      worker.onerror = (event) => {
        const error = new Error(event.message || "The transcription model could not start.");
        this.pending.forEach((p) => p.reject(error));
        this.pending.clear();
        this.worker = null;
        this.warm = false;
      };
      this.worker = worker;
    }
    const id = this.nextId++;
    // A copy: the caller still needs its samples (the voice print reads them too).
    const copy = new Float32Array(samples);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error("The transcription model took too long."));
      }, this.warm ? TIMEOUT_MS : FIRST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (text) => { clearTimeout(timer); resolve(text.trim()); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.worker!.postMessage({ id, samples: copy, language: language.slice(0, 2).toLowerCase() }, [copy.buffer]);
    });
  }
}

/** One per page. */
export const localStt = new LocalStt();
