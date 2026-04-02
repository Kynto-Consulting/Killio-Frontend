"use client";

import React from "react";
import { MoreHorizontal, AlignLeft, AlignCenter, AlignRight, Maximize, FileText, Settings, Link as LinkIcon, Image as ImageIcon, MessageSquare, MessageSquarePlus, Send, Paperclip, AtSign, ArrowUp, SmilePlus, Check, Copy, Edit, BellOff, Trash } from "lucide-react";
import { UnifiedTableBrick } from "./unified-table-brick";
import { UnifiedTextBrick } from "./unified-text-brick";
import { UnifiedGraphBrick } from "./unified-graph-brick";
import { UnifiedChecklistBrick } from "./unified-checklist-brick";
import { UnifiedAccordionBrick } from "./unified-accordion-brick";
import { UnifiedQuoteBrick } from "./unified-quote-brick";
import { UnifiedDividerBrick } from "./unified-divider-brick";
import { UnifiedCalloutBrick } from "./unified-callout-brick";
import { UnifiedTabsBrick } from "./unified-tabs-brick";
import { UnifiedColumnsBrick } from "./unified-columns-brick";
import { UnifiedMediaBrick } from "./unified-media-brick";
import { DocumentBrick, DocumentSummary } from "@/lib/api/documents";
import { BoardSummary } from "@/lib/api/contracts";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

interface BrickRendererProps {
  brick: DocumentBrick;
  canEdit: boolean;
  onUpdate: (content: any) => void;
  onAddBrick?: (kind: string, afterBrickId?: string, parentProps?: any, initialContent?: any) => void;
  onDeleteBrick?: (id: string) => void;
  onUpdateBrick?: (id: string, content: any) => void;
  onReorderBricks?: (ids: string[]) => void;
  onCrossContainerDrop?: (activeId: string, overId: string) => void;
  documents?: DocumentSummary[];
  boards?: BoardSummary[];
  activeBricks?: DocumentBrick[];
  users?: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  onPasteImageInTextBrick?: (payload: { brickId: string; file: File; cursorOffset: number; markdown: string }) => Promise<string | void> | string | void;
  onUploadMediaFiles?: (payload: { brickId: string; files: File[] }) => Promise<void> | void;
  onAiAction?: (action: string, contextText: string) => void;
  isCompact?: boolean;
}

type BrickComment = {
  id: string;
  text: string;
  createdAt: string;
  userId?: string | null;
  userName?: string | null;
  resolved?: boolean;
};

