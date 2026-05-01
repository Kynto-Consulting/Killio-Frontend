"use client";

import React, { useState, useCallback, useEffect } from "react";
import { FileText, ExternalLink, X, Loader2, ChevronRight, Pencil } from "lucide-react";
import {
  createDocument,
  getDocument,
  updateDocumentTitle,
  createDocumentBrick,
  updateDocumentBrick,
  deleteDocumentBrick,
  reorderDocumentBricks,
  patchBrickCell,
  DocumentView,
  DocumentBrick,
} from "@/lib/api/documents";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { sanitizeChildrenByContainer } from "@/lib/bricks/nesting";

export interface PopupDocumentContent {
  title?: string;
  inlineDocumentId?: string | null;
  externalSource?: {
    provider: "google_drive" | "onedrive";
    fileId: string;
    fileName: string;
    mimeType?: string;
    webViewLink?: string;
    webUrl?: string;
    isPublic: boolean;
    credentialId: string;
  } | null;
}

interface UnifiedPopupDocumentBrickProps {
  id: string;
  content: PopupDocumentContent;
  canEdit: boolean;
  onUpdate: (content: PopupDocumentContent) => void;
}

function sanitizeBricks(bricks: DocumentBrick[]): DocumentBrick[] {
  const deduped = Array.from(new Map(bricks.map((b) => [b.id, b])).values());
  const ids = new Set(deduped.map((b) => b.id));
  return deduped.map((b) => ({
    ...b,
    content: sanitizeChildrenByContainer(b.content || {}, ids),
  }));
}

