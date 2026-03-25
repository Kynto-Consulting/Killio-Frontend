"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, Loader2, ArrowLeft, Plus, MoreVertical, GripVertical, Trash2, MessageSquare, Share2, Users, X, Check } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useDocumentRealtime } from "@/hooks/useDocumentRealtime";
import { getDocument, createDocumentBrick, updateDocumentBrick, deleteDocumentBrick, DocumentView, DocumentBrick, reorderDocumentBricks, listDocuments, DocumentSummary } from "@/lib/api/documents";
import { listTeamBoards, BoardSummary, listTeamMembers } from "@/lib/api/contracts";
import Link from "next/link";
import { UnifiedBrickList } from "@/components/bricks/unified-brick-list";
import { cn } from "@/lib/utils";
import { useDocumentPresence } from "@/hooks/useDocumentPresence";
import { addDocumentMember } from "@/lib/api/documents";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { updateDocumentTitle } from "@/lib/api/documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentCommentsDrawer } from "@/components/ui/document-comments-drawer";
import { Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";

export default function DocumentPage() {
  const { docId } = useParams() as { docId: string };
  const { accessToken, user } = useSession();
  const router = useRouter();

  const [document, setDocument] = useState<DocumentView | null>(null);
  const [teamDocs, setTeamDocs] = useState<DocumentSummary[]>([]);
  const [teamBoards, setTeamBoards] = useState<BoardSummary[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<any>("editor");
  const [isSharing, setIsSharing] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'copilot' | 'comments' | 'activity'>('comments');

  const { activeTeamId } = useSession();
  const presenceMembers = useDocumentPresence(docId, user, accessToken);

  const fetchDoc = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const doc = await getDocument(docId, accessToken);
      setDocument(doc);

      if (activeTeamId) {
        const [docs, boards, members] = await Promise.all([
          listDocuments(activeTeamId, accessToken),
          listTeamBoards(activeTeamId, accessToken),
          listTeamMembers(activeTeamId, accessToken)
        ]);
        setTeamDocs(docs);
        setTeamBoards(boards);
        setTeamMembers(members);
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
        const updates = event.payload.updates as { id: string, position: number }[];
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
    if (kind === 'graph') content = { type: 'line', data: [{ name: 'Jan', value: 400 }, { name: 'Feb', value: 300 }], title: 'New Chart' };
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
      toast("Failed to create block", "error");
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
  const handleUpdateTitle = async () => {
    if (!accessToken || !document || !tempTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }
    const originalTitle = document.title;
    setDocument(prev => prev ? { ...prev, title: tempTitle } : null);
    setIsEditingTitle(false);
    try {
      await updateDocumentTitle(docId, tempTitle, accessToken);
    } catch (e) {
      setDocument(prev => prev ? { ...prev, title: originalTitle } : null);
    }
  };

  const handleShare = async () => {
    if (!accessToken || !shareEmail.trim()) return;
    setIsSharing(true);
    try {
      await addDocumentMember(docId, shareEmail, shareRole, accessToken);
      toast(`Shared with ${shareEmail}`);
      setShareEmail("");
      setIsShareModalOpen(false);
    } catch (e: any) {
      toast(e.message || "Failed to share document", "error");
    } finally {
      setIsSharing(false);
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
          {/* Presence */}
          <div className="flex -space-x-1.5 mr-2">
            {presenceMembers.map((member) => (
              <img
                key={member.clientId}
                src={getUserAvatarUrl(member.data.avatar_url, member.data.email, 24)}
                alt={member.data.displayName}
                title={`${member.data.displayName} is viewing`}
                className="h-6 w-6 rounded-full border border-background ring-1 ring-border/50 object-cover bg-muted"
              />
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSidebarTab('copilot');
              setIsCommentsOpen(true);
            }}
            className={cn("h-8 gap-2 text-xs font-semibold", isCommentsOpen && sidebarTab === 'copilot' && "bg-accent/10 text-accent")}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Copilot
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSidebarTab('comments');
              setIsCommentsOpen(true);
            }}
            className={cn("h-8 gap-2 text-xs font-semibold", isCommentsOpen && sidebarTab === 'comments' && "bg-accent/10 text-accent")}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Comments
          </Button>

          <Button variant="ghost" size="sm" onClick={() => setIsShareModalOpen(true)} className="h-8 gap-2 text-xs font-semibold">
            <Share2 className="h-3.5 w-3.5" />
            Share
          </Button>

          <div className="h-7 w-7 rounded-full ring-2 ring-background bg-gradient-to-tr from-accent to-primary/60 flex items-center justify-center text-[10px] font-bold text-white shadow-sm" title={user?.displayName}>
            {user?.displayName?.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      {/* Share Modal Backdrop */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsShareModalOpen(false)}>
          <div className="bg-card w-full max-w-md border border-border shadow-2xl rounded-xl overflow-hidden p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-accent" />
                Share Document
              </h2>
              <button onClick={() => setIsShareModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">User Email</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="email@example.com"
                    value={shareEmail}
                    onChange={(e: any) => setShareEmail(e.target.value)}
                    className="flex-1"
                  />
                  <select
                    value={shareRole}
                    onChange={e => setShareRole(e.target.value)}
                    className="bg-muted border border-border rounded-md px-2 text-xs outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </div>
              </div>
              <Button
                onClick={handleShare}
                disabled={isSharing || !shareEmail.trim()}
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite to Document"}
              </Button>
            </div>

            <p className="mt-6 text-[11px] text-muted-foreground leading-relaxed italic border-t border-border pt-4">
              Invited users must be members of the same team to access this document.
            </p>
          </div>
        </div>
      )}

      {/* Editor Content Area */}
      <main className="flex-1 overflow-y-auto w-full flex justify-center py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl w-full">
          {isEditingTitle ? (
            <div className="flex items-center gap-2 mb-8 animate-in slide-in-from-left-2 duration-200">
              <Input
                autoFocus
                value={tempTitle}
                onChange={(e: any) => setTempTitle(e.target.value)}
                onBlur={handleUpdateTitle}
                onKeyDown={(e: any) => e.key === 'Enter' && handleUpdateTitle()}
                className="text-4xl md:text-5xl h-auto py-2 font-bold tracking-tight bg-transparent border-none focus-visible:ring-0 px-0"
              />
              <Button size="icon" variant="ghost" className="h-10 w-10 text-accent" onClick={handleUpdateTitle}>
                <Check className="h-6 w-6" />
              </Button>
            </div>
          ) : (
            <h1
              onClick={() => {
                if (canEdit) {
                  setTempTitle(document.title);
                  setIsEditingTitle(true);
                }
              }}
              className={`text-4xl md:text-5xl font-bold tracking-tight mb-8 text-foreground pb-4 border-b border-border/50 group cursor-pointer hover:border-accent/40 transition-colors ${!canEdit && 'cursor-default'}`}
            >
              {document.title}
              {canEdit && (
                <span className="ml-4 opacity-0 group-hover:opacity-30 transition-opacity text-xl font-normal text-muted-foreground whitespace-nowrap">Edit Title</span>
              )}
            </h1>
          )}

          <div className="pb-32">
            <UnifiedBrickList
              bricks={document.bricks}
              canEdit={canEdit}
              documents={teamDocs}
              boards={teamBoards}
              users={teamMembers.map(m => ({ id: m.id, name: m.displayName || m.email, avatarUrl: m.avatarUrl }))}
              onAddBrick={(kind) => handleAddBrick(kind as any)}
              onUpdateBrick={handleUpdateBrick}
              onDeleteBrick={handleDeleteBrick}
              onReorderBricks={handleReorderBricks}
            />
          </div>
        </div>
      </main>

      <DocumentCommentsDrawer
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        docId={docId}
        documents={teamDocs}
        boards={teamBoards}
        members={teamMembers}
        initialTab={sidebarTab}
      />
    </div>
  );
}

