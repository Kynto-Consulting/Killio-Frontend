import assert from 'node:assert/strict';
import test from 'node:test';

import { createSaveGate, DRAFT_MAX_BYTES, DRAFT_PREFIX, clearDraft, draftKey, readDraft, restorableDraft, saveDraft, savedAtOf } from './draft.ts';
import { escapeDecision, popupCount, registerPopup, resetPopups, type EscapeContext } from './escape.ts';
import { emptyGraph, makeNode, normalizeGraph } from './defaults.ts';
import {
  activeSession, applySession, cancelSession, closeSession, getSession, getSnapshot, isPrimaryHost, openSession, ownerPresent, registerHost, registerOwner, resetSessions, sameTables,
  subscribe, tablesSignature, updateDraft, updateTables,
} from './session-store.ts';
import type { FlowGraph } from './types.ts';
import type { KqlTable } from '../query/kql.ts';

const table = (id: string, rows = 2): KqlTable => ({ id, title: `T ${id}`, kind: 'table', columns: ['A', 'B'], rows: Array.from({ length: rows }, (_, i) => ({ id: `${id}:${i}` }) as never) });
const graphWith = (n: number): FlowGraph => ({ ...emptyGraph(), nodes: Array.from({ length: n }, () => makeNode('source', { x: 0, y: 0 }, { kind: 'cards', name: '' })) });
const ctx = (patch: Partial<EscapeContext> = {}): EscapeContext => ({ defaultPrevented: false, targetTag: 'DIV', isContentEditable: false, insideFloating: false, expanded: false, popups: 0, dirty: false, ...patch });

// ── (a) Escape ───────────────────────────────────────────────────────────────
test('Escape closes the editor only when nothing inside it used the key', () => {
  assert.equal(escapeDecision(ctx()), 'close');
  assert.equal(escapeDecision(ctx({ dirty: true })), 'confirm');
  assert.equal(escapeDecision(ctx({ defaultPrevented: true })), 'ignore');
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) assert.equal(escapeDecision(ctx({ targetTag: tag, dirty: true })), 'ignore', tag);
  assert.equal(escapeDecision(ctx({ isContentEditable: true })), 'ignore');
  assert.equal(escapeDecision(ctx({ insideFloating: true })), 'ignore');
  assert.equal(escapeDecision(ctx({ expanded: true })), 'ignore');
  assert.equal(escapeDecision(ctx({ popups: 1 })), 'ignore');
});

test('the popup registry counts what is open and cannot go negative', () => {
  resetPopups();
  const a = registerPopup();
  const b = registerPopup();
  assert.equal(popupCount(), 2);
  a();
  a();
  assert.equal(popupCount(), 1);
  b();
  assert.equal(popupCount(), 0);
  assert.equal(escapeDecision(ctx({ popups: popupCount() })), 'close');
});

// ── (b) session store ────────────────────────────────────────────────────────
test('a session survives the owner re-mounting and keeps the draft', () => {
  resetSessions();
  const first = openSession({ ownerId: 'brick:1', initialScript: 'cards', tables: [table('a')] });
  const unregister = registerOwner('brick:1', { onApply: () => undefined });
  updateDraft('brick:1', graphWith(2), true);
  // the brick unmounts (a refresh, a route change) ...
  unregister();
  assert.equal(ownerPresent('brick:1'), false);
  assert.ok(getSession('brick:1'), 'the editor is still open');
  // ... and mounts again: asking to open again returns the same session with the draft
  registerOwner('brick:1', { onApply: () => undefined });
  const again = openSession({ ownerId: 'brick:1', initialScript: 'cards' });
  assert.equal(again.ownerId, first.ownerId);
  assert.equal(getSession('brick:1')!.draft!.nodes.length, 2);
  assert.equal(getSession('brick:1')!.dirty, true);
  assert.equal(ownerPresent('brick:1'), true);
});

