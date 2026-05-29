// Import a folder of markdown (e.g. an Obsidian vault) or a .zip into Killio.
// Markdown → bricks (see markdown-import.ts); [[wikilinks]] are remapped to
// @-mention refpills; ![[embeds]]/images become media bricks with their files
// copied into the workspace (local) or uploaded (online). Folder structure is
// preserved on disk for local imports.

import { unzipSync } from "fflate";
import { parseMarkdownToBricks, type ImportedBrick, type EmbedTarget } from "./markdown-import.ts";
import { writeAsset } from "./assets.ts";
import { writeWorkspaceFile, ensureWorkspaceDir } from "./fs-access.ts";
import { encodeKillioFile } from "@/lib/killio-file";
import { docToKd, folderMetaToKf, KF_SCHEMA } from "./adapters.ts";
import { folderMetaFromName } from "./emoji-icon.ts";
import { createDocument, createDocumentBrick } from "@/lib/api/documents";
import { uploadFile } from "@/lib/api/contracts";

export type RawFile = { path: string; isMd: boolean; text?: string; bytes?: Uint8Array; mime?: string };
export type ImportProgress = (done: number, total: number, label?: string) => void;
export type ImportSummary = { documents: number; assets: number; failed: number };

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/x-m4v",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  pdf: "application/pdf",
};

function extOf(name: string): string { const i = name.lastIndexOf("."); return i >= 0 ? name.slice(i + 1).toLowerCase() : ""; }
function baseOf(path: string): string { return path.split("/").pop() || path; }
function stem(name: string): string { const i = name.lastIndexOf("."); return i >= 0 ? name.slice(0, i) : name; }
function mimeOf(name: string): string { return MIME_BY_EXT[extOf(name)] || "application/octet-stream"; }

function embedKind(name: string): EmbedTarget["kind"] {
  const e = extOf(name);
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(e)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(e)) return "video";
  if (["mp3", "wav", "ogg"].includes(e)) return "audio";
  return "file";
}

/** Filesystem-safe, link-stable slug for a path segment (drops emoji/accents). */
function slugSeg(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "").trim()
    .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    .toLowerCase() || "untitled";
}

function splitSegs(path: string): string[] { return path.split("/").map((s) => s.trim()).filter(Boolean); }

/** Drop a leading common root dir + any `.obsidian` config files. */
function normalizeFiles(files: RawFile[]): RawFile[] {
  const kept = files.filter((f) => !splitSegs(f.path).includes(".obsidian"));
  const roots = new Set(kept.map((f) => splitSegs(f.path)[0]).filter(Boolean));
  const stripRoot = roots.size === 1;
  return kept.map((f) => {
    const segs = splitSegs(f.path);
    return { ...f, path: (stripRoot ? segs.slice(1) : segs).join("/") };
  });
}

/** Unzip an ArrayBuffer into RawFiles. */
export function unzipToFiles(buf: ArrayBuffer): RawFile[] {
  const entries = unzipSync(new Uint8Array(buf));
  const out: RawFile[] = [];
  const decoder = new TextDecoder();
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith("/") || bytes.length === 0) continue;
    const isMd = path.toLowerCase().endsWith(".md");
    out.push(isMd ? { path, isMd: true, text: decoder.decode(bytes) } : { path, isMd: false, bytes, mime: mimeOf(path) });
  }
  return out;
}

/** Read a folder FileList (webkitRelativePath) into RawFiles. */
export async function fileListToFiles(files: File[]): Promise<RawFile[]> {
  const out: RawFile[] = [];
  for (const f of files) {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    if (path.toLowerCase().endsWith(".md")) out.push({ path, isMd: true, text: await f.text() });
    else out.push({ path, isMd: false, bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type || mimeOf(path) });
  }
  return out;
}

// ── Shared planning ───────────────────────────────────────────────────────────

