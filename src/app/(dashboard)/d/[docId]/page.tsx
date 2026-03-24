"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, Loader2, ArrowLeft, Plus, MoreVertical, GripVertical, Trash2 } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useDocumentRealtime } from "@/hooks/useDocumentRealtime";
import { getDocument, createDocumentBrick, updateDocumentBrick, deleteDocumentBrick, DocumentView, DocumentBrick, reorderDocumentBricks, listDocuments, DocumentSummary } from "@/lib/api/documents";
import { listTeamBoards, BoardSummary } from "@/lib/api/contracts";
import Link from "next/link";
import { UnifiedBrickList } from "@/components/bricks/unified-brick-list";

export default function DocumentPage() {
  const { docId } = useParams() as { docId: string };
  const { accessToken, user } = useSession();
  const router = useRouter();

  const [document, setDocument] = useState<DocumentView | null>(null);
  const [teamDocs, setTeamDocs] = useState<DocumentSummary[]>([]);
  const [teamBoards, setTeamBoards] = useState<BoardSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { activeTeamId } = useSession();

  const fetchDoc = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const doc = await getDocument(docId, accessToken);
      setDocument(doc);
      
      if (activeTeamId) {
        const [docs, boards] = await Promise.all([
          listDocuments(activeTeamId, accessToken),
          listTeamBoards(activeTeamId, accessToken)
        ]);
        setTeamDocs(docs);
        setTeamBoards(boards);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load document");
    } finally {
      setIsLoading(false);
    }
  }, [docId, accessToken, activeTeamId]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  useDocumentRealtime(docId, (event) => {
    if (event.type === "brick.created") {
      setDocument((prev) => {
        if (!prev) return prev;
        const exists = prev.bricks.some((b) => b.id === event.payload.id);
        if (exists) return prev;
        return { ...prev, bricks: [...prev.bricks, event.payload].sort((a, b) => a.position - b.position) };
      });
    } else if (event.type === "brick.updated") {
       setDocument((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          bricks: prev.bricks.map((b) => (b.id === event.payload.id ? event.payload : b)),
        };
      });
    } else if (event.type === "brick.deleted") {
      setDocument((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          bricks: prev.bricks.filter((b) => b.id !== event.payload.brickId),
        };
      });
    } else if (event.type === "document.updated") {
      setDocument((prev) => {
        if (!prev) return prev;
        return { ...prev, title: event.payload.title };
      });
    } else if (event.type === "brick.reordered") {
      setDocument((prev) => {
        if (!prev) return prev;
        const updates = event.payload.updates as {id: string, position: number}[];
        const newBricks = prev.bricks.map(b => {
          const u = updates.find(x => x.id === b.id);
          return u ? { ...b, position: u.position } : b;
        }).sort((a, b) => a.position - b.position);
        return { ...prev, bricks: newBricks };
      });
    }
  });

  const handleAddBrick = async (kind: string) => {
    if (!accessToken || !document) return;
    const position = document.bricks.length > 0 ? document.bricks[document.bricks.length - 1].position + 1000 : 1000;
    
    // Default empty content based on kind
    let content: any = {};
    if (kind === 'text') content = { text: '' };
    if (kind === 'checklist') content = { items: [] };
    if (kind === 'graph') content = { type: 'line', data: [{name:'Jan', value:400}, {name:'Feb', value:300}], title: 'New Chart' };
    if (kind === 'accordion') content = { title: 'Toggle Header', body: '', isExpanded: true };
    if (kind === 'table') content = { rows: [['Header 1', 'Header 2'], ['Row 1 Cell 1', 'Row 1 Cell 2']] };
    if (kind === 'image') content = { url: '' };

    try {
      const newBrick = await createDocumentBrick(docId, { kind, position, content }, accessToken);
      // Wait for WS OR optimistic update:
      setDocument((prev) => {
        if (!prev) return prev;
        return { ...prev, bricks: [...prev.bricks, newBrick].sort((a, b) => a.position - b.position) };
      });
    } catch (e) {
      console.error(e);
      alert("Failed to create block");
    }
  };

  const handleUpdateBrick = async (brickId: string, content: any) => {
    if (!accessToken || !document) return;
    
    // Optimistic update
    setDocument((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        bricks: prev.bricks.map((b) => (b.id === brickId ? { ...b, content } : b)),
      };
    });

    try {
      await updateDocumentBrick(docId, brickId, content, accessToken);
    } catch (e) {
       console.error(e);
       // Revert or show error
    }
  };

  const handleDeleteBrick = async (brickId: string) => {
    if (!accessToken || !document) return;
    
    setDocument((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        bricks: prev.bricks.filter((b) => b.id !== brickId),
      };
    });

    try {
      await deleteDocumentBrick(docId, brickId, accessToken);
    } catch (e) {
      console.error(e);
    }
  };

  const handleReorderBricks = async (brickIds: string[]) => {
    if (!accessToken || !document) return;

    // Optimistic update
    setDocument((prev) => {
      if (!prev) return prev;
      const newBricks = brickIds
        .map((id) => prev.bricks.find((b) => b.id === id))
        .filter(Boolean) as DocumentBrick[];
      return { ...prev, bricks: newBricks };
    });

    try {
      const updates = brickIds.map((id, index) => ({ id, position: index }));
      await reorderDocumentBricks(docId, updates, accessToken);
    } catch (e) {
      console.error(e);
      fetchDoc(); // Rollback on error
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold">Document Not Found</h2>
        <p className="text-muted-foreground mt-2 mb-6">{error || "The document you are looking for does not exist or you don't have access."}</p>
        <Link href="/" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const canEdit = document.role === 'owner' || document.role === 'editor';

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-card/50 px-4 backdrop-blur-md z-40 shrink-0 shadow-sm sticky top-0">
        <div className="flex items-center space-x-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground hover:bg-accent/10 p-1.5 rounded-md transition-colors group">
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          </Link>
          <div className="h-4 w-px bg-border/80"></div>
          
          <div className="flex items-center space-x-2">
            <FileText className="h-5 w-5 text-accent" />
            <h1 className="text-base font-semibold tracking-tight">{document.title}</h1>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Share/Members buttons could go here */}
          <div className="flex -space-x-2 mr-2">
             <div className="h-7 w-7 rounded-full ring-2 ring-background bg-gradient-to-tr from-accent to-primary/60 flex items-center justify-center text-[10px] font-bold text-white shadow-sm" title={user?.displayName}>
               {user?.displayName?.charAt(0).toUpperCase()}
             </div>
          </div>
        </div>
      </header>

      {/* Editor Content Area */}
      <main className="flex-1 overflow-y-auto w-full flex justify-center py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl w-full">
           <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-8 text-foreground pb-4 border-b border-border/50">
             {document.title}
           </h1>

           <div className="pb-32">
             <UnifiedBrickList 
               bricks={document.bricks}
               canEdit={canEdit}
               documents={teamDocs}
               boards={teamBoards}
               onAddBrick={(kind) => handleAddBrick(kind as any)}
               onUpdateBrick={handleUpdateBrick}
               onDeleteBrick={handleDeleteBrick}
               onReorderBricks={handleReorderBricks}
             />
           </div>
        </div>
      </main>
    </div>
  );
}

