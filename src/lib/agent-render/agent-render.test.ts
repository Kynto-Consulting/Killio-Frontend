import assert from 'node:assert/strict';
import test from 'node:test';

import { assetToBlock, buildAssistantRender, classifyAsset, dropOrphanAssetOpenTags, stripPartialAssistantTags } from './blocks.ts';
import { decodeBrickJson, resolveBrickPayload } from './brick-json.ts';

const types = (text: string, streaming = false) => buildAssistantRender(text, { streaming }).blocks.map((b) => b.type);

test('plain markdown is one markdown block and keeps its formatting', () => {
  const r = buildAssistantRender('## Hola\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |');
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0]!.type, 'markdown');
  assert.match((r.blocks[0] as { text: string }).text, /\| x \| y \|/);
  assert.equal(r.hasContent, true);
  assert.equal(r.partialAsset, false);
});

test('empty / null input yields no content and never throws', () => {
  for (const v of [undefined, null, '', '   ']) {
    const r = buildAssistantRender(v as string);
    assert.deepEqual(r.blocks, []);
    assert.equal(r.hasContent, false);
  }
});

test('a brick asset tag becomes a brick block between two markdown blocks', () => {
  const text = 'Antes.\n<asset type="brick" kind="beautiful_table" title="Resultados">{"rows": [["Col1", "Col2"], ["Val1", "Val2"]]}</asset>\nDespués.';
  const r = buildAssistantRender(text);
  assert.deepEqual(r.blocks.map((b) => b.type), ['markdown', 'brick', 'markdown']);
  const brick = r.blocks[1] as Extract<(typeof r.blocks)[number], { type: 'brick' }>;
  assert.equal(brick.kind, 'beautiful_table');
  assert.equal(brick.title, 'Resultados');
  assert.deepEqual(brick.content.rows, [['Col1', 'Col2'], ['Val1', 'Val2']]);
  assert.equal(r.text, 'Antes.\n\nDespués.');
});

test('brick kind falls back to the json, then to nested content.kind, then to text; chart aliases to graph', () => {
  assert.equal(resolveBrickPayload(undefined, { kind: 'checklist', items: ['a'] })!.kind, 'checklist');
  assert.equal(resolveBrickPayload(undefined, { content: { kind: 'quote', text: 'x' } })!.kind, 'quote');
  assert.equal(resolveBrickPayload(undefined, { markdown: 'hi' })!.kind, 'text');
  assert.equal(resolveBrickPayload('chart', { type: 'bar' })!.kind, 'graph');
  assert.equal(resolveBrickPayload('table', {}), null);
});

test('checklist string items are normalised into renderable items', () => {
  const p = resolveBrickPayload('checklist', { items: ['uno', { text: 'dos', done: true }] })!;
  assert.deepEqual(p.content.items, [
    { id: 'item-0', label: 'uno', checked: false },
    { id: 'item-1', text: 'dos', done: true, label: 'dos', checked: true },
  ]);
});

test('decodeBrickJson handles html entities, escaped quotes and fences', () => {
  assert.deepEqual(decodeBrickJson('{&quot;a&quot;: 1}'), { a: 1 });
  assert.deepEqual(decodeBrickJson('{\\"a\\": \\"b\\"}'), { a: 'b' });
  assert.deepEqual(decodeBrickJson('```json\n{"a": 2}\n```'), { a: 2 });
  assert.deepEqual(decodeBrickJson('{&quot;a&quot;: &quot;&lt;b&gt; &amp;&quot;}'), { a: '<b> &' });
});

test('decodeBrickJson does not corrupt valid JSON that contains escaped quotes', () => {
  assert.deepEqual(decodeBrickJson('{"t": "dijo \\"hola\\""}'), { t: 'dijo "hola"' });
});

test('decodeBrickJson accepts double-encoded JSON and rejects non-objects', () => {
  assert.deepEqual(decodeBrickJson(JSON.stringify('{"a":1}')), { a: 1 });
  assert.equal(decodeBrickJson('[1,2,3]'), null);
  assert.equal(decodeBrickJson('42'), null);
  assert.equal(decodeBrickJson(''), null);
  assert.equal(decodeBrickJson(undefined), null);
});

test('malformed brick JSON degrades to a text fallback, never throws', () => {
  const text = 'Mira:\n<asset type="brick" kind="table" title="Roto">{"rows": [["a", "b"],</asset>\nFin.';
  let r!: ReturnType<typeof buildAssistantRender>;
  assert.doesNotThrow(() => { r = buildAssistantRender(text); });
  assert.deepEqual(r.blocks.map((b) => b.type), ['markdown', 'brick-fallback', 'markdown']);
  const fb = r.blocks[1] as { text: string; title?: string };
  assert.equal(fb.title, 'Roto');
  assert.match(fb.text, /"rows"/);
});

test('a brick with an empty body (or `{}`) renders nothing instead of an empty card', () => {
  assert.deepEqual(types('<asset type="brick" kind="text" />'), []);
  assert.deepEqual(types('<asset type="brick" kind="text">{}</asset>'), []);
});

test('an image asset tag becomes an image block', () => {
  const r = buildAssistantRender('Aquí:\n<asset type="img" src="https://x.test/a.png" title="Foto" />');
  assert.deepEqual(r.blocks.map((b) => b.type), ['markdown', 'image']);
  const img = r.blocks[1] as { src: string; title?: string };
  assert.equal(img.src, 'https://x.test/a.png');
  assert.equal(img.title, 'Foto');
});

