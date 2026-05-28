"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Check, X, Archive, ArchiveRestore, MoveRight, ChevronDown } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { getBoard, getArchivedLists, archiveList, updateCard, ArchivedListSummary } from "@/lib/api/contracts";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";
import { apiCache, CACHE_TTL, cacheKey } from "@/lib/api-cache";
import { useBoardRealtime } from "@/hooks/useBoardRealtime";
import { Skeleton } from "@/components/ui/skeleton";
import { TagBadge } from "@/components/ui/tag-badge";
import { CardDetailModal } from "@/components/ui/card-detail-modal";
import { getUserAvatarUrl } from "@/lib/gravatar";

type CardRow = {
  id: string;
  title: string;
  assignees?: { id: string; email?: string; name?: string; avatarUrl?: string }[];
  tags?: { id: string; name: string; color?: string }[];
  dueAt?: string | null;
  priority?: string | null;
  archivedAt?: string | null;
  status?: string;
};

type ListCol = {
  id: string;
  title: string;
  cards: CardRow[];
};

type SwipeState = {
  cardId: string;
  startX: number;
  currentX: number;
  listId: string;
};

function priorityColor(p?: string | null) {
  if (p === "urgent") return "bg-red-500";
  if (p === "high") return "bg-orange-400";
  if (p === "medium") return "bg-yellow-400";
  return "bg-muted-foreground/30";
}

const SWIPE_THRESHOLD = 72;
const LONG_PRESS_MS = 450;