type Plan = {
  mds: Array<{ src: RawFile; docPath: string; title: string }>;
  assets: Array<{ src: RawFile; assetName: string }>;
  /** note name (lowercased) → doc relative path */
  wikiMap: Map<string, string>;
  /** asset basename (lowercased, with ext) → asset filename */
  embedMap: Map<string, string>;
  /** folder relative path (slugged) → { name (clean), icon } for dirs with a leading emoji */
  folders: Map<string, { name: string; icon: string }>;
};

function buildPlan(rawFiles: RawFile[], baseFolder = ""): Plan {
  const files = normalizeFiles(rawFiles);
  const base = baseFolder ? slugSeg(baseFolder) : "";
  const wikiMap = new Map<string, string>();
  const embedMap = new Map<string, string>();
  const folders = new Map<string, { name: string; icon: string }>();
  const mds: Plan["mds"] = [];
  const assets: Plan["assets"] = [];
  const usedAssetNames = new Set<string>();

  // Record folder metadata (emoji → icon + clean name) for every directory
  // segment encountered, keyed by its cumulative slugged path.
  const recordDirs = (segs: string[]) => {
    let cum = base;
    for (const seg of segs) {
      cum = [cum, slugSeg(seg)].filter(Boolean).join("/");
      if (folders.has(cum)) continue;
      const meta = folderMetaFromName(seg);
      if (meta) folders.set(cum, meta);
    }
  };

  for (const f of files) {
    const segs = splitSegs(f.path);
    const name = segs.pop() || f.path;
    recordDirs(segs);
    if (f.isMd) {
      const title = stem(name);
      const dirSegs = segs.map(slugSeg);
      const docPath = [base, ...dirSegs, `${slugSeg(title)}.kd`].filter(Boolean).join("/");
      mds.push({ src: f, docPath, title });
      wikiMap.set(stem(name).toLowerCase(), docPath);
    } else {
      let assetName = slugSeg(stem(name)) + (extOf(name) ? `.${extOf(name)}` : "");
      while (usedAssetNames.has(assetName)) assetName = `${slugSeg(stem(name))}-${Math.random().toString(36).slice(2, 6)}.${extOf(name)}`;
      usedAssetNames.add(assetName);
      assets.push({ src: f, assetName });
      embedMap.set(name.toLowerCase(), assetName);
    }
  }
  return { mds, assets, wikiMap, embedMap, folders };
}

function bricksFor(text: string, hooks: Parameters<typeof parseMarkdownToBricks>[1]): ImportedBrick[] {
  return parseMarkdownToBricks(text, hooks);
}

// ── Local import (File System Access) ──────────────────────────────────────────

export async function importVaultLocal(
  rawFiles: RawFile[],
  dir: FileSystemDirectoryHandle,
  opts: { baseFolder?: string; onProgress?: ImportProgress } = {},
): Promise<ImportSummary> {
  const plan = buildPlan(rawFiles, opts.baseFolder);
  let assetCount = 0;
  let docCount = 0;
  let failed = 0;
  const total = plan.assets.length + plan.mds.length;
  let done = 0;

  // 0) Folder .kf markers (emoji → icon + clean name) for emoji-prefixed dirs.
  for (const [folderPath, meta] of plan.folders) {
    try {
      await ensureWorkspaceDir(dir, folderPath);
      const dirName = folderPath.split("/").filter(Boolean).pop() || "folder";
      await writeWorkspaceFile(dir, `${folderPath}/${dirName}.kf`, encodeKillioFile({ kind: "kf", schemaVersion: KF_SCHEMA, payload: folderMetaToKf(meta) }));
    } catch { /* non-fatal */ }
  }

  // 1) Copy assets into <workspace>/assets/.
  for (const a of plan.assets) {
    try { if (a.src.bytes) { await writeAsset(dir, a.assetName, a.src.bytes); assetCount += 1; } }
    catch { failed += 1; }
    opts.onProgress?.(++done, total, a.assetName);
  }

  // 2) Parse + write each markdown as a .kd document.
  for (const m of plan.mds) {
    try {
      const bricks = bricksFor(m.src.text || "", {
        resolveWikiLink: (target, alias) => {
          const path = plan.wikiMap.get(target.toLowerCase());
          return path ? `@[doc:${path}:${alias || target}]` : null;
        },
        resolveEmbed: (target) => {
          const an = plan.embedMap.get(baseOf(target).toLowerCase());
          if (!an) return null;
          return { kind: embedKind(an), url: `asset:${an}`, title: stem(target), mimeType: mimeOf(an) };
        },
      });
      const payload = docToKd({ id: m.docPath, title: m.title, bricks: bricks.map((b, i) => ({ id: `${i}`, kind: b.kind, position: i, content: b.content })) });
      await writeWorkspaceFile(dir, m.docPath, encodeKillioFile({ kind: "kd", schemaVersion: "2026-v1", payload }));
      docCount += 1;
    } catch { failed += 1; }
    opts.onProgress?.(++done, total, m.title);
  }

  return { documents: docCount, assets: assetCount, failed };
}

