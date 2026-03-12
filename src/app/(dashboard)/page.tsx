"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Clock, Layout, Users, Sparkles, Loader2 } from "lucide-react";
import { AiGenerationPanel } from "@/components/ui/ai-generation-panel";
import { CreateBoardModal } from "@/components/ui/create-board-modal";
import { useSession } from "@/components/providers/session-provider";
import { useEffect } from "react";
import { listTeamBoards, BoardSummary, createBoard } from "@/lib/api/contracts";

export default function WorkspacesPage() {
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const { accessToken, activeTeamId } = useSession();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);

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
      alert("No active workspace found. Please select or create one from the top menu first.");
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

  return (
    <div className="container mx-auto p-6 lg:p-10 max-w-6xl">
      <CreateBoardModal 
        isOpen={isCreateBoardModalOpen}
        onClose={() => setIsCreateBoardModalOpen(false)}
        onSubmit={handleCreateBoardSubmit}
      />
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Workspaces</h1>
          <p className="text-muted-foreground">Manage your boards, teams, and projects.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Create new card */}
        <div onClick={handleCreateBoardClick} className="group relative rounded-xl border border-dashed border-border/60 bg-transparent hover:border-accent hover:bg-accent/5 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center min-h-[220px]">
          <div className="mb-4 rounded-full bg-accent/10 p-3 text-accent group-hover:bg-accent/20 transition-colors">
            <Plus className="h-6 w-6" />
          </div>
          <h3 className="font-medium">New Board</h3>
          <p className="text-sm text-muted-foreground mt-1">Start from scratch or a template</p>
        </div>

        {/* Board Cards */}
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
              <h3 className="text-xl font-semibold mb-2 group-hover:text-accent transition-colors">{board.name}</h3>
              
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

      <div className="mt-12">
        <h2 className="text-xl font-semibold mb-6 flex items-center">
          <Clock className="mr-2 h-5 w-5 text-muted-foreground" />
          Recently viewed
        </h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border/50">
            {boards.slice(0, 3).map((item, i) => (
              <Link href={`/b/${item.id}`} key={i} className="flex items-center px-4 py-3 hover:bg-accent/5 transition-colors group">
                <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center mr-4 group-hover:bg-primary/30 transition-colors">
                  <Layout className="h-4 w-4 text-foreground/70" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium">{item.name}</span>
                  <div className="text-xs text-muted-foreground flex items-center mt-0.5">
                    Team Board <span className="mx-1">•</span> Accessed recently
                  </div>
                </div>
              </Link>
            ))}
            {boards.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground">No recent boards found.</div>
            )}
          </div>
        </div>
      </div>
      
      <AiGenerationPanel isOpen={isAiPanelOpen} onClose={() => setIsAiPanelOpen(false)} />
    </div>
  );
}
