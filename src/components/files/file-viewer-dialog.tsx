"use client";

import React from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { Download, ExternalLink, X, FileText, FileImage, FileVideo, FileAudio, FileSpreadsheet, FileArchive, FileCode, FileJson, Presentation, File as FileIcon } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { describeFile, humanSize, type FileCategory, type FileInfo } from "@/lib/files/file-types";
import { listZip, type ZipEntry } from "@/lib/files/zip-reader";
import { readDocx, readOdf, readPptx, readXlsx, rtfToText, type SheetData } from "@/lib/files/office-text";

export interface ViewableFile {
  /** Fetchable url (already resolved: asset: refs must be turned into object URLs by the caller). */
  url: string;
  name?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_FETCH_BYTES = 40 * 1024 * 1024;

export function FileTypeIcon({ category, className }: { category: FileCategory; className?: string }) {
  const Icon = { image: FileImage, video: FileVideo, audio: FileAudio, sheet: FileSpreadsheet, data: FileJson, code: FileCode, archive: FileArchive, slides: Presentation, pdf: FileText, document: FileText, text: FileText, model: FileIcon, other: FileIcon }[category] ?? FileIcon;
  return <Icon className={className} />;
}

type Loaded =
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "markdown"; text: string }
  | { kind: "table"; sheets: SheetData[] }
  | { kind: "paragraphs"; lines: string[] }
  | { kind: "slides"; slides: string[][] }
  | { kind: "zip"; entries: ZipEntry[] }
  | { kind: "html"; html: string }
  | { kind: "pdf"; blobUrl: string };

/** Delimited text to rows (RFC 4180 quotes), capped so a huge file does not freeze the tab. */
export function parseDelimited(text: string, delimiter: string, maxRows = 1000): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if ((cell !== "" || row.length) && rows.length < maxRows) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** UTF-8 (BOM aware); files saved by Excel or older tools that are not valid UTF-8 are read as Windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_FETCH_BYTES) throw new Error("too-large");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_FETCH_BYTES) throw new Error("too-large");
  return buf;
}

async function loadFile(file: ViewableFile, info: FileInfo): Promise<Loaded | null> {
  const p = info.previewer;
  if (p === "image" || p === "video" || p === "audio" || p === "none") return null;
  const bytes = await fetchBytes(file.url);
  const decode = (limit = MAX_TEXT_BYTES) => ({ text: decodeText(bytes.subarray(0, limit)), truncated: bytes.length > limit });
  switch (p) {
    case "pdf":
      return { kind: "pdf", blobUrl: URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })) };
    case "markdown":
      return { kind: "markdown", text: decode().text };
    case "html":
      return { kind: "html", html: decode().text };
    case "csv": {
      const { text } = decode();
      const delimiter = info.ext === "tsv" || (!text.slice(0, 2000).includes(",") && text.slice(0, 2000).includes("\t")) ? "\t" : text.slice(0, 2000).split(";").length > text.slice(0, 2000).split(",").length ? ";" : ",";
      return { kind: "table", sheets: [{ name: info.name, rows: parseDelimited(text, delimiter) }] };
    }
    case "text": {
      const d = decode();
      if (info.ext === "rtf") return { kind: "text", text: rtfToText(d.text), truncated: d.truncated };
      if (info.ext === "json") {
        try {
          return { kind: "text", text: JSON.stringify(JSON.parse(d.text), null, 2), truncated: d.truncated };
        } catch {
          /* show as written */
        }
      }
      return { kind: "text", ...d };
    }
    case "xlsx":
      return { kind: "table", sheets: await readXlsx(bytes) };
    case "docx":
      return { kind: "paragraphs", lines: await readDocx(bytes) };
    case "pptx":
      return { kind: "slides", slides: await readPptx(bytes) };
    case "odf":
      return { kind: "paragraphs", lines: await readOdf(bytes) };
    case "zip": {
      return { kind: "zip", entries: listZip(bytes) };
    }
    default:
      return null;
  }
}

