"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, Loader2, ArrowLeft, Plus, MoreVertical, GripVertical, Trash2, MessageSquare, Share2, Users, X, Check, Download, Printer, Settings } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useDocumentRealtime } from "@/hooks/useDocumentRealtime";
import { getDocument, createDocumentBrick, updateDocumentBrick, deleteDocumentBrick, DocumentView, DocumentBrick, reorderDocumentBricks, listDocuments, DocumentSummary } from "@/lib/api/documents";
import { listTeamBoards, BoardSummary, listTeamMembers, uploadFile } from "@/lib/api/contracts";
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
import { useTranslations } from "@/components/providers/i18n-provider";
import { MediaCarouselItem, parseMediaMeta, buildMediaCaption, uploadFilesAsMediaItems } from "@/lib/media-bricks";

export default function DocumentPage() {
  const t = useTranslations("document-detail");
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
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'docx'>('pdf');
  const [exportStyle, setExportStyle] = useState<'carta' | 'harvard'>('carta');
  const [exportSize, setExportSize] = useState<'letter' | 'A4'>('A4');
  const [isExporting, setIsExporting] = useState(false);
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
      setError(e.message || t("loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [docId, accessToken, activeTeamId, t]);

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
      if (event.payload?.fullSyncRequired) {
        fetchDoc();
      } else if (event.payload?.contentPatch && event.payload?.id) {
        setDocument((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            bricks: prev.bricks.map((b) =>
              b.id === event.payload.id
                ? {
                    ...b,
                    content: { ...(b.content || {}), ...(event.payload.contentPatch || {}) },
                    updatedAt: event.payload.updatedAt || b.updatedAt,
                  }
                : b
            ),
          };
        });
      } else {
        setDocument((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            bricks: prev.bricks.map((b) => (b.id === event.payload.id ? event.payload : b)),
          };
        });
      }
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

  const handleAddBrick = async (kind: string, afterBrickId?: string) => {
    if (!accessToken || !document) return;
    
    let position = 1000;
    if (afterBrickId) {
      const idx = document.bricks.findIndex(b => b.id === afterBrickId);
      if (idx >= 0) {
        if (idx === document.bricks.length - 1) {
          position = document.bricks[idx].position + 1000;
        } else {
          position = (document.bricks[idx].position + document.bricks[idx + 1].position) / 2;
        }
      }
    } else {
      position = document.bricks.length > 0 ? document.bricks[document.bricks.length - 1].position + 1000 : 1000;
    }

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
        if (prev.bricks.some((b) => b.id === newBrick.id)) return prev;
        return { ...prev, bricks: [...prev.bricks, newBrick].sort((a, b) => a.position - b.position) };
      });
    } catch (e) {
      console.error(e);
      toast(t("createBlockError"), "error");
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

  const handleUploadMediaFiles = useCallback(async ({
    brickId,
    files,
  }: {
    brickId: string;
    files: File[];
  }) => {
    if (!accessToken || !document || files.length === 0) return;

    const target = document.bricks.find((brick) => brick.id === brickId);
    if (!target) return;

    if (target.kind !== 'image' && target.kind !== 'media' && target.kind !== 'file') {
      return;
    }

    const fallback: MediaCarouselItem = {
      url: target.content?.url || '',
      title: target.content?.title || '',
      mimeType: target.content?.mimeType || null,
      sizeBytes: target.content?.sizeBytes || null,
      assetId: target.content?.assetId || null,
    };

    const existingMeta = parseMediaMeta(target.content?.caption, fallback);

    const uploadedItems = await uploadFilesAsMediaItems({
      files,
      accessToken,
      uploadFile,
      onUploadError: (err) => {
        console.error('Failed to upload media file for document brick', err);
        toast('No se pudo subir uno de los archivos. Se mostrara localmente en esta sesion.', 'error');
      },
      allowLocalBlobFallback: true,
    });

    if (uploadedItems.length === 0) {
      toast(t("createBlockError"), "error");
      return;
    }

    const nextItems = [...existingMeta.items.filter((it: MediaCarouselItem) => it.url), ...uploadedItems];
    const first = nextItems[0];

    const updatedBrick = await updateDocumentBrick(docId, brickId, {
      ...target.content,
      mediaType: first?.mimeType?.startsWith('image/') ? 'image' : 'file',
      title: first?.title || target.content?.title || 'Media',
      url: first?.url || target.content?.url || '',
      mimeType: first?.mimeType || null,
      sizeBytes: first?.sizeBytes || null,
      assetId: first?.assetId || null,
      caption: buildMediaCaption({ subtitle: existingMeta.subtitle || '', items: nextItems }),
    }, accessToken);

    setDocument((current) => {
      if (!current) return current;
      return {
        ...current,
        bricks: current.bricks.map((brick) => (
          brick.id === brickId ? updatedBrick : brick
        )),
      };
    });
  }, [accessToken, docId, document, t]);

  const handlePasteImageInTextBrick = useCallback(async ({
    brickId,
    file,
    cursorOffset,
    markdown,
  }: {
    brickId: string;
    file: File;
    cursorOffset: number;
    markdown: string;
  }) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DocumentTextPaste] start', {
        brickId,
        fileName: file?.name,
        fileType: file?.type,
        fileSize: file?.size,
        cursorOffset,
        markdownLength: markdown?.length ?? 0,
      });
    }

    if (!accessToken || !document) return;

    const targetIndex = document.bricks.findIndex((brick) => brick.id === brickId);
    if (targetIndex < 0) return;

    const target = document.bricks[targetIndex];
    if (target.kind !== 'text') return;

    const sourceMarkdown = typeof markdown === 'string'
      ? markdown
      : String(target.content?.markdown ?? target.content?.text ?? '');
    const safeCursor = Math.max(0, Math.min(cursorOffset, sourceMarkdown.length));
    const beforeText = sourceMarkdown.slice(0, safeCursor);
    const afterText = sourceMarkdown.slice(safeCursor);
    const isAtStart = safeCursor === 0;
    const isAtEnd = safeCursor >= sourceMarkdown.length;
    const isAtMiddle = !isAtStart && !isAtEnd;

    try {
      const uploaded = await uploadFile(file, accessToken);
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DocumentTextPaste] upload complete', {
          url: uploaded.url,
          key: uploaded.key,
        });
      }

      const mediaContent = {
        mediaType: 'image',
        title: (file.name || 'Imagen').trim() || 'Imagen',
        url: uploaded.url,
        mimeType: file.type || null,
        sizeBytes: file.size || null,
        caption: '',
        assetId: uploaded.key,
      };

      if (isAtMiddle) {
        const updatedTextBrick = await updateDocumentBrick(docId, brickId, {
          ...target.content,
          text: beforeText,
          markdown: beforeText,
        }, accessToken);

        const mediaBrick = await createDocumentBrick(docId, {
          kind: 'image',
          position: target.position + 0.5,
          content: mediaContent,
        }, accessToken);

        const afterBrick = afterText.length > 0
          ? await createDocumentBrick(docId, {
              kind: 'text',
              position: target.position + 1,
              content: { text: afterText, markdown: afterText },
            }, accessToken)
          : null;

        setDocument((current) => {
          if (!current) return current;
          const merged = current.bricks
            .map((brick) => (brick.id === brickId ? updatedTextBrick : brick))
            .concat([mediaBrick, ...(afterBrick ? [afterBrick] : [])]);
          const nextBricks = Array.from(new Map(merged.map((brick) => [brick.id, brick])).values())
            .sort((a, b) => a.position - b.position);
          return { ...current, bricks: nextBricks };
        });
      } else {
        const mediaBrick = await createDocumentBrick(docId, {
          kind: 'image',
          position: isAtStart ? target.position - 0.5 : target.position + 0.5,
          content: mediaContent,
        }, accessToken);

        setDocument((current) => {
          if (!current) return current;
          const merged = [...current.bricks, mediaBrick];
          const nextBricks = Array.from(new Map(merged.map((brick) => [brick.id, brick])).values())
            .sort((a, b) => a.position - b.position);
          return {
            ...current,
            bricks: nextBricks,
          };
        });
      }

      return;
    } catch (err) {
      console.error('Failed to paste image into document text brick', err);
      if (process.env.NODE_ENV !== 'production') {
        console.error('[DocumentTextPaste] failed', {
          brickId,
          fileName: file?.name,
        });
      }
      toast(t("createBlockError"), "error");
      return;
    }
  }, [accessToken, docId, document, t]);

  const handleExport = async () => {
    if (!accessToken) return;
    setIsExporting(true);
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
      const url = `${API_BASE_URL}/documents/${docId}/export?format=${exportFormat}&style=${exportStyle}&paperSize=${exportSize}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error("Error en la exportación");
      
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = downloadUrl;
      a.download = `${document?.title || 'Document'}.${exportFormat}`;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      toast("Exportación completada", "success");
      setIsExportModalOpen(false);
    } catch (e: any) {
      toast(e.message || "Error al exportar", "error");
    } finally {
      setIsExporting(false);
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
      toast(t("shareSuccess", { email: shareEmail }));
      setShareEmail("");
      setIsShareModalOpen(false);
    } catch (e: any) {
      toast(e.message || t("shareError"), "error");
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
        <h2 className="text-xl font-semibold">{t("notFoundTitle")}</h2>
        <p className="text-muted-foreground mt-2 mb-6">{error || t("notFoundDescription")}</p>
        <Link href="/" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
          {t("returnDashboard")}
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
                title={t("presenceViewing", { name: member.data.displayName })}
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
            {t("header.copilot")}
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
            {t("header.comments")}
          </Button>

          <Button variant="ghost" size="sm" onClick={() => setIsExportModalOpen(true)} className="h-8 gap-2 text-xs font-semibold">
            <Download className="h-3.5 w-3.5" />
            Descargar
          </Button>

          <Button variant="ghost" size="sm" onClick={() => setIsShareModalOpen(true)} className="h-8 gap-2 text-xs font-semibold">
            <Share2 className="h-3.5 w-3.5" />
            {t("header.share")}
          </Button>

          <div className="h-7 w-7 rounded-full ring-2 ring-background bg-gradient-to-tr from-accent to-primary/60 flex items-center justify-center text-[10px] font-bold text-white shadow-sm" title={user?.displayName}>
            {user?.displayName?.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      {/* Export Modal Backdrop */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsExportModalOpen(false)}>
          <div className="bg-card w-full max-w-sm border border-border shadow-2xl rounded-xl overflow-hidden p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Download className="h-5 w-5 text-accent" />
                Exportar o Imprimir
              </h2>
              <button onClick={() => setIsExportModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Formato de Exportación</label>
                <div className="flex gap-2">
                  <Button variant={exportFormat === 'pdf' ? 'default' : 'outline'} className="flex-1" onClick={() => setExportFormat('pdf')}>PDF</Button>
                  <Button variant={exportFormat === 'docx' ? 'default' : 'outline'} className="flex-1" onClick={() => setExportFormat('docx')}>Word (DOCX)</Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Estilo Visual</label>
                <div className="flex gap-2">
                  <Button variant={exportStyle === 'carta' ? 'default' : 'outline'} className="flex-1 text-xs px-2" onClick={() => setExportStyle('carta')}>Reporte Técnico</Button>
                  <Button variant={exportStyle === 'harvard' ? 'default' : 'outline'} className="flex-1 text-xs px-2" onClick={() => setExportStyle('harvard')}>Estilo Harvard</Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tamaño de Hoja</label>
                <div className="flex gap-2">
                  <Button variant={exportSize === 'A4' ? 'default' : 'outline'} className="flex-1" onClick={() => setExportSize('A4')}>A4</Button>
                  <Button variant={exportSize === 'letter' ? 'default' : 'outline'} className="flex-1" onClick={() => setExportSize('letter')}>Carta</Button>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsExportModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleExport} disabled={isExporting}>
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                Descargar Documento
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal Backdrop */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsShareModalOpen(false)}>
          <div className="bg-card w-full max-w-md border border-border shadow-2xl rounded-xl overflow-hidden p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-accent" />
                {t("shareModal.title")}
              </h2>
              <button onClick={() => setIsShareModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("shareModal.userEmail")}</label>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("shareModal.emailPlaceholder")}
                    value={shareEmail}
                    onChange={(e: any) => setShareEmail(e.target.value)}
                    className="flex-1"
                  />
                  <select
                    value={shareRole}
                    onChange={e => setShareRole(e.target.value)}
                    className="bg-muted border border-border rounded-md px-2 text-xs outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="viewer">{t("shareModal.viewer")}</option>
                    <option value="editor">{t("shareModal.editor")}</option>
                  </select>
                </div>
              </div>
              <Button
                onClick={handleShare}
                disabled={isSharing || !shareEmail.trim()}
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                {isSharing ? <Loader2 className="h-4 w-4 animate-spin" /> : t("shareModal.invite")}
              </Button>
            </div>

            <p className="mt-6 text-[11px] text-muted-foreground leading-relaxed italic border-t border-border pt-4">
              {t("shareModal.teamNote")}
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
                <span className="ml-4 opacity-0 group-hover:opacity-30 transition-opacity text-xl font-normal text-muted-foreground whitespace-nowrap">{t("title.editHint")}</span>
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
              addableKinds={['text', 'table', 'graph', 'checklist', 'accordion', 'image']}
              onAddBrick={(kind, afterBrickId) => handleAddBrick(kind, afterBrickId)}
              onUpdateBrick={handleUpdateBrick}
              onDeleteBrick={handleDeleteBrick}
              onReorderBricks={handleReorderBricks}
              onPasteImageInTextBrick={handlePasteImageInTextBrick}
              onUploadMediaFiles={handleUploadMediaFiles}
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

