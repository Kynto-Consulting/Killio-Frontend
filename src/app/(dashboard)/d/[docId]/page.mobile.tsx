"use client";

/**
 * Mobile document view — PAR-02
 *
 * Differences from web:
 * - Compact header: back + title + 3-dot menu (no row of 5 buttons)
 * - Copilot / Comments open as a bottom sheet instead of a side drawer
 * - Export/Share actions inside the overflow menu
 * - Full-width content area (no horizontal margin compression from drawers)
 * - Touch-friendly brick toolbar (shown at bottom when text is selected)
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, MoreVertical, Sparkles, MessageSquare,
  Download, Share2, FileText, X, Check,
} from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useDocumentRealtime } from "@/hooks/useDocumentRealtime";
import {
  getDocument, updateDocumentTitle, DocumentView, DocumentBrick,
  createDocumentBrick, updateDocumentBrick, deleteDocumentBrick,
  reorderDocumentBricks,
} from "@/lib/api/documents";
import { UnifiedBrickList } from "@/components/bricks/unified-brick-list";
import { getTopLevelBrickIds, sanitizeChildrenByContainer } from "@/lib/bricks/nesting";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

export default function DocumentMobilePage() {
  const t = useTranslations("document-detail");
  const { docId } = useParams() as { docId: string };
  const { accessToken, user, activeTeamId } = useSession();

  const [document, setDocument] = useState<DocumentView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState<"copilot" | "comments" | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");

  const documentBricksRef = useRef<DocumentBrick[]>([]);
  useEffect(() => {
    if (document?.bricks) documentBricksRef.current = document.bricks;
  }, [document?.bricks]);

  const sanitize = useCallback((bricks: DocumentBrick[]): DocumentBrick[] => {
    const deduped = Array.from(new Map(bricks.map(b => [b.id, b])).values());
    const ids = new Set(deduped.map(b => b.id));
    return deduped.map(b => ({ ...b, content: sanitizeChildrenByContainer(b.content || {}, ids) }));
  }, []);

  const fetchDoc = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const doc = await getDocument(docId, accessToken);
      setDocument({ ...doc, bricks: sanitize(doc.bricks) });
    } catch (e: any) {
      setError(e.message || t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [docId, accessToken, sanitize, t]);

  useEffect(() => { fetchDoc(); }, [fetchDoc]);

  useDocumentRealtime(docId, (event) => {
    if (event.type === "brick.created") {
      setDocument(prev => {
        if (!prev) return prev;
        if (prev.bricks.some(b => b.id === event.payload.id)) return prev;
        return { ...prev, bricks: sanitize([...prev.bricks, event.payload]).sort((a, b) => a.position - b.position) };
      });
    } else if (event.type === "brick.updated") {
      if (event.payload?.fullSyncRequired) { fetchDoc(); }
      else {
        setDocument(prev => {
          if (!prev) return prev;
          return { ...prev, bricks: sanitize(prev.bricks.map(b => b.id === event.payload.id ? event.payload : b)) };
        });
      }
    } else if (event.type === "brick.deleted") {
      setDocument(prev => prev ? { ...prev, bricks: prev.bricks.filter(b => b.id !== event.payload.brickId) } : prev);
    } else if (event.type === "document.updated") {
      setDocument(prev => prev ? { ...prev, title: event.payload.title } : prev);
    }
  });

  const handleAddBrick = useCallback(async (kind: string, afterBrickId?: string, parentProps?: any, initialContent?: any) => {
    if (!accessToken || !document) return;
    const topLevel = document.bricks.filter(b => getTopLevelBrickIds(document.bricks).has(b.id)).sort((a, b) => a.position - b.position);
    let position = 1000;
    if (afterBrickId) {
      const idx = topLevel.findIndex(b => b.id === afterBrickId);
      if (idx >= 0) position = idx === topLevel.length - 1 ? topLevel[idx].position + 1000 : (topLevel[idx].position + topLevel[idx + 1].position) / 2;
    } else {
      position = topLevel.length > 0 ? topLevel[topLevel.length - 1].position + 1000 : 1000;
    }
    let content: any = initialContent || {};
    if (!initialContent && kind === "text") content = { text: "" };
    try {
      const newBrick = await createDocumentBrick(docId, { kind: kind === "code" || kind === "math" ? "text" : kind, position, content }, accessToken);
      setDocument(prev => prev ? { ...prev, bricks: sanitize([...prev.bricks, newBrick]).sort((a, b) => a.position - b.position) } : prev);
    } catch { toast(t("createBlockError"), "error"); }
  }, [accessToken, document, docId, sanitize, t]);

  const handleUpdateBrick = useCallback(async (brickId: string, content: any) => {
    if (!accessToken || !document) return;
    setDocument(prev => prev ? { ...prev, bricks: prev.bricks.map(b => b.id === brickId ? { ...b, content } : b) } : prev);
    try { await updateDocumentBrick(docId, brickId, content, accessToken); } catch { console.error("Update brick failed"); }
  }, [accessToken, document, docId]);

  const handleDeleteBrick = useCallback(async (brickId: string) => {
    if (!accessToken || !document) return;
    setDocument(prev => prev ? { ...prev, bricks: prev.bricks.filter(b => b.id !== brickId) } : prev);
    try { await deleteDocumentBrick(docId, brickId, accessToken); } catch { fetchDoc(); }
  }, [accessToken, document, docId, fetchDoc]);

  const handleReorderBricks = useCallback(async (brickIds: string[]) => {
    if (!accessToken || !document) return;
    const updates = brickIds.map((id, i) => ({ id, position: i * 1000 + 1000 }));
    setDocument(prev => {
      if (!prev) return prev;
      return { ...prev, bricks: prev.bricks.map(b => { const u = updates.find(x => x.id === b.id); return u ? { ...b, position: u.position } : b; }) };
    });
    try { await reorderDocumentBricks(docId, updates, accessToken); } catch { fetchDoc(); }
  }, [accessToken, document, docId, fetchDoc]);

  const handleUpdateTitle = async () => {
    if (!accessToken || !document || !tempTitle.trim()) { setIsEditingTitle(false); return; }
    const original = document.title;
    setDocument(prev => prev ? { ...prev, title: tempTitle } : null);
    setIsEditingTitle(false);
    try { await updateDocumentTitle(docId, tempTitle, accessToken); }
    catch { setDocument(prev => prev ? { ...prev, title: original } : null); }
  };

  const canEdit = document?.role === "owner" || document?.role === "editor";

  // ─── Loading skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-background">
        <header className="flex items-center gap-2 px-3 py-3 border-b border-border/50">
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          <Skeleton className="h-4 flex-1 rounded" />
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          <Skeleton className="h-9 w-3/4 rounded-lg mb-6" />
          {[1,2,3,4,5].map(i => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-full rounded" style={{ opacity: 1 - i * 0.15 }} />
              <Skeleton className="h-4 w-4/5 rounded" style={{ opacity: 1 - i * 0.15 }} />
            </div>
          ))}
        </main>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm font-medium">{error || t("notFoundTitle")}</p>
        <Link href="/d" className="mt-4 text-xs text-accent">{t("returnDashboard")}</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Compact header */}
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50 bg-background/90 backdrop-blur shrink-0 z-10">
        <Link href="/d" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Link>

        {/* Title — tap to edit */}
        {isEditingTitle ? (
          <div className="flex-1 flex items-center gap-1 min-w-0">
            <input
              autoFocus
              value={tempTitle}
              onChange={e => setTempTitle(e.target.value)}
              onBlur={handleUpdateTitle}
              onKeyDown={e => { if (e.key === "Enter") handleUpdateTitle(); if (e.key === "Escape") setIsEditingTitle(false); }}
              className="flex-1 min-w-0 text-sm font-semibold bg-transparent border-b border-accent focus:outline-none"
            />
            <button onClick={handleUpdateTitle} className="p-1 text-accent shrink-0"><Check className="h-4 w-4" /></button>
            <button onClick={() => setIsEditingTitle(false)} className="p-1 text-muted-foreground shrink-0"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <button
            onClick={() => { if (canEdit) { setTempTitle(document.title); setIsEditingTitle(true); } }}
            className="flex-1 min-w-0 text-left"
          >
            <p className="text-sm font-semibold truncate">{document.title}</p>
          </button>
        )}

        {/* Quick action buttons */}
        <button
          onClick={() => setActiveSheet(s => s === "copilot" ? null : "copilot")}
          className={cn("p-1.5 rounded-lg transition-colors shrink-0", activeSheet === "copilot" ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground hover:bg-accent/10")}
          aria-label="Copilot"
        >
          <Sparkles className="h-4 w-4" />
        </button>
        <button
          onClick={() => setActiveSheet(s => s === "comments" ? null : "comments")}
          className={cn("p-1.5 rounded-lg transition-colors shrink-0", activeSheet === "comments" ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground hover:bg-accent/10")}
          aria-label="Comments"
        >
          <MessageSquare className="h-4 w-4" />
        </button>

        {/* Overflow menu */}
        <div className="relative shrink-0">
          <button onClick={() => setIsMenuOpen(o => !o)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors">
            <MoreVertical className="h-4 w-4" />
          </button>
          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden">
                <Link
                  href={`/d/${docId}`}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-accent/5 transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Vista completa
                </Link>
                <button
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-accent/5 transition-colors"
                  onClick={() => { setIsMenuOpen(false); /* trigger share */ }}
                >
                  <Share2 className="h-4 w-4 text-muted-foreground" />
                  {t("header.share")}
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-accent/5 transition-colors"
                  onClick={() => { setIsMenuOpen(false); /* trigger export */ }}
                >
                  <Download className="h-4 w-4 text-muted-foreground" />
                  Descargar
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Document content */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        {/* Inline title */}
        <h1
          onClick={() => { if (canEdit) { setTempTitle(document.title); setIsEditingTitle(true); } }}
          className={cn("text-2xl font-bold tracking-tight mb-6 pb-4 border-b border-border/40", canEdit && "cursor-pointer")}
        >
          {document.title}
        </h1>

        <UnifiedBrickList
          bricks={document.bricks.filter(b => getTopLevelBrickIds(document.bricks).has(b.id))}
          activeBricks={document.bricks}
          canEdit={canEdit}
          documents={[]}
          boards={[]}
          users={[]}
          addableKinds={["text", "table", "checklist", "image", "code"]}
          onAddBrick={handleAddBrick}
          onUpdateBrick={handleUpdateBrick}
          onDeleteBrick={handleDeleteBrick}
          onReorderBricks={handleReorderBricks}
          onCrossContainerDrop={async () => {}}
          onPasteImageInTextBrick={async () => {}}
          onUploadMediaFiles={async () => {}}
          onAiAction={() => {}}
        />

        {/* Bottom padding for safe area */}
        <div className="h-20" />
      </main>

      {/* Bottom sheet for Copilot / Comments */}
      {activeSheet && (
        <>
          <div
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
            onClick={() => setActiveSheet(null)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                {activeSheet === "copilot" ? <Sparkles className="h-4 w-4 text-accent" /> : <MessageSquare className="h-4 w-4 text-accent" />}
                <span className="text-sm font-semibold">
                  {activeSheet === "copilot" ? t("header.copilot") : t("header.comments")}
                </span>
              </div>
              <button onClick={() => setActiveSheet(null)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-muted-foreground text-center py-8">
                {activeSheet === "copilot" ? "Abre la vista completa para usar el Copilot completo." : "Abre la vista completa para ver y añadir comentarios."}
              </p>
              <Link
                href={`/d/${docId}`}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
              >
                <FileText className="h-4 w-4" />
                Abrir vista completa
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
