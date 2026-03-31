"use client";

import { useState, useEffect, type CSSProperties } from "react";
import Link from "next/link";
import { Plus, Clock, Layout, Loader2, Search, Trash2 } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { listTeamBoards, BoardSummary, createBoard, deleteBoard, uploadFile } from "@/lib/api/contracts";
import { toast } from "@/lib/toast";
import { CreateBoardModal, type CreateBoardSubmitPayload } from "@/components/ui/create-board-modal";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { useTranslations } from "@/components/providers/i18n-provider";

export default function BoardsPage() {
  const t = useTranslations("boards");
  const { accessToken, activeTeamId } = useSession();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);
  const [boardToDelete, setBoardToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;
    
    setIsLoading(true);
    listTeamBoards(activeTeamId, accessToken)
      .then(setBoards)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId]);

  const handleCreateBoardClick = () => {
    if (!accessToken) return;
    if (!activeTeamId) {
      toast(t("noActiveWorkspace"), "info");
      return;
    }
    setIsCreateBoardModalOpen(true);
  };

  const handleCreateBoardSubmit = async (payload: CreateBoardSubmitPayload) => {
    if (!accessToken || !activeTeamId) return;
    
    try {
      const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `board-${Date.now()}`;
      const newBoard = await createBoard({ ...payload, slug }, activeTeamId, accessToken);
      setBoards([...boards, newBoard]);
      toast(t("boardCreatedSuccess"), "success");
    } catch (error) {
      toast(t("boardCreateError"), "error");
    }
  };

  const handleUploadBoardCover = async (file: File): Promise<string> => {
    if (!accessToken) {
      throw new Error("Sesion expirada. Inicia sesion nuevamente.");
    }
    const uploaded = await uploadFile(file, accessToken);
    return uploaded.url;
  };

  const resolveBoardCover = (board: BoardSummary): { className: string; style?: CSSProperties } => {
    if (board.coverImageUrl && (/^https?:\/\//i.test(board.coverImageUrl) || board.coverImageUrl.startsWith("/") || board.coverImageUrl.startsWith("data:image/"))) {
      return {
        className: "bg-slate-800 bg-cover bg-center",
        style: { backgroundImage: `url(${board.coverImageUrl})` },
      };
    }

    if (board.coverImageUrl) {
      return { className: board.coverImageUrl };
    }

    if (board.backgroundKind === "image" && board.backgroundImageUrl) {
      return {
        className: "bg-slate-800 bg-cover bg-center",
        style: { backgroundImage: `url(${board.backgroundImageUrl})` },
      };
    }

    if (board.backgroundKind === "color" && board.backgroundValue) {
      return {
        className: "bg-slate-800",
        style: { backgroundColor: board.backgroundValue },
      };
    }

    if (board.backgroundKind === "gradient" && board.backgroundGradient) {
      if (board.backgroundGradient.startsWith("bg-")) {
        return { className: board.backgroundGradient };
      }

      return {
        className: "bg-slate-800",
        style: { background: board.backgroundGradient },
      };
    }

    if (board.backgroundKind === "preset" && board.backgroundValue) {
      return { className: board.backgroundValue };
    }

    return { className: "bg-gradient-to-tr from-accent/20 to-primary/20" };
  };

  const handleDeleteBoard = async () => {
    if (!accessToken || !boardToDelete) return;

    try {
      await deleteBoard(boardToDelete.id, accessToken);
      setBoards(boards.filter(b => b.id !== boardToDelete.id));
      setBoardToDelete(null);
      toast(t("boardDeleteSuccess"), "success");
    } catch (error) {
      toast(t("boardDeleteError"), "error");
    }
  };

  const filteredBoards = boards.filter(board => 
    board.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container mx-auto p-6 lg:p-10 max-w-6xl">
      <ConfirmDeleteModal 
        isOpen={!!boardToDelete}
        onClose={() => setBoardToDelete(null)}
        onConfirm={handleDeleteBoard}
        title={t("deleteTitle")}
        description={t("deleteDescription", { name: boardToDelete?.name || "" })}
      />
      <CreateBoardModal 
        isOpen={isCreateBoardModalOpen}
        onClose={() => setIsCreateBoardModalOpen(false)}
        onSubmit={handleCreateBoardSubmit}
        onUploadCoverImage={handleUploadBoardCover}
      />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 w-64 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            />
          </div>
          <button 
            onClick={handleCreateBoardClick} 
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary/90 hover:bg-primary text-primary-foreground shadow h-9 px-4 group"
          >
            <Plus className="mr-2 h-4 w-4 opacity-70 group-hover:scale-110 transition-transform" />
            {t("newBoard")}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary/50" />
          <p>{t("gathering")}</p>
        </div>
      ) : filteredBoards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div 
            onClick={handleCreateBoardClick} 
            className="group relative rounded-xl border border-dashed border-border/60 bg-transparent hover:border-accent hover:bg-accent/5 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center min-h-[160px]"
          >
            <div className="mb-4 rounded-full bg-accent/10 p-3 text-accent group-hover:bg-accent/20 transition-colors">
              <Plus className="h-6 w-6" />
            </div>
            <h3 className="font-medium">{t("newBoard")}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t("startFromScratch")}</p>
          </div>

          {filteredBoards.map((board) => (
            (() => {
              const cover = resolveBoardCover(board);
              return (
            <Link 
              href={`/b/${board.id}`} 
              key={board.id} 
              className="group relative rounded-xl border border-border bg-card shadow-sm hover:border-accent/40 hover:shadow-md transition-all flex flex-col min-h-[160px] overflow-hidden"
            >
               <div
                 className={`h-20 ${cover.className} w-full border-b border-border/50 relative px-4 flex items-center`}
                 style={cover.style}
               >
                 <Layout className="h-8 w-8 text-accent/40" />
              </div>
              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-semibold group-hover:text-accent transition-colors truncate max-w-[170px]">{board.name}</h3>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setBoardToDelete({ id: board.id, name: board.name });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="mt-auto pt-4 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  <span>{t("updated")} {new Date(board.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
              );
            })()
          ))}
        </div>
      ) : (
        <div className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-xl bg-card/30">
          <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Layout className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-xl font-semibold mb-1">{t("noBoardsFound")}</h3>
          <p className="text-muted-foreground max-w-xs mb-6">
            {searchQuery ? t("noBoardsMatch", { query: searchQuery }) : t("noBoardsEmpty")}
          </p>
          <button 
            onClick={handleCreateBoardClick}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-accent/10 text-accent hover:bg-accent/20 h-9 px-4"
          >
            {t("createFirstBoard")}
          </button>
        </div>
      )}
    </div>
  );
}
