"use client";
import { getUserAvatarUrl } from "@/lib/gravatar";

import { useRef, useState, useCallback, type CSSProperties } from "react";
import { Plus, MoreHorizontal, Filter, Share, Maximize2, Trash2, Bot, History, Settings } from "lucide-react";
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ListColumn } from "@/components/ui/list-column";
import { BoardChatDrawer } from "@/components/ui/board-chat-drawer";
import { ShareModal } from "@/components/ui/share-modal";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { MessageSquare } from "lucide-react";
import { useBoardRealtime, BoardEvent } from "@/hooks/useBoardRealtime";
import { useBoardPresence } from "@/hooks/useBoardPresence";
import { TagBadge } from "@/components/ui/tag-badge";
import { getClientLocale, translateNativeTagName } from "@/lib/native-tags";
import { useSession } from "@/components/providers/session-provider";
import { useParams, useRouter } from "next/navigation";
import { getBoard, createList, deleteBoard, updateCard, listTeamBoards, BoardSummary } from "@/lib/api/contracts";
import { listDocuments, DocumentSummary } from "@/lib/api/documents";
import { toast } from "@/lib/toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffect } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { ApiError } from "@/lib/api/client";

type BoardListState = {
  id: string;
  title: string;
  cards: any[];
};

type BoardAppearanceState = {
  coverImageUrl?: string | null;
  backgroundKind?: "none" | "preset" | "image" | "color" | "gradient";
  backgroundValue?: string | null;
  backgroundImageUrl?: string | null;
  backgroundGradient?: string | null;
  themeKind?: "preset" | "custom";
  themePreset?: string | null;
  themeCustom?: Record<string, unknown>;
};

type ApplyEventResult = {
  nextLists: BoardListState[];
  needsFallback: boolean;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function findCardLocation(lists: BoardListState[], cardId: string): { listIndex: number; cardIndex: number } | null {
  for (let listIndex = 0; listIndex < lists.length; listIndex += 1) {
    const cardIndex = lists[listIndex].cards.findIndex((card: any) => card.id === cardId);
    if (cardIndex >= 0) {
      return { listIndex, cardIndex };
    }
  }

  return null;
}

function reorderCardWithinList(cards: any[], fromIndex: number, toIndex: number): any[] {
  if (fromIndex === toIndex) return cards;
  const nextCards = [...cards];
  const [card] = nextCards.splice(fromIndex, 1);
  nextCards.splice(Math.max(0, Math.min(toIndex, nextCards.length)), 0, card);
  return nextCards;
}

function dedupeListsById(lists: BoardListState[]): BoardListState[] {
  const byId = new Map<string, BoardListState>();
  const order: string[] = [];

  for (const list of lists) {
    const existing = byId.get(list.id);
    if (!existing) {
      byId.set(list.id, list);
      order.push(list.id);
      continue;
    }

    const existingCardCount = Array.isArray(existing.cards) ? existing.cards.length : 0;
    const incomingCardCount = Array.isArray(list.cards) ? list.cards.length : 0;

    if (incomingCardCount > existingCardCount) {
      byId.set(list.id, list);
    }
  }

  return order.map((id) => byId.get(id)!).filter(Boolean);
}

function applyCardCreated(lists: BoardListState[], payload: Record<string, unknown>): ApplyEventResult {
  const cardId = asString(payload.cardId);
  const listId = asString(payload.listId);
  const title = asString(payload.title) ?? "Untitled";
  const assignees = Array.isArray(payload.assignees)
    ? payload.assignees
      .map((raw) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null))
      .filter((raw): raw is Record<string, unknown> => Boolean(raw))
      .map((raw) => ({
        id: asString(raw.id) || '',
        email: asString(raw.email) || '',
        displayName: asString(raw.displayName),
        avatarUrl: asString(raw.avatarUrl),
      }))
      .filter((assignee) => assignee.id.length > 0)
    : [];

  if (!cardId || !listId) {
    return { nextLists: lists, needsFallback: true };
  }

  const existing = findCardLocation(lists, cardId);
  if (existing) {
    return { nextLists: lists, needsFallback: false };
  }

  const targetListIndex = lists.findIndex((list) => list.id === listId);
  if (targetListIndex === -1) {
    return { nextLists: lists, needsFallback: true };
  }

  const nextLists = [...lists];
  const targetList = nextLists[targetListIndex];
  nextLists[targetListIndex] = {
    ...targetList,
    cards: [
      ...targetList.cards,
      {
        id: cardId,
        title,
        summary: null,
        status: "active",
        startAt: null,
        dueAt: null,
        completedAt: null,
        archivedAt: null,
        urgency: "normal",
        blocks: [],
        tags: [],
        assignees,
      },
    ],
  };

  return { nextLists, needsFallback: false };
}

function applyCardMoved(lists: BoardListState[], payload: Record<string, unknown>): ApplyEventResult {
  const cardId = asString(payload.cardId);
  const toListId = asString(payload.toListId);

  if (!cardId || !toListId) {
    return { nextLists: lists, needsFallback: true };
  }

  const location = findCardLocation(lists, cardId);
  const targetListIndex = lists.findIndex((list) => list.id === toListId);

  if (!location || targetListIndex === -1) {
    return { nextLists: lists, needsFallback: true };
  }

  if (location.listIndex === targetListIndex) {
    return { nextLists: lists, needsFallback: false };
  }

  const nextLists = [...lists];
  const sourceList = nextLists[location.listIndex];
  const targetList = nextLists[targetListIndex];
  const sourceCards = [...sourceList.cards];
  const [movingCard] = sourceCards.splice(location.cardIndex, 1);

  nextLists[location.listIndex] = { ...sourceList, cards: sourceCards };
  nextLists[targetListIndex] = { ...targetList, cards: [...targetList.cards, movingCard] };

  return { nextLists, needsFallback: false };
}

