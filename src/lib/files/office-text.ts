/** Text extraction from OOXML / OpenDocument XML, with regexes so it runs (and is tested) without a DOM. */
import { listZip, readZipText } from "./zip-reader.ts";

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
export const decodeXml = (s: string): string =>
  s
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)));

/** `<w:p>` paragraphs of a docx document.xml, with tabs and breaks. */
export function docxParagraphs(xml: string): string[] {
  const out: string[] = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)].map((m) => (m[1] != null ? m[1] : m[0].startsWith("<w:tab") ? "\t" : "\n")).join("");
    const style = /<w:pStyle w:val="([^"]+)"/.exec(p)?.[1] ?? "";
    const heading = /^Heading(\d)/i.exec(style);
    out.push(decodeXml(heading ? `${"#".repeat(Math.min(6, Number(heading[1])))} ${text}` : text));
  }
  return out;
}

/** Slide texts of a pptx: one array of paragraphs per slide, in slide order. */
export function pptxSlideTexts(slideXml: string): string[] {
  return (slideXml.match(/<a:p>[\s\S]*?<\/a:p>|<a:p [\s\S]*?<\/a:p>/g) ?? [])
    .map((p) => decodeXml([...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join("")))
    .filter((t) => t.trim());
}

/** Column letters ("AB") to a 0-based index. */
export const columnIndex = (ref: string): number => {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export function sharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  return (xml.match(/<si>[\s\S]*?<\/si>|<si [\s\S]*?<\/si>/g) ?? []).map((si) => decodeXml([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")));
}

/** Rows of an xlsx worksheet as strings (shared strings resolved; formulas show their cached value). */
export function sheetRows(xml: string, strings: string[], maxRows = 500, maxCols = 60): string[][] {
  const rows: string[][] = [];
  for (const row of xml.match(/<row[ >][\s\S]*?<\/row>/g) ?? []) {
    if (rows.length >= maxRows) break;
    const cells: string[] = [];
    for (const c of row.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? "";
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const idx = ref ? columnIndex(ref) : cells.length;
      if (idx >= maxCols) continue;
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s" && v != null) value = strings[Number(v)] ?? "";
      else if (type === "inlineStr") value = decodeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v != null) value = decodeXml(v);
      while (cells.length < idx) cells.push("");
      cells[idx] = value;
    }
    rows.push(cells);
  }
  return rows;
}

export interface SheetData {
  name: string;
  rows: string[][];
}

export async function readXlsx(buf: ArrayBuffer | Uint8Array): Promise<SheetData[]> {
  const entries = listZip(buf);
  const strings = sharedStrings(await readZipText(buf, entries, "xl/sharedStrings.xml"));
  const workbook = (await readZipText(buf, entries, "xl/workbook.xml")) ?? "";
  const rels = (await readZipText(buf, entries, "xl/_rels/workbook.xml.rels")) ?? "";
  const target = new Map([...rels.matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"|<Relationship [^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"/g)].map((m) => [m[1] ?? m[4], m[2] ?? m[3]] as const));
  const sheets: SheetData[] = [];
  for (const s of workbook.matchAll(/<sheet [^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"/g)) {
    const t = target.get(s[2]);
    if (!t) continue;
    const path = t.startsWith("/") ? t.slice(1) : `xl/${t}`;
    const xml = await readZipText(buf, entries, path);
    if (xml != null) sheets.push({ name: decodeXml(s[1]), rows: sheetRows(xml, strings) });
  }
  return sheets;
}

export async function readDocx(buf: ArrayBuffer | Uint8Array): Promise<string[]> {
  const entries = listZip(buf);
  const xml = await readZipText(buf, entries, "word/document.xml");
  if (xml == null) throw new Error("Not a Word document");
  return docxParagraphs(xml);
}

export async function readPptx(buf: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const entries = listZip(buf);
  const slides = entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.name)).sort((a, b) => Number(/(\d+)\.xml$/.exec(a.name)?.[1]) - Number(/(\d+)\.xml$/.exec(b.name)?.[1]));
  const out: string[][] = [];
  for (const s of slides) out.push(pptxSlideTexts((await readZipText(buf, entries, s.name)) ?? ""));
  return out;
}

/** OpenDocument (odt / ods / odp): text of content.xml, paragraphs and headings, plus table rows. */
export async function readOdf(buf: ArrayBuffer | Uint8Array): Promise<string[]> {
  const entries = listZip(buf);
  const xml = await readZipText(buf, entries, "content.xml");
  if (xml == null) throw new Error("Not an OpenDocument file");
  const out: string[] = [];
  for (const m of xml.matchAll(/<text:(h|p)\b[^>]*>([\s\S]*?)<\/text:\1>|<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/g)) {
    if (m[3] != null) {
      const cells = [...m[3].matchAll(/<table:table-cell\b[^>]*>([\s\S]*?)<\/table:table-cell>/g)].map((c) => decodeXml(c[1].replace(/<[^>]+>/g, "")));
      if (cells.some(Boolean)) out.push(cells.join("\t"));
    } else {
      out.push(decodeXml(m[2].replace(/<text:tab\/>/g, "\t").replace(/<text:line-break\/>/g, "\n").replace(/<[^>]+>/g, "")));
    }
  }
  return out;
}

/** Quick text of an RTF file: control words stripped. */
export function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'([0-9a-f]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\{\\\*[^{}]*\}/g, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n +/g, "\n")
    .trim();
}
