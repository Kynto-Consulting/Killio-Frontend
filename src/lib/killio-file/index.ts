// Killio unified local-file container — a human-readable KAML document used by
// all four local formats (.kd documents, .km mesh, .kb kanban, .ks scripts).
// Files are plain text, editable in any editor:
//
//   #killio km 2026-v1
//   id: "mesh-123"
//   title: "My Mesh"
//   viewport:
//     x: 0
//     zoom: 1
//   bricks:
//     - kind: draw
//       id: "b1"
//       ...
//
// The first line is the header `#killio <kind> <schemaVersion>`; the rest is the
// payload encoded as KAML (see kaml.ts).

import { stringifyKaml, parseKaml, KamlParseError } from "./kaml.ts";

// kd/km/kb/ks are entity files; kf is a folder-metadata marker file
// (`<foldername>.kf`) holding display name + color + icon for a disk subfolder.
export type KillioKind = "kd" | "km" | "kb" | "ks" | "kf";

export const KILLIO_EXT: Record<KillioKind, string> = { kd: ".kd", km: ".km", kb: ".kb", ks: ".ks", kf: ".kf" };
export const KILLIO_MIME = "text/plain;charset=utf-8";
const KINDS: KillioKind[] = ["kd", "km", "kb", "ks", "kf"];

export class KillioFileError extends Error {}

export type KillioFile = {
  kind: KillioKind;
  schemaVersion: string;
  payload: unknown;
};

export function encodeKillioFile(file: KillioFile): string {
  if (!KINDS.includes(file.kind)) throw new KillioFileError(`Unknown kind: ${file.kind}`);
  const header = `#killio ${file.kind} ${file.schemaVersion || "1"}`;
  return `${header}\n${stringifyKaml(file.payload)}\n`;
}

export function decodeKillioFile(text: string): KillioFile {
  const nl = text.indexOf("\n");
  const headerLine = (nl === -1 ? text : text.slice(0, nl)).trim();
  const m = headerLine.match(/^#killio\s+(kd|km|kb|ks|kf)\s+(\S+)/);
  if (!m) throw new KillioFileError("Missing or invalid #killio header");
  const kind = m[1] as KillioKind;
  const schemaVersion = m[2];
  const body = nl === -1 ? "" : text.slice(nl + 1);
  let payload: unknown;
  try {
    payload = parseKaml(body);
  } catch (e) {
    if (e instanceof KamlParseError) throw new KillioFileError(`Corrupt payload: ${e.message}`);
    throw e;
  }
  return { kind, schemaVersion, payload };
}

export function killioFilename(kind: KillioKind, title: string, fallbackId: string): string {
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const base = slug(title) || slug(fallbackId) || kind;
  return `${base}${KILLIO_EXT[kind]}`;
}

/** Trigger a browser download of a KAML Killio file. DOM side-effecting. */
export function downloadKillioFile(file: KillioFile, filename: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([encodeKillioFile(file)], { type: KILLIO_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ext = KILLIO_EXT[file.kind];
  a.download = filename.endsWith(ext) ? filename : `${filename}${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Read a File (from <input type=file>) into a decoded Killio file. */
export function readKillioFile(file: File): Promise<KillioFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(decodeKillioFile(String(reader.result)));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new KillioFileError("Read failed"));
    reader.readAsText(file);
  });
}

export { stringifyKaml, parseKaml, KamlParseError } from "./kaml.ts";