function normalizeBrickComments(raw: unknown): BrickComment[] {
  if (!Array.isArray(raw)) return [];

  const comments: BrickComment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (!text) continue;

    const id = typeof record.id === "string" && record.id.trim().length > 0
      ? record.id
      : `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = typeof record.createdAt === "string" && record.createdAt.trim().length > 0
      ? record.createdAt
      : new Date().toISOString();

    comments.push({
      id,
      text,
      createdAt,
      userId: typeof record.userId === "string" ? record.userId : null,
      userName: typeof record.userName === "string" ? record.userName : null,
      resolved: Boolean(record.resolved),
    });
  }

  return comments;
}

export function UnifiedBrickRenderer({
  brick,
  canEdit,
  onUpdate,
  onAddBrick,
  onDeleteBrick,
  onUpdateBrick,
  onReorderBricks,
  onCrossContainerDrop,
  documents = [],
  boards = [],
  activeBricks = [],
  users = [],
  onPasteImageInTextBrick,
  onUploadMediaFiles,
  onAiAction,
  isCompact = false
}: BrickRendererProps) {
  const t = useTranslations("document-detail");
  const { user } = useSession();
  const { kind, content } = brick;
  const [isCommentsOpen, setIsCommentsOpen] = React.useState(false);
  const [newComment, setNewComment] = React.useState("");
  const [activeMenu, setActiveMenu] = React.useState<string | null>(null);

  const comments = React.useMemo(() => normalizeBrickComments(content?.comments), [content?.comments]);

  const submitComment = () => {
    if (!canEdit) return;
    const text = newComment.trim();
    if (!text) return;

    const nextComment: BrickComment = {
      id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      createdAt: new Date().toISOString(),
      userId: user?.id ?? null,
      userName: user?.displayName || user?.username || "Anon",
      resolved: false,
    };

    onUpdate({
      ...content,
      comments: [...comments, nextComment],
    });
    setNewComment("");
    setIsCommentsOpen(true);
  };

  let brickBody: React.ReactNode;

  switch (kind) {
    case 'text':
      brickBody = (
        <UnifiedTextBrick
          id={brick.id}
          text={content.text || content.markdown || ""}
            onAddBrick={(kind, aId, parentProps, initialContent) => onAddBrick?.(kind, brick.id, parentProps, initialContent)}
          onUpdate={(text: any) => {
            // Pass only the fields that matter for text brick
            onUpdate({
              kind: 'text',
              displayStyle: content.displayStyle || 'paragraph',
              markdown: text,
            });
          }}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          activeBricks={activeBricks}
          users={users}
          onPasteImage={(payload) => onPasteImageInTextBrick?.({ ...payload, brickId: brick.id })}
          onAiAction={onAiAction}
        />
      );
      break;

    case 'table':
      brickBody = (
        <UnifiedTableBrick
          id={brick.id}
          data={content.rows || [['Header 1', 'Header 2'], ['', '']]}
          onUpdate={(rows) => onUpdate({ ...content, rows })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          users={users}
          activeBricks={activeBricks}
        />
      );
      break;

    case 'graph':
      brickBody = (
        <UnifiedGraphBrick
          id={brick.id}
          config={content as any}
          onUpdate={(newConfig) => onUpdate({ ...content, ...newConfig })}
          readonly={!canEdit}
          activeBricks={activeBricks as any[]}
        />
      );
      break;

    case 'checklist':
      brickBody = (
        <UnifiedChecklistBrick
          id={brick.id}
          items={content.items || []}
          onUpdate={(items) => onUpdate({ ...content, items })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          users={users}
        />
      );
      break;

    case 'quote':
      brickBody = (
        <UnifiedQuoteBrick
          id={brick.id}
          text={content.text || content.markdown || ""}
            onAddBrick={(k, aId, parentProps, initialContent) => onAddBrick?.(k, brick.id, parentProps, initialContent)}
          onUpdate={(text: any) => onUpdate({ ...content, kind: 'quote', markdown: text })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          activeBricks={activeBricks}
          users={users}
        />
      );
      break;

    case 'divider':
      brickBody = (
        <UnifiedDividerBrick
          id={brick.id}
          readonly={!canEdit}
        />
      );
      break;

    case 'callout':
      brickBody = (
        <UnifiedCalloutBrick
          id={brick.id}
          text={content.text || content.markdown || ""}
            onAddBrick={(k, aId, parentProps, initialContent) => onAddBrick?.(k, brick.id, parentProps, initialContent)}
          onUpdate={(text: any) => onUpdate({ ...content, kind: 'callout', markdown: text })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          activeBricks={activeBricks}
          users={users}
        />
      );
      break;

    case 'accordion':
      brickBody = (
        <UnifiedAccordionBrick
          id={brick.id}
          title={content.title || ""}
          body={content.body || ""}
          isExpanded={!!content.isExpanded}
          childrenByContainer={content.childrenByContainer}
          onUpdate={(data) => onUpdate({ ...content, ...data })}
          readonly={!canEdit}
          documents={documents}
          boards={boards}
          activeBricks={activeBricks}
          users={users}
          onAddBrick={onAddBrick}
          onDeleteBrick={onDeleteBrick}
          onUpdateBrick={onUpdateBrick}
          onReorderBricks={onReorderBricks}
          onCrossContainerDrop={onCrossContainerDrop}
        />
      );
      break;

    case 'media':
    case 'image':
    case 'video':
    case 'audio':
    case 'bookmark':
    case 'file': {
      brickBody = (
        <UnifiedMediaBrick
          brickId={brick.id}
          kind={kind}
          content={content}
          canEdit={canEdit}
          onUpdate={onUpdate}
          onUploadMediaFiles={onUploadMediaFiles}
        />
      );
      break;
    }

    case 'tabs':
      brickBody = (
        <UnifiedTabsBrick
          id={brick.id}
          tabs={content.tabs}
          childrenByContainer={content.childrenByContainer}
          onUpdate={(data) => onUpdate({ ...content, kind: 'tabs', ...data })}
          readonly={!canEdit}
          activeBricks={activeBricks}
          onAddBrick={onAddBrick}
          onDeleteBrick={onDeleteBrick}
          onUpdateBrick={onUpdateBrick}
          onReorderBricks={onReorderBricks}
          documents={documents}
          boards={boards}
          users={users}
        />
      );
      break;

    case 'columns':
      brickBody = (
        <UnifiedColumnsBrick
          id={brick.id}
          columns={content.columns}
          childrenByContainer={content.childrenByContainer}
          onUpdate={(data) => onUpdate({ ...content, kind: 'columns', ...data })}
          readonly={!canEdit}
          activeBricks={activeBricks}
          onAddBrick={onAddBrick}
          onDeleteBrick={onDeleteBrick}
          onUpdateBrick={onUpdateBrick}
          onReorderBricks={onReorderBricks}
          onCrossContainerDrop={onCrossContainerDrop}
          documents={documents}
          boards={boards}
          users={users}
        />
      );
      break;

    // Add other cases as they are implemented...

    default:
      brickBody = (
        <div className="p-4 border border-border/50 rounded bg-muted/20 text-muted-foreground italic text-sm">
          {t("brickRenderer.unsupportedBlock", { kind })}
        </div>
      );
      break;
  }

  return (
    <div className="group/brick relative w-full">
      <div 
        className={cn(
          "transition-all rounded-sm",
          comments.length > 0 && "bg-[#ffeb3b]/30 dark:bg-[#ffd54f]/20",
          isCommentsOpen && "ring-2 ring-accent/40"
        )}
      >
        {brickBody}
      </div>

      {/* Action Button: Comments for normal mode, Trash for compact mode */}
      {((canEdit || comments.length > 0) && !isCompact) && (
        <div 
          className={`absolute top-1.5 -right-3 sm:-right-8 z-10 flex items-center transition-opacity duration-200 ${
            isCommentsOpen || comments.length > 0 ? "opacity-100" : "opacity-0 group-hover/brick:opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={() => setIsCommentsOpen((o) => !o)}
            className={`flex items-center justify-center h-7 w-7 rounded-full shadow-sm border transition-colors ${
              comments.length > 0
                ? "bg-accent text-accent-foreground border-accent hover:opacity-90"
                : "bg-background text-muted-foreground border-border/40 hover:bg-muted/50 hover:text-foreground"
            }`}
             title={t("brickRenderer.commentHoverTitle")}
          >
            {comments.length === 0 ? <MessageSquarePlus className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">{comments.length}</span>}
          </button>
        </div>
      )}

      {(isCompact && canEdit && onDeleteBrick && kind !== 'table') && (
        <div 
          className="absolute top-1.5 -right-3 sm:-right-8 z-10 flex items-center transition-opacity duration-200 opacity-0 group-hover/brick:opacity-100"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteBrick(brick.id);
            }}
            className="flex items-center justify-center h-7 w-7 rounded-full shadow-sm border transition-colors bg-background text-destructive border-border/40 hover:bg-destructive/10 hover:border-destructive/30"
             title={t("brickComments.delete") || "Eliminar"}
          >
            <Trash className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Popover tipo Notion para los comentarios, flotando al lado o debajo */}
      {isCommentsOpen && (
        <div 
          className="absolute z-[100] right-0 top-full mt-1 w-full sm:w-[320px] rounded-lg border border-border/60 bg-background shadow-xl flex flex-col no-drag-focus"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {comments.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto px-4 py-3 space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="group/comment flex flex-col gap-1.5 border-b border-border/30 pb-3 last:border-0 last:pb-0 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                        {comment.userName ? comment.userName.charAt(0).toUpperCase() : "A"}
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {comment.userName && comment.userName.trim() ? comment.userName : t("brickComments.anonymous")}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Notion style hover buttons */}
                    <div className={cn(
                      "flex items-center gap-0.5 opacity-0 group-hover/comment:opacity-100 transition-opacity absolute right-0 top-0 bg-background rounded-md border border-border/50 shadow-sm p-0.5 z-10",
                      activeMenu === comment.id && "opacity-100"
                    )}>
                      <button className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title={t("brickComments.addReaction")}><SmilePlus className="w-3.5 h-3.5" /></button>
                      <button 
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" 
                        title={t("brickComments.resolve")}
                        onClick={() => {
                          const newComments = comments.filter(c => c.id !== comment.id);
                          onUpdate({ ...content, comments: newComments });
                        }}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <div className="relative">
                        <button 
                          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" 
                          title={t("brickComments.moreActions")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenu(activeMenu === comment.id ? null : comment.id);
                          }}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                        
                        {/* Menu desplegable */}
                        {activeMenu === comment.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-border/60 bg-popover shadow-md p-1 flex flex-col z-[150]">
                            <button className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-muted text-foreground w-full text-left" onClick={() => setActiveMenu(null)}>
                              <Check className="w-3.5 h-3.5 invisible" /> {t("brickComments.markUnread")}
                            </button>
                            <button className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-muted text-foreground w-full text-left" onClick={() => setActiveMenu(null)}>
                              <Edit className="w-3.5 h-3.5" /> {t("brickComments.edit")}
                            </button>
                            <button className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-muted text-foreground w-full text-left" onClick={() => setActiveMenu(null)}>
                              <LinkIcon className="w-3.5 h-3.5" /> {t("brickComments.copyLink")}
                            </button>
                            <button className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-muted text-foreground w-full text-left" onClick={() => setActiveMenu(null)}>
                              <BellOff className="w-3.5 h-3.5" /> {t("brickComments.muteReplies")}
                            </button>
                            <button 
                              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-destructive/10 text-destructive w-full text-left" 
                              onClick={() => {
                                 const newComments = comments.filter(c => c.id !== comment.id);
                                 onUpdate({ ...content, comments: newComments });
                                 setActiveMenu(null);
                              }}
                            >
                              <Trash className="w-3.5 h-3.5" /> {t("brickComments.delete")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                  <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed pl-7">{comment.text}</p>
                </div>
              ))}
            </div>
          )}

          {canEdit && (
            <div className={comments.length > 0 ? "p-3 bg-muted/10 border-t border-border/30" : "p-3 bg-background"}>
              <div className="flex items-center gap-1.5 rounded-md border border-input focus-within:ring-1 focus-within:ring-ring focus-within:border-accent bg-background px-3 py-1.5 transition-all w-full shadow-sm">
                <input
                  value={newComment}
                  onChange={(event) => setNewComment(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.stopPropagation();
                      submitComment();
                    }
                  }}
                  autoFocus
                  placeholder={t("brickComments.placeholder")}
                  className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                />
                
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors p-1 outline-none">
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors p-1 outline-none">
                  <AtSign className="w-3.5 h-3.5" />
                </button>
                
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    submitComment();
                  }}
                  disabled={!newComment.trim()}
                  className="inline-flex h-6 w-6 ml-0.5 shrink-0 items-center justify-center rounded bg-accent text-accent-foreground outline-none transition-colors hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
