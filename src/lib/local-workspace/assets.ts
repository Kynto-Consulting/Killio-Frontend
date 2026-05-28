// Asset handling for Local workspaces. When a user pastes/embeds an image (or
// any binary) into a document/mesh/board, the bytes are written into an
// `assets/` subfolder of the workspace and the brick stores a portable
// reference `asset:<filename>` instead of a data URL. On load, refs are resolved
// back to object URLs from disk.

export const ASSETS_DIR = "assets";
const REF_PREFIX = "asset:";

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif",
  "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif",
  "application/pdf": "pdf", "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav",
};

export function extFromMime(mime: string): string {
  return MIME_TO_EXT[mime?.toLowerCase?.() ?? ""] ?? "bin";
}

/** Build a stable asset filename `<id>.<ext>` from a mime type. Pure. */
export function assetFilename(mime: string, id: string): string {
  return `${id}.${extFromMime(mime)}`;
}

export function makeAssetRef(name: string): string {
  return `${REF_PREFIX}${name}`;
}

export function isAssetRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(REF_PREFIX);
}

export function assetNameFromRef(ref: string): string {
  return ref.startsWith(REF_PREFIX) ? ref.slice(REF_PREFIX.length) : ref;
}

type DirHandle = FileSystemDirectoryHandle;

async function getAssetsDir(dir: DirHandle, create: boolean): Promise<DirHandle> {
  return dir.getDirectoryHandle(ASSETS_DIR, { create });
}

/** Write binary asset bytes into <workspace>/assets/<name>. Returns the ref. */
export async function writeAsset(
  dir: DirHandle,
  name: string,
  data: Blob | ArrayBuffer | Uint8Array,
): Promise<string> {
  const assets = await getAssetsDir(dir, true);
  const fileHandle = await assets.getFileHandle(name, { create: true });
  const writable = await (fileHandle as unknown as { createWritable: () => Promise<{ write: (d: BlobPart) => Promise<void>; close: () => Promise<void> }> }).createWritable();
  const part: BlobPart = data instanceof Uint8Array ? data.slice() : (data as BlobPart);
  await writable.write(part);
  await writable.close();
  return makeAssetRef(name);
}

/** Read an asset file from <workspace>/assets/<name>. */
export async function readAssetFile(dir: DirHandle, name: string): Promise<File> {
  const assets = await getAssetsDir(dir, false);
  const fileHandle = await assets.getFileHandle(name);
  return fileHandle.getFile();
}

/** Resolve an `asset:` ref to a blob object URL for display. Caller revokes it. */
export async function resolveAssetUrl(dir: DirHandle, ref: string): Promise<string> {
  const file = await readAssetFile(dir, assetNameFromRef(ref));
  return URL.createObjectURL(file);
}
