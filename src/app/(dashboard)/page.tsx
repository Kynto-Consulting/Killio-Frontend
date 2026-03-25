"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Clock, Layout, Users, Sparkles, Loader2, Trash2 } from "lucide-react";
import { AiGenerationPanel } from "@/components/ui/ai-generation-panel";
import { CreateBoardModal } from "@/components/ui/create-board-modal";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { useSession } from "@/components/providers/session-provider";
import { useEffect } from "react";
import { listTeamBoards, BoardSummary, createBoard, deleteBoard } from "@/lib/api/contracts";
import { listDocuments, DocumentSummary, createDocument } from "@/lib/api/documents";
import { FileText } from "lucide-react";
import { toast } from "@/lib/toast";

export default function WorkspacesPage() {
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const { accessToken, activeTeamId } = useSession();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);
  const [boardToDelete, setBoardToDelete] = useState<{ id: string; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'boards' | 'documents'>('boards');

  useEffect(() => {
    if (!accessToken || !activeTeamId) return;

    setIsLoading(true);
    Promise.all([
      listTeamBoards(activeTeamId, accessToken).catch(e => { console.error(e); return [] as BoardSummary[]; }),
      listDocuments(activeTeamId, accessToken).catch(e => { console.error(e); return [] as DocumentSummary[]; })
    ]).then(([fetchedBoards, fetchedDocs]) => {
      setBoards(fetchedBoards);
      setDocuments(fetchedDocs);
    }).finally(() => setIsLoading(false));
  }, [accessToken, activeTeamId]);

  const handleCreateBoardClick = () => {
    if (!accessToken) return;
    if (!activeTeamId) {
      toast("No active workspace found. Please select or create one from the top menu first.", "info");
      return;
    }
    setIsCreateBoardModalOpen(true);
  };

  const handleCreateBoardSubmit = async (payload: { name: string; coverImageUrl: string }) => {
    if (!accessToken || !activeTeamId) return;

    const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `board-${Date.now()}`;
    const newBoard = await createBoard({ name: payload.name, slug, coverImageUrl: payload.coverImageUrl }, activeTeamId, accessToken);
    setBoards([...boards, newBoard]);
  };

  const handleCreateDocumentClick = async () => {
    if (!accessToken || !activeTeamId) return;
    const title = prompt("Enter document title");
    if (!title || !title.trim()) return;

    try {
      const doc = await createDocument({ teamId: activeTeamId, title }, accessToken);
      setDocuments([doc, ...documents]);
    } catch (e) {
      console.error(e);
      toast("Failed to create document", "error");
    }
  };

  const handleDeleteBoard = async () => {
    if (!accessToken || !boardToDelete) return;

    try {
      await deleteBoard(boardToDelete.id, accessToken);
      setBoards(boards.filter(b => b.id !== boardToDelete.id));
      setBoardToDelete(null);
    } catch (error) {
      console.error("Failed to delete board", error);
      toast("Failed to delete board", "error");
    }
  };

  return (
    <div className="container mx-auto p-6 lg:p-10 max-w-6xl">
      <ConfirmDeleteModal
        isOpen={!!boardToDelete}
        onClose={() => setBoardToDelete(null)}
        onConfirm={handleDeleteBoard}
        title="Delete Board"
        description={`Are you sure you want to delete the board "${boardToDelete?.name}"? This action cannot be undone.`}
      />
      <CreateBoardModal
        isOpen={isCreateBoardModalOpen}
        onClose={() => setIsCreateBoardModalOpen(false)}
        onSubmit={handleCreateBoardSubmit}
      />
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Workspaces</h1>
          <p className="text-muted-foreground">Manage your boards, documents, and projects.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAiPanelOpen(true)}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-card hover:bg-accent/10 hover:text-foreground shadow-sm h-9 px-4 group"
          >
            <Sparkles className="mr-2 h-4 w-4 text-accent" />
            AI Draft Studio
          </button>
          <button onClick={handleCreateBoardClick} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary/90 hover:bg-primary text-primary-foreground shadow h-9 px-4 group">
            <Plus className="mr-2 h-4 w-4 opacity-70 group-hover:scale-110 transition-transform" />
            New Board
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
            <span>Boards</span>
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
            <span>Documents</span>
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
            <h3 className="font-medium">New Board</h3>
            <p className="text-sm text-muted-foreground mt-1">Start from scratch or a template</p>
          </div>

          {isLoading ? (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary/50" />
              <p>Gathering your workspaces...</p>
            </div>
          ) : boards.map((board) => (
            <Link href={`/b/${board.id}`} key={board.id} className="group relative rounded-xl border border-border bg-card shadow-sm hover:border-accent/40 hover:shadow-md transition-all flex flex-col min-h-[220px] overflow-hidden">
              <div className={`h-24 ${board.coverImageUrl || 'bg-gradient-to-tr from-accent to-primary/60'} w-full border-b border-border/50 relative`}>
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
                    Board
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div onClick={handleCreateDocumentClick} className="group relative rounded-xl border border-dashed border-border/60 bg-transparent hover:border-accent hover:bg-accent/5 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center min-h-[220px]">
            <div className="mb-4 rounded-full bg-accent/10 p-3 text-accent group-hover:bg-accent/20 transition-colors">
              <Plus className="h-6 w-6" />
            </div>
            <h3 className="font-medium">New Document</h3>
            <p className="text-sm text-muted-foreground mt-1">Start writing with bricks</p>
          </div>

          {isLoading ? (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary/50" />
              <p>Gathering your documents...</p>
            </div>
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
                    Document
                  </div>
                  <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-12">
        <h2 className="text-xl font-semibold mb-6 flex items-center">
          <Clock className="mr-2 h-5 w-5 text-muted-foreground" />
          Recently viewed
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
                    {item.type === 'board' ? 'Team Board' : 'Document'} <span className="mx-1">•</span> Updated {new Date(item.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
            {boards.length === 0 && documents.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground">No recent activity found.</div>
            )}
          </div>
        </div>
      </div>

      <AiGenerationPanel isOpen={isAiPanelOpen} onClose={() => setIsAiPanelOpen(false)} />
    </div>
  );
}
