"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { GitBranch, Loader2, Plus, Search, FileUp, Upload, X } from "lucide-react";

import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { ApiError, BoardSummary, createBoard, listTeamBoards, getMesh, updateMeshState } from "@/lib/api/contracts";
import { toast } from "@/lib/toast";
import { CreateBoardModal, type CreateBoardSubmitPayload } from "@/components/ui/create-board-modal";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { encodeKillioFile } from "@/lib/killio-file";
import { serializeMeshToKm } from "@/lib/mesh-file";
import { importToMeshTemplate, templateToMeshState } from "@/lib/mesh-import";

function resolveMeshCardBg(mesh: { backgroundKind?: string | null; backgroundValue?: string | null; backgroundGradient?: string | null; backgroundImageUrl?: string | null }): { className: string; style?: CSSProperties } {
  if (mesh.backgroundKind === "image" && mesh.backgroundImageUrl) {
    return { className: "bg-slate-900 bg-cover bg-center", style: { backgroundImage: `url(${mesh.backgroundImageUrl})` } };
  }
  if ((mesh.backgroundKind === "color" || mesh.backgroundKind === "preset") && mesh.backgroundValue) {
    return { className: "bg-slate-900", style: { backgroundColor: mesh.backgroundValue } };
  }
  if (mesh.backgroundKind === "gradient" && mesh.backgroundGradient) {
    if (mesh.backgroundGradient.startsWith("bg-")) return { className: mesh.backgroundGradient };
    return { className: "bg-slate-900", style: { background: mesh.backgroundGradient } };
  }
  // default: dark black
  return { className: "bg-black" };
}

function slugifyMeshName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `mesh-${Date.now()}`
  );
}

