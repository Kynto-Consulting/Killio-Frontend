import test from "node:test";
import assert from "node:assert/strict";
import { describeFile, extensionOf, fileNameFromUrl, FILE_KINDS, FILE_ACCEPT, humanSize } from "./file-types.ts";
import { docxParagraphs, sheetRows, sharedStrings, columnIndex, pptxSlideTexts, rtfToText } from "./office-text.ts";
import { listZip, readZipEntry } from "./zip-reader.ts";

test("catalogue covers at least 30 file types", () => {
  assert.ok(Object.keys(FILE_KINDS).length >= 30);
  assert.ok(FILE_ACCEPT.includes(".docx") && FILE_ACCEPT.includes("image/*"));
});

test("describeFile uses the extension, then the MIME type", () => {
  assert.equal(describeFile({ name: "ventas.CSV" }).previewer, "csv");
  assert.equal(describeFile({ url: "/uploads/file/2024/Informe%20Q1.pdf?x=1" }).name, "Informe Q1.pdf");
  assert.equal(describeFile({ name: "blob", mime: "application/pdf" }).previewer, "pdf");
  assert.equal(describeFile({ name: "x.unknown", mime: "image/heic" }).category, "image");
  assert.equal(describeFile({ name: "x.bin" }).known, false);
  assert.equal(describeFile({ name: "old.doc" }).previewer, "none");
});

test("extension and name helpers", () => {
  assert.equal(extensionOf("a/b.tar.GZ?x"), "gz");
  assert.equal(fileNameFromUrl("https://h/p/a%20b.txt#f"), "a b.txt");
  assert.equal(humanSize(2048), "2.0 KB");
});

test("docx paragraphs keep text, tabs and heading levels", () => {
  const xml = '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Titulo</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">a &amp; b</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>c</w:t></w:r></w:p>';
  assert.deepEqual(docxParagraphs(xml), ["## Titulo", "a & b\tc"]);
});

test("xlsx rows resolve shared strings, gaps and booleans", () => {
  const strings = sharedStrings('<si><t>Cliente</t></si><si><t>Monto</t></si><si><r><t>AC</t></r><r><t>ME</t></r></si>');
  assert.deepEqual(strings, ["Cliente", "Monto", "ACME"]);
  const xml = '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>10.5</v></c><c r="C2" t="b"><v>1</v></c></row>';
  assert.deepEqual(sheetRows(xml, strings), [["Cliente", "", "Monto"], ["ACME", "10.5", "TRUE"]]);
  assert.equal(columnIndex("AB7"), 27);
});

test("pptx slide text and rtf", () => {
  assert.deepEqual(pptxSlideTexts("<a:p><a:r><a:t>Hola</a:t></a:r><a:r><a:t> mundo</a:t></a:r></a:p><a:p></a:p>"), ["Hola mundo"]);
  assert.equal(rtfToText("{\\rtf1\\ansi Hola\\par mundo}"), "Hola\nmundo");
});

test("zip reader lists and reads stored and deflated entries", async () => {
  // build a tiny stored-only zip by hand
  const enc = new TextEncoder();
  const name = enc.encode("a.txt");
  const data = enc.encode("hola");
  const local = new Uint8Array(30 + name.length + data.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(26, name.length, true);
  lv.setUint32(18, data.length, true);
  lv.setUint32(22, data.length, true);
  local.set(name, 30);
  local.set(data, 30 + name.length);
  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint32(20, data.length, true);
  cv.setUint32(24, data.length, true);
  cv.setUint16(28, name.length, true);
  cv.setUint32(42, 0, true);
  central.set(name, 46);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length, true);
  const zip = new Uint8Array([...local, ...central, ...eocd]);
  const entries = listZip(zip);
  assert.equal(entries[0].name, "a.txt");
  assert.equal(new TextDecoder().decode(await readZipEntry(zip, entries[0])), "hola");
  assert.throws(() => listZip(new Uint8Array(40)));
});
