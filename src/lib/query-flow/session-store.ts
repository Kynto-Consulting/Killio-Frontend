/**
 * Module-level store of the open editor sessions. The editor is shown from here (not from the state of whatever component asked
 * for it), so a re-render, a re-mount or a route change of the brick / pill dialog that opened it never closes it: the draft lives
 * in the store and the apply / cancel callbacks are looked up by owner when the user acts. Framework-free (useSyncExternalStore
 * friendly: `subscribe` + `getSnapshot`).
 */
import type { KqlTable } from '../query/kql.ts';
import type { FlowGraph } from './types.ts';

export interface ApplyValue { script: string; flow: FlowGraph }
export interface SessionOwner {
  onApply?: (value: ApplyValue, options?: { keepOpen?: boolean }) => void;
  onClose?: () => void;
}
export interface QueryFlowSession {
  /** Whoever asked for the editor (a brick id, a pill id...). One session per owner. */
  ownerId: string;
  initialScript: string;
  initialFlow: unknown;
  tables: KqlTable[];
  /** The graph being edited: survives the editor component being unmounted and mounted again. */
  draft: FlowGraph | null;
  dirty: boolean;
  openedAt: number;
}
export interface StoreState { sessions: QueryFlowSession[]; owners: Record<string, SessionOwner>; hosts: string[] }

let state: StoreState = { sessions: [], owners: {}, hosts: [] };
const listeners = new Set<() => void>();

function set(next: StoreState): void {
  state = next;
  for (const l of [...listeners]) l();
}

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getSnapshot = (): StoreState => state;
export const getServerSnapshot = (): StoreState => state;

/** Test helper: forget everything. */
export function resetSessions(): void {
  set({ sessions: [], owners: {}, hosts: [] });
}

/** Same tables (ids, titles, columns, row counts)? Used to keep the array identity, so a re-render with a new but identical array changes nothing. */
export function tablesSignature(tables: KqlTable[]): string {
  return tables.map((t) => `${t.id}\u0001${t.title}\u0001${t.columns.join('\u0002')}\u0001${t.rows.length}`).join('\u0003');
}
export const sameTables = (a: KqlTable[], b: KqlTable[]): boolean => a === b || tablesSignature(a) === tablesSignature(b);

export function getSession(ownerId: string): QueryFlowSession | null {
  return state.sessions.find((s) => s.ownerId === ownerId) ?? null;
}
/** The session the editor shows: the last one that was opened. */
export const activeSession = (): QueryFlowSession | null => state.sessions[state.sessions.length - 1] ?? null;

/** Opens (or returns the already open) session of an owner. */
export function openSession(args: { ownerId: string; initialScript?: string; initialFlow?: unknown; tables?: KqlTable[] }): QueryFlowSession {
  const existing = getSession(args.ownerId);
  if (existing) {
    // asking again must not reset what the user did: only a re-order so it becomes the active one
    set({ ...state, sessions: [...state.sessions.filter((s) => s !== existing), existing] });
    return existing;
  }
  const session: QueryFlowSession = { ownerId: args.ownerId, initialScript: args.initialScript ?? '', initialFlow: args.initialFlow, tables: args.tables ?? [], draft: null, dirty: false, openedAt: Date.now() };
  set({ ...state, sessions: [...state.sessions, session] });
  return session;
}

export function closeSession(ownerId: string): void {
  if (!getSession(ownerId)) return;
  set({ ...state, sessions: state.sessions.filter((s) => s.ownerId !== ownerId) });
}

function patchSession(ownerId: string, patch: Partial<QueryFlowSession>): void {
  const existing = getSession(ownerId);
  if (!existing) return;
  set({ ...state, sessions: state.sessions.map((s) => (s === existing ? { ...s, ...patch } : s)) });
}

export function updateDraft(ownerId: string, draft: FlowGraph, dirty: boolean): void {
  const s = getSession(ownerId);
  if (!s || (s.draft === draft && s.dirty === dirty)) return;
  patchSession(ownerId, { draft, dirty });
}

/** Keeps the old array when the new one has the same content. */
export function updateTables(ownerId: string, tables: KqlTable[]): void {
  const s = getSession(ownerId);
  if (!s || sameTables(s.tables, tables)) return;
  patchSession(ownerId, { tables });
}

/** Registers the latest callbacks of an owner; the returned function unregisters them only if nobody registered newer ones since. */
export function registerOwner(ownerId: string, handlers: SessionOwner): () => void {
  set({ ...state, owners: { ...state.owners, [ownerId]: handlers } });
  return () => {
    if (state.owners[ownerId] !== handlers) return;
    const owners = { ...state.owners };
    delete owners[ownerId];
    set({ ...state, owners });
  };
}
export const ownerPresent = (ownerId: string): boolean => !!state.owners[ownerId];

/**
 * Hands the result to the owner. Without an owner (the brick is gone) nothing is lost: the session stays open and the caller shows
 * why. A plain "Apply" (`keepOpen`) also keeps it open.
 */
export function applySession(ownerId: string, value: ApplyValue, options?: { keepOpen?: boolean }): 'applied' | 'owner-gone' {
  const owner = state.owners[ownerId];
  if (!owner?.onApply) return 'owner-gone';
  owner.onApply(value, options);
  if (options?.keepOpen) patchSession(ownerId, { dirty: false });
  else closeSession(ownerId);
  return 'applied';
}

/** Closes without applying and tells the owner. */
export function cancelSession(ownerId: string): void {
  if (!getSession(ownerId)) return;
  const owner = state.owners[ownerId];
  closeSession(ownerId);
  owner?.onClose?.();
}

// ── hosts: only one component draws the editor ──────────────────────────────
export function registerHost(id: string): () => void {
  set({ ...state, hosts: [...state.hosts.filter((h) => h !== id), id] });
  return () => set({ ...state, hosts: state.hosts.filter((h) => h !== id) });
}
/** The first host that mounted draws the editor (a host in the app layout wins over the ones inside bricks). */
export const isPrimaryHost = (id: string, s: StoreState = state): boolean => s.hosts[0] === id;
