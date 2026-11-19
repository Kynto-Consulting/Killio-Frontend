import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { BUCKETS, COND_OP_KEYS, FLAG_NAMES, FN_ARGS, TRANSFORM_KINDS, VALUE_TYPES } from './labels.ts';
import { COLUMN_TYPES, OPS, opById, UNSUPPORTED_OPS } from './ops.ts';
import { parseCommand, RIBBON, ribbonLabelIds } from './ribbon-config.ts';
import { buildColumnMenu, menuLabelIds } from './column-menu-config.ts';
import { FLOW_TEMPLATES } from './templates.ts';
import { KQL_FUNCTION_CATALOG } from '../query/kql.ts';
import { COND_OPS, INLINE_TYPES, METRIC_KINDS, NODE_TYPES, OUTPUT_KINDS, SOURCE_KINDS, TRANSFORM_FNS } from './types.ts';

const root = new URL('../../', import.meta.url);
const load = (lang: string) => JSON.parse(readFileSync(new URL(`i18n/locales/${lang}/query-flow.json`, root), 'utf8')) as Record<string, unknown>;
const en = load('en');
const es = load('es');

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' && v !== null ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));
}
const has = (dict: Record<string, unknown>, key: string) => {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null || !(part in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' && cur.length > 0;
};

test('English and Spanish have the same keys', () => {
  assert.deepEqual(flatten(en).sort(), flatten(es).sort());
});

test('every literal t("...") key of the components exists in both languages', () => {
  const dir = new URL('components/query-flow/', root);
  const missing: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
    const text = readFileSync(new URL(file, dir), 'utf8');
    for (const m of text.matchAll(/\bt\(\s*"([^"$]+)"/g)) {
      for (const [lang, dict] of [['en', en], ['es', es]] as const) if (!has(dict, m[1])) missing.push(`${lang}:${m[1]} (${file})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every key built from a list exists in both languages', () => {
  const keys: string[] = [];
  for (const type of NODE_TYPES) keys.push(`nodes.${type}.title`, `nodes.${type}.hint`);
  for (const k of SOURCE_KINDS) keys.push(`source.kinds.${k}`);
  for (const op of COND_OPS) keys.push(`cond.ops.${COND_OP_KEYS[op]}`);
  for (const f of FLAG_NAMES) keys.push(`cond.flags.${f}`);
  for (const v of VALUE_TYPES) keys.push(`cond.types.${v}`);
  for (const b of BUCKETS) keys.push(`group.buckets.${b}`);
  for (const m of METRIC_KINDS) keys.push(`group.metricKinds.${m}`);
  for (const k of TRANSFORM_KINDS) keys.push(`transform.kinds.${k}`);
  for (const f of TRANSFORM_FNS) keys.push(`transform.fns.${f}`);
  for (const a of Object.values(FN_ARGS)) { if (a.a) keys.push(`transform.args.${a.a}`); if (a.b) keys.push(`transform.args.${a.b}`); }
  for (const k of OUTPUT_KINDS) keys.push(`output.kinds.${k}`);
  for (const o of OPS) keys.push(`ops.${o.id}`);
  for (const k of ['filterByValues', 'conditional', 'join', 'union']) keys.push(`ops.${k}`);
  for (const u of UNSUPPORTED_OPS) keys.push(`rb.${u}`);
  for (const id of ribbonLabelIds()) keys.push(`rb.${id}`);
  for (const type of ['text', 'number', 'date', 'boolean', 'empty'] as const) for (const id of menuLabelIds(buildColumnMenu({ type }))) keys.push(`cm.${id}`);
  for (const id of COLUMN_TYPES) keys.push(`typeMenu.${id}`);
  for (const c of ['Text', 'Number', 'Date & Time', 'List', 'Logical', 'Conversion', 'Aggregation', 'Row', 'Value', 'User functions', 'Parameters']) keys.push(`custom.categories.${c}`);
  for (const ty of INLINE_TYPES) keys.push(`enterData.types.${ty}`);
  for (const o of ['shared', 'document', 'card', 'file']) keys.push(`source.origins.${o}`);
  for (const c of KQL_FUNCTION_CATALOG) keys.push(`custom.categories.${c.category}`);
  for (const id of ['text', 'number', 'bool', 'date']) keys.push(`params.types.${id}`);
  for (const k of ['detectTypes', 'moveTo', 'filterBetween', 'filterWindow', 'filterEmpty', 'changeType']) keys.push(`ops.${k}`);
  for (const o of OPS) for (const p of o.params) keys.push(`params.${p.key}`);
  for (const tpl of FLOW_TEMPLATES) keys.push(`templates.${tpl.id}`);
  for (const ty of ['text', 'number', 'date', 'boolean', 'empty']) keys.push(`types.${ty}`);
  const missing = keys.filter((k) => !has(en, k) || !has(es, k));
  assert.deepEqual(missing, []);
});

test('every ribbon command points at something the editor can run', () => {
  const special = new Set(['conditional']);
  const commands: string[] = [];
  for (const groups of Object.values(RIBBON)) for (const g of groups) for (const item of g.items) {
    if (item.command) commands.push(item.command);
    for (const m of item.menu ?? []) if ('command' in m) commands.push(m.command);
  }
  const bad: string[] = [];
  for (const c of commands) {
    const { kind, id } = parseCommand(c);
    if (kind === 'op' || kind === 'dlg') { if (!opById(id)) bad.push(c); }
    else if (kind === 'new') { if (!opById(id) && !special.has(id)) bad.push(c); }
    else if (kind === 'x') { if (!['chooseColumns', 'groupBy', 'merge', 'append', 'fromCards', 'fromTable', 'fromFile', 'fromShared', 'enterData', 'params', 'function', 'sort', 'properties'].includes(id)) bad.push(c); }
    else if (kind === 'src') { if (id !== 'blank' && !SOURCE_KINDS.includes(id as never)) bad.push(c); }
    else if (kind === 'view') { if (!['querySettings', 'formulaBar', 'queriesPane', 'monospaced', 'showWhitespace', 'quality', 'distribution', 'profile', 'profileTop', 'profileAll', 'advanced', 'diagram', 'schema'].includes(id)) bad.push(c); }
    else if (kind === 'home') { if (!['apply', 'close', 'refresh'].includes(id)) bad.push(c); }
    else if (kind === 'col') { if (!['detectType'].includes(id)) bad.push(c); }
    else if (kind !== 'disabled') bad.push(c);
  }
  assert.deepEqual(bad, []);
  assert.ok(commands.length > 60);
});

test('the ribbon has the Power Query tabs and every unsupported operation is disabled with the engine flag', () => {
  assert.deepEqual(Object.keys(RIBBON), ['home', 'transform', 'addColumn', 'view', 'sources']);
  const disabled: string[] = [];
  for (const groups of Object.values(RIBBON)) for (const g of groups) for (const item of g.items) {
    if (item.engine) disabled.push(item.id);
    for (const m of item.menu ?? []) if ('engine' in m && m.engine) disabled.push(m.id);
  }
  for (const u of UNSUPPORTED_OPS) assert.ok(disabled.includes(u), u);
});
