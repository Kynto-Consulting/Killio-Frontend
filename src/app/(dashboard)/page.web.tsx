"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AlignLeft, ArrowRight, ArrowRightLeft, Bot, BrainCircuit, CheckCircle2, CheckSquare, Clock, FileText, GitBranch, Layout, Loader2, MessageSquare, Plus, ShieldCheck, Sparkles, Trash2, Users, Webhook, Workflow } from "lucide-react";
import { AiGenerationPanel } from "@/components/ui/ai-generation-panel";
import { CreateBoardModal, type CreateBoardSubmitPayload } from "@/components/ui/create-board-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/components/providers/session-provider";
import { listTeamBoards, BoardSummary, createBoard, deleteBoard, uploadFile } from "@/lib/api/contracts";
import { listDocuments, DocumentSummary, createDocument } from "@/lib/api/documents";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";
import { apiCache, CACHE_TTL, cacheKey } from "@/lib/api-cache";
import { SkeletonBoardCard, SkeletonDocumentRow } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { encodeKillioFile } from "@/lib/killio-file";
import { docToKd } from "@/lib/local-workspace/adapters";
import { joinPath } from "@/lib/local-workspace/fs-access";

type TFunction = (key: string, params?: Record<string, string | number>) => string;

export default function WorkspacesPage() {
  const t = useTranslations("workspace");
  const tLanding = useTranslations("landing");
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const { accessToken, activeTeamId, isLoading: isSessionLoading } = useSession();
  const router = useRouter();
  const localWs = useLocalWorkspace();
  const localMode = localWs.mode === "local";
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const upd = () => setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);
  const [boardToDelete, setBoardToDelete] = useState<{ id: string; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'boards' | 'documents'>('boards');
  const [isCreateDocModalOpen, setIsCreateDocModalOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [isSubmittingDoc, setIsSubmittingDoc] = useState(false);

  // Local workspace: boards/documents come from the folder, not the cloud.
  useEffect(() => {
    if (!localMode) return;
    setBoards(localWs.files.filter((f) => f.kind === "kb").map((f) => ({
      id: f.path, name: f.name.replace(/\.kb$/, ""), boardType: "kanban", updatedAt: new Date(f.lastModified || Date.now()).toISOString(),
    })) as unknown as BoardSummary[]);
    setDocuments(localWs.files.filter((f) => f.kind === "kd").map((f) => ({
      id: f.path, title: f.name.replace(/\.kd$/, ""), updatedAt: new Date(f.lastModified || Date.now()).toISOString(),
    })) as unknown as DocumentSummary[]);
    setIsLoading(false);
  }, [localMode, localWs.files]);

  useEffect(() => {
    if (localMode || !accessToken || !activeTeamId) return;

    const bKey = cacheKey.boards(activeTeamId);
    const dKey = cacheKey.documents(activeTeamId);

    // Serve cached data immediately — no loading spinner if cache is warm
    const cachedBoards = apiCache.get<BoardSummary[]>(bKey);
    const cachedDocs   = apiCache.get<DocumentSummary[]>(dKey);
    if (cachedBoards) setBoards(cachedBoards);
    if (cachedDocs)   setDocuments(cachedDocs);

    if (!cachedBoards || !cachedDocs) setIsLoading(true);

    Promise.all([
      cachedBoards ? Promise.resolve(cachedBoards) : listTeamBoards(activeTeamId, accessToken).catch(e => { console.error(e); return [] as BoardSummary[]; }),
      cachedDocs   ? Promise.resolve(cachedDocs)   : listDocuments(activeTeamId, accessToken).catch(e => { console.error(e); return [] as DocumentSummary[]; }),
    ]).then(([freshBoards, freshDocs]) => {
      if (!cachedBoards) { apiCache.set(bKey, freshBoards, CACHE_TTL.BOARDS); setBoards(freshBoards); }
      if (!cachedDocs)   { apiCache.set(dKey, freshDocs,   CACHE_TTL.DOCUMENTS); setDocuments(freshDocs); }
    }).finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId]);

  const handleCreateBoardClick = () => {
    if (localMode) { setIsCreateBoardModalOpen(true); return; }
    if (!accessToken) return;
    if (!activeTeamId) {
      toast(t("noActiveWorkspace"), "info");
      return;
    }
    setIsCreateBoardModalOpen(true);
  };

  const handleCreateBoardSubmit = async (payload: CreateBoardSubmitPayload) => {
    const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `board-${Date.now()}`;

    if (localMode) {
      // Home "New Board" creates a kanban .kb (meshes are created from /m).
      const path = joinPath("", `${slug}.kb`);
      await localWs.writeFile(path, encodeKillioFile({ kind: "kb", schemaVersion: "2026-v1", payload: { id: path, name: payload.name, boardType: "kanban", lists: [] } }));
      router.push(`/b/${path.split("/").map(encodeURIComponent).join("/")}`);
      return;
    }

    if (!accessToken || !activeTeamId) return;
    const newBoard = await createBoard({ ...payload, slug }, activeTeamId, accessToken);
    const updated = [...boards, newBoard];
    setBoards(updated);
    apiCache.set(cacheKey.boards(activeTeamId), updated, CACHE_TTL.BOARDS);
  };

  const handleUploadBoardCover = async (file: File): Promise<string> => {
    if (!accessToken) {
      throw new Error(t("sessionExpired"));
    }
    const uploaded = await uploadFile(
      file,
      accessToken,
      activeTeamId
        ? {
            ownerScopeType: 'team',
            ownerScopeId: activeTeamId,
            usage: 'board-cover',
          }
        : { usage: 'board-cover' },
    );
    return uploaded.url;
  };

  const resolveSerializedCover = (raw?: string | null): { className: string; style?: CSSProperties } | null => {
    if (!raw) return null;
    const source = raw.trim();
    if (!source) return null;

    const separatorIndex = source.indexOf("::");
    let kind = "";
    let value = source;

    if (separatorIndex > 0) {
      kind = source.slice(0, separatorIndex);
      value = source.slice(separatorIndex + 2);
    }

    if (!kind) {
      if (/^https?:\/\//i.test(source) || source.startsWith("/") || source.startsWith("data:image/")) {
        kind = "image";
      } else if (source.startsWith("bg-")) {
        kind = "preset";
      } else if (source.startsWith("#")) {
        kind = "color";
      } else {
        kind = "gradient";
      }
    }

    if (kind === "none") return null;

    if (kind === "image") {
      if (!(/^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("data:image/"))) {
        return null;
      }

      return {
        className: "bg-slate-800 bg-cover bg-center",
        style: { backgroundImage: `url(${value})` },
      };
    }

    if (kind === "preset") {
      return { className: value };
    }

    if (kind === "color") {
      return {
        className: "bg-slate-800",
        style: { backgroundColor: value },
      };
    }

    if (value.startsWith("bg-")) {
      return { className: value };
    }

    return {
      className: "bg-slate-800",
      style: { background: value },
    };
  };

  const resolveBoardCover = (board: BoardSummary): { className: string; style?: CSSProperties } => {
    // Prioridad 1: Cover image (portada del board) - tiene mayor prioridad que el background
    const cover = resolveSerializedCover(board.coverImageUrl);
    if (cover) return cover;

    // Prioridad 2: Background image
    if (board.backgroundKind === "image" && board.backgroundImageUrl) {
      return {
        className: "bg-slate-800 bg-cover bg-center",
        style: { backgroundImage: `url(${board.backgroundImageUrl})` },
      };
    }

    // Prioridad 3: Background color
    if (board.backgroundKind === "color" && board.backgroundValue) {
      return {
        className: "bg-slate-800",
        style: { backgroundColor: board.backgroundValue },
      };
    }

    // Prioridad 4: Background gradient
    if (board.backgroundKind === "gradient" && board.backgroundGradient) {
      if (board.backgroundGradient.startsWith("bg-")) {
        return { className: board.backgroundGradient };
      }

      return {
        className: "bg-slate-800",
        style: { background: board.backgroundGradient },
      };
    }

    // Prioridad 5: Preset background
    if (board.backgroundKind === "preset" && board.backgroundValue) {
      return { className: board.backgroundValue };
    }

    return { className: "bg-gradient-to-tr from-accent to-primary/60" };
  };

  const handleCreateDocumentClick = () => {
    if (!accessToken || !activeTeamId) return;
    setNewDocTitle("");
    setIsCreateDocModalOpen(true);
  };

  const handleCreateDocumentSubmit = async () => {
    if (!newDocTitle.trim()) return;
    if (!localMode && (!accessToken || !activeTeamId)) return;
    setIsSubmittingDoc(true);
    try {
      if (localMode) {
        const title = newDocTitle.trim();
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `doc-${Date.now()}`;
        const path = joinPath("", `${slug}.kd`);
        await localWs.writeFile(path, encodeKillioFile({ kind: "kd", schemaVersion: "2026-v1", payload: docToKd({ id: path, title, bricks: [] }) }));
        setIsCreateDocModalOpen(false);
        setNewDocTitle("");
        router.push(`/d/${path.split("/").map(encodeURIComponent).join("/")}`);
        return;
      }
      const doc = await createDocument({ teamId: activeTeamId!, title: newDocTitle.trim() }, accessToken!);
      setDocuments([doc, ...documents]);
      setIsCreateDocModalOpen(false);
      setNewDocTitle("");
    } catch (e) {
      console.error(e);
      toast(t("createDocError"), "error");
    } finally {
      setIsSubmittingDoc(false);
    }
  };

  const handleDeleteBoard = async () => {
    if (!boardToDelete) return;

    try {
      if (localMode) {
        // Local board = a .kb file; its id IS the file path. Delete the file
        // from the FileSystemDirectoryHandle (the local-workspace effect
        // re-derives `boards` from localWs.files, so the row disappears).
        await localWs.removeFile(boardToDelete.id);
        setBoards((prev) => prev.filter((b) => b.id !== boardToDelete.id));
        setBoardToDelete(null);
        return;
      }
      if (!accessToken || !activeTeamId) return;
      await deleteBoard(boardToDelete.id, accessToken);
      const updated = boards.filter(b => b.id !== boardToDelete.id);
      setBoards(updated);
      apiCache.set(cacheKey.boards(activeTeamId), updated, CACHE_TTL.BOARDS);
      setBoardToDelete(null);
    } catch (error) {
      console.error(t("deleteBoardError"), error);
      toast(t("deleteBoardError"), "error");
    }
  };

  if (!accessToken && !localMode) {
    if (isSessionLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      );
    }

  }

  return (
    <div className="container mx-auto p-6 lg:p-10 max-w-6xl">
      <ConfirmDialog
        isOpen={!!boardToDelete}
        onClose={() => setBoardToDelete(null)}
        onConfirm={handleDeleteBoard}
        title={t("deleteBoardTitle")}
        description={t("deleteBoardDescription", { name: boardToDelete?.name || "" })}
        confirmText={boardToDelete?.name || undefined}
        variant="danger"
      />
      <CreateBoardModal
        isOpen={isCreateBoardModalOpen}
        onClose={() => setIsCreateBoardModalOpen(false)}
        onSubmit={handleCreateBoardSubmit}
        onUploadBackground={handleUploadBoardCover}
      />
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          {online && (
            <button
              onClick={() => setIsAiPanelOpen(true)}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-card hover:bg-accent/10 hover:text-foreground shadow-sm h-9 px-4 group"
            >
              <Sparkles className="mr-2 h-4 w-4 text-accent" />
              {t("aiStudio")}
            </button>
          )}
          <button onClick={handleCreateBoardClick} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary/90 hover:bg-primary text-primary-foreground shadow h-9 px-4 group">
            <Plus className="mr-2 h-4 w-4 opacity-70 group-hover:scale-110 transition-transform" />
            {t("newBoard")}
          </button>
        </div>
      </div>

      <div className="flex space-x-4 border-b border-border/50 mb-6 px-1">
        <button
          onClick={() => setActiveTab('boards')}
          className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'boards' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/5'}`}
        >
          <div className="flex items-center space-x-2 px-2">
            <Layout className="h-4 w-4" />
            <span>{t("boards")}</span>
          </div>
          {activeTab === 'boards' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t-full shadow-[0_-2px_8px_rgba(var(--accent),0.5)]"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`pb-3 text-sm font-medium transition-all relative ${activeTab === 'documents' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/5'}`}
        >
          <div className="flex items-center space-x-2 px-2">
            <FileText className="h-4 w-4" />
            <span>{t("documents")}</span>
          </div>
          {activeTab === 'documents' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t-full shadow-[0_-2px_8px_rgba(var(--accent),0.5)]"></div>
          )}
        </button>
      </div>

      {activeTab === 'boards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div onClick={handleCreateBoardClick} className="group relative rounded-xl border border-dashed border-border/60 bg-transparent hover:border-accent hover:bg-accent/5 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center min-h-[220px]">
            <div className="mb-4 rounded-full bg-accent/10 p-3 text-accent group-hover:bg-accent/20 transition-colors">
              <Plus className="h-6 w-6" />
            </div>
            <h3 className="font-medium">{t("newBoard")}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t("startFromScratch")}</p>
          </div>

          {isLoading && boards.length === 0 ? (
            <>
              {[1,2,3,4,5,6].map(i => <SkeletonBoardCard key={i} />)}
            </>
          ) : boards.map((board) => (
            (() => {
              const cover = resolveBoardCover(board);
              return (
            <Link href={`/b/${board.id}`} key={board.id} className="group relative rounded-xl border border-border bg-card shadow-sm hover:border-accent/40 hover:shadow-md transition-all flex flex-col min-h-[220px] overflow-hidden">
              <div
                className={`h-24 ${cover.className} w-full border-b border-border/50 relative`}
                style={cover.style}
              >
                <div className="absolute inset-0 bg-black/10 transition-opacity group-hover:bg-black/0"></div>
              </div>
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-start justify-between">
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-accent transition-colors">{board.name}</h3>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setBoardToDelete({ id: board.id, name: board.name });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded transition-all focus:opacity-100"
                    aria-label="Delete board"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center">
                    <Layout className="mr-1.5 h-3.5 w-3.5" />
                    {t("board")}
                  </div>
                </div>
              </div>
            </Link>
              );
            })()
          ))}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div onClick={handleCreateDocumentClick} className="group relative rounded-xl border border-dashed border-border/60 bg-transparent hover:border-accent hover:bg-accent/5 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center min-h-[220px]">
            <div className="mb-4 rounded-full bg-accent/10 p-3 text-accent group-hover:bg-accent/20 transition-colors">
              <Plus className="h-6 w-6" />
            </div>
            <h3 className="font-medium">{t("newDocument")}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t("startWriting")}</p>
          </div>

          {isLoading && documents.length === 0 ? (
            <>
              {[1,2,3,4].map(i => <SkeletonDocumentRow key={i} className="col-span-full" />)}
            </>
          ) : documents.map((doc) => (
            <Link href={`/d/${doc.id}`} key={doc.id} className="group relative rounded-xl border border-border bg-card shadow-sm hover:border-accent/40 hover:shadow-md transition-all flex flex-col min-h-[220px] overflow-hidden">
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-start justify-between h-full pt-2">
                  <div className="flex items-center">
                    <FileText className="mr-3 h-6 w-6 text-accent" />
                    <h3 className="text-xl font-semibold group-hover:text-accent transition-colors">{doc.title}</h3>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center">
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    {t("document")}
                  </div>
                  <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!localMode && (
      <div className="mt-12">
        <h2 className="text-xl font-semibold mb-6 flex items-center">
          <Clock className="mr-2 h-5 w-5 text-muted-foreground" />
          {t("recentlyViewed")}
        </h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border/50">
            {[
              ...boards.map(b => ({ ...b, type: 'board' as const })),
              ...documents.map(d => ({ ...d, type: 'document' as const }))
            ]
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 10)
            .map((item, i) => (
              <Link href={item.type === 'board' ? `/b/${item.id}` : `/d/${item.id}`} key={i} className="flex items-center px-4 py-3 hover:bg-accent/5 transition-colors group">
                <div className={`h-8 w-8 rounded flex items-center justify-center mr-4 transition-colors ${item.type === 'board' ? 'bg-primary/20 group-hover:bg-primary/30' : 'bg-accent/20 group-hover:bg-accent/30'}`}>
                  {item.type === 'board' ? <Layout className="h-4 w-4 text-foreground/70" /> : <FileText className="h-4 w-4 text-foreground/70" />}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium">{item.type === 'board' ? (item as BoardSummary).name : (item as DocumentSummary).title}</span>
                  <div className="text-xs text-muted-foreground flex items-center mt-0.5">
                    {item.type === 'board' ? t("teamBoard") : t("document")} <span className="mx-1">•</span> {t("updated")} {new Date(item.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
            {boards.length === 0 && documents.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground">{t("noRecentActivity")}</div>
            )}
          </div>
        </div>
      </div>
      )}

      <AiGenerationPanel isOpen={isAiPanelOpen} onClose={() => setIsAiPanelOpen(false)} />

      {isCreateDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-sm rounded-xl border border-border shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <h2 className="text-lg font-semibold tracking-tight">{t("createDocTitle")}</h2>
            <input
              autoFocus
              type="text"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              placeholder={t("createDocPrompt")}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreateDocumentSubmit(); if (e.key === "Escape") setIsCreateDocModalOpen(false); }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateDocModalOpen(false)}
                className="h-9 px-4 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleCreateDocumentSubmit()}
                disabled={!newDocTitle.trim() || isSubmittingDoc}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmittingDoc && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />}
                {t("createDocBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
