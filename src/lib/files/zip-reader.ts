/**
 * Minimal ZIP reader (central directory + deflate) so the viewer can open docx / xlsx / pptx / odf / zip files in the
 * browser without a dependency. Read-only; no encryption or zip64.
 */
export interface ZipEntry {
  name: string;
  size: number;
  compressedSize: number;
  method: number;
  offset: number;
  directory: boolean;
}

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);

export function listZip(buf: ArrayBuffer | Uint8Array): ZipEntry[] {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(view, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file");
  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  const out: ZipEntry[] = [];
  const decoder = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
    if (u32(view, p) !== 0x02014b50) break;
    const method = u16(view, p + 10);
    const compressedSize = u32(view, p + 20);
    const size = u32(view, p + 24);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const offset = u32(view, p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, size, compressedSize, method, offset, directory: name.endsWith("/") });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export async function readZipEntry(buf: ArrayBuffer | Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const o = entry.offset;
  if (u32(view, o) !== 0x04034b50) throw new Error("Corrupt ZIP entry");
  const start = o + 30 + u16(view, o + 26) + u16(view, o + 28);
  const raw = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new Error(`Unsupported ZIP compression (${entry.method})`);
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipText(buf: ArrayBuffer | Uint8Array, entries: ZipEntry[], name: string): Promise<string | null> {
  const entry = entries.find((e) => e.name === name);
  return entry ? new TextDecoder().decode(await readZipEntry(buf, entry)) : null;
}
