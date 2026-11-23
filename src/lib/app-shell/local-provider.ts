/**
 * The AI provider chosen for THIS device (Killio App only). Pure storage, no imports.
 *
 * "Claude" is the person's own Claude Code, reached through the app. It exists only on the computer where
 * Claude Code is installed, so the choice is kept on the device, not in the account: the same person on
 * their phone or on the web keeps using the provider set in their account.
 */

export interface LocalAiProvider {
  mode: "claude";
  /** Model id as the person's Claude Code lists it. */
  model: string;
}

const KEY = "killio_local_ai_provider";

export function readLocalAiProvider(storage: Pick<Storage, "getItem"> | null): LocalAiProvider | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.mode !== "claude" || typeof parsed.model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(parsed.model)) return null;
    return { mode: "claude", model: parsed.model };
  } catch {
    return null;
  }
}

export function writeLocalAiProvider(storage: Pick<Storage, "setItem" | "removeItem"> | null, value: LocalAiProvider | null): void {
  try {
    if (value) storage?.setItem(KEY, JSON.stringify(value));
    else storage?.removeItem(KEY);
  } catch {
    /* storage unavailable: the choice simply does not stick */
  }
}