test('asset routing: uploads are files, entities/iframes are portals, unknown is other', () => {
  assert.equal(classifyAsset({ type: 'document', src: '/uploads/x.pdf' }), 'file');
  assert.equal(classifyAsset({ type: 'document', src: 'uuid' }), 'portal');
  assert.equal(classifyAsset({ type: 'kanban', src: 'uuid' }), 'portal');
  assert.equal(classifyAsset({ type: 'iframe', src: '/d/1' }), 'portal');
  assert.equal(classifyAsset({ type: 'pdf', src: 'https://x/y.pdf' }), 'file');
  assert.equal(classifyAsset({ type: 'img', src: '' }), 'other');
  assert.equal(classifyAsset({ type: 'weird', src: 'x' }), 'other');
  assert.equal(classifyAsset(undefined), 'other');
  assert.equal(assetToBlock('k', { type: 'weird' }, '').type, 'other-asset');
});

test('tool_status / tool_output / invoke tags are stripped from the visible content', () => {
  const text = 'Voy a mirar.\n<invoke id="t1" name="board_get"><parameters><id>1</id></parameters></invoke>\n<tool_status id="t1">done</tool_status>\n<tool_output id="t1">{"big":"payload"}</tool_output>\nListo, son 3 listas.';
  const r = buildAssistantRender(text);
  assert.ok(r.blocks.every((b) => b.type === 'markdown'));
  assert.ok(!/tool_status|tool_output|invoke|payload/.test(r.text));
  assert.match(r.text, /Voy a mirar/);
  assert.match(r.text, /Listo, son 3 listas/);
});

test('streaming: an unfinished <asset at the end never flashes raw', () => {
  for (const tail of ['<asset', '<asset type="brick" kind="tab', '<asset type="img" src="https://x/a.png" /', '<asset type="brick" kind="table">{"rows": [["a"']) {
    const r = buildAssistantRender(`Aquí va:\n${tail}`, { streaming: true });
    assert.deepEqual(r.blocks.map((b) => b.type), ['markdown'], tail);
    assert.equal(r.text, 'Aquí va:', tail);
    assert.equal(r.partialAsset, true, tail);
  }
});

test('streaming: a trailing prefix of a tag is held back, plain "<" prose survives when final', () => {
  assert.equal(buildAssistantRender('Hola <', { streaming: true }).text, 'Hola');
  assert.equal(buildAssistantRender('Hola <as', { streaming: true }).text, 'Hola');
  assert.equal(buildAssistantRender('Hola <inv', { streaming: true }).text, 'Hola');
  assert.equal(buildAssistantRender('x < y', { streaming: true }).text, 'x < y');
  assert.equal(buildAssistantRender('Hola <', { streaming: false }).text, 'Hola <');
});

test('streaming: a complete asset earlier in the text still renders while the tail is partial', () => {
  const r = buildAssistantRender('<asset type="img" src="https://x/a.png" />\nY ahora <asset type="brick" kin', { streaming: true });
  assert.deepEqual(r.blocks.map((b) => b.type), ['image', 'markdown']);
  assert.equal(r.text, 'Y ahora');
});

test('streaming: partial tool call is flagged, not shown', () => {
  const r = buildAssistantRender('Un momento.\n<invoke id="t1" name="board_get"><parameters><id>', { streaming: true });
  assert.equal(r.partialTool, true);
  assert.equal(r.text, 'Un momento.');
});

test('final message with an unclosed asset tag drops only the tag, keeps the prose', () => {
  const r = buildAssistantRender('Antes <asset type="brick" kind="table"> después', { streaming: false });
  assert.match(r.text, /^Antes\s+después$/);
  assert.ok(!r.text.includes('<asset'));
});

test('asset tags quoted inside inline code are not treated as partial tags', () => {
  const r = buildAssistantRender('Usa `<asset type="img" src="x" />` así.', { streaming: false });
  assert.match(r.text, /`<asset type="img"/);
});

test('stripPartialAssistantTags is a no-op on clean text', () => {
  assert.deepEqual(stripPartialAssistantTags('texto normal', true), { clean: 'texto normal', partial: false });
});

test('the real prompt example round-trips', () => {
  const r = buildAssistantRender('<asset type="brick" kind="beautiful_table" title="Results">{"rows": [["Col1", "Col2"], ["Val1", "Val2"]]}</asset>');
  assert.deepEqual(r.blocks.map((b) => b.type), ['brick']);
});

test('a prose mention of <asset type="brick"> before the real tag does not swallow the real brick', () => {
  const text = 'Te lo dejo usando <asset type="brick">:\n\nTabla — Top 3\n<asset type="brick" kind="beautiful_table" title="T">{"content":{"rows":[["a","b"]]}}</asset>\nFin.';
  const r = buildAssistantRender(text);
  assert.deepEqual(r.blocks.map((b) => b.type), ['markdown', 'brick', 'markdown']);
  assert.equal((r.blocks[1] as { kind: string }).kind, 'beautiful_table');
  assert.ok(!r.text.includes('<asset'));
});

test('dropOrphanAssetOpenTags leaves well-formed sequences untouched', () => {
  const ok = '<asset type="img" src="a" />\n<asset type="brick" kind="text">{"markdown":"x"}</asset>\n<asset type="brick" kind="text">{"markdown":"y"}</asset>';
  assert.equal(dropOrphanAssetOpenTags(ok), ok);
  assert.equal(dropOrphanAssetOpenTags(null), '');
});
