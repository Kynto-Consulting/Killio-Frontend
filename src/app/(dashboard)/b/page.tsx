"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Clock, Layout, Loader2, Search, Trash2 } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { listTeamBoards, BoardSummary, createBoard, deleteBoard } from "@/lib/api/contracts";
import { toast } from "@/lib/toast";
import { CreateBoardModal } from "@/components/ui/create-board-modal";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";

export default function BoardsPage() {
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
      toast("No active workspace found. Please select or create one from the top menu first.", "info");
      return;
    }
    setIsCreateBoardModalOpen(true);
  };

  const handleCreateBoardSubmit = async (payload: { name: string; coverImageUrl: string }) => {
    if (!accessToken || !activeTeamId) return;
    
    try {
      const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `board-${Date.now()}`;
      const newBoard = await createBoard({ name: payload.name, slug, coverImageUrl: payload.coverImageUrl }, activeTeamId, accessToken);
      setBoards([...boards, newBoard]);
      toast("Board created successfully", "success");
    } catch (error) {
      toast("Failed to create board", "error");
    }
  };

  const handleDeleteBoard = async () => {
    if (!accessToken || !boardToDelete) return;

    try {
      await deleteBoard(boardToDelete.id, accessToken);
      setBoards(boards.filter(b => b.id !== boardToDelete.id));
      setBoardToDelete(null);
      toast("Board deleted successfully", "success");
    } catch (error) {
      toast("Failed to delete board", "error");
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
          <h1 className="text-3xl font-bold tracking-tight mb-2">Boards</h1>
          <p className="text-muted-foreground">Manage your workspace boards and projects.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Search boards..."
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
            New Board
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary/50" />
          <p>Gathering your boards...</p>
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
            <h3 className="font-medium">New Board</h3>
            <p className="text-sm text-muted-foreground mt-1">Start from scratch or a template</p>
          </div>

          {filteredBoards.map((board) => (
            <Link 
              href={`/b/${board.id}`} 
              key={board.id} 
              className="group relative rounded-xl border border-border bg-card shadow-sm hover:border-accent/40 hover:shadow-md transition-all flex flex-col min-h-[160px] overflow-hidden"
            >
               <div className={`h-20 ${board.coverImageUrl || 'bg-gradient-to-tr from-accent/20 to-primary/20'} w-full border-b border-border/50 relative px-4 flex items-center`}>
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
                  <span>Updated {new Date(board.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-xl bg-card/30">
          <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Layout className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-xl font-semibold mb-1">No boards found</h3>
          <p className="text-muted-foreground max-w-xs mb-6">
            {searchQuery ? `No boards match "${searchQuery}"` : "You haven't created any boards in this workspace yet."}
          </p>
          <button 
            onClick={handleCreateBoardClick}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-accent/10 text-accent hover:bg-accent/20 h-9 px-4"
          >
            Create your first board
          </button>
        </div>
      )}
    </div>
  );
}
