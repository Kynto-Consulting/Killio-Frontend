/**
 * "Fijados": turns the saved pins (type + id) into what the screens show. Names and links come from the lists the app
 * already loads; a pin whose entity is not in them (deleted, no access, still loading) is simply left out. Pure (no React,
 * no path aliases) so it runs under `node --test`.
 */

export type PinKind = 'board' | 'mesh' | 'document' | 'folder';

export interface PinRef {
  entityType: PinKind;
  entityId: string;
  position?: number;
}

export interface PinnedEntry {
  kind: PinKind;
  id: string;
  title: string;
  href: string;
  updatedAt?: string | null;
}

export interface PinSources {
  boards?: ReadonlyArray<{ id: string; name: string; boardType?: string; updatedAt?: string | null }>;
  documents?: ReadonlyArray<{ id: string; title: string; updatedAt?: string | null }>;
  folders?: ReadonlyArray<{ id: string; name: string }>;
}

export const pinHref = (kind: PinKind, id: string): string => (kind === 'board' ? `/b/${id}` : kind === 'mesh' ? `/m/${id}` : kind === 'document' ? `/d/${id}` : `/d?folder=${id}`);

/** The kind a board is pinned as: meshes live under /m, everything else is a board. */
export const boardPinKind = (board: { boardType?: string }): 'board' | 'mesh' => (board.boardType === 'mesh' ? 'mesh' : 'board');

export function resolvePins(pins: readonly PinRef[], sources: PinSources): PinnedEntry[] {
  const boards = new Map((sources.boards ?? []).map((b) => [b.id, b]));
  const docs = new Map((sources.documents ?? []).map((d) => [d.id, d]));
  const folders = new Map((sources.folders ?? []).map((f) => [f.id, f]));
  const out: PinnedEntry[] = [];
  for (const p of [...pins].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    if (p.entityType === 'board' || p.entityType === 'mesh') {
      const b = boards.get(p.entityId);
      if (b && boardPinKind(b) === p.entityType) out.push({ kind: p.entityType, id: b.id, title: b.name, href: pinHref(p.entityType, b.id), updatedAt: b.updatedAt });
    } else if (p.entityType === 'document') {
      const d = docs.get(p.entityId);
      if (d) out.push({ kind: 'document', id: d.id, title: d.title, href: pinHref('document', d.id), updatedAt: d.updatedAt });
    } else {
      const f = folders.get(p.entityId);
      if (f) out.push({ kind: 'folder', id: f.id, title: f.name, href: pinHref('folder', f.id) });
    }
  }
  return out;
}

export const isPinned = (pins: readonly PinRef[], kind: PinKind, id: string): boolean => pins.some((p) => p.entityType === kind && p.entityId === id);

/** Optimistic list after pinning (appended) or unpinning one entity. */
export function applyPin(pins: readonly PinRef[], kind: PinKind, id: string, pinned: boolean): PinRef[] {
  const rest = pins.filter((p) => !(p.entityType === kind && p.entityId === id));
  if (!pinned) return rest;
  const next = rest.reduce((m, p) => Math.max(m, (p.position ?? 0) + 1), 0);
  return [...rest, { entityType: kind, entityId: id, position: next }];
}
