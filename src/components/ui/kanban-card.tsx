"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, CheckSquare, MessageSquare, Paperclip, MoreHorizontal } from "lucide-react";
import { CardDetailModal } from "./card-detail-modal";
import { CardView, TextBrick, MediaBrick, deleteCard } from "@/lib/api/contracts";
import { useSession } from "../providers/session-provider";
import { getClientLocale, translateNativeTagName } from "@/lib/native-tags";
import { getUserAvatarUrl } from "@/lib/gravatar";

export function KanbanCard({ card, listId, listName, boardName, boardId, canEdit = true, canComment = true, teamDocs = [], teamBoards = [] }: { card: CardView, listId?: string, listName?: string, boardName?: string, boardId?: string, canEdit?: boolean, canComment?: boolean, teamDocs?: any[], teamBoards?: any[] }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { accessToken } = useSession();
  const isGuest = !canEdit;
  
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const normalizeColor = (raw?: string | null) => {
    if (!raw) return '#64748b';
    if (raw.startsWith('#')) return raw;
    return `#${raw}`;
  };

  const blocks = card.blocks || [];
  const textBlocks = blocks.filter((b): b is TextBrick => b.kind === 'text');
  const mediaBlocks = blocks.filter((b): b is MediaBrick => b.kind === 'media');
  
  const hasDescription = textBlocks.some(b => b.displayStyle === 'paragraph' && b.markdown && b.markdown.trim().length > 0);
  
  const checklists = textBlocks.filter(b => b.displayStyle === 'checklist');
  let totalChecklistItems = 0;
  let completedChecklistItems = 0;
  checklists.forEach(cl => {
    (cl.tasks || []).forEach(t => {
      totalChecklistItems++;
      if (t.checked) completedChecklistItems++;
    });
  });

  const attachmentsCount = mediaBlocks.length;
  const assignees = (card.assignees || []).slice(0, 4);
  const hiddenAssigneesCount = Math.max(0, (card.assignees || []).length - assignees.length);
  const locale = getClientLocale();

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        onClick={() => !isMenuOpen && setIsModalOpen(true)}
        className={`group relative flex flex-col gap-3 rounded-lg border ${
          isDragging
            ? "border-accent shadow-lg ring-1 ring-accent"
            : "border-border shadow-sm hover:border-accent/40"
        } p-3 cursor-grab active:cursor-grabbing transition-colors`}
        {...attributes}
        {...listeners}
      >
      
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isGuest && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            className="h-6 w-6 rounded bg-background/80 hover:bg-muted flex items-center justify-center text-muted-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
        {isMenuOpen && (
          <div className="absolute right-0 top-8 w-40 bg-popover border border-border rounded-md shadow-lg py-1 z-50 text-sm">
            <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsModalOpen(true); }} className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground">Edit Card...</button>
            <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsModalOpen(true); }} className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground">Edit Tags...</button>
            <div className="my-1 border-t border-border" />
            <button
              onClick={async (e) => {
                e.stopPropagation();
                setIsMenuOpen(false);

                if (!accessToken) {
                  console.error("Missing access token for deleteCard");
                  return;
                }

                const confirmed = window.confirm("Delete this card permanently? This action cannot be undone.");
                if (!confirmed) return;

                try {
                  await deleteCard(card.id, accessToken);
                  window.dispatchEvent(new Event('board:refresh'));
                } catch (err) {
                  console.error("Failed to delete card", err);
                }
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-accent text-destructive hover:text-destructive"
            >
              Delete Card
            </button>
          </div>
        )}
      </div>

      <p className="text-sm font-medium leading-tight transition-colors text-foreground/90 group-hover:text-accent">
        {card.title}
      </p>

      {(card.tags || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 pr-6">
          {(card.tags || []).map((tag) => (
            <span
              key={tag.id}
              className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border"
              style={{
                color: normalizeColor(tag.color),
                borderColor: `${normalizeColor(tag.color)}66`,
                backgroundColor: `${normalizeColor(tag.color)}22`,
              }}
            >
              {translateNativeTagName(tag.name, locale)}
            </span>
          ))}
        </div>
      )}
      
      <div className="flex items-center justify-between text-muted-foreground mt-1">
        <div className="flex items-center space-x-3">
          {hasDescription && (
            <div className="flex items-center space-x-1 text-xs hover:text-foreground transition-colors" title="This card has a description">
              <AlignLeft className="h-3.5 w-3.5" />
            </div>
          )}
          {totalChecklistItems > 0 && (
            <div className="flex items-center space-x-1 text-xs hover:text-foreground transition-colors" title="Checklist items">
              <CheckSquare className="h-3.5 w-3.5" />
              <span>{completedChecklistItems}/{totalChecklistItems}</span>
            </div>
          )}
          {/* No comments for now */ false ? (
            <div className="flex items-center space-x-1 text-xs hover:text-foreground transition-colors" title="Comments">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{/*card.commentsCount*/}</span>
            </div>
          ) : null}
          {attachmentsCount > 0 ? (
            <div className="flex items-center space-x-1 text-xs hover:text-foreground transition-colors" title="Attachments">
              <Paperclip className="h-3.5 w-3.5" />
              <span>{attachmentsCount}</span>
            </div>
          ) : null}
        </div>
        
        {(card.assignees || []).length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {assignees.map((assignee: any) => (
              <img
                key={assignee.id}
                src={getUserAvatarUrl(assignee.avatar_url || assignee.avatarUrl, assignee.email, 20)}
                alt={assignee.name || assignee.displayName || assignee.email}
                title={assignee.name || assignee.displayName || assignee.email}
                className="h-5 w-5 rounded-full border border-border/70 object-cover bg-muted"
              />
            ))}
            {hiddenAssigneesCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                +{hiddenAssigneesCount}
              </span>
            )}
          </div>
        )}
      </div>
      </div>
      
      <CardDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        card={card}
        listId={listId}
        listName={listName || ""}
        boardName={boardName || ""}
        boardId={boardId}
        readonly={!canEdit}
        canComment={canComment}
        teamDocs={teamDocs}
        teamBoards={teamBoards}
      />
    </>
  );
}
