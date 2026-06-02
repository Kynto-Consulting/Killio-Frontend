// Shared import logic for .kd/.kb/.km/.ks/.kf files coming out of the agent.
// Used by both the KillioImportChip (inline single-file import in agent
// chat) and the AI Draft Studio scan-folder preview (bulk import with
// per-file selection). Keep this file pure — no React, no hooks.

import { decodeKillioFile } from "@/lib/killio-file";
import { kdToDocDraft, kbToBoardDraft, ksToScriptDraft } from "@/lib/local-workspace/adapters";
import { deserializeKmToMesh } from "@/lib/mesh-file";
import { createDocument, createDocumentBrick } from "@/lib/api/documents";
import { createBoard, createList, createCard, createCardBrick } from "@/lib/api/contracts";
import { createScript, saveScriptGraph } from "@/lib/api/scripts";
import { importMeshFromKaml } from "@/lib/api/agent";

export type KillioImportKind = "kd" | "kb" | "km" | "ks" | "kf";

export interface KillioImportInput {
  kind: KillioImportKind;
  name: string;          // file basename, e.g. "notas.kd"
  label?: string;        // optional display label, defaults to name
  content: string;       // raw KAML text including the #killio header
}

export interface KillioImportResult {
  kind: KillioImportKind;
  name: string;
  entityId?: string;
  entityKind?: "document" | "board" | "mesh" | "script";
  url?: string;
}

/**
 * Where an imported file lands:
 *  - cloud: decode KAML → create the matching entity in the active team.
 *  - local: write the raw KAML file straight into the FileSystemDirectoryHandle
 *           (a local workspace IS a folder of .kd/.kb/.km/.ks files, so the
 *           agent's output is already the native format — no conversion).
 */
export type KillioImportTarget =
  | { mode: "cloud"; accessToken: string; activeTeamId: string }
  | { mode: "local"; writeLocal: (path: string, content: string) => Promise<void>; folder?: string | null };

/**
 * Import a single Killio file. In local mode the raw KAML is written to the
 * workspace folder (optionally inside `folder`). In cloud mode the payload is
 * decoded and the matching entity is created via the API. Throws on error.
 */
export async function importKillioFile(
  input: KillioImportInput,
  target: KillioImportTarget,
): Promise<KillioImportResult> {
  // ── Local workspace: just write the file (it's already KAML) ──────────────
  if (target.mode === "local") {
    const rel = target.folder ? `${target.folder.replace(/\/+$/, "")}/${input.name}` : input.name;
    await target.writeLocal(rel, input.content);
    return { kind: input.kind, name: input.name, url: rel };
  }

  // ── Cloud: decode + create entity ─────────────────────────────────────────
  const { accessToken, activeTeamId } = target;
  const decoded = decodeKillioFile(input.content);

  if (input.kind === "kf") {
    // Folder marker — no entity to create cloud-side. Surface a noop.
    return { kind: "kf", name: input.name };
  }

  if (input.kind === "kd") {
    const draft = kdToDocDraft(decoded.payload);
    const doc = await createDocument({ teamId: activeTeamId, title: draft.title }, accessToken);
    for (const b of draft.bricks) {
      await createDocumentBrick(
        doc.id,
        { kind: b.kind as any, position: b.position, content: (b.content as any) ?? {} },
        accessToken,
      );
    }
    return { kind: "kd", name: input.name, entityId: doc.id, entityKind: "document", url: `/d/${doc.id}` };
  }

  if (input.kind === "kb") {
    const draft = kbToBoardDraft(decoded.payload);
    const slug =
      (draft.name || "board").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) ||
      `board-${Date.now()}`;
    const board = await createBoard(
      { name: draft.name, slug, description: draft.description ?? undefined, boardType: draft.boardType as any },
      activeTeamId,
      accessToken,
    );
    for (let li = 0; li < draft.lists.length; li++) {
      const list = draft.lists[li];
      const apiList = await createList(board.id, { name: list.name, position: li }, accessToken);
      for (let ci = 0; ci < list.cards.length; ci++) {
        const card = list.cards[ci];
        const apiCard = await createCard(
          {
            listId: apiList.id,
            title: card.title,
            summary: card.summary,
            tags: (card.tags ?? []).map((tg: any) => tg.name).filter(Boolean),
          },
          accessToken,
        );
        for (let bi = 0; bi < (card.blocks?.length ?? 0); bi++) {
          const blk = (card.blocks as any[])[bi];
          if (blk?.kind && blk?.content) {
            await createCardBrick(apiCard.id, { kind: blk.kind, content: blk.content } as any, accessToken);
          }
        }
      }
    }
    return { kind: "kb", name: input.name, entityId: board.id, entityKind: "board", url: `/b/${board.id}` };
  }

  if (input.kind === "km") {
    const { state, meta } = deserializeKmToMesh(decoded.payload);
    const res = await importMeshFromKaml(
      {
        teamId: activeTeamId,
        name: meta.title || (input.label || input.name),
        state: {
          viewport: state.viewport,
          rootOrder: state.rootOrder ?? [],
          bricksById: state.bricksById ?? {},
          connectionsById: state.connectionsById ?? {},
        },
      },
      accessToken,
    );
    return { kind: "km", name: input.name, entityId: res.meshId, entityKind: "mesh", url: res.url };
  }

  if (input.kind === "ks") {
    const { summary, graph } = ksToScriptDraft(decoded.payload);
    const sc = await createScript(
      {
        teamId: activeTeamId,
        name: summary.name,
        description: summary.description ?? undefined,
        triggerConfig: { triggerType: summary.triggerType, ...((summary.triggerConfig as any) || {}) },
      },
      accessToken,
    );
    await saveScriptGraph(sc.id, activeTeamId, { nodes: graph.nodes as any, edges: graph.edges as any }, accessToken);
    return { kind: "ks", name: input.name, entityId: sc.id, entityKind: "script", url: `/scripts/${sc.id}` };
  }

  throw new Error(`Unknown killio kind: ${input.kind}`);
}