function applyCardUpdated(lists: BoardListState[], payload: Record<string, unknown>): ApplyEventResult {
  const cardId = asString(payload.cardId);
  const listIdFromPayload = asString(payload.listId);
  const changes = payload.changes as Record<string, { from?: unknown; to?: unknown }> | undefined;

  if (!cardId || !changes || typeof changes !== "object") {
    return { nextLists: lists, needsFallback: true };
  }

  const location = findCardLocation(lists, cardId);
  if (!location) {
    return { nextLists: lists, needsFallback: true };
  }

  const nextLists = [...lists];
  const sourceList = nextLists[location.listIndex];
  const sourceCards = [...sourceList.cards];
  const currentCard = sourceCards[location.cardIndex];
  const nextCard = { ...currentCard };

  const titleTo = asString(changes.title?.to);
  if (titleTo !== null) nextCard.title = titleTo;

  if (changes.summary && (typeof changes.summary.to === "string" || changes.summary.to === null)) {
    nextCard.summary = changes.summary.to;
  }

  const dueAtTo = changes.due_at?.to;
  if (typeof dueAtTo === "string" || dueAtTo === null) {
    nextCard.dueAt = dueAtTo;
  }

  const startAtTo = changes.start_at?.to;
  if (typeof startAtTo === "string" || startAtTo === null) {
    nextCard.startAt = startAtTo;
  }

  const completedAtTo = changes.completed_at?.to;
  if (typeof completedAtTo === "string" || completedAtTo === null) {
    nextCard.completedAt = completedAtTo;
  }

  const archivedAtTo = changes.archived_at?.to;
  if (typeof archivedAtTo === "string" || archivedAtTo === null) {
    nextCard.archivedAt = archivedAtTo;
    return { nextLists: lists, needsFallback: true };
  }

  const statusTo = asString(changes.status?.to);
  if (statusTo === "draft" || statusTo === "active" || statusTo === "done" || statusTo === "archived") {
    nextCard.status = statusTo;
  }

  const targetListId = asString(changes.list_id?.to) ?? listIdFromPayload ?? sourceList.id;
  const targetPosition = asFiniteNumber(changes.position?.to);
  const targetListIndex = nextLists.findIndex((list) => list.id === targetListId);

  if (targetListIndex === -1) {
    return { nextLists: lists, needsFallback: true };
  }

  sourceCards[location.cardIndex] = nextCard;

  if (targetListIndex !== location.listIndex) {
    const targetList = nextLists[targetListIndex];
    const trimmedSourceCards = [...sourceCards];
    const [movedCard] = trimmedSourceCards.splice(location.cardIndex, 1);
    const nextTargetCards = [...targetList.cards];
    const insertIndex = targetPosition !== null
      ? Math.max(0, Math.min(targetPosition, nextTargetCards.length))
      : nextTargetCards.length;

    nextTargetCards.splice(insertIndex, 0, movedCard);
    nextLists[location.listIndex] = { ...sourceList, cards: trimmedSourceCards };
    nextLists[targetListIndex] = { ...targetList, cards: nextTargetCards };
    return { nextLists, needsFallback: false };
  }

  if (targetPosition !== null) {
    nextLists[location.listIndex] = {
      ...sourceList,
      cards: reorderCardWithinList(sourceCards, location.cardIndex, targetPosition),
    };
    return { nextLists, needsFallback: false };
  }

  nextLists[location.listIndex] = { ...sourceList, cards: sourceCards };
  return { nextLists, needsFallback: false };
}

function applyCardAssigneeAdded(lists: BoardListState[], payload: Record<string, unknown>): ApplyEventResult {
  const cardId = asString(payload.cardId);
  const assignee = (payload.assignee && typeof payload.assignee === 'object')
    ? (payload.assignee as Record<string, unknown>)
    : null;

  const assigneeId = assignee ? asString(assignee.id) : null;

  if (!cardId || !assignee || !assigneeId) {
    return { nextLists: lists, needsFallback: true };
  }

  const location = findCardLocation(lists, cardId);
  if (!location) {
    return { nextLists: lists, needsFallback: true };
  }

  const nextLists = [...lists];
  const sourceList = nextLists[location.listIndex];
  const sourceCards = [...sourceList.cards];
  const currentCard = sourceCards[location.cardIndex];

  const currentAssignees = Array.isArray((currentCard as any).assignees) ? [...(currentCard as any).assignees] : [];
  if (currentAssignees.some((item: any) => item?.id === assigneeId)) {
    return { nextLists: lists, needsFallback: false };
  }

  const nextCard = {
    ...currentCard,
    assignees: [
      ...currentAssignees,
      {
        id: assigneeId,
        email: asString(assignee.email) || '',
        displayName: asString(assignee.displayName),
        avatarUrl: asString(assignee.avatarUrl),
      },
    ],
  };

  sourceCards[location.cardIndex] = nextCard;
  nextLists[location.listIndex] = { ...sourceList, cards: sourceCards };
  return { nextLists, needsFallback: false };
}