function Grid({ rows }: { rows: string[][] }) {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return (
    <div className="overflow-auto rounded-md border border-border">
      <table className="min-w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-muted">
          <tr>
            <th className="w-10 border-b border-r border-border px-2 py-1 text-right font-normal text-muted-foreground">#</th>
            {Array.from({ length: width }, (_, i) => (
              <th key={i} className="border-b border-r border-border px-2 py-1 text-left font-medium">
                {String.fromCharCode(65 + (i % 26))}
                {i >= 26 ? Math.floor(i / 26) : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-muted/20">
              <td className="border-r border-border px-2 py-1 text-right text-muted-foreground">{i + 1}</td>
              {Array.from({ length: width }, (_, c) => (
                <td key={c} className="max-w-[320px] truncate border-r border-border px-2 py-1" title={r[c] ?? ""}>
                  {r[c] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FileViewerDialog({ file, onClose }: { file: ViewableFile | null; onClose: () => void }) {
  const t = useTranslations("document-detail");
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [sheet, setSheet] = React.useState(0);
  const info = React.useMemo(() => (file ? describeFile({ name: file.name, url: file.url, mime: file.mimeType }) : null), [file]);

  React.useEffect(() => {
    setLoaded(null);
    setError(null);
    setSheet(0);
    if (!file || !info) return;
    let alive = true;
    let blob: string | null = null;
    setLoading(true);
    loadFile(file, info)
      .then((r) => {
        if (r?.kind === "pdf") blob = r.blobUrl;
        if (alive) setLoaded(r);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error && e.message === "too-large" ? "too-large" : "failed"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [file, info]);

  React.useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, onClose]);

  if (!file || !info || typeof document === "undefined") return null;

  const body = (() => {
    if (loading) return <div className="p-10 text-center text-sm text-muted-foreground">{t("fileViewer.loading")}</div>;
    if (error) return <div className="p-10 text-center text-sm text-muted-foreground">{error === "too-large" ? t("fileViewer.tooLarge") : t("fileViewer.failed")}</div>;
    if (info.previewer === "image") return <img src={file.url} alt={info.name} className="mx-auto max-h-full max-w-full object-contain" />;
    if (info.previewer === "video") return <video src={file.url} controls className="mx-auto max-h-full max-w-full" />;
    if (info.previewer === "audio") return <audio src={file.url} controls className="mx-auto mt-10 w-full max-w-xl" />;
    if (!loaded) return <div className="p-10 text-center text-sm text-muted-foreground">{t("fileViewer.noPreview")}</div>;
    switch (loaded.kind) {
      case "pdf":
        return <iframe src={loaded.blobUrl} title={info.name} className="h-full w-full rounded-md border border-border bg-white" />;
      case "html":
        return <iframe srcDoc={loaded.html} sandbox="" title={info.name} className="h-full w-full rounded-md border border-border bg-white" />;
      case "markdown":
        return (
          <div className="prose prose-sm mx-auto max-w-3xl dark:prose-invert">
            <ReactMarkdown>{loaded.text}</ReactMarkdown>
          </div>
        );
      case "text":
        return (
          <>
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-xs">{loaded.text}</pre>
            {loaded.truncated ? <p className="mt-2 text-center text-xs text-muted-foreground">{t("fileViewer.truncated")}</p> : null}
          </>
        );
      case "paragraphs":
        return (
          <div className="mx-auto max-w-3xl space-y-2 text-sm leading-relaxed">
            {loaded.lines.map((l, i) => (l.trim() ? <p key={i} className={l.startsWith("#") ? "mt-3 font-semibold" : ""}>{l.replace(/^#+ /, "")}</p> : <div key={i} className="h-2" />))}
          </div>
        );
      case "slides":
        return (
          <div className="mx-auto grid max-w-3xl gap-3">
            {loaded.slides.map((s, i) => (
              <div key={i} className="rounded-md border border-border bg-card p-4">
                <div className="mb-2 text-[11px] font-medium text-muted-foreground">{t("fileViewer.slide", { n: i + 1 })}</div>
                {s.map((line, j) => (
                  <p key={j} className={j === 0 ? "text-sm font-semibold" : "text-xs"}>{line}</p>
                ))}
              </div>
            ))}
          </div>
        );
      case "table":
        return (
          <>
            {loaded.sheets.length > 1 ? (
              <div className="mb-2 flex flex-wrap gap-1">
                {loaded.sheets.map((s, i) => (
                  <button key={i} type="button" onClick={() => setSheet(i)} className={`rounded-md border px-2 py-1 text-xs ${i === sheet ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            ) : null}
            <Grid rows={loaded.sheets[sheet]?.rows ?? []} />
            <p className="mt-2 text-center text-xs text-muted-foreground">{t("fileViewer.rowsShown", { n: loaded.sheets[sheet]?.rows.length ?? 0 })}</p>
          </>
        );
      case "zip":
        return (
          <ul className="divide-y divide-border rounded-md border border-border text-xs">
            {loaded.entries.map((e) => (
              <li key={e.name} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="truncate font-mono">{e.name}</span>
                <span className="shrink-0 text-muted-foreground">{e.directory ? "" : humanSize(e.size)}</span>
              </li>
            ))}
          </ul>
        );
      default:
        return null;
    }
  })();

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={info.name}>
      <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <FileTypeIcon category={info.category} className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{info.name || t("brickRenderer.defaultDocTitle")}</div>
            <div className="text-[11px] text-muted-foreground">{[info.label, humanSize(file.sizeBytes)].filter(Boolean).join(" · ")}</div>
          </div>
          <a href={file.url} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title={t("fileViewer.openNew")}>
            <ExternalLink className="h-4 w-4" />
          </a>
          <a href={file.url} download={info.name || undefined} className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
            <Download className="h-3.5 w-3.5" />
            {t("brickRenderer.download")}
          </a>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label={t("fileViewer.close")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{body}</div>
      </div>
    </div>,
    document.body,
  );
}