test('only the latest registration of an owner can unregister it (a stale cleanup does nothing)', () => {
  resetSessions();
  openSession({ ownerId: 'o' });
  const stale = registerOwner('o', { onApply: () => undefined });
  let applied = 0;
  registerOwner('o', { onApply: () => { applied++; } });
  stale();
  assert.equal(ownerPresent('o'), true);
  assert.equal(applySession('o', { script: 'cards', flow: emptyGraph() }), 'applied');
  assert.equal(applied, 1);
  assert.equal(getSession('o'), null, 'Close & Apply closes the session');
});

test('applying without an owner keeps the session and the result', () => {
  resetSessions();
  openSession({ ownerId: 'gone' });
  updateDraft('gone', graphWith(1), true);
  assert.equal(applySession('gone', { script: 'cards', flow: emptyGraph() }), 'owner-gone');
  assert.ok(getSession('gone'));
  assert.equal(getSession('gone')!.draft!.nodes.length, 1);
});

test('plain Apply keeps the session open and marks it clean; cancel tells the owner', () => {
  resetSessions();
  openSession({ ownerId: 'o' });
  let closed = 0;
  let seen: boolean | undefined;
  registerOwner('o', { onApply: (_v, options) => { seen = options?.keepOpen; }, onClose: () => { closed++; } });
  updateDraft('o', graphWith(1), true);
  assert.equal(applySession('o', { script: 'cards', flow: emptyGraph() }, { keepOpen: true }), 'applied');
  assert.equal(seen, true);
  assert.equal(getSession('o')!.dirty, false);
  cancelSession('o');
  assert.equal(closed, 1);
  assert.equal(getSession('o'), null);
  cancelSession('o');
  assert.equal(closed, 1, 'a closed session cannot be cancelled twice');
});

test('one session per owner, the last opened is the active one, listeners hear every change', () => {
  resetSessions();
  let calls = 0;
  const off = subscribe(() => { calls++; });
  openSession({ ownerId: 'a' });
  openSession({ ownerId: 'b' });
  assert.equal(activeSession()!.ownerId, 'b');
  openSession({ ownerId: 'a' });
  assert.equal(getSnapshot().sessions.length, 2);
  assert.equal(activeSession()!.ownerId, 'a');
  closeSession('a');
  assert.equal(activeSession()!.ownerId, 'b');
  assert.ok(calls >= 4);
  off();
  const before = calls;
  closeSession('b');
  assert.equal(calls, before);
});

test('the first mounted host draws the editor', () => {
  resetSessions();
  const layout = registerHost('layout');
  const inBrick = registerHost('brick');
  assert.equal(isPrimaryHost('layout'), true);
  assert.equal(isPrimaryHost('brick'), false);
  layout();
  assert.equal(isPrimaryHost('brick'), true);
  inBrick();
  assert.equal(isPrimaryHost('brick'), false);
});

// ── (c) tables identity ──────────────────────────────────────────────────────
test('a new tables array with the same content changes nothing (no reset of the model)', () => {
  resetSessions();
  const tables = [table('a'), table('b')];
  openSession({ ownerId: 'o', tables });
  updateDraft('o', graphWith(3), true);
  const sessionBefore = getSession('o')!;
  const sameContent = [table('a'), table('b')];
  assert.notEqual(sameContent, tables);
  assert.ok(sameTables(tables, sameContent));
  let notified = 0;
  const off = subscribe(() => { notified++; });
  updateTables('o', sameContent);
  off();
  assert.equal(notified, 0, 'no store change');
  assert.equal(getSession('o'), sessionBefore, 'same session object');
  assert.equal(getSession('o')!.tables, tables, 'same tables array');
  assert.equal(getSession('o')!.draft!.nodes.length, 3);
  // a real change (another row count or table) does update, and still keeps the draft
  updateTables('o', [table('a'), table('b', 5)]);
  assert.notEqual(getSession('o')!.tables, tables);
  assert.equal(getSession('o')!.draft!.nodes.length, 3);
  assert.notEqual(tablesSignature([table('a')]), tablesSignature([table('b')]));
});

