"use client";

// KillioImportChip — rendered in the agent chat whenever the agent calls the
// `killio_import` tool. Shows the proposed file (.kd / .kb / .km / .ks / .kf)
// as a clickable card; clicking it decodes the KAML payload and creates the
// matching entity in the user's active team (or writes it to the local
// workspace FS handle when localMode is on).

import React from "react";
import { FileText, Layout, Network, Workflow, Folder, Loader2, Check, X, Download } from "lucide-react";
import { decodeKillioFile } from "@/lib/killio-file";
import { kdToDocDraft, kbToBoardDraft, ksToScriptDraft } from "@/lib/local-workspace/adapters";
import { deserializeKmToMesh } from "@/lib/mesh-file";
import { createDocument, createDocumentBrick } from "@/lib/api/documents";
import { createBoard, createList, createCard, createCardBrick } from "@/lib/api/contracts";
import { createScript, saveScriptGraph } from "@/lib/api/scripts";
import { importMeshFromKaml } from "@/lib/api/agent";
import { useSession } from "@/components/providers/session-provider";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { toast } from "@/lib/toast";

type KillioKind = "kd" | "kb" | "km" | "ks" | "kf";

interface Props {
  path: string;
  kind: KillioKind;
  name: string;
  label: string;
  description?: string | null;
  content: string;
  size: number;
}

const ICON: Record<KillioKind, React.ReactNode> = {
  kd: <FileText className="h-4 w-4" />,
  kb: <Layout className="h-4 w-4" />,
  km: <Network className="h-4 w-4" />,
  ks: <Workflow className="h-4 w-4" />,
  kf: <Folder className="h-4 w-4" />,
};

export function KillioImportChip({ path, kind, name, label, description, content }: Props) {
  const t = useTranslations("common");
  const { accessToken, activeTeamId } = useSession();
  const { mode: workspaceMode } = useLocalWorkspace();
  const isLocal = workspaceMode === "local";

  const KIND_LABEL: Record<KillioKind, string> = {
    kd: t("killioImport.kd"),
    kb: t("killioImport.kb"),
    km: t("killioImport.km"),
    ks: t("killioImport.ks"),
    kf: t("killioImport.kf"),
  };

  const [state, setState] = React.useState<"idle" | "importing" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  const handleImport = async () => {
    if (state === "importing" || state === "done") return;
    setState("importing");
    setErrMsg(null);
    try {
      // Decode the KAML payload the agent produced.
      let decoded;
      try {
        decoded = decodeKillioFile(content);
      } catch (e: any) {
        throw new Error(t("killioImport.invalidFile", { msg: e?.message || String(e) }));
      }

      if (kind === "kf") {
        // .kf is a folder marker. In a cloud team the dashboard already
        // owns folder grouping, so we just acknowledge.
        toast(t("killioImport.folderAck"), "info");
        setState("done");
        return;
      }

      // Cloud import path.
      if (!isLocal && activeTeamId && accessToken) {
        if (kind === "kd") {
          const draft = kdToDocDraft(decoded.payload);
          const doc = await createDocument({ teamId: activeTeamId, title: draft.title }, accessToken);
          for (const b of draft.bricks) {
            await createDocumentBrick(
              doc.id,
              { kind: b.kind as any, position: b.position, content: (b.content as any) ?? {} },
              accessToken,
            );
          }
        } else if (kind === "kb") {
          const draft = kbToBoardDraft(decoded.payload);
          const slug = (draft.name || "board").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || `board-${Date.now()}`;
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
                  await createCardBrick(
                    apiCard.id,
                    { kind: blk.kind, content: blk.content } as any,
                    accessToken,
                  );
                }
              }
            }
          }
        } else if (kind === "ks") {
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
        } else if (kind === "km") {
          // Bulk mesh import via /agent/import-mesh — server inserts the
          // board record + the seeded mesh_board_states row in one shot.
          const { state: meshState, meta } = deserializeKmToMesh(decoded.payload);
          await importMeshFromKaml(
            {
              teamId: activeTeamId,
              name: meta.title || label,
              state: {
                viewport: meshState.viewport,
                rootOrder: meshState.rootOrder ?? [],
                bricksById: meshState.bricksById ?? {},
                connectionsById: meshState.connectionsById ?? {},
              },
            },
            accessToken,
          );
        }
        toast(t("killioImport.imported", { kind: KIND_LABEL[kind] }), "success");
        setState("done");
        return;
      }

      // Local workspace path. We don't reach into the FS handle from this
      // chip — instead we hand the encoded content to the
      // local-workspace-provider via a window event the host listens to.
      if (isLocal) {
        window.dispatchEvent(new CustomEvent("killio:local-import", {
          detail: { kind, name, content, path },
        }));
        toast(t("killioImport.queuedLocal", { kind: KIND_LABEL[kind] }), "info");
        setState("done");
        return;
      }

      throw new Error(t("killioImport.noTarget"));
    } catch (err: any) {
      setErrMsg(err?.message || t("killioImport.errGeneric"));
      setState("error");
    }
  };

  const isDone = state === "done";
  const isErr = state === "error";
  const isBusy = state === "importing";

  return (
    <button
      type="button"
      onClick={handleImport}
      disabled={isBusy || isDone}
      className={`my-2 inline-flex items-start gap-3 rounded-xl border p-3 text-left transition-colors w-full max-w-md ${
        isDone
          ? "border-emerald-500/40 bg-emerald-500/5"
          : isErr
          ? "border-red-500/40 bg-red-500/5"
          : "border-accent/40 bg-accent/5 hover:bg-accent/10 cursor-pointer"
      }`}
    >
      <div className={`shrink-0 mt-0.5 ${isDone ? "text-emerald-500" : isErr ? "text-red-500" : "text-accent"}`}>
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : isDone ? <Check className="h-4 w-4" /> : isErr ? <X className="h-4 w-4" /> : ICON[kind]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground truncate">{label}</span>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent/10 text-accent">{kind}</span>
        </div>
        {description ? (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={path}>{path}</p>
        )}
        <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
          {isBusy && <span>{t("killioImport.importing")}</span>}
          {isDone && <span className="text-emerald-500">{t("killioImport.doneLabel")}</span>}
          {isErr && <span className="text-red-500">{t("killioImport.errPrefix")}{errMsg}</span>}
          {!isBusy && !isDone && !isErr && (
            <><Download className="h-3 w-3" /> {t("killioImport.cta")}</>
          )}
        </div>
      </div>
    </button>
  );
}
