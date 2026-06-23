// Reconcile external edits into the local activity history. The `.h` activity
// sidecars are normally written by the app on in-app edits. If a user edits a
// `.kd`/`.kb`/`.km` file by hand (outside Killio), nothing is logged. On
// workspace load this reconciler compares each entity's current per-unit hashes
// against a baseline kept in `.killio/manifest.json`; when they differ AND the
// app didn't already log activity since the last reconcile, it appends a single
// synthetic "edited" entry carrying a brick/card/node-level diff. Idempotent:
// keyed on content hashes, so re-loading the same state never re-logs.

import { DOT_KILLIO } from "./dot-killio.ts";
import { decodeKillioFile } from "@/lib/killio-file";
import { kdToDocDraft, kbToBoardDraft } from "./adapters.ts";
import { deserializeKmToMesh } from "@/lib/mesh-file";
import { readWorkspaceFileWithMeta, writeWorkspaceFile } from "./fs-access.ts";
import { logLocalActivity, readLocalActivity } from "./local-activity.ts";

const MANIFEST_PATH = `${DOT_KILLIO}/manifest.json`;
type DirHandle = FileSystemDirectoryHandle;
type EntityKind = "kd" | "kb" | "km";

type Units = Record<string, string>; // unit id → content hash
type ManifestEntry = { hash: string; units: Units; reconciledAt: string };
type Manifest = { version: number; entities: Record<string, ManifestEntry> };

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

/** Per-unit content hashes for an entity: bricks (kd), cards (kb), nodes (km). */
export function entityUnits(kind: EntityKind, payload: unknown): Units {
  const u: Units = {};
  try {
    if (kind === "kd") {
      for (const b of kdToDocDraft(payload).bricks) u[String(b.id)] = fnv(`${b.kind}:${JSON.stringify(b.content ?? {})}`);
    } else if (kind === "kb") {
      const kb = kbToBoardDraft(payload);
      kb.lists.forEach((l, li) => {
        for (const c of l.cards) u[String(c.id ?? `${li}:${c.title}`)] = fnv(JSON.stringify(c));
      });
    } else if (kind === "km") {
      const { state } = deserializeKmToMesh(payload);
      const bricks = Object.values((state as any).bricksById ?? {});
      for (const b of bricks as any[]) u[String(b.id)] = fnv(JSON.stringify(b));
      const conns = Object.values((state as any).connectionsById ?? {});
      for (const c of conns as any[]) u[`conn:${String(c.id)}`] = fnv(JSON.stringify(c));
    }
  } catch { /* unparseable → empty units → treated as a wholesale change */ }
  return u;
}

function diffUnits(prev: Units, cur: Units): { added: string[]; removed: string[]; changed: string[] } {
  const added: string[] = []; const removed: string[] = []; const changed: string[] = [];
  for (const id of Object.keys(cur)) {
    if (!(id in prev)) added.push(id);
    else if (prev[id] !== cur[id]) changed.push(id);
  }
  for (const id of Object.keys(prev)) if (!(id in cur)) removed.push(id);
  return { added, removed, changed };
}

async function readManifest(dir: DirHandle): Promise<Manifest> {
  try {
    const meta = await readWorkspaceFileWithMeta(dir, MANIFEST_PATH);
    if (meta) { const m = JSON.parse(meta.text) as Manifest; if (m?.entities) return m; }
  } catch { /* fall through */ }
  return { version: 1, entities: {} };
}

export type ReconcileFile = { path: string; kind: EntityKind; text: string };

/**
 * Reconcile a workspace's entity files against the manifest baseline, logging
 * external edits. `nowIso` is passed in (no Date.now() coupling). Returns the
 * number of external edits logged.
 */
export async function reconcileWorkspaceHistory(
  dir: DirHandle,
  files: ReconcileFile[],
  nowIso: string,
): Promise<number> {
  const manifest = await readManifest(dir);
  let logged = 0;
  let dirty = false;

  for (const f of files) {
    let payload: unknown;
    try { payload = decodeKillioFile(f.text).payload; } catch { continue; }
    const units = entityUnits(f.kind, payload);
    const hash = fnv(Object.keys(units).sort().map((k) => `${k}=${units[k]}`).join("|"));
    const prev = manifest.entities[f.path];

    if (prev && prev.hash === hash) continue; // unchanged

    if (prev) {
      // Did the app already log something since our last reconcile? If so, this
      // change is an in-app edit (already in `.h`) → update baseline silently.
      let appLogged = false;
      try {
        const entries = await readLocalActivity(dir, f.path); // newest-first
        const newest = entries[0];
        if (newest && new Date(newest.createdAt).getTime() > new Date(prev.reconciledAt).getTime()) appLogged = true;
      } catch { /* no sidecar */ }

      if (!appLogged) {
        const d = diffUnits(prev.units || {}, units);
        if (d.added.length || d.removed.length || d.changed.length) {
          try {
            await logLocalActivity(dir, f.path, {
              action: "entity.edited.external",
              actorId: "external",
              scope: f.kind === "kd" ? "document" : f.kind === "kb" ? "board" : "mesh",
              scopeId: f.path,
              payload: { source: "external", added: d.added, removed: d.removed, changed: d.changed },
            }, { dedupeMs: 0 });
            logged += 1;
          } catch { /* logging best-effort */ }
        }
      }
    }
    // New file (no prev) → just record the baseline, no entry (avoids spamming on
    // first load / import).
    manifest.entities[f.path] = { hash, units, reconciledAt: nowIso };
    dirty = true;
  }

  // Drop manifest entries for files that no longer exist.
  const present = new Set(files.map((f) => f.path));
  for (const path of Object.keys(manifest.entities)) {
    if (!present.has(path)) { delete manifest.entities[path]; dirty = true; }
  }

  if (dirty) { try { await writeWorkspaceFile(dir, MANIFEST_PATH, JSON.stringify(manifest)); } catch { /* ignore */ } }
  return logged;
}