// ── draft safety ─────────────────────────────────────────────────────────────
function memoryStorage() {
  const map = new Map<string, string>();
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
}

test('drafts are saved per owner and read back', () => {
  const s = memoryStorage();
  assert.equal(saveDraft(s, 'o1', graphWith(2), 1000), true);
  assert.ok(s.map.has(`${DRAFT_PREFIX}o1`));
  assert.equal(draftKey('o1'), `${DRAFT_PREFIX}o1`);
  const read = readDraft(s, 'o1')!;
  assert.equal(read.updatedAt, 1000);
  assert.equal(read.graph.nodes.length, 2);
  assert.equal(readDraft(s, 'other'), null);
  clearDraft(s, 'o1');
  assert.equal(readDraft(s, 'o1'), null);
});

test('a draft is offered only when it is newer than the saved flow and different from it', () => {
  const saved = graphWith(1);
  const savedJson = JSON.stringify(saved);
  const draft = { ownerId: 'o', updatedAt: 5000, graph: graphWith(3) };
  assert.equal(restorableDraft(draft, { savedAt: 4000 }, savedJson), draft, 'newer');
  assert.equal(restorableDraft(draft, { savedAt: 5000 }, savedJson), null, 'same time');
  assert.equal(restorableDraft(draft, { savedAt: 9000 }, savedJson), null, 'older than the saved flow');
  assert.equal(restorableDraft(draft, undefined, savedJson), draft, 'a flow saved before drafts existed');
  assert.equal(restorableDraft({ ...draft, graph: saved }, undefined, savedJson), null, 'identical content');
  assert.equal(restorableDraft(null, undefined, savedJson), null);
  assert.equal(savedAtOf({ savedAt: 12 }), 12);
  assert.equal(savedAtOf({ savedAt: 'x' }), 0);
  assert.equal(savedAtOf(null), 0);
});

test('oversize, corrupt and malformed drafts are ignored; storage failures never throw', () => {
  const s = memoryStorage();
  const big: FlowGraph = { ...graphWith(1), nodes: [{ ...graphWith(1).nodes[0], data: { kind: 'advanced', script: 'x'.repeat(DRAFT_MAX_BYTES + 10) } }] };
  assert.equal(saveDraft(s, 'o', graphWith(1)), true);
  assert.equal(saveDraft(s, 'o', big), false, 'too big: not saved');
  assert.equal(readDraft(s, 'o')!.graph.nodes.length, 1, 'the previous draft is kept');
  s.map.set(draftKey('bad'), '{not json');
  assert.equal(readDraft(s, 'bad'), null);
  s.map.set(draftKey('shape'), JSON.stringify({ updatedAt: 1, graph: { nodes: 'x', edges: [] } }));
  assert.equal(readDraft(s, 'shape'), null);
  s.map.set(draftKey('huge'), 'y'.repeat(DRAFT_MAX_BYTES + 5));
  assert.equal(readDraft(s, 'huge'), null);
  const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  assert.equal(saveDraft(broken, 'o', graphWith(1)), false);
  assert.equal(readDraft(broken, 'o'), null);
  assert.doesNotThrow(() => clearDraft(broken, 'o'));
  assert.equal(saveDraft(null, 'o', graphWith(1)), false);
  // a restored draft goes through the same repair as any saved flow
  const restored = normalizeGraph(readDraft(s, 'o')!.graph);
  assert.ok(restored);
});

test('the save gate waits for 500 ms of quiet', () => {
  const gate = createSaveGate(500);
  assert.equal(gate.due(0), false);
  gate.touch(100);
  assert.equal(gate.due(400), false);
  assert.equal(gate.due(600), true);
  gate.touch(550);
  assert.equal(gate.due(600), false);
  gate.done();
  assert.equal(gate.due(5000), false);
});
