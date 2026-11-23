/**
 * The wake phrase of active listening: a phrase that starts by calling Killio by name ("Killio, …",
 * "Oye Killio, …", "Hey Killio …") is an order for the assistant, not just something to note down.
 *
 * It works on the transcript, so it only exists while active listening is on and costs nothing extra:
 * the phrase was going to be transcribed anyway. It is not an on-device wake-word model, and it does
 * not wake anything up from silence.
 */

const WAKE_KEY = "killio_wake_phrase";

/** How transcription tends to spell the name. */
const NAME = "(?:killio|kilio|kilyo|quilio|quillio|kilio's)";
const GREETING = "(?:oye|oiga|hey|ey|ok|okay|hola|hi|hello)";
const WAKE = new RegExp(`^[\\s¡¿"'“”]*(?:${GREETING}[\\s,]+)?${NAME}(?=$|[\\s,.:;!?…-])[\\s,.:;!?…-]*`, "iu");

/** The order that follows the name, or null when the phrase is not addressed to Killio (or says nothing after it). */
export function wakeCommand(text: string): string | null {
  const phrase = String(text ?? "").trim();
  const match = WAKE.exec(phrase);
  if (!match) return null;
  const rest = phrase.slice(match[0].length).trim();
  // The name alone, or a single word after it, is too little to act on.
  return rest.split(/\s+/).filter(Boolean).length >= 2 ? rest : null;
}

/** Off unless the person turned it on: anyone within earshot can say the name. */
export function isWakePhraseEnabled(): boolean {
  try {
    return localStorage.getItem(WAKE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setWakePhraseEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(WAKE_KEY, "1");
    else localStorage.removeItem(WAKE_KEY);
  } catch {
    /* stays off */
  }
}
