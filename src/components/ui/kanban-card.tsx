"use client";

import { useEffect, useState, useRef } from "react";
import { ProfileHover } from "@/components/ui/profile-hover";
import { summarizeChecklists } from "@/lib/boards/card-checklist";
import { createPortal } from "react-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, CheckSquare, MessageSquare, Paperclip, MoreHorizontal, ExternalLink, UserCheck, UserMinus, CalendarClock, Link2, Copy, Archive, Trash2 } from "lucide-react";
import { CardDetailModal } from "./card-detail-modal";
import { CardView, TextBrick, MediaBrick, deleteCard, updateCard, createCard, addCardAssignee, removeCardAssignee } from "@/lib/api/contracts";
import { toast } from "@/lib/toast";
import { stripText } from "@/lib/query/kql";
import { useSession } from "../providers/session-provider";
import { getClientLocale, translateNativeTagName } from "@/lib/native-tags";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { useTranslations } from "@/components/providers/i18n-provider";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAsyncAction, useConfirm } from "@/hooks/ui";

export function KanbanCard({ card, listId, listName, boardName, boardId, teamId, canEdit = true, canComment = true, teamDocs = [], teamBoards = [] }: { card: CardView, listId?: string, listName?: string, boardName?: string, boardId?: string, teamId?: string, canEdit?: boolean, canComment?: boolean, teamDocs?: any[], teamBoards?: any[] }) {
  const t = useTranslations("board-detail");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const { accessToken, user } = useSession();
  const myId = (user as { id?: string } | null)?.id ?? null;
  const isAssignedToMe = !!myId && (card.assignees ?? []).some((a: any) => (a?.id ?? a?.userId) === myId);
  // Quick actions of the card menu: they change the card without opening it.
  const runQuick = async (job: () => Promise<unknown>, okMessage?: string) => {
    setIsMenuOpen(false);
    try {
      await job();
      window.dispatchEvent(new Event("board:refresh"));
      if (okMessage) toast(okMessage, "success");
    } catch (err) {
      console.error("Card quick action failed", err);
      const detail = err instanceof Error && err.message && !/^HTTP \d+/.test(err.message) ? err.message : "";
      toast(detail ? `${t("card.actionError")}: ${detail}` : t("card.actionError"), "error");
    }
  };
  const setDueInDays = (days: number | null) => {
    if (!accessToken) return;
    const due = days === null ? null : (() => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + days); return d.toISOString(); })();
    void runQuick(() => updateCard(card.id, { due_at: due }, accessToken));
  };
  const { ask: askDeleteCard, ConfirmDialog: DeleteCardConfirmDialog } = useConfirm();
  const deleteCardAction = useAsyncAction(
    async () => {
      if (!accessToken) throw new Error("Missing access token for deleteCard");
      await deleteCard(card.id, accessToken);
      window.dispatchEvent(new Event('board:refresh'));
    },
    {
      onError: (err) => console.error("Failed to delete card", err),
    }
  );
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

  // The description is parsed before it is shown: markdown, HTML, mentions and Killio's [color:]/[size:]/[bg:]/[t:] tokens
  // become plain text, so the card never shows raw syntax such as **bold**.
  const descriptionSnippet = firstTextBrick?.markdown
    ? stripText(firstTextBrick.markdown.replace(/\[\/?(?:color|size|bg|t)(?::[^\]]*)?\]/gi, '')).slice(0, 140)
    : undefined;

  const hasDescription = !!descriptionSnippet;

  // Every checklist item of the card (text bricks styled as checklist AND `checklist` bricks): what is done vs what is left.
  const checklist = summarizeChecklists(card.blocks as unknown[]);
  const totalChecklistItems = checklist.total;
  const completedChecklistItems = checklist.done;
  const checklistPercent = totalChecklistItems > 0 ? Math.round((completedChecklistItems / totalChecklistItems) * 100) : 0;

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
        className={`group relative flex flex-col gap-2 min-w-0 max-w-full overflow-hidden rounded-lg bg-white dark:bg-[#22272b] shadow-[0_1px_1px_#091e4240,0_0_1px_#091e424f] dark:shadow-none dark:ring-[0.5px] dark:ring-white/10 p-3 hover:ring-2 hover:ring-primary/40 ${isArchived ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} transition-colors border-none`}
        {...(isArchived ? {} : attributes)}
        {...(isArchived ? {} : listeners)}
      >

        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isGuest && (
            <button
              ref={menuButtonRef}
              onClick={(e) => {
                e.stopPropagation();
                if (!isMenuOpen && menuButtonRef.current) {
                  setMenuRect(menuButtonRef.current.getBoundingClientRect());
                }
                setIsMenuOpen(!isMenuOpen);
              }}
              className="h-6 w-6 rounded bg-background/80 hover:bg-muted flex items-center justify-center text-muted-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
          {isMenuOpen && menuRect && typeof document !== 'undefined' && createPortal(
            <>
              <div className="fixed inset-0 z-[99]" onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); }} />
              <div 
                className="fixed bg-popover border border-border rounded-md shadow-lg py-1 z-[100] text-sm w-56"
                style={{
                  top: menuRect.bottom + 4,
                  left: menuRect.right - 224,
                }}
              >
                <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsModalOpen(true); }} className="w-full flex items-center gap-2 text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />{t("card.open")}</button>
                {accessToken && myId ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); void runQuick(() => (isAssignedToMe ? removeCardAssignee(card.id, myId, accessToken) : addCardAssignee(card.id, myId, accessToken))); }}
                    className="w-full flex items-center gap-2 text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
                  >
                    {isAssignedToMe ? <UserMinus className="h-3.5 w-3.5 text-muted-foreground" /> : <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />}
                    {isAssignedToMe ? t("card.unassignMe") : t("card.assignMe")}
                  </button>
                ) : null}
                {accessToken ? (
                  <div className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><CalendarClock className="h-3 w-3" />{t("card.due")}</div>
                    <div className="flex flex-wrap gap-1">
                      {([[0, "card.dueToday"], [1, "card.dueTomorrow"], [7, "card.dueWeek"], [null, "card.dueClear"]] as const).map(([days, key]) => (
                        <button key={key} onClick={() => setDueInDays(days)} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground hover:bg-accent hover:text-accent-foreground">{t(key)}</button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="my-1 border-t border-border" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("card", card.id);
                    const url = `${window.location.origin}${pathname}?${params.toString()}`;
                    void navigator.clipboard?.writeText(url).then(() => toast(t("card.linkCopied"), "success"), () => toast(t("card.actionError"), "error"));
                  }}
                  className="w-full flex items-center gap-2 text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
                ><Link2 className="h-3.5 w-3.5 text-muted-foreground" />{t("card.copyLink")}</button>
                {accessToken && listId ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); void runQuick(() => createCard({ listId, title: `${card.title} ${t("card.copySuffix")}`, tags: (card.tags ?? []).map((tag) => tag.id) }, accessToken), t("card.duplicated")); }}
                    className="w-full flex items-center gap-2 text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
                  ><Copy className="h-3.5 w-3.5 text-muted-foreground" />{t("card.duplicate")}</button>
                ) : null}
                {accessToken && !isArchived ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); void runQuick(() => updateCard(card.id, { status: "archived", archived_at: new Date().toISOString(), start_at: null, due_at: null }, accessToken), t("card.archived")); }}
                    className="w-full flex items-center gap-2 text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
                  ><Archive className="h-3.5 w-3.5 text-muted-foreground" />{t("card.archive")}</button>
                ) : null}
                <div className="my-1 border-t border-border" />
                <button
                  disabled={deleteCardAction.isPending}
                  onClick={async (e) => {
                    e.stopPropagation();
                    setIsMenuOpen(false);
                    const ok = await askDeleteCard({
                      title: t("card.deleteConfirm"),
                      confirmLabel: t("card.delete"),
                      variant: "destructive",
                    });
                    if (ok) deleteCardAction.run(undefined);
                  }}
                  className="w-full flex items-center gap-2 text-left px-3 py-1.5 hover:bg-accent text-destructive hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleteCardAction.isPending ? '...' : t("card.delete")}
                </button>
              </div>
            </>,
            document.body
          )}
        </div>

        <p title={card.title} className={`text-sm font-medium leading-tight line-clamp-2 break-words [overflow-wrap:anywhere] pr-6 transition-colors ${isArchived ? 'text-[color:var(--board-text,hsl(var(--foreground)))] opacity-65' : 'text-[color:var(--board-text,hsl(var(--foreground)))] group-hover:text-accent'}`}>
          {card.title}
        </p>

        {!isArchived && hasDescription && (
          <p className="text-[11px] leading-relaxed text-[color:var(--board-text,hsl(var(--muted-foreground)))] opacity-70 line-clamp-2 break-words [overflow-wrap:anywhere] -mt-1.5 px-0.5">
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
          <div className="flex items-center justify-between text-[color:var(--board-text,hsl(var(--muted-foreground)))] mt-1">
            <div className="flex items-center space-x-3">
              {hasDescription && (
                <div className="flex items-center space-x-1 text-xs hover:text-foreground transition-colors" title={t("card.hasDescription")}>
                  <AlignLeft className="h-3.5 w-3.5" />
                </div>
              )}
              {totalChecklistItems > 0 && (
                <div
                  className={`flex items-center space-x-1 text-xs transition-colors ${checklistPercent === 100 ? "text-emerald-600 dark:text-emerald-400" : "hover:text-foreground"}`}
                  title={t("card.checklistProgress", { done: completedChecklistItems, total: totalChecklistItems })}
                  aria-label={t("card.checklistProgress", { done: completedChecklistItems, total: totalChecklistItems })}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{completedChecklistItems}/{totalChecklistItems}</span>
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
                  <ProfileHover key={assignee.id} name={assignee.name || assignee.displayName || assignee.email || ""} email={assignee.email} avatarUrl={assignee.avatar_url || assignee.avatarUrl}>
                    <img
                      src={getUserAvatarUrl(assignee.avatar_url || assignee.avatarUrl, assignee.email, 20)}
                      alt={assignee.name || assignee.displayName || assignee.email}
                      className="h-5 w-5 rounded-full border border-border/70 object-cover bg-muted"
                    />
                  </ProfileHover>
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
        teamId={teamId}
        readonly={!canEdit}
        canComment={canComment}
        teamDocs={teamDocs}
        teamBoards={teamBoards}
      />
      <DeleteCardConfirmDialog />
    </>
  );
}
