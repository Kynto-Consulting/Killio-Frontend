import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceCatalog, filterCatalog } from './source-catalog.ts';

const input = {
  tables: [{ id: 'b1', title: 'Ventas', columns: ['Cliente', 'Monto'], rows: [[1], [2]] }],
  files: [
    { id: 'file:1', name: 'ventas.csv', kind: 'csv', size: 2048, where: 'document' as const, refTitle: 'Prueba KQL' },
    { id: 'file:2', name: 'datos.xlsx', kind: 'xlsx', size: 3_000_000, sheets: ['A', 'B'], where: 'card' as const, refTitle: 'Tarea 1' },
    { id: 'file:3', name: 'datos.xlsx', kind: 'xlsx', size: 10, where: 'card' as const, refTitle: 'Tarea 2' },
  ],
  queryTables: [
    { id: 'shared:s1', name: 'Clientes', origin: 'shared' as const, columns: ['Nombre'], rows: 4 },
    { id: 'b1', name: 'Ventas', origin: 'document' as const, columns: ['Cliente'], refTitle: 'Prueba KQL' },
    { id: 'b9', name: 'Gastos', origin: 'document' as const, columns: ['Rubro'], refTitle: 'Otro doc' },
  ],
  queries: [{ id: 'q1', name: 'Query1' }, { id: 'q2', name: 'Query2' }],
  currentQueryId: 'q1',
};

test('groups every source available in the context, by where it lives', () => {
  const groups = buildSourceCatalog(input);
  // the open document (its title is known from the team's table list) is ONE block: its tables, its files and its folders
  assert.deepEqual(groups.map((g) => g.id), ['owner:document:prueba kql', 'queries', 'shared', 'owner:document:otro doc', 'owner:card:tarea 1', 'owner:card:tarea 2', 'builtin']);
  assert.equal(groups[0].current, true);
  assert.deepEqual(groups[0].items.map((i) => i.name), ['Ventas', 'ventas.csv', 'bricks', 'comments']); // checklists hang under bricks
  assert.equal(groups[0].items[0].rows, 2);
  assert.deepEqual(groups[0].items[2].where, { field: 'document', value: 'Prueba KQL' });
  assert.equal(groups[0].items[2].expand, 'bricks');
  assert.deepEqual(groups[1].items.map((i) => i.name), ['Query2']); // not the query being edited
  assert.deepEqual(groups[2].items[0].source, { kind: 'rows', name: 'shared:Clientes' });
  assert.deepEqual(groups[3].items.map((i) => i.name), ['Gastos', 'bricks', 'comments']);
  assert.equal(groups[4].ownerKind, 'card');
  assert.deepEqual(groups[4].items.map((i) => i.name), ['datos.xlsx', 'items', 'comments']); // cards: checklist items and comments, no bricks list
  const ventas = groups.flatMap((g) => g.items).filter((i) => i.name === 'Ventas');
  assert.equal(ventas.length, 1); // never listed twice
  // attachments are not a workspace-wide source: they live under their document or card
  assert.ok(!groups[groups.length - 1].items.some((i) => i.name === 'attachments' || i.name === 'bricks' || i.name === 'items' || i.name === 'tags' || i.name === 'comments'));
});

test('files with a repeated name are qualified by where they are attached', () => {
  const files = buildSourceCatalog(input).filter((g) => g.kind === 'owner').flatMap((g) => g.items.filter((i) => i.id.startsWith('f:')));
  const byId = Object.fromEntries(files.map((f) => [f.id, f]));
  assert.equal(byId['f:file:1'].source.name, 'ventas.csv');
  assert.equal(byId['f:file:2'].source.name, 'card:Tarea 1 / datos.xlsx');
  assert.match(byId['f:file:2'].detail, /XLSX · 2\.9 MB · 2 sheets/);
});

test('filter by words over owner, name, detail and columns', () => {
  const groups = buildSourceCatalog(input);
  assert.deepEqual(filterCatalog(groups, 'monto').map((g) => g.id), ['owner:document:prueba kql']);
  assert.deepEqual(filterCatalog(groups, 'xlsx 10').flatMap((g) => g.items.map((i) => i.id)), ['f:file:3']);
  assert.deepEqual(filterCatalog(groups, 'tarea mb').flatMap((g) => g.items.map((i) => i.id)), ['f:file:2']);
  assert.equal(filterCatalog(groups, '').length, groups.length);
  assert.deepEqual(filterCatalog(groups, 'zzzz'), []);
});
