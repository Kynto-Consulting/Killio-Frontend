/**
 * Catalogue of the attachment types the file viewer understands. One table drives the label, the icon family,
 * the upload `accept` list and which previewer renders the file, so adding a type is one line.
 */
export type FileCategory = "image" | "video" | "audio" | "pdf" | "text" | "code" | "data" | "document" | "sheet" | "slides" | "archive" | "model" | "other";

/** How the viewer shows the bytes. */
export type FilePreviewer = "image" | "video" | "audio" | "pdf" | "text" | "markdown" | "csv" | "html" | "docx" | "xlsx" | "pptx" | "odf" | "zip" | "model" | "none";

export interface FileKind {
  ext: string;
  label: string;
  category: FileCategory;
  previewer: FilePreviewer;
  mime: string;
}

const k = (ext: string, label: string, category: FileCategory, previewer: FilePreviewer, mime: string): [string, FileKind] => [ext, { ext, label, category, previewer, mime }];

export const FILE_KINDS: Record<string, FileKind> = Object.fromEntries([
  // images
  k("png", "PNG image", "image", "image", "image/png"),
  k("jpg", "JPEG image", "image", "image", "image/jpeg"),
  k("jpeg", "JPEG image", "image", "image", "image/jpeg"),
  k("gif", "GIF image", "image", "image", "image/gif"),
  k("webp", "WebP image", "image", "image", "image/webp"),
  k("avif", "AVIF image", "image", "image", "image/avif"),
  k("bmp", "Bitmap image", "image", "image", "image/bmp"),
  k("ico", "Icon", "image", "image", "image/x-icon"),
  k("svg", "SVG vector", "image", "image", "image/svg+xml"),
  // video / audio
  k("mp4", "MP4 video", "video", "video", "video/mp4"),
  k("m4v", "M4V video", "video", "video", "video/x-m4v"),
  k("webm", "WebM video", "video", "video", "video/webm"),
  k("mov", "QuickTime video", "video", "video", "video/quicktime"),
  k("ogv", "Ogg video", "video", "video", "video/ogg"),
  k("mp3", "MP3 audio", "audio", "audio", "audio/mpeg"),
  k("wav", "WAV audio", "audio", "audio", "audio/wav"),
  k("ogg", "Ogg audio", "audio", "audio", "audio/ogg"),
  k("oga", "Ogg audio", "audio", "audio", "audio/ogg"),
  k("m4a", "M4A audio", "audio", "audio", "audio/mp4"),
  k("aac", "AAC audio", "audio", "audio", "audio/aac"),
  k("flac", "FLAC audio", "audio", "audio", "audio/flac"),
  k("opus", "Opus audio", "audio", "audio", "audio/ogg"),
  // documents
  k("pdf", "PDF document", "pdf", "pdf", "application/pdf"),
  k("docx", "Word document", "document", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  k("xlsx", "Excel workbook", "sheet", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  k("pptx", "PowerPoint deck", "slides", "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
  k("odt", "OpenDocument text", "document", "odf", "application/vnd.oasis.opendocument.text"),
  k("ods", "OpenDocument sheet", "sheet", "odf", "application/vnd.oasis.opendocument.spreadsheet"),
  k("odp", "OpenDocument slides", "slides", "odf", "application/vnd.oasis.opendocument.presentation"),
  k("rtf", "Rich text", "document", "text", "application/rtf"),
  k("doc", "Word 97-2003", "document", "none", "application/msword"),
  k("xls", "Excel 97-2003", "sheet", "none", "application/vnd.ms-excel"),
  k("ppt", "PowerPoint 97-2003", "slides", "none", "application/vnd.ms-powerpoint"),
  // text and data
  k("txt", "Plain text", "text", "text", "text/plain"),
  k("log", "Log file", "text", "text", "text/plain"),
  k("md", "Markdown", "text", "markdown", "text/markdown"),
  k("markdown", "Markdown", "text", "markdown", "text/markdown"),
  k("csv", "CSV table", "data", "csv", "text/csv"),
  k("tsv", "TSV table", "data", "csv", "text/tab-separated-values"),
  k("json", "JSON", "data", "text", "application/json"),
  k("jsonl", "JSON lines", "data", "text", "application/x-ndjson"),
  k("xml", "XML", "data", "text", "application/xml"),
  k("yaml", "YAML", "data", "text", "application/yaml"),
  k("yml", "YAML", "data", "text", "application/yaml"),
  k("toml", "TOML", "data", "text", "application/toml"),
  k("ini", "INI config", "data", "text", "text/plain"),
  k("env", "Environment file", "data", "text", "text/plain"),
  k("html", "HTML page", "code", "html", "text/html"),
  k("htm", "HTML page", "code", "html", "text/html"),
  // code
  k("js", "JavaScript", "code", "text", "text/javascript"),
  k("mjs", "JavaScript module", "code", "text", "text/javascript"),
  k("ts", "TypeScript", "code", "text", "text/typescript"),
  k("tsx", "TypeScript React", "code", "text", "text/typescript"),
  k("jsx", "JavaScript React", "code", "text", "text/javascript"),
  k("css", "Stylesheet", "code", "text", "text/css"),
  k("py", "Python", "code", "text", "text/x-python"),
  k("sql", "SQL", "code", "text", "application/sql"),
  k("sh", "Shell script", "code", "text", "application/x-sh"),
  k("java", "Java", "code", "text", "text/x-java"),
  k("go", "Go", "code", "text", "text/x-go"),
  k("rs", "Rust", "code", "text", "text/x-rust"),
  k("c", "C", "code", "text", "text/x-c"),
  k("cpp", "C++", "code", "text", "text/x-c++"),
  k("php", "PHP", "code", "text", "application/x-php"),
  k("rb", "Ruby", "code", "text", "text/x-ruby"),
  k("kql", "KQL query", "code", "text", "text/plain"),
  // archives and 3D
  k("zip", "ZIP archive", "archive", "zip", "application/zip"),
  // 3D models render inline in the media brick (model-viewer), so the viewer has nothing more to add
  k("glb", "3D model (GLB)", "model", "none", "model/gltf-binary"),
  k("gltf", "3D model (glTF)", "model", "none", "model/gltf+json"),
  k("7z", "7-Zip archive", "archive", "none", "application/x-7z-compressed"),
  k("rar", "RAR archive", "archive", "none", "application/vnd.rar"),
  k("gz", "Gzip archive", "archive", "none", "application/gzip"),
  k("tar", "TAR archive", "archive", "none", "application/x-tar"),
]);

const MIME_TO_EXT: Record<string, string> = {};
for (const kind of Object.values(FILE_KINDS)) if (!MIME_TO_EXT[kind.mime]) MIME_TO_EXT[kind.mime] = kind.ext;

export function extensionOf(name: string | null | undefined): string {
  const clean = String(name ?? "").split(/[?#]/)[0];
  const m = /\.([a-z0-9]{1,8})$/i.exec(clean.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Name to show for a url like `/uploads/image/2024/ventas.csv` or `https://x/y/Informe%20Q1.pdf`. */
export function fileNameFromUrl(url: string | null | undefined): string {
  const clean = String(url ?? "").split(/[?#]/)[0];
  const last = clean.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export interface FileInfo extends FileKind {
  /** False when the type is not in the catalogue (still downloadable). */
  known: boolean;
  name: string;
}

/** Works out what a file is from its name, url and MIME type (the extension wins, then the MIME type). */
export function describeFile(input: { name?: string | null; url?: string | null; mime?: string | null }): FileInfo {
  const name = (input.name ?? "").trim() || fileNameFromUrl(input.url);
  const mime = String(input.mime ?? "").toLowerCase().split(";")[0].trim();
  const byExt = FILE_KINDS[extensionOf(name) || extensionOf(input.url)];
  if (byExt) return { ...byExt, known: true, name };
  const byMime = FILE_KINDS[MIME_TO_EXT[mime] ?? ""];
  if (byMime) return { ...byMime, known: true, name };
  if (mime.startsWith("image/")) return { ...FILE_KINDS.png, ext: "", label: "Image", mime, known: true, name };
  if (mime.startsWith("video/")) return { ...FILE_KINDS.mp4, ext: "", label: "Video", mime, known: true, name };
  if (mime.startsWith("audio/")) return { ...FILE_KINDS.mp3, ext: "", label: "Audio", mime, known: true, name };
  if (mime.startsWith("text/")) return { ...FILE_KINDS.txt, ext: "", label: "Text", mime, known: true, name };
  return { ext: extensionOf(name), label: "File", category: "other", previewer: "none", mime: mime || "application/octet-stream", known: false, name };
}

export const canPreview = (info: FileInfo): boolean => info.previewer !== "none";

/** Value for `<input type="file" accept>`: every catalogued extension. */
export const FILE_ACCEPT = ["image/*", "video/*", "audio/*", ...Object.keys(FILE_KINDS).map((e) => `.${e}`)].join(",");

export const humanSize = (bytes: number | null | undefined): string => {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10485760 ? 2 : 1)} MB`;
};