export function UnifiedPopupDocumentBrick({
  id,
  content,
  canEdit,
  onUpdate,
}: UnifiedPopupDocumentBrickProps) {
  const t = useTranslations("document-detail");
  const { accessToken, activeTeamId } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(content.title ?? "");

  const title = content.title || t("popupDocument.untitled", { fallback: "Untitled document" });

  const handleTitleSave = () => {
    const trimmed = tempTitle.trim();
    if (trimmed && trimmed !== content.title) {
      onUpdate({ ...content, title: trimmed });
    }
    setIsEditingTitle(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleTitleSave();
    if (e.key === "Escape") {
      setTempTitle(content.title ?? "");
      setIsEditingTitle(false);
    }
  };

  return (
    <>
      {/* Brick card */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.03)",
          cursor: "default",
          userSelect: "none",
        }}
      >
        <FileText style={{ width: 16, height: 16, color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />

        {isEditingTitle && canEdit ? (
          <input
            autoFocus
            value={tempTitle}
            onChange={(e) => setTempTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.3)",
              outline: "none",
              fontSize: 13,
              color: "rgba(255,255,255,0.88)",
              padding: "0 2px",
            }}
          />
        ) : (
          <span
            style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            onDoubleClick={canEdit ? () => { setTempTitle(content.title ?? ""); setIsEditingTitle(true); } : undefined}
          >
            {title}
          </span>
        )}

        {canEdit && !isEditingTitle && (
          <button
            type="button"
            onClick={() => { setTempTitle(content.title ?? ""); setIsEditingTitle(true); }}
            style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", lineHeight: 1 }}
            title="Rename"
          >
            <Pencil style={{ width: 12, height: 12 }} />
          </button>
        )}

        {content.inlineDocumentId && (
          <a
            href={`/d/${content.inlineDocumentId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: 4, background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", lineHeight: 1 }}
            title="Open in new tab"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
        )}

        <button
          type="button"
          onClick={() => setIsOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 7,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "transparent",
            color: "rgba(255,255,255,0.6)",
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <ChevronRight style={{ width: 12, height: 12 }} />
          {t("popupDocument.open", { fallback: "Open" })}
        </button>
      </div>

      {/* Slide-over panel */}
      {isOpen && (
        <PopupDocumentPanel
          content={content}
          canEdit={canEdit}
          teamId={activeTeamId ?? null}
          accessToken={accessToken ?? ""}
          onClose={() => setIsOpen(false)}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}

// ─── PopupDocumentPanel ───────────────────────────────────────────────────────

interface PopupDocumentPanelProps {
  content: PopupDocumentContent;
  canEdit: boolean;
  teamId: string | null;
  accessToken: string;
  onClose: () => void;
  onUpdate: (content: PopupDocumentContent) => void;
}

function PopupDocumentPanel({ content, canEdit, teamId, accessToken, onClose, onUpdate }: PopupDocumentPanelProps) {
  const t = useTranslations("document-detail");
  const [doc, setDoc] = useState<DocumentView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingInlineDoc, setIsCreatingInlineDoc] = useState(false);

  const { inlineDocumentId } = content;

  const fetchDoc = useCallback(async () => {
    if (!inlineDocumentId || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getDocument(inlineDocumentId, accessToken);
      setDoc({ ...result, bricks: sanitizeBricks(result.bricks) });
    } catch (err: any) {
      setError(err.message ?? "Failed to load document");
    } finally {
      setLoading(false);
    }
  }, [inlineDocumentId, accessToken]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  useEffect(() => {
    if (inlineDocumentId || content.externalSource) return;
    if (!canEdit || !teamId || !accessToken) return;
    if (isCreatingInlineDoc) return;

    let cancelled = false;

    const provisionInlineDocument = async () => {
      setIsCreatingInlineDoc(true);
      setLoading(true);
      setError(null);
      try {
        const baseTitle = (content.title || "").trim() || t("popupDocument.untitled", { fallback: "Untitled document" });
        const created = await createDocument({ teamId, title: baseTitle }, accessToken);
        await createDocumentBrick(
          created.id,
          { kind: "text", position: 1000, content: { text: "" } },
          accessToken,
        );

        if (cancelled) return;

        onUpdate({
          ...content,
          title: content.title || created.title,
          inlineDocumentId: created.id,
        });

        const full = await getDocument(created.id, accessToken);
        if (!cancelled) {
          setDoc({ ...full, bricks: sanitizeBricks(full.bricks) });
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? t("popupDocument.createFailed", { fallback: "Failed to create popup document" }));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setIsCreatingInlineDoc(false);
        }
      }
    };

    provisionInlineDocument();

    return () => {
      cancelled = true;
    };
  }, [inlineDocumentId, content.externalSource, content.title, canEdit, teamId, accessToken, onUpdate, t, isCreatingInlineDoc]);

  // External source (Drive/OneDrive file) – show iframe viewer
  const externalSource = content.externalSource;
  const viewerUrl = externalSource
    ? externalSource.provider === "google_drive" && externalSource.webViewLink
      ? `https://drive.google.com/file/d/${externalSource.fileId}/preview`
      : externalSource.webUrl ?? null
    : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "flex-end",
        pointerEvents: "none",
      }}
    >
      {/* Backdrop */}
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)", pointerEvents: "auto" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          position: "relative",
          width: "min(680px, 100vw)",
          height: "100%",
          background: "#0c0e14",
          borderLeft: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          pointerEvents: "auto",
          animation: "slideInFromRight 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          <FileText style={{ width: 16, height: 16, color: "rgba(255,255,255,0.4)" }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.88)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc?.title ?? externalSource?.fileName ?? content.title ?? t("popupDocument.untitled", { fallback: "Untitled" })}
          </span>
          {inlineDocumentId && (
            <a
              href={`/d/${inlineDocumentId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: 4, color: "rgba(255,255,255,0.35)", lineHeight: 1 }}
              title="Open standalone"
            >
              <ExternalLink style={{ width: 14, height: 14 }} />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{ padding: 6, background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", lineHeight: 1, borderRadius: 6 }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
              <Loader2 style={{ width: 20, height: 20, color: "rgba(255,255,255,0.3)", animation: "spin 1s linear infinite" }} />
            </div>
          )}

          {error && (
            <div style={{ fontSize: 13, color: "#f87171", textAlign: "center", paddingTop: 40 }}>{error}</div>
          )}

          {/* External source: iframe preview */}
          {!loading && !error && externalSource && viewerUrl && (
            <iframe
              src={viewerUrl}
              sandbox="allow-scripts allow-popups allow-same-origin allow-forms allow-top-navigation"
              style={{ width: "100%", height: "100%", minHeight: 500, border: "none", borderRadius: 8 }}
              title={externalSource.fileName}
            />
          )}

          {/* Inline document: lazy-loaded brick list */}
          {!loading && !error && doc && !externalSource && (
            <InlineDocumentBody
              doc={doc}
              canEdit={canEdit}
              accessToken={accessToken}
              onDocUpdate={setDoc}
            />
          )}

          {/* No linked document yet */}
          {!loading && !error && !inlineDocumentId && !externalSource && !isCreatingInlineDoc && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: 40 }}>
              {t("popupDocument.noContent", { fallback: "No content linked yet." })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInFromRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ─── InlineDocumentBody ───────────────────────────────────────────────────────

interface InlineDocumentBodyProps {
  doc: DocumentView;
  canEdit: boolean;
  accessToken: string;
  onDocUpdate: (doc: DocumentView) => void;
}

function InlineDocumentBody({ doc, canEdit, accessToken, onDocUpdate }: InlineDocumentBodyProps) {
  // Lazy import to avoid circular deps; UnifiedBrickList is the same renderer used in document pages
  const [BrickListComponent, setBrickListComponent] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    import("@/components/bricks/unified-brick-list").then((m) => {
      setBrickListComponent(() => m.UnifiedBrickList);
    });
  }, []);

  const handleBrickUpdate = useCallback(
    async (brickId: string, newContent: any) => {
      if (!canEdit) return;
      try {
        await updateDocumentBrick(doc.id, brickId, newContent, accessToken);
        onDocUpdate({
          ...doc,
          bricks: doc.bricks.map((b) => (b.id === brickId ? { ...b, content: newContent } : b)),
        });
      } catch {
        // ignore
      }
    },
    [doc, canEdit, accessToken, onDocUpdate],
  );

  const handlePatchCell = useCallback(
    async (brickId: string, patch: Record<string, any>) => {
      if (!canEdit) return;
      try {
        await patchBrickCell(doc.id, brickId, patch as any, accessToken);
      } catch {
        // ignore
      }
    },
    [doc.id, canEdit, accessToken],
  );

  if (!BrickListComponent) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 20 }}>
        <Loader2 style={{ width: 16, height: 16, color: "rgba(255,255,255,0.3)", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <BrickListComponent
      bricks={doc.bricks}
      canEdit={canEdit}
      documents={[]}
      boards={[]}
      users={[]}
      activeBricks={doc.bricks}
      onBrickUpdate={handleBrickUpdate}
      onPatchCell={handlePatchCell}
      onPatchColumn={handlePatchCell}
    />
  );
}