export default function MeshBoardsPage() {
  const t = useTranslations("boards");
  const router = useRouter();
  const { accessToken, activeTeamId } = useSession();
  const localWs = useLocalWorkspace();
  const workspaceMode = localWs.mode;

  const [meshes, setMeshes] = useState<BoardSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateMeshModalOpen, setIsCreateMeshModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (workspaceMode === "local") {
      setMeshes(localWs.files.filter((f) => f.kind === "km").map((f) => ({
        id: f.path, name: f.name.replace(/\.km$/, ""), boardType: "mesh", updatedAt: new Date(f.lastModified || Date.now()).toISOString(),
      })) as unknown as BoardSummary[]);
      setIsLoading(false);
      return;
    }
    if (!accessToken || !activeTeamId) return;

    setIsLoading(true);
    listTeamBoards(activeTeamId, accessToken)
      .then((boards) => {
        setMeshes(boards.filter((board) => board.boardType === "mesh"));
      })
      .catch((error) => {
        console.error(error);
        toast(t("mesh.loadError"), "error");
      })
      .finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId, workspaceMode, localWs.files]);

  const filteredMeshes = useMemo(
    () => meshes.filter((mesh) => mesh.name.toLowerCase().includes(search.toLowerCase())),
    [meshes, search],
  );

  const handleCreateMeshClick = () => {
    if (workspaceMode === "local") { setIsCreateMeshModalOpen(true); return; }
    if (!accessToken) {
      return;
    }

    if (!activeTeamId) {
      toast(t("noActiveWorkspace"), "info");
      return;
    }

    setIsCreateMeshModalOpen(true);
  };

  const handleCreateMeshSubmit = async (payload: CreateBoardSubmitPayload) => {
    if (isCreating) return;
    const meshName = payload.name.trim();
    if (!meshName) return;

    if (workspaceMode === "local") {
      setIsCreating(true);
      try {
        const path = `${slugifyMeshName(meshName)}.km`;
        await localWs.writeFile(path, encodeKillioFile({ kind: "km", schemaVersion: "2026-v1", payload: { id: path, title: meshName, viewport: { x: 0, y: 0, zoom: 1 }, bricks: [], connections: [], rootOrder: [] } }));
        router.push(`/m/${path.split("/").map(encodeURIComponent).join("/")}`);
      } catch (err) {
        console.error("[mesh] local create failed", err);
        toast(err instanceof Error ? `${t("mesh.createError")}: ${err.message}` : t("mesh.createError"), "error");
      }
      finally { setIsCreating(false); }
      return;
    }

    if (!accessToken || !activeTeamId) return;
    setIsCreating(true);
    try {
      const created = await createBoard(
        {
          ...payload,
          name: meshName,
          slug: slugifyMeshName(meshName),
          boardType: "mesh",
        },
        activeTeamId,
        accessToken,
      );

      setMeshes((current) => [created, ...current]);
      toast(t("mesh.createSuccess"), "success");
      router.push(`/m/${created.id}`);
    } catch (error) {
      console.error(error);
      toast(error instanceof ApiError ? error.message : t("mesh.createError"), "error");
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  const runImport = async (input: { text?: string; fileName?: string; fileBytes?: Uint8Array }) => {
    if (importing) return;
    setImporting(true);
    try {
      const tpl = await importToMeshTemplate(input);
      if (!tpl) { toast(t("mesh.importEmpty"), "error"); return; }
      const state = templateToMeshState(tpl);
      const name = (importName.trim() || input.fileName?.replace(/\.[^.]+$/, "") || "Imported mesh").trim();
      if (workspaceMode === "local") {
        const path = `${slugifyMeshName(name)}.km`;
        const km = serializeMeshToKm(state, { meshId: path, title: name });
        await localWs.writeFile(path, encodeKillioFile({ kind: "km", schemaVersion: km.schemaVersion, payload: km }));
        router.push(`/m/${path.split("/").map(encodeURIComponent).join("/")}`);
      } else {
        if (!accessToken || !activeTeamId) { toast(t("noActiveWorkspace"), "info"); return; }
        const board = await createBoard({ name, slug: slugifyMeshName(name), boardType: "mesh" }, activeTeamId, accessToken);
        const snap = await getMesh(board.id, accessToken).catch(() => null);
        await updateMeshState(board.id, { state, expectedRevision: snap?.revision ?? 0 }, accessToken);
        router.push(`/m/${board.id}`);
      }
      setIsImportOpen(false); setImportText(""); setImportName("");
    } catch (err) {
      console.error("[mesh] import failed", err);
      toast(err instanceof ApiError ? err.message : t("mesh.importError"), "error");
    } finally { setImporting(false); }
  };
  const onImportFile = async (file: File) => {
    const isPng = /\.png$/i.test(file.name) || file.type === "image/png";
    if (isPng) await runImport({ fileName: file.name, fileBytes: new Uint8Array(await file.arrayBuffer()) });
    else await runImport({ fileName: file.name, text: await file.text() });
  };

  return (
    <div className="container mx-auto max-w-6xl p-6 lg:p-10">
      <CreateBoardModal
        isOpen={isCreateMeshModalOpen}
        onClose={() => setIsCreateMeshModalOpen(false)}
        onSubmit={handleCreateMeshSubmit}
      />
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("mesh.title")}</h1>
          <p className="text-muted-foreground">{t("mesh.subtitle")}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("mesh.searchPlaceholder")}
              className="h-9 w-64 rounded-md border border-input bg-card px-3 pl-9 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-card px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent/10"
          >
            <FileUp className="mr-2 h-4 w-4" /> {t("mesh.import")}
          </button>

          <button
            type="button"
            onClick={handleCreateMeshClick}
            disabled={isCreating}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary/90 px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary disabled:opacity-60"
          >
            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t("mesh.newMesh")}
          </button>
        </div>
      </div>

      {isImportOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { if (!importing) setIsImportOpen(false); }}>
          <div className="w-[min(560px,92vw)] rounded-2xl border border-cyan-300/25 bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><FileUp className="h-4 w-4 text-cyan-400" /> {t("mesh.importTitle")}</h2>
              <button onClick={() => setIsImportOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-accent/10"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">{t("mesh.importHint")}</p>
            <input value={importName} onChange={(e) => setImportName(e.target.value)} placeholder={t("mesh.importNamePlaceholder")}
              className="mb-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-cyan-500/50" />
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={7} disabled={importing}
              placeholder={t("mesh.importPlaceholder")}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-[12px] outline-none focus:border-cyan-500/50 disabled:opacity-60" />
            <div className="mt-4 flex items-center justify-end gap-2">
              <label className="mr-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20">
                <Upload className="h-3.5 w-3.5" /> {t("mesh.importFile")}
                <input type="file" accept=".excalidraw,.json,.md,.mmd,.png,application/json,image/png" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); e.currentTarget.value = ""; }} />
              </label>
              <button type="button" disabled={importing} onClick={() => setIsImportOpen(false)} className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent/10 disabled:opacity-50">{t("mesh.importCancel")}</button>
              <button type="button" disabled={importing || !importText.trim()} onClick={() => void runImport({ text: importText })}
                className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/90 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50">
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />} {t("mesh.importAction")}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mb-4 h-8 w-8 animate-spin" />
          <p>{t("mesh.loading")}</p>
        </div>
      ) : filteredMeshes.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredMeshes.map((mesh) => {
            const cardBg = resolveMeshCardBg(mesh);
            return (
            <Link
              key={mesh.id}
              href={`/m/${mesh.id}`}
              className="group flex min-h-[160px] flex-col rounded-xl border border-border bg-card shadow-sm transition-all hover:border-accent/40 hover:shadow-md"
            >
              <div className={`flex h-20 w-full items-center border-b border-border/50 px-4 ${cardBg.className}`} style={cardBg.style}>
                <GitBranch className="h-8 w-8 text-white/30 drop-shadow" />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h2 className="truncate text-lg font-semibold transition-colors group-hover:text-accent">{mesh.name}</h2>
                <p className="mt-auto pt-4 text-xs uppercase tracking-wider text-muted-foreground">
                  {t("mesh.updated")} {new Date(mesh.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/30 py-20 text-center">
          <h2 className="text-xl font-semibold">{t("mesh.noMeshTitle")}</h2>
          <p className="mt-2 text-muted-foreground">{t("mesh.noMeshDescription")}</p>
          <button
            type="button"
            onClick={handleCreateMeshClick}
            disabled={isCreating}
            className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-accent/10 px-4 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
          >
            {t("mesh.createFirst")}
          </button>
        </div>
      )}
    </div>
  );
}