function applyCardAssigneeRemoved(lists: BoardListState[], payload: Record<string, unknown>): ApplyEventResult {
  const cardId = asString(payload.cardId);
  const assigneeId = asString(payload.assigneeId);

  if (!cardId || !assigneeId) {
    return { nextLists: lists, needsFallback: true };
  }

  const location = findCardLocation(lists, cardId);
  if (!location) {
    return { nextLists: lists, needsFallback: true };
  }

  const nextLists = [...lists];
  const sourceList = nextLists[location.listIndex];
  const sourceCards = [...sourceList.cards];
  const currentCard = sourceCards[location.cardIndex];
  const currentAssignees = Array.isArray((currentCard as any).assignees) ? [...(currentCard as any).assignees] : [];
  const nextAssignees = currentAssignees.filter((item: any) => item?.id !== assigneeId);

  if (nextAssignees.length === currentAssignees.length) {
    return { nextLists: lists, needsFallback: false };
  }

  const nextCard = {
    ...currentCard,
    assignees: nextAssignees,
  };

  sourceCards[location.cardIndex] = nextCard;
  nextLists[location.listIndex] = { ...sourceList, cards: sourceCards };
  return { nextLists, needsFallback: false };
}

function applyBrickDeleted(lists: BoardListState[], payload: Record<string, unknown>): ApplyEventResult {
  const cardId = asString(payload.cardId);
  const brickId = asString(payload.brickId);

  if (!cardId || !brickId) {
    return { nextLists: lists, needsFallback: true };
  }

  const location = findCardLocation(lists, cardId);
  if (!location) {
    return { nextLists: lists, needsFallback: true };
  }

  const nextLists = [...lists];
  const sourceList = nextLists[location.listIndex];
  const sourceCards = [...sourceList.cards];
  const nextCard = { ...sourceCards[location.cardIndex] };
  const currentBlocks = Array.isArray(nextCard.blocks) ? nextCard.blocks : null;

  if (!currentBlocks) {
    return { nextLists: lists, needsFallback: true };
  }

  const nextBlocks = currentBlocks.filter((block: any) => block.id !== brickId);
  if (nextBlocks.length === currentBlocks.length) {
    return { nextLists: lists, needsFallback: false };
  }

  nextCard.blocks = nextBlocks;
  sourceCards[location.cardIndex] = nextCard;
  nextLists[location.listIndex] = { ...sourceList, cards: sourceCards };
  return { nextLists, needsFallback: false };
}

function applyBrickReordered(lists: BoardListState[], payload: Record<string, unknown>): ApplyEventResult {
  const cardId = asString(payload.cardId);
  const brickIds = Array.isArray(payload.brickIds)
    ? payload.brickIds.map((brickId) => asString(brickId)).filter((value): value is string => Boolean(value))
    : null;

  if (!cardId || !brickIds) {
    return { nextLists: lists, needsFallback: true };
  }

  const location = findCardLocation(lists, cardId);
  if (!location) {
    return { nextLists: lists, needsFallback: true };
  }

  const nextLists = [...lists];
  const sourceList = nextLists[location.listIndex];
  const sourceCards = [...sourceList.cards];
  const nextCard = { ...sourceCards[location.cardIndex] };
  const currentBlocks = Array.isArray(nextCard.blocks) ? nextCard.blocks : null;

  if (!currentBlocks) {
    return { nextLists: lists, needsFallback: true };
  }

  if (currentBlocks.length !== brickIds.length) {
    return { nextLists: lists, needsFallback: true };
  }

  const blockById = new Map(currentBlocks.map((block: any) => [block.id, block]));
  const reorderedBlocks = brickIds.map((brickId, index) => {
    const block = blockById.get(brickId);
    if (!block) return null;
    return {
      ...block,
      position: index,
    };
  });

  if (reorderedBlocks.some((block) => block === null)) {
    return { nextLists: lists, needsFallback: true };
  }

  nextCard.blocks = reorderedBlocks;
  sourceCards[location.cardIndex] = nextCard;
  nextLists[location.listIndex] = { ...sourceList, cards: sourceCards };
  return { nextLists, needsFallback: false };
}