export default function BoardMobilePage() {
  const { boardId } = useParams() as { boardId: string };
  const { accessToken } = useSession();
  const t = useTranslations("board-detail");

  const [boardName, setBoardName] = useState("");
  const [lists, setLists] = useState<ListCol[]>([]);
  const [activeListIndex, setActiveListIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [selectedCard, setSelectedCard] = useState<{ card: CardRow; listId: string; listName: string } | null>(null);
  const [showArchivedLists, setShowArchivedLists] = useState(false);
  const [archivedLists, setArchivedLists] = useState<ArchivedListSummary[]>([]);
  const [archivedListsLoading, setArchivedListsLoading] = useState(false);
  // Move sheet
  const [moveSheet, setMoveSheet] = useState<{ card: CardRow; fromListId: string } | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  // Swipe state
  const [swipedCardId, setSwipedCardId] = useState<string | null>(null);
  const swipeRef = useRef<SwipeState | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadBoard = useCallback(() => {
    if (!accessToken || !boardId) return;

    const cached = apiCache.get<any>(cacheKey.board(boardId));
    if (cached) {
      setBoardName(cached.name);
      setLists(cached.lists.map((l: any) => ({ id: l.id, title: l.name, cards: l.cards })));
      setIsLoading(false);
    }

    getBoard(boardId, accessToken)
      .then((board) => {
        apiCache.set(cacheKey.board(boardId), board, CACHE_TTL.BOARD_DETAIL);
        setBoardName(board.name);
        setLists(board.lists.map((l: any) => ({ id: l.id, title: l.name, cards: l.cards })));
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [accessToken, boardId]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  useBoardRealtime(boardId, (evt) => {
    if (["card.moved", "card.created", "card.updated", "card.assignee_added", "card.assignee_removed", "list.updated"].includes(evt.type)) {
      loadBoard();
    }
  }, accessToken);

  const handleToggleArchivedLists = useCallback(async () => {
    if (showArchivedLists) { setShowArchivedLists(false); return; }
    if (!accessToken) return;
    setShowArchivedLists(true);
    setArchivedListsLoading(true);
    try {
      const data = await getArchivedLists(boardId, accessToken);
      setArchivedLists(data);
    } catch {
      toast(t("list.archiveError"), "error");
    } finally {
      setArchivedListsLoading(false);
    }
  }, [showArchivedLists, accessToken, boardId, t]);

  const handleUnarchiveList = useCallback(async (listId: string) => {
    if (!accessToken) return;
    try {
      await archiveList(boardId, listId, false, accessToken);
      setArchivedLists(prev => prev.filter(l => l.id !== listId));
      toast(t("list.unarchiveSuccess"), "success");
      loadBoard();
    } catch {
      toast(t("list.unarchiveError"), "error");
    }
  }, [accessToken, boardId, t, loadBoard]);

  // ── Move card to another list ──────────────────────────────────────────────
  const handleMoveCard = useCallback(async (card: CardRow, fromListId: string, toListId: string) => {
    if (!accessToken || fromListId === toListId) { setMoveSheet(null); return; }
    setIsMoving(true);
    const toList = lists.find(l => l.id === toListId);
    const position = toList ? toList.cards.filter(c => !c.archivedAt).length : 0;

    // Optimistic update
    setLists(prev => {
      const next = prev.map(l => ({ ...l, cards: [...l.cards] }));
      const src = next.find(l => l.id === fromListId);
      const dst = next.find(l => l.id === toListId);
      if (!src || !dst) return prev;
      const idx = src.cards.findIndex(c => c.id === card.id);
      if (idx === -1) return prev;
      const [moved] = src.cards.splice(idx, 1);
      dst.cards.push(moved);
      return next;
    });
    setMoveSheet(null);
    apiCache.invalidate(cacheKey.board(boardId));

    try {
      await updateCard(card.id, { list_id: toListId, position }, accessToken);
    } catch {
      toast(t("createCardError"), "error");
      loadBoard();
    } finally {
      setIsMoving(false);
    }
  }, [accessToken, lists, boardId, t, loadBoard]);

  const activeList = lists[activeListIndex] ?? null;
  const visibleCards = (activeList?.cards ?? []).filter(c => !c.archivedAt);

  const handleAddCard = async () => {
    if (!newCardTitle.trim() || !accessToken || !activeList) return;
    const tempId = `tmp-${Date.now()}`;
    const tempCard: CardRow = { id: tempId, title: newCardTitle.trim() };
    setLists(prev => prev.map((l, i) => i === activeListIndex ? { ...l, cards: [...l.cards, tempCard] } : l));
    setNewCardTitle("");
    setIsAddingCard(false);
    apiCache.invalidate(cacheKey.board(boardId));

    try {
      const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
      const res = await fetch(`${API_BASE}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ listId: activeList.id, title: tempCard.title }),
      });
      if (!res.ok) throw new Error("create failed");
      const newCard = await res.json();
      setLists(prev => prev.map((l, i) =>
        i === activeListIndex
          ? { ...l, cards: l.cards.map(c => c.id === tempId ? { ...newCard, title: newCard.title } : c) }
          : l,
      ));
    } catch {
      setLists(prev => prev.map((l, i) => i === activeListIndex ? { ...l, cards: l.cards.filter(c => c.id !== tempId) } : l));
      toast(t("createCardError"), "error");
    }
  };

  // ── Swipe-to-reveal handlers ───────────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent, card: CardRow, listId: string) => {
    const touch = e.touches[0];
    swipeRef.current = { cardId: card.id, startX: touch.clientX, currentX: touch.clientX, listId };

    // Long-press for move sheet
    longPressTimer.current = setTimeout(() => {
      swipeRef.current = null; // cancel swipe tracking
      setSwipedCardId(null);
      const list = lists.find(l => l.id === listId);
      setMoveSheet({ card, fromListId: listId });
      if (navigator.vibrate) navigator.vibrate(40);
    }, LONG_PRESS_MS);
  }, [lists]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - swipeRef.current.startX;

    // Cancel long-press if user moves finger
    if (Math.abs(dx) > 8 && longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    swipeRef.current.currentX = touch.clientX;
    const clamped = Math.max(-SWIPE_THRESHOLD, Math.min(0, dx));
    if (clamped < -4) {
      setSwipedCardId(swipeRef.current.cardId);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    const state = swipeRef.current;
    swipeRef.current = null;
    if (!state) return;
    const dx = state.currentX - state.startX;
    if (dx < -(SWIPE_THRESHOLD * 0.6)) {
      setSwipedCardId(state.cardId); // keep revealed
    } else {
      setSwipedCardId(null);
    }
  }, []);

  const prevList = () => { setActiveListIndex(i => Math.max(0, i - 1)); setSwipedCardId(null); };
  const nextList = () => { setActiveListIndex(i => Math.min(lists.length - 1, i + 1)); setSwipedCardId(null); };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50 bg-background/90 backdrop-blur shrink-0">
        <Link href="/b" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="flex-1 text-sm font-semibold truncate">
          {boardName || <Skeleton className="h-4 w-32 inline-block" />}
        </h1>
        <button
          onClick={handleToggleArchivedLists}
          className={`p-1.5 rounded-lg transition-colors ${showArchivedLists ? "text-accent bg-accent/10" : "text-muted-foreground hover:text-foreground hover:bg-accent/10"}`}
          title={showArchivedLists ? t("list.hideArchived") : t("list.viewArchived")}
        >
          <Archive className="h-4 w-4" />
        </button>
      </header>

      {isLoading && lists.length === 0 ? (
        <div className="flex-1 flex flex-col px-4 py-4 space-y-3">
          <Skeleton className="h-8 w-full rounded-lg" />
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : lists.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <p className="text-sm font-medium text-muted-foreground">{t("list.noArchivedLists")}</p>
          <Link href={`/b/${boardId}`} className="mt-3 text-xs text-accent">{t("list.addAnother")}</Link>
        </div>
      ) : (
        <>
          {/* List selector chips */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 shrink-0 overflow-x-auto scrollbar-none">
            <button onClick={prevList} disabled={activeListIndex === 0} className="shrink-0 p-1 rounded disabled:opacity-30 text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {lists.map((list, i) => (
              <button
                key={list.id}
                onClick={() => { setActiveListIndex(i); setSwipedCardId(null); }}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  i === activeListIndex ? "bg-accent text-accent-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {list.title}
                <span className="ml-1.5 opacity-60">{list.cards.filter(c => !c.archivedAt).length}</span>
              </button>
            ))}
            <button onClick={nextList} disabled={activeListIndex === lists.length - 1} className="shrink-0 p-1 rounded disabled:opacity-30 text-muted-foreground hover:text-foreground">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Cards */}
          <div
            className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
            onClick={() => swipedCardId && setSwipedCardId(null)}
          >
            {visibleCards.map((card) => {
              const isSwiped = swipedCardId === card.id;
              return (
                <div
                  key={card.id}
                  className="relative overflow-hidden rounded-xl"
                  onTouchStart={e => handleTouchStart(e, card, activeList!.id)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  {/* Swipe action buttons (revealed on swipe-left) */}
                  <div className="absolute right-0 top-0 bottom-0 flex items-stretch">
                    <button
                      onClick={e => { e.stopPropagation(); setSwipedCardId(null); setMoveSheet({ card, fromListId: activeList!.id }); }}
                      className="flex flex-col items-center justify-center gap-1 px-3 bg-accent/90 text-accent-foreground text-[10px] font-medium transition-transform"
                      style={{ transform: isSwiped ? "translateX(0)" : "translateX(100%)", transition: "transform 0.22s cubic-bezier(.4,0,.2,1)" }}
                      aria-label="Move card"
                    >
                      <MoveRight className="h-4 w-4" />
                      Move
                    </button>
                  </div>

                  {/* Card body */}
                  <button
                    onClick={() => {
                      if (isSwiped) { setSwipedCardId(null); return; }
                      setSelectedCard({ card, listId: activeList!.id, listName: activeList!.title });
                    }}
                    className="w-full flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 active:scale-[0.98] transition-[transform,box-shadow] text-left"
                    style={{
                      transform: isSwiped ? `translateX(-${SWIPE_THRESHOLD}px)` : "translateX(0)",
                      transition: "transform 0.22s cubic-bezier(.4,0,.2,1)",
                      boxShadow: isSwiped ? "-2px 0 12px rgba(0,0,0,0.08)" : undefined,
                    }}
                  >
                    <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${priorityColor(card.priority)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{card.title}</p>
                      {card.tags && card.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {card.tags.slice(0, 3).map(tag => (
                            <TagBadge key={tag.id} tag={tag} className="text-[10px] py-0 px-1.5" />
                          ))}
                        </div>
                      )}
                      {card.dueAt && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(card.dueAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {card.assignees && card.assignees.length > 0 && (
                      <div className="flex -space-x-1 shrink-0">
                        {card.assignees.slice(0, 2).map(a => (
                          <img
                            key={a.id}
                            src={getUserAvatarUrl(a.avatarUrl, a.email, 20)}
                            alt={a.name ?? a.email ?? "?"}
                            title={a.name ?? a.email}
                            className="h-5 w-5 rounded-full border border-background object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </button>
                </div>
              );
            })}

            {visibleCards.length === 0 && !isAddingCard && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-xs text-muted-foreground">{t("list.addCard")}</p>
              </div>
            )}

            {isAddingCard && (
              <div className="rounded-xl border border-accent/40 bg-card px-4 py-3 space-y-2">
                <input
                  ref={inputRef}
                  autoFocus
                  value={newCardTitle}
                  onChange={e => setNewCardTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleAddCard();
                    if (e.key === "Escape") { setIsAddingCard(false); setNewCardTitle(""); }
                  }}
                  placeholder={t("list.placeholder")}
                  className="w-full text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
                />
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={handleAddCard} className="flex items-center gap-1 px-3 py-1 rounded-lg bg-accent text-accent-foreground text-xs font-medium">
                    <Check className="h-3.5 w-3.5" />
                    {t("list.add")}
                  </button>
                  <button onClick={() => { setIsAddingCard(false); setNewCardTitle(""); }} className="p-1 rounded-lg text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* FAB */}
          {!isAddingCard && (
            <div className="px-4 pb-6 pt-2 shrink-0">
              <button
                onClick={() => { setIsAddingCard(true); setTimeout(() => inputRef.current?.focus(), 50); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-accent/30 text-accent/70 text-sm font-medium hover:border-accent/60 hover:text-accent transition-colors active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
                {t("list.addCard")} — {activeList?.title}
              </button>
            </div>
          )}
        </>
      )}

      {/* Archived lists panel */}
      {showArchivedLists && (
        <div className="shrink-0 border-t border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Archive className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">{t("list.archivedLists")}</span>
          </div>
          {archivedListsLoading ? (
            <Skeleton className="h-8 w-full rounded-lg" />
          ) : archivedLists.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("list.noArchivedLists")}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {archivedLists.map(al => (
                <div key={al.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card">
                  <span className="text-sm font-medium text-foreground truncate">{al.name}</span>
                  <button
                    onClick={() => handleUnarchiveList(al.id)}
                    className="flex items-center gap-1 ml-3 shrink-0 text-xs text-accent hover:text-accent/80"
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    {t("list.unarchiveList")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Move-to-list bottom sheet ──────────────────────────────────────── */}
      {moveSheet && (
        <>
          <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={() => setMoveSheet(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/50">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Move card</p>
                <p className="text-sm font-semibold truncate mt-0.5">{moveSheet.card.title}</p>
              </div>
              <button onClick={() => setMoveSheet(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground shrink-0 ml-2">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[55vh] py-2">
              {lists.map((list) => {
                const isCurrent = list.id === moveSheet.fromListId;
                const cardCount = list.cards.filter(c => !c.archivedAt).length;
                return (
                  <button
                    key={list.id}
                    disabled={isCurrent || isMoving}
                    onClick={() => handleMoveCard(moveSheet.card, moveSheet.fromListId, list.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                      isCurrent
                        ? "opacity-40 cursor-default"
                        : "hover:bg-accent/5 active:bg-accent/10"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isCurrent ? (
                        <Check className="h-4 w-4 text-accent shrink-0" />
                      ) : (
                        <MoveRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className={`text-sm font-medium truncate ${isCurrent ? "text-accent" : "text-foreground"}`}>
                        {list.title}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{cardCount}</span>
                  </button>
                );
              })}
            </div>

            <div className="h-safe-area-inset-bottom pb-6" />
          </div>
        </>
      )}

      {/* Card detail modal */}
      {selectedCard && (
        <CardDetailModal
          isOpen
          onClose={() => { setSelectedCard(null); loadBoard(); }}
          card={selectedCard.card}
          listId={selectedCard.listId}
          listName={selectedCard.listName}
          boardName={boardName}
          boardId={boardId}
          teamDocs={[]}
          teamBoards={[]}
        />
      )}
    </div>
  );
}
