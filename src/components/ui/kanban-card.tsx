"use client";

import { useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, CheckSquare, MessageSquare, Paperclip, MoreHorizontal } from "lucide-react";
import { CardDetailModal } from "./card-detail-modal";
import { CardView, TextBrick, MediaBrick, deleteCard } from "@/lib/api/contracts";
import { useSession } from "../providers/session-provider";
import { getClientLocale, translateNativeTagName } from "@/lib/native-tags";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { useTranslations } from "@/components/providers/i18n-provider";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function KanbanCard({ card, listId, listName, boardName, boardId, canEdit = true, canComment = true, teamDocs = [], teamBoards = [] }: { card: CardView, listId?: string, listName?: string, boardName?: string, boardId?: string, canEdit?: boolean, canComment?: boolean, teamDocs?: any[], teamBoards?: any[] }) {
  const t = useTranslations("board-detail");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { accessToken } = useSession();
  const isGuest = !canEdit;
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isArchived = Boolean(card.archivedAt);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled: isArchived });

  useEffect(() => {
    const requestedCardId = searchParams.get("cardId") || searchParams.get("card");
    if (requestedCardId === card.id) {
      setIsModalOpen(true);
    }
  }, [card.id, searchParams]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    const requestedCardId = searchParams.get("cardId") || searchParams.get("card");
    if (requestedCardId !== card.id) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("cardId");
    nextParams.delete("card");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : (isArchived ? 0.58 : 1),
    borderColor: isDragging
      ? "var(--board-accent, rgba(56,189,248,0.9))"
      : "var(--board-border, rgba(148,163,184,0.35))",
    backgroundColor: isArchived
      ? "rgba(148, 163, 184, 0.12)"
      : "var(--board-panel-strong, rgba(15,23,42,0.72))",
    boxShadow: isDragging
      ? "0 0 0 1px var(--board-accent, rgba(56,189,248,0.9))"
      : undefined,
  };

  const normalizeColor = (raw?: string | null) => {
    if (!raw) return '#64748b';
    if (raw.startsWith('#')) return raw;
    return `#${raw}`;
  };

  const blocks = card.blocks || [];
  const textBlocks = blocks.filter((b): b is TextBrick => b.kind === 'text');
  const mediaBlocks = blocks.filter((b): b is MediaBrick => b.kind === 'media');

  const firstTextBrick = textBlocks.find(b => b.displayStyle === 'paragraph' && b.markdown && b.markdown.trim().length > 0);

  // 1. Clean the markdown first by replacing @[x:y:z] with just z
  const cleanedMarkdown = firstTextBrick?.markdown?.replace(/@\[[^:]+:[^:]+:([^\]]+)\]/g, '$1');

  // 2. Then create your snippet from the cleaned text
  const descriptionSnippet = cleanedMarkdown?.trim().split('\n')[0].substring(0, 90);

  const hasDescription = !!descriptionSnippet;

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
        className={`group relative flex flex-col gap-2 rounded-lg bg-white dark:bg-[#22272b] shadow-[0_1px_1px_#091e4240,0_0_1px_#091e424f] dark:shadow-none dark:ring-[0.5px] dark:ring-white/10 p-3 hover:ring-2 hover:ring-primary/40 ${isArchived ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} transition-colors border-none`}
        {...(isArchived ? {} : attributes)}
        {...(isArchived ? {} : listeners)}
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
              <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsModalOpen(true); }} className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground">{t("card.editCard")}</button>
              <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsModalOpen(true); }} className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground">{t("card.editTags")}</button>
              <div className="my-1 border-t border-border" />
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);

                  if (!accessToken) {
                    console.error("Missing access token for deleteCard");
                    return;
                  }

                  const confirmed = window.confirm(t("card.deleteConfirm"));
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
                {t("card.delete")}
              </button>
            </div>
          )}
        </div>

        <p className={`text-sm font-medium leading-tight transition-colors ${isArchived ? 'text-foreground/65' : 'text-foreground/90 group-hover:text-accent'}`}>
          {card.title}
        </p>

        {!isArchived && hasDescription && (
          <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-2 -mt-1.5 px-0.5">
            {descriptionSnippet}
            {firstTextBrick!.markdown.trim().length > 90 ? '...' : ''}
          </p>
        )}

        {!isArchived && (card.tags || []).length > 0 && (
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

        {!isArchived ? (
          <div className="flex items-center justify-between text-muted-foreground mt-1">
            <div className="flex items-center space-x-3">
              {hasDescription && (
                <div className="flex items-center space-x-1 text-xs hover:text-foreground transition-colors" title={t("card.hasDescription")}>
                  <AlignLeft className="h-3.5 w-3.5" />
                </div>
              )}
              {totalChecklistItems > 0 && (
                <div className="flex items-center space-x-1 text-xs hover:text-foreground transition-colors" title={t("card.checklistItems")}>
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span>{completedChecklistItems}/{totalChecklistItems}</span>
                </div>
              )}
              {(card.commentsCount || 0) > 0 && (
                <div className="flex items-center space-x-1 text-xs hover:text-foreground transition-colors" title={t("card.comments")}>
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>{card.commentsCount}</span>
                </div>
              )}
              {attachmentsCount > 0 ? (
                <div className="flex items-center space-x-1 text-xs hover:text-foreground transition-colors" title={t("card.attachments")}>
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
        ) : null}
      </div>

      <CardDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
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