function applyBoardUpdated(
  lists: BoardListState[],
  payload: Record<string, unknown>,
  onVisibilityChange: (visibility: "private" | "team" | "public_link") => void,
  onAppearanceChange: (appearancePatch: Partial<BoardAppearanceState>) => void,
): ApplyEventResult {
  const changes = payload.changes as Record<string, unknown> | undefined;

  if (!changes || typeof changes !== "object") {
    return { nextLists: lists, needsFallback: true };
  }

  const visibility = asString(changes.visibility);
  if (visibility === "private" || visibility === "team" || visibility === "public_link") {
    onVisibilityChange(visibility);
  }

  const appearanceRaw = changes.appearance as Record<string, unknown> | undefined;
  if (appearanceRaw && typeof appearanceRaw === "object") {
    const patch: Partial<BoardAppearanceState> = {};
    const backgroundKind = asString(appearanceRaw.backgroundKind ?? appearanceRaw.background_kind);
    if (backgroundKind === "none" || backgroundKind === "preset" || backgroundKind === "image" || backgroundKind === "color" || backgroundKind === "gradient") {
      patch.backgroundKind = backgroundKind;
    }

    const themeKind = asString(appearanceRaw.themeKind ?? appearanceRaw.theme_kind);
    if (themeKind === "preset" || themeKind === "custom") {
      patch.themeKind = themeKind;
    }

    const coverImageUrl = appearanceRaw.coverImageUrl ?? appearanceRaw.cover_image_url;
    if (typeof coverImageUrl === "string" || coverImageUrl === null) {
      patch.coverImageUrl = coverImageUrl;
    }

    const backgroundValue = appearanceRaw.backgroundValue ?? appearanceRaw.background_value;
    if (typeof backgroundValue === "string" || backgroundValue === null) {
      patch.backgroundValue = backgroundValue;
    }

    const backgroundImageUrl = appearanceRaw.backgroundImageUrl ?? appearanceRaw.background_image_url;
    if (typeof backgroundImageUrl === "string" || backgroundImageUrl === null) {
      patch.backgroundImageUrl = backgroundImageUrl;
    }

    const backgroundGradient = appearanceRaw.backgroundGradient ?? appearanceRaw.background_gradient;
    if (typeof backgroundGradient === "string" || backgroundGradient === null) {
      patch.backgroundGradient = backgroundGradient;
    }

    const themePreset = appearanceRaw.themePreset ?? appearanceRaw.theme_preset;
    if (typeof themePreset === "string" || themePreset === null) {
      patch.themePreset = themePreset;
    }

    if (appearanceRaw.themeCustom && typeof appearanceRaw.themeCustom === "object") {
      patch.themeCustom = appearanceRaw.themeCustom as Record<string, unknown>;
    }

    if (appearanceRaw.theme_custom && typeof appearanceRaw.theme_custom === "object") {
      patch.themeCustom = appearanceRaw.theme_custom as Record<string, unknown>;
    }

    if (Object.keys(patch).length > 0) {
      onAppearanceChange(patch);
    }
  }

  const listCreated = changes.listCreated as Record<string, unknown> | undefined;
  if (!listCreated) {
    return { nextLists: lists, needsFallback: false };
  }

  const createdListId = asString(listCreated.id);
  const createdListName = asString(listCreated.name);
  if (!createdListId || !createdListName) {
    return { nextLists: lists, needsFallback: true };
  }

  if (lists.some((list) => list.id === createdListId)) {
    return { nextLists: lists, needsFallback: false };
  }

  return {
    nextLists: dedupeListsById([...lists, { id: createdListId, title: createdListName, cards: [] }]),
    needsFallback: false,
  };
}

function applyRealtimeEventToLists(
  lists: BoardListState[],
  event: BoardEvent,
  onVisibilityChange: (visibility: "private" | "team" | "public_link") => void,
  onAppearanceChange: (appearancePatch: Partial<BoardAppearanceState>) => void,
): ApplyEventResult {
  switch (event.type) {
    case "card.created":
      return applyCardCreated(lists, event.payload);
    case "card.updated":
      return applyCardUpdated(lists, event.payload);
    case "card.assignee_added":
      return applyCardAssigneeAdded(lists, event.payload);
    case "card.assignee_removed":
      return applyCardAssigneeRemoved(lists, event.payload);
    case "card.moved":
      return applyCardMoved(lists, event.payload);
    case "brick.deleted":
      return applyBrickDeleted(lists, event.payload);
    case "brick.reordered":
      return applyBrickReordered(lists, event.payload);
    case "board.updated":
      return applyBoardUpdated(lists, event.payload, onVisibilityChange, onAppearanceChange);
    case "brick.created":
    case "brick.updated":
      return { nextLists: lists, needsFallback: true };
    default:
      return { nextLists: lists, needsFallback: true };
  }
}