// ── Online import (cloud documents) ─────────────────────────────────────────────

export async function importVaultOnline(
  rawFiles: RawFile[],
  ctx: { teamId: string; accessToken: string },
  opts: { onProgress?: ImportProgress } = {},
): Promise<ImportSummary> {
  const plan = buildPlan(rawFiles);
  let assetCount = 0;
  let docCount = 0;
  let failed = 0;
  const total = plan.assets.length + plan.mds.length * 2;
  let done = 0;

  // 1) Upload assets → embed basename → cloud url.
  const assetUrl = new Map<string, string>();
  for (const a of plan.assets) {
    try {
      if (a.src.bytes) {
        const blobPart = new Uint8Array(a.src.bytes); // ensure a plain ArrayBuffer backing
        const file = new File([blobPart], a.assetName, { type: a.src.mime || mimeOf(a.assetName) });
        const up = await uploadFile(file, ctx.accessToken, { ownerScopeType: "team", ownerScopeId: ctx.teamId });
        assetUrl.set(a.assetName, up.url);
        assetCount += 1;
      }
    } catch { failed += 1; }
    opts.onProgress?.(++done, total, a.assetName);
  }

  // 2) Create document shells → note path → cloud id.
  const docId = new Map<string, string>();
  for (const m of plan.mds) {
    try {
      const doc = await createDocument({ teamId: ctx.teamId, title: m.title }, ctx.accessToken);
      docId.set(m.docPath, doc.id);
    } catch { failed += 1; }
    opts.onProgress?.(++done, total, m.title);
  }

  // 3) Parse + push bricks with cloud-remapped refs.
  for (const m of plan.mds) {
    const id = docId.get(m.docPath);
    if (!id) { continue; }
    try {
      const bricks = bricksFor(m.src.text || "", {
        resolveWikiLink: (target, alias) => {
          const path = plan.wikiMap.get(target.toLowerCase());
          const cid = path ? docId.get(path) : undefined;
          return cid ? `@[doc:${cid}:${alias || target}]` : null;
        },
        resolveEmbed: (target) => {
          const an = plan.embedMap.get(baseOf(target).toLowerCase());
          const url = an ? assetUrl.get(an) : undefined;
          if (!url) return null;
          return { kind: embedKind(an!), url, title: stem(target), mimeType: mimeOf(an!) };
        },
      });
      for (let i = 0; i < bricks.length; i += 1) {
        try { await createDocumentBrick(id, { kind: bricks[i].kind, position: i, content: bricks[i].content }, ctx.accessToken); } catch { /* skip brick */ }
      }
      docCount += 1;
    } catch { failed += 1; }
    opts.onProgress?.(++done, total, m.title);
  }

  return { documents: docCount, assets: assetCount, failed };
}
