// Killio unified local-file container. A single binary envelope used by all
// four local formats (.kd documents, .km mesh, .kb kanban, .ks scripts).
// Layout:
//   bytes 0..3  magic 'K','L','O','1'  (0x4B 0x4C 0x4F 0x31)
//   byte  4     container version (1)
//   byte  5     kind code (0=kd, 1=km, 2=kb, 3=ks)
//   varint+utf8 schemaVersion
//   <value>     payload encoded with the dictionary value codec (see binary.ts)

import { ByteWriter, ByteReader, encodeValue, decodeValue, newKeyDict } from "./binary.ts";
import { encodeMeshPayload, decodeMeshPayload, type MeshPayload } from "./brick-codecs.ts";
import { encodeContentBricks, decodeContentBricks, type ContentBrickLike } from "./content-brick-codecs.ts";

type AnyDict = ReturnType<typeof newKeyDict>;

// Documents (.kd): { ...meta, bricks: ContentBrick[] }. The heavy brick array
// uses the unified content-brick codec; remaining metadata rides the generic
// value codec. Lossless for arbitrary extra fields.
function encodeDocPayload(w: ByteWriter, payload: unknown, dict: AnyDict): void {
  const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const { bricks, ...rest } = obj;
  encodeValue(w, rest, dict);
  encodeContentBricks(w, (Array.isArray(bricks) ? bricks : []) as ContentBrickLike[], dict);
}
function decodeDocPayload(r: ByteReader, dict: AnyDict): unknown {
  const rest = decodeValue(r, dict) as Record<string, unknown>;
  const bricks = decodeContentBricks(r, dict);
  return { ...(rest && typeof rest === "object" ? rest : {}), bricks };
}

export type KillioKind = "kd" | "km" | "kb" | "ks";

export const KILLIO_EXT: Record<KillioKind, string> = { kd: ".kd", km: ".km", kb: ".kb", ks: ".ks" };
export const KILLIO_MIME = "application/octet-stream";
const CONTAINER_VERSION = 1;
const MAGIC = [0x4b, 0x4c, 0x4f, 0x31]; // "KLO1"

const KIND_TO_CODE: Record<KillioKind, number> = { kd: 0, km: 1, kb: 2, ks: 3 };
const CODE_TO_KIND: Record<number, KillioKind> = { 0: "kd", 1: "km", 2: "kb", 3: "ks" };

export class KillioFileError extends Error {}

export type KillioFile = {
  kind: KillioKind;
  schemaVersion: string;
  payload: unknown;
};

export function encodeKillioFile(file: KillioFile): Uint8Array {
  const code = KIND_TO_CODE[file.kind];
  if (code === undefined) throw new KillioFileError(`Unknown kind: ${file.kind}`);
  const w = new ByteWriter(2048);
  for (const b of MAGIC) w.u8(b);
  w.u8(CONTAINER_VERSION);
  w.u8(code);
  w.str(file.schemaVersion || "");
  const dict = newKeyDict();
  // Per-kind optimized codecs: km → positional mesh bricks, kd → unified content
  // bricks. kb/ks fall back to the generic dictionary value codec for now.
  if (file.kind === "km") encodeMeshPayload(w, file.payload as MeshPayload, dict);
  else if (file.kind === "kd") encodeDocPayload(w, file.payload, dict);
  else encodeValue(w, file.payload, dict);
  return w.finish();
}

export function decodeKillioFile(bytes: Uint8Array): KillioFile {
  if (bytes.length < 6) throw new KillioFileError("Too short");
  const r = new ByteReader(bytes);
  for (let i = 0; i < MAGIC.length; i++) {
    if (r.u8() !== MAGIC[i]) throw new KillioFileError("Bad magic — not a Killio file");
  }
  const version = r.u8();
  if (version !== CONTAINER_VERSION) throw new KillioFileError(`Unsupported container version ${version}`);
  const code = r.u8();
  const kind = CODE_TO_KIND[code];
  if (!kind) throw new KillioFileError(`Unknown kind code ${code}`);
  const schemaVersion = r.str();
  let payload: unknown;
  try {
    const dict = newKeyDict();
    payload = kind === "km" ? decodeMeshPayload(r, dict)
      : kind === "kd" ? decodeDocPayload(r, dict)
      : decodeValue(r, dict);
  } catch (e) {
    throw new KillioFileError(`Corrupt payload: ${(e as Error).message}`);
  }
  return { kind, schemaVersion, payload };
}

export function killioFilename(kind: KillioKind, title: string, fallbackId: string): string {
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const base = slug(title) || slug(fallbackId) || kind;
  return `${base}${KILLIO_EXT[kind]}`;
}

/** Trigger a browser download of an encoded Killio file. DOM side-effecting. */
export function downloadKillioFile(file: KillioFile, filename: string): void {
  if (typeof window === "undefined") return;
  const bytes = encodeKillioFile(file);
  // copy into a fresh ArrayBuffer-backed view for Blob
  const blob = new Blob([bytes.slice()], { type: KILLIO_MIME });
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
        resolve(decodeKillioFile(new Uint8Array(reader.result as ArrayBuffer)));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new KillioFileError("Read failed"));
    reader.readAsArrayBuffer(file);
  });
}

export { ByteWriter, ByteReader } from "./binary.ts";
