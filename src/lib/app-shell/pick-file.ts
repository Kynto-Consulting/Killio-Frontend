/**
 * Lets the person hand a file to the assistant. A page may only open the system's file dialog right
 * after a click, and the assistant's request arrives on its own, so a small card asks first: its
 * button is the click, and also the person's consent. Works the same on every system.
 */

export interface PickedFile {
  name: string;
  /** Bytes. */
  size: number;
  mime: string;
  /** The contents, for small text files only. */
  text?: string;
}

const ACCEPT: Record<string, string> = {
  image: "image/*",
  pdf: "application/pdf,.pdf",
  text: "text/*,.txt,.md,.csv,.json,.log,.xml,.yaml,.yml",
};
const MAX_TEXT_BYTES = 100 * 1024;
const TEXT_LIKE = /^(text\/|application\/(json|xml|x-yaml|yaml))|\.(txt|md|csv|json|log|xml|ya?ml)$/i;

/** Resolves with the chosen file, or null when the person closes the card or the dialog. */
export function pickFile(kind: string, labels: { title: string; choose: string; cancel: string }): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", labels.title);
    overlay.style.cssText = "position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.5)";
    const card = document.createElement("div");
    card.className = "rounded-xl border border-border bg-card text-card-foreground shadow-xl";
    card.style.cssText = "width:100%;max-width:22rem;padding:20px";
    const title = document.createElement("p");
    title.className = "text-sm font-medium";
    title.textContent = labels.title;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:16px";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "h-9 rounded-md border border-border px-3 text-sm font-medium";
    cancel.textContent = labels.cancel;
    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground";
    choose.textContent = labels.choose;
    const input = document.createElement("input");
    input.type = "file";
    input.hidden = true;
    if (ACCEPT[kind]) input.accept = ACCEPT[kind];
    row.append(cancel, choose);
    card.append(title, row, input);
    overlay.append(card);

    let settled = false;
    const finish = (file: PickedFile | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(file);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") finish(null); };
    cancel.addEventListener("click", () => finish(null));
    overlay.addEventListener("click", (event) => { if (event.target === overlay) finish(null); });
    choose.addEventListener("click", () => input.click());
    // Closing the system dialog without choosing leaves the card up: the person can try again or cancel.
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const picked: PickedFile = { name: file.name, size: file.size, mime: file.type || "application/octet-stream" };
      if (file.size <= MAX_TEXT_BYTES && TEXT_LIKE.test(`${file.type}${file.name}`)) {
        try { picked.text = await file.text(); } catch { /* the name and size are still an answer */ }
      }
      finish(picked);
    });
    document.addEventListener("keydown", onKey);
    document.body.append(overlay);
    choose.focus();
  });
}
