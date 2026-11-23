/**
 * Active listening (Killio App): the microphone stays on, what is said is cut into phrases on the device,
 * each phrase is transcribed and written to the person's diary. It replaces Killio Vault's audio diary.
 *
 * Only speech leaves the device (speech-segmenter.ts drops silence), and only while the person has it
 * turned on: it never starts by itself, and it stops when the page is closed. Transcription is the
 * server's cloud speech-to-text (`/vault/stt`), which is metered in credits; the phrases go to the diary
 * through `/vault/diary/ingest`. Without a connection nothing can be transcribed, so phrases are dropped.
 */
import { API_BASE_URL } from "@/lib/api/client";
import { SpeechSegmenter, downsample, encodeWav, type SpeechSegment } from "./speech-segmenter.ts";

export interface ListeningState {
  status: "off" | "starting" | "listening" | "error";
  /** True while a phrase is being captured. */
  speaking: boolean;
  /** Phrases written to the diary since it was turned on. */
  phrases: number;
  lastText: string;
  /** Why it stopped, or the last phrase that could not be saved while it keeps listening. */
  error: string | null;
}

export interface ListeningDeps {
  accessToken: () => string | null;
  teamId: () => string | null;
  /** "es", "en"… a hint for the transcription. */
  language: () => string;
}

const RATE = 16_000;
const MAX_WAITING = 20;
const OFF: ListeningState = { status: "off", speaking: false, phrases: 0, lastText: "", error: null };

function deviceId(): string {
  try {
    const key = "killio_device_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = `app-${crypto.randomUUID()}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "app-unknown";
  }
}

/** YYYY-MM-DD in the device's own time zone: the diary is organised by the person's day, not UTC's. */
function localDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function serverMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  const message = Array.isArray(body?.message) ? body.message.join(" ") : body?.message;
  return typeof message === "string" && message ? message : fallback;
}

class ActiveListening {
  private state: ListeningState = OFF;
  private readonly listeners = new Set<() => void>();
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;
  private segmenter: SpeechSegmenter | null = null;
  private waiting: SpeechSegment[] = [];
  private working = false;
  private deps: ListeningDeps | null = null;

  private readonly phraseListeners = new Set<(text: string) => void>();

  getState = (): ListeningState => this.state;

  /** Called with each phrase once it is in the diary (the wake phrase reads these). */
  onPhrase = (listener: (text: string) => void): (() => void) => {
    this.phraseListeners.add(listener);
    return () => { this.phraseListeners.delete(listener); };
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private set(patch: Partial<ListeningState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  get isOn(): boolean {
    return this.state.status === "starting" || this.state.status === "listening";
  }

  async start(deps: ListeningDeps): Promise<void> {
    if (this.isOn) return;
    this.deps = deps;
    this.set({ ...OFF, status: "starting" });
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This device has no microphone access.");
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const context = new AudioContext();
      this.context = context;
      const source = context.createMediaStreamSource(this.stream);
      // ScriptProcessorNode is the one capture API every webview the app runs in has.
      const node = context.createScriptProcessor(4096, 1, 1);
      this.node = node;
      const segmenter = new SpeechSegmenter({ sampleRate: RATE });
      this.segmenter = segmenter;
      node.onaudioprocess = (event) => {
        const block = downsample(new Float32Array(event.inputBuffer.getChannelData(0)), context.sampleRate, RATE);
        const phrase = segmenter.push(block, Date.now());
        if (segmenter.isSpeaking !== this.state.speaking) this.set({ speaking: segmenter.isSpeaking });
        if (phrase) this.enqueue(phrase);
      };
      // The node only runs while connected to an output; a silent gain keeps the microphone off the speakers.
      const silent = context.createGain();
      silent.gain.value = 0;
      source.connect(node);
      node.connect(silent);
      silent.connect(context.destination);
      // If the microphone is unplugged or the permission is revoked, say so instead of listening to nothing.
      this.stream.getAudioTracks().forEach((track) => track.addEventListener("ended", () => this.fail("The microphone stopped.")));
      this.set({ status: "listening" });
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  stop(): void {
    const last = this.segmenter?.flush();
    this.release();
    if (last) this.enqueue(last);
    this.set({ status: "off", speaking: false });
  }

  private fail(message: string): void {
    this.release();
    this.waiting = [];
    this.set({ status: "error", speaking: false, error: message });
  }

  private release(): void {
    if (this.node) this.node.onaudioprocess = null;
    try { this.node?.disconnect(); } catch { /* already gone */ }
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close().catch(() => {});
    this.node = null;
    this.stream = null;
    this.context = null;
    this.segmenter = null;
  }

  private enqueue(phrase: SpeechSegment): void {
    this.waiting.push(phrase);
    // A long stretch without a connection must not pile audio up in memory: the oldest phrases go.
    while (this.waiting.length > MAX_WAITING) this.waiting.shift();
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      for (let phrase = this.waiting.shift(); phrase; phrase = this.waiting.shift()) {
        const outcome = await this.save(phrase);
        if (outcome === "stop") return;
      }
    } finally {
      this.working = false;
    }
  }

  /** Transcribes one phrase and writes it to the diary. "stop" when listening cannot go on. */
  private async save(phrase: SpeechSegment): Promise<"ok" | "skipped" | "stop"> {
    const token = this.deps?.accessToken();
    const teamId = this.deps?.teamId();
    if (!token || !teamId) {
      this.fail("Sign in to use active listening.");
      return "stop";
    }
    try {
      const form = new FormData();
      const wav = encodeWav(phrase.samples, RATE);
      form.append("file", new Blob([wav.buffer as ArrayBuffer], { type: "audio/wav" }), "phrase.wav");
      const query = new URLSearchParams({ teamId, language: this.deps?.language() ?? "" });
      const stt = await fetch(`${API_BASE_URL}/vault/stt?${query.toString()}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      if (!stt.ok) {
        const message = await serverMessage(stt, `Transcription failed (${stt.status}).`);
        // The plan does not include it, the credits ran out, or the session ended: listening on would only
        // keep recording phrases that cannot be saved.
        if ([401, 402, 403, 404].includes(stt.status)) {
          this.fail(message);
          return "stop";
        }
        this.set({ error: message });
        return "skipped";
      }
      const text = String((await stt.json())?.text ?? "").trim();
      if (!text) return "skipped";
      const ingest = await fetch(`${API_BASE_URL}/vault/diary/ingest`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          date: localDate(phrase.startedAt),
          deviceId: deviceId(),
          segments: [{ text, ts: Math.round(phrase.startedAt), clientId: crypto.randomUUID(), source: "killio-app" }],
        }),
      });
      if (!ingest.ok) {
        const message = await serverMessage(ingest, `The diary could not be written (${ingest.status}).`);
        if ([401, 402, 403].includes(ingest.status)) {
          this.fail(message);
          return "stop";
        }
        this.set({ error: message });
        return "skipped";
      }
      this.set({ phrases: this.state.phrases + 1, lastText: text, error: null });
      this.phraseListeners.forEach((listener) => listener(text));
      return "ok";
    } catch {
      // No connection: the phrase cannot be transcribed later either (the audio is not kept), so it is dropped.
      this.set({ error: "No connection: that phrase was not saved." });
      return "skipped";
    }
  }
}

/** One per page: there is one microphone. */
export const activeListening = new ActiveListening();