export default function BoardPage() {
  const t = useTranslations("board-detail");
  const params = useParams();
  const router = useRouter();
  const boardId = params.boardId as string;
  const { accessToken, user } = useSession();

  const members = useBoardPresence(boardId, user, accessToken);

  const locale = getClientLocale();

  const [lists, setLists] = useState<any[]>([]);
  const [boardName, setBoardName] = useState(t("loadingBoard"));
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'copilot' | 'chat' | 'activity'>('activity');
  const [realtimeLog, setRealtimeLog] = useState<string[]>([]);
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [boardTeamId, setBoardTeamId] = useState<string | null>(null);
  const permissions = usePermissions(boardId, boardTeamId, user?.id, accessToken);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [dragVisual, setDragVisual] = useState<{
    activeId: string | null;
    activeTitle: string | null;
    targetListId: string | null;
    targetIndex: number | null;
  }>({
    activeId: null,
    activeTitle: null,
    targetListId: null,
    targetIndex: null,
  });
  const [teamDocs, setTeamDocs] = useState<DocumentSummary[]>([]);
  const [teamBoards, setTeamBoards] = useState<BoardSummary[]>([]);

  useEffect(() => {
    if (!accessToken || !boardTeamId) return;
    listDocuments(boardTeamId, accessToken).then(setTeamDocs).catch(console.error);
    listTeamBoards(boardTeamId, accessToken).then(setTeamBoards).catch(console.error);
  }, [accessToken, boardTeamId]);

  const lastOverIdRef = useRef<string | null>(null);
  const dragStateRef = useRef<{ activeId: string; sourceListId: string | null; targetListId: string | null; targetIndex: number | null } | null>(null);

  const handleDeleteBoard = async () => {
    if (!accessToken) return;
    setIsDeleting(true);
    try {
      await deleteBoard(boardId, accessToken);
      router.push("/");
    } catch (e) {
      console.error(e);
      const detail = e instanceof ApiError ? e.message : null;
      toast(detail ? `${t("deleteBoardError")}: ${detail}` : t("deleteBoardError"), "error");
      setIsDeleting(false);
    }
  };

  const handleAddList = async () => {
    if (!newListName.trim() || !accessToken) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticList = {
      id: tempId,
      title: newListName.trim(),
      cards: []
    };

    setLists(prev => dedupeListsById([...prev, optimisticList]));
    setIsAddingList(false);
    setNewListName("");

    try {
      const createdList = await createList(boardId, { name: optimisticList.title }, accessToken);
      setLists(prev => dedupeListsById(prev.map(l => l.id === tempId ? {
        id: createdList.id,
        title: createdList.name,
        cards: []
      } : l)));
    } catch (error) {
      console.error("Failed to create list", error);
      toast(t("createListError"), "error");
      // Optional: Remove optimistic list if failed
      setLists(prev => prev.filter(l => l.id !== tempId));
    }
  };

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [boardVisibility, setBoardVisibility] = useState<"private" | "team" | "public_link">("team");
  const [boardAppearance, setBoardAppearance] = useState<BoardAppearanceState>({
    backgroundKind: "preset",
    backgroundValue: "bg-background",
  });

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isBoardMenuOpen, setIsBoardMenuOpen] = useState(false);

  const realtimeReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBoard = useCallback(() => {
    if (!accessToken || !boardId) return;

    getBoard(boardId, accessToken)
      .then((board) => {
        setBoardName(board.name);
        setBoardVisibility(board.visibility || "team");
        setBoardAppearance({
          coverImageUrl: board.coverImageUrl,
          backgroundKind: board.backgroundKind,
          backgroundValue: board.backgroundValue,
          backgroundImageUrl: board.backgroundImageUrl,
          backgroundGradient: board.backgroundGradient,
          themeKind: board.themeKind,
          themePreset: board.themePreset,
          themeCustom: board.themeCustom,
        });
        setBoardTeamId(board.teamId ?? null);
        const mappedLists = board.lists.map(list => ({
          id: list.id,
          title: list.name,
          cards: list.cards
        }));
        setLists(mappedLists);
      })
      .catch((err) => {
        console.error("Failed to fetch board", err);
        setBoardName(t("loadBoardError"));
      });
  }, [accessToken, boardId, t]);

  const scheduleBoardReload = useCallback((delayMs = 120) => {
    if (realtimeReloadTimerRef.current) {
      clearTimeout(realtimeReloadTimerRef.current);
    }

    realtimeReloadTimerRef.current = setTimeout(() => {
      realtimeReloadTimerRef.current = null;
      loadBoard();
    }, delayMs);
  }, [loadBoard]);

  useEffect(() => {
    loadBoard();

    const unlisten = () => { };
    const handleRefresh = () => loadBoard();
    const handleOpenBoardChat = () => { setSidebarTab('chat'); setIsChatOpen(true); };
    const handleOpenBoardShare = () => setIsShareModalOpen(true);
    window.addEventListener('board:refresh', handleRefresh);
    window.addEventListener('board:open-chat', handleOpenBoardChat);
    window.addEventListener('board:open-share', handleOpenBoardShare);

    return () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
        realtimeReloadTimerRef.current = null;
      }
      window.removeEventListener('board:refresh', handleRefresh);
      window.removeEventListener('board:open-chat', handleOpenBoardChat);
      window.removeEventListener('board:open-share', handleOpenBoardShare);
    };
  }, [loadBoard]);

  // Subscribe to Ably realtime events for this board
  useBoardRealtime(boardId, (event: BoardEvent) => {
    setRealtimeLog((prev) => [`[${event.type}] ${JSON.stringify(event.payload)}`, ...prev].slice(0, 5));

    let shouldFallback = false;

    setLists((currentLists) => {
      const result = applyRealtimeEventToLists(currentLists, event, setBoardVisibility, (patch) => {
        setBoardAppearance((prev) => ({ ...prev, ...patch }));
      });
      if (result.needsFallback) {
        shouldFallback = true;
      }
      return result.nextLists;
    });

    if (shouldFallback) {
      scheduleBoardReload(120);
    }
  }, accessToken);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: permissions.canEdit ? 5 : 999999 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent) {
    const activeId = event.active.id.toString();
    const sourceListId = lists.find((l) => l.cards.some((c: any) => c.id === activeId))?.id ?? null;
    const activeCard = lists.flatMap((l) => l.cards).find((c: any) => c.id === activeId);

    dragStateRef.current = {
      activeId,
      sourceListId,
      targetListId: sourceListId,
      targetIndex: null,
    };

    setDragVisual({
      activeId,
      activeTitle: activeCard?.title ?? t("drag.card"),
      targetListId: sourceListId,
      targetIndex: null,
    });
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();

    if (overId !== activeId) {
      lastOverIdRef.current = overId;
    }

    if (activeId === overId) return;

    const isActiveAList = lists.some(l => l.id === activeId);
    if (isActiveAList) return;

    const activeContainerId =
      dragStateRef.current?.activeId === activeId
        ? dragStateRef.current.sourceListId
        : lists.find(l => l.cards.some((c: any) => c.id === activeId))?.id;
    const overContainerId = lists.some(l => l.id === overId)
      ? overId
      : lists.find(l => l.cards.some((c: any) => c.id === overId))?.id;

    if (!activeContainerId || !overContainerId) {
      return;
    }

    const overContainer = lists.find((l) => l.id === overContainerId);
    if (!overContainer) return;

    const insertIndex = overId === overContainerId
      ? overContainer.cards.length
      : (() => {
        const idx = overContainer.cards.findIndex((c: any) => c.id === overId);
        return idx >= 0 ? idx : overContainer.cards.length;
      })();

    dragStateRef.current = {
      activeId,
      sourceListId: activeContainerId,
      targetListId: overContainerId,
      targetIndex: insertIndex,
    };

    setDragVisual((prev) => ({
      ...prev,
      targetListId: overContainerId,
      targetIndex: insertIndex,
    }));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeId = active.id.toString();

    const eventOverId = over?.id?.toString() ?? null;
    const fallbackOverId = lastOverIdRef.current;
    const resolvedOverId = eventOverId && eventOverId !== activeId
      ? eventOverId
      : fallbackOverId && fallbackOverId !== activeId
        ? fallbackOverId
        : eventOverId;

    if (!resolvedOverId) {
      setDragVisual({ activeId: null, activeTitle: null, targetListId: null, targetIndex: null });
      return;
    }

    const overId = resolvedOverId;

    const isActiveAList = lists.some(l => l.id === activeId);
    if (isActiveAList) {
      const activeListIndex = lists.findIndex((l) => l.id === activeId);
      const overListIndex = lists.findIndex((l) => l.id === overId);

      if (activeListIndex !== -1 && overListIndex !== -1) {
        setLists(arrayMove(lists, activeListIndex, overListIndex));
      }
      lastOverIdRef.current = null;
      setDragVisual({ activeId: null, activeTitle: null, targetListId: null, targetIndex: null });
      return;
    }

    const activeContainerId = lists.find(l => l.cards.some((c: any) => c.id === activeId))?.id;
    const overContainerId = lists.some(l => l.id === overId)
      ? overId
      : lists.find(l => l.cards.some((c: any) => c.id === overId))?.id;

    const dragMeta = dragStateRef.current?.activeId === activeId ? dragStateRef.current : null;
    const sourceListId = dragMeta?.sourceListId ?? activeContainerId ?? null;
    const targetListId = dragMeta?.targetListId ?? overContainerId ?? null;
    const targetIndexFromMeta = dragMeta?.targetIndex ?? null;

    if (!sourceListId || !targetListId) {
      lastOverIdRef.current = null;
      dragStateRef.current = null;
      setDragVisual({ activeId: null, activeTitle: null, targetListId: null, targetIndex: null });
      return;
    }

    const sourceListIndex = lists.findIndex((l) => l.id === sourceListId);
    const targetListIndex = lists.findIndex((l) => l.id === targetListId);
    if (sourceListIndex === -1 || targetListIndex === -1) {
      lastOverIdRef.current = null;
      dragStateRef.current = null;
      setDragVisual({ activeId: null, activeTitle: null, targetListId: null, targetIndex: null });
      return;
    }

    const sourceCards = lists[sourceListIndex].cards;
    const sourceCardIndex = sourceCards.findIndex((c: any) => c.id === activeId);
    if (sourceCardIndex === -1) {
      lastOverIdRef.current = null;
      dragStateRef.current = null;
      setDragVisual({ activeId: null, activeTitle: null, targetListId: null, targetIndex: null });
      return;
    }

    const baseTargetIndex =
      targetIndexFromMeta ??
      (overId === targetListId
        ? lists[targetListIndex].cards.length
        : (() => {
          const idx = lists[targetListIndex].cards.findIndex((c: any) => c.id === overId);
          return idx >= 0 ? idx : lists[targetListIndex].cards.length;
        })());

    const finalIndex = sourceListId === targetListId
      ? Math.max(0, Math.min(baseTargetIndex, sourceCards.length - 1))
      : Math.max(0, Math.min(baseTargetIndex, lists[targetListIndex].cards.length));

    setLists((prev) => {
      const next = [...prev];
      const srcIndex = next.findIndex((l) => l.id === sourceListId);
      const dstIndex = next.findIndex((l) => l.id === targetListId);
      if (srcIndex === -1 || dstIndex === -1) return prev;

      const srcCards = [...next[srcIndex].cards];
      const movingIndex = srcCards.findIndex((c: any) => c.id === activeId);
      if (movingIndex === -1) return prev;

      if (srcIndex === dstIndex) {
        if (movingIndex === finalIndex) return prev;
        next[srcIndex] = {
          ...next[srcIndex],
          cards: arrayMove(srcCards, movingIndex, finalIndex),
        };
        return next;
      }

      const [movedCard] = srcCards.splice(movingIndex, 1);
      const dstCards = [...next[dstIndex].cards];
      const boundedTargetIndex = Math.max(0, Math.min(finalIndex, dstCards.length));
      dstCards.splice(boundedTargetIndex, 0, movedCard);

      next[srcIndex] = { ...next[srcIndex], cards: srcCards };
      next[dstIndex] = { ...next[dstIndex], cards: dstCards };
      return next;
    });

    if (accessToken) {
      try {
        await updateCard(activeId, { list_id: targetListId, position: finalIndex }, accessToken);
      } catch (err) {
        console.error("Failed to persist card move", err);
      } finally {
        loadBoard();
      }
    }

    lastOverIdRef.current = null;
    dragStateRef.current = null;
    setDragVisual({ activeId: null, activeTitle: null, targetListId: null, targetIndex: null });
  }

  const allAvailableTags = Array.from(new Set(
    lists.flatMap(l => l.cards.flatMap((c: any) => (c.tags || []).map((t: any) => JSON.stringify({ id: t.id, name: t.name, slug: t.slug, color: t.color, tag_kind: t.tag_kind }))))
  )).map(str => JSON.parse(str as string)).filter(Boolean);

  const filteredLists = lists.map(list => ({
    ...list,
    cards: list.cards.filter((card: any) => {
      if (selectedTags.length === 0) return true;
      const cardTagNames = (card.tags || []).map((t: any) => t.name);
      return selectedTags.some(selectedTag => cardTagNames.includes(selectedTag));
    })
  }));

  const resolveBoardBackground = (appearance: BoardAppearanceState): { className: string; style?: CSSProperties } => {
    if (appearance.backgroundKind === "image" && appearance.backgroundImageUrl) {
      return {
        className: "bg-slate-950 bg-cover bg-center",
        style: { backgroundImage: `url(${appearance.backgroundImageUrl})` },
      };
    }

    if (appearance.backgroundKind === "color" && appearance.backgroundValue) {
      return {
        className: "bg-slate-950",
        style: { backgroundColor: appearance.backgroundValue },
      };
    }

    if (appearance.backgroundKind === "gradient" && appearance.backgroundGradient) {
      if (appearance.backgroundGradient.startsWith("bg-")) {
        return { className: appearance.backgroundGradient };
      }

      return {
        className: "bg-slate-950",
        style: { background: appearance.backgroundGradient },
      };
    }

    if (appearance.backgroundKind === "preset" && appearance.backgroundValue) {
      return { className: appearance.backgroundValue };
    }

    if (appearance.coverImageUrl && (/^https?:\/\//i.test(appearance.coverImageUrl) || appearance.coverImageUrl.startsWith("/") || appearance.coverImageUrl.startsWith("data:image/"))) {
      return {
        className: "bg-slate-950 bg-cover bg-center",
        style: { backgroundImage: `url(${appearance.coverImageUrl})` },
      };
    }

    if (appearance.coverImageUrl) {
      return { className: appearance.coverImageUrl };
    }

    return { className: "bg-background" };
  };

  const boardBackground = resolveBoardBackground(boardAppearance);

  return (
    <div className={`flex flex-col h-full overflow-hidden relative ${boardBackground.className}`} style={boardBackground.style}>
      {/* Board Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-background/80 backdrop-blur-sm z-10 w-full shrink-0">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold tracking-tight">{boardName}</h1>
          <div className="h-4 w-[1px] bg-border/80"></div>
          <button className="flex items-center text-sm px-2.5 py-1 rounded-md bg-accent/10 text-accent font-medium hover:bg-accent/20 transition-colors">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
            {t("header.live")}
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex -space-x-2 mr-4 hidden sm:flex">
            {members.slice(0, 4).map((m) => {
              const avatarUrl = getUserAvatarUrl(m.data?.avatar_url, m.data?.email, 32);
              return (
                <img
                  key={m.clientId}
                  src={avatarUrl}
                  alt={m.data?.displayName || m.clientId}
                  title={m.data?.displayName || m.clientId}
                  className="w-8 h-8 rounded-full border-2 border-background shadow-sm object-cover"
                />
              );
            })}
            {members.length > 4 && (
              <div className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shadow-sm">
                +{members.length - 4}
              </div>
            )}
            {members.length === 0 && (
              <div className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shadow-sm animate-pulse" title={t("header.connecting")}>
                ...
              </div>
            )}
          </div>

          <button
            onClick={() => { setSidebarTab('copilot'); setIsChatOpen(true); }}
            className={`h-8 px-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border shadow-sm ${isChatOpen && sidebarTab === 'copilot' ? "bg-accent/10 border-accent/20 text-accent" : "bg-card border-border hover:bg-accent/10 hover:border-accent hover:text-accent text-muted-foreground"}`}
          >
            <Bot className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("header.copilot")}</span>
          </button>

          <button
            onClick={() => { setSidebarTab('chat'); setIsChatOpen(true); }}
            className={`h-8 px-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border shadow-sm ${isChatOpen && sidebarTab === 'chat' ? "bg-accent/10 border-accent/20 text-accent" : "bg-card border-border hover:bg-accent/10 hover:border-accent hover:text-accent text-muted-foreground"}`}
          >
            <MessageSquare className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("header.teamChat")}</span>
          </button>

          <button
            onClick={() => { setSidebarTab('activity'); setIsChatOpen(true); }}
            className={`h-8 px-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border shadow-sm ${isChatOpen && sidebarTab === 'activity' ? "bg-accent/10 border-accent/20 text-accent" : "bg-card border-border hover:bg-accent/10 hover:border-accent hover:text-accent text-muted-foreground"}`}
          >
            <History className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("header.activity")}</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setIsFilterMenuOpen((current) => !current)}
              className={`h-8 px-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border shadow-sm ${isFilterMenuOpen || selectedTags.length > 0 ? "bg-accent/10 border-accent/20 text-accent" : "bg-card border-border hover:bg-accent/10 hover:border-accent hover:text-accent text-muted-foreground"}`}
            >
              <Filter className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Filtros</span>
              {selectedTags.length > 0 ? (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/15 px-1 text-[10px] font-semibold">
                  {selectedTags.length}
                </span>
              ) : null}
            </button>

            {isFilterMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden">
                <div className="p-3 border-b border-border bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      {t("header.filterByTags")}
                    </div>
                    {selectedTags.length > 0 ? (
                      <button
                        onClick={() => setSelectedTags([])}
                        className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        {t("header.clearFilters")}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="p-3 max-h-60 overflow-y-auto space-y-1">
                  {allAvailableTags.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground text-center">{t("header.noTags")}</div>
                  ) : (
                    allAvailableTags.map((tag: any) => {
                      const isSelected = selectedTags.includes(tag.name);
                      return (
                        <label key={tag.name} className="flex items-center space-x-2 p-2 hover:bg-accent/5 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-border text-accent focus:ring-accent"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedTags((prev) =>
                                isSelected ? prev.filter((currentTag) => currentTag !== tag.name) : [...prev, tag.name]
                              );
                            }}
                          />
                          <TagBadge tag={tag} />
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setIsBoardMenuOpen((current) => !current)}
              className={`h-8 px-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border shadow-sm ${isBoardMenuOpen ? "bg-accent/10 border-accent/20 text-accent" : "bg-card border-border hover:bg-accent/10 hover:border-accent hover:text-accent text-muted-foreground"}`}
            >
              <Settings className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Config</span>
            </button>

            {isBoardMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden">
                <div className="p-3 border-b border-border bg-muted/20">
                  <h4 className="text-sm font-semibold text-foreground">Configuración del board</h4>
                </div>
                {(permissions.canManageBoard || permissions.canEdit) && (
                  <div className="p-3 space-y-2">
                    {permissions.canManageBoard && (
                      <button
                        onClick={() => {
                          setIsBoardMenuOpen(false);
                          setIsShareModalOpen(true);
                        }}
                        className="w-full h-9 px-3 inline-flex items-center justify-start rounded-md text-sm font-medium transition-colors hover:bg-accent/10 text-foreground"
                      >
                        <Share className="h-4 w-4 mr-2" />
                        {t("header.share")}
                      </button>
                    )}
                    {permissions.canEdit && (
                      <button
                        onClick={() => {
                          setIsBoardMenuOpen(false);
                          setIsDeleteModalOpen(true);
                        }}
                        disabled={isDeleting}
                        className="w-full h-9 px-3 inline-flex items-center justify-start rounded-md text-sm font-medium transition-colors hover:bg-red-500/10 hover:text-red-500 text-muted-foreground disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t("header.deleteBoard")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Kanban Canvas */}
      <main className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full p-6 inline-flex items-start space-x-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              lastOverIdRef.current = null;
              dragStateRef.current = null;
            }}
          >
            {filteredLists.map((list) => (
              <ListColumn
                key={list.id}
                list={list}
                boardId={boardId}
                boardName={boardName}
                isDropTarget={dragVisual.targetListId === list.id}
                dropHintIndex={dragVisual.targetListId === list.id ? dragVisual.targetIndex : null}
                draggingCardId={dragVisual.activeId}
                canEdit={permissions.canEdit}
                canComment={permissions.canComment}
                teamDocs={teamDocs}
                teamBoards={teamBoards}
              />
            ))}

            <DragOverlay>
              {dragVisual.activeId ? (
                <div className="w-72 rounded-lg border border-accent/60 bg-card/95 shadow-2xl ring-2 ring-accent/30 px-3 py-2 backdrop-blur-sm">
                  <div className="text-[10px] uppercase tracking-wider text-accent/90 font-semibold mb-1">{t("drag.movingCard")}</div>
                  <div className="text-sm font-medium text-foreground truncate">{dragVisual.activeTitle ?? t("drag.card")}</div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Add List Button / Form */}
          {isAddingList ? (
            <div className="w-72 shrink-0 p-3 rounded-xl border border-border/60 bg-card shadow-sm flex flex-col space-y-3">
              <input
                type="text"
                placeholder={t("list.placeholder")}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddList();
                  if (e.key === 'Escape') {
                    setIsAddingList(false);
                    setNewListName("");
                  }
                }}
              />
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleAddList}
                  className="px-3 py-1.5 bg-accent hover:bg-accent/90 text-accent-foreground text-xs font-medium rounded-md transition-colors"
                >
                  {t("list.add")}
                </button>
                <button
                  onClick={() => {
                    setIsAddingList(false);
                    setNewListName("");
                  }}
                  className="px-3 py-1.5 bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-medium rounded-md transition-colors"
                >
                  {t("list.cancel")}
                </button>
              </div>
            </div>
          ) : (
            permissions.canEdit && (
              <button
                onClick={() => setIsAddingList(true)}
                className="w-72 shrink-0 h-12 rounded-xl border border-dashed border-border/60 bg-transparent flex items-center justify-center text-muted-foreground hover:bg-accent/5 hover:border-accent hover:text-foreground transition-all"
              >
                <Plus className="h-5 w-5 mr-2" />
                {t("list.addAnother")}
              </button>
            )
          )}
        </div>
      </main>

      <BoardChatDrawer isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} boardId={boardId} initialTab={sidebarTab} />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        boardId={boardId}
        boardName={boardName}
        initialVisibility={boardVisibility}
        accessToken={accessToken!}
      />

      <ConfirmDeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteBoard}
        title={t("confirmDelete.title")}
        description={t("confirmDelete.description")}
      />
    </div>
  );
}
