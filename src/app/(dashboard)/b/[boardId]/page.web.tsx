"use client";
import { getUserAvatarUrl } from "@/lib/gravatar";

import { useRef, useState, useCallback, useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { NavbarAiCredits } from "@/components/ui/navbar-ai-credits";
import { Plus, MoreHorizontal, Filter, Share, Maximize2, Trash2, Bot, History, Settings, Pencil, ChartGantt, SquareKanban, ChevronLeft, ChevronRight, CalendarDays, Clock3, Archive, ArchiveRestore } from "lucide-react";
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ListColumn } from "@/components/ui/list-column";
import { ShareModal } from "@/components/ui/share-modal";
import { CardDetailModal } from "@/components/ui/card-detail-modal";
import { MessageSquare } from "lucide-react";
import { useBoardRealtime, BoardEvent } from "@/hooks/useBoardRealtime";
import { useBoardPresence } from "@/hooks/useBoardPresence";
import { TagBadge } from "@/components/ui/tag-badge";
import { getClientLocale, translateNativeTagName } from "@/lib/native-tags";
import { useSession } from "@/components/providers/session-provider";
import { useParams, useRouter } from "next/navigation";
import { getBoard, createList, deleteBoard, updateCard, listTeamBoards, BoardSummary, updateBoardAppearance, updateBoardDetails, uploadFile, getArchivedLists, archiveList, ArchivedListSummary } from "@/lib/api/contracts";
import { listDocuments, DocumentSummary } from "@/lib/api/documents";
import { apiCache, CACHE_TTL, cacheKey } from "@/lib/api-cache";
import { toast } from "@/lib/toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffect } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { ApiError } from "@/lib/api/client";
import { BoardChatDrawer } from "@/components/ui/board-chat-drawer";
import { BoardSettingsModal } from "@/components/ui/board-settings-modal";
import { useAsyncAction, useConfirm } from "@/hooks/ui";

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

type BoardViewMode = "kanban" | "gantt";

type GanttCardRow = {
  card: any;
  listId: string;
  listName: string;
  startAt: string;
  dueAt: string;
  leftPct: number;
  widthPct: number;
  isOverdue: boolean;
};

type ApplyEventResult = {
  nextLists: BoardListState[];
  needsFallback: boolean;
};

type BoardThemeTokens = {
  accent: string;
  accentForeground: string;
  surface: string;
  surfaceStrong: string;
  text: string;
  border: string;
  panel: string;
  panelStrong: string;
  buttonGhost: string;
};

const THEME_PRESET_COLORS: Record<string, { accent: string; surface: string }> = {
  "killio-default": { accent: "#d8ff72", surface: "#0b0f14" },
  "trello-ocean": { accent: "#67e8f9", surface: "#0c2233" },
  "trello-forest": { accent: "#86efac", surface: "#10251f" },
  "trello-sunrise": { accent: "#fcd34d", surface: "#3b1f10" },
};

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return fallback;
  if (trimmed.length === 7) return trimmed.toLowerCase();
  const r = trimmed[1];
  const g = trimmed[2];
  const b = trimmed[3];
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(hex, "#000000");
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbaFromHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHex(base: string, target: string, ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const a = hexToRgb(base);
  const b = hexToRgb(target);
  const r = Math.round(a.r + (b.r - a.r) * clamped);
  const g = Math.round(a.g + (b.g - a.g) * clamped);
  const bValue = Math.round(a.b + (b.b - a.b) * clamped);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bValue
    .toString(16)
    .padStart(2, "0")}`;
}

function isLightColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62;
}

function resolveThemeTokens(appearance: BoardAppearanceState): BoardThemeTokens {
  const presetKey = appearance.themePreset && THEME_PRESET_COLORS[appearance.themePreset]
    ? appearance.themePreset
    : "killio-default";

  const preset = THEME_PRESET_COLORS[presetKey];
  const custom = appearance.themeKind === "custom" ? appearance.themeCustom : undefined;

  const accent = normalizeHexColor(custom?.accent, preset.accent);
  const surface = normalizeHexColor(custom?.surface, preset.surface);
  const text = isLightColor(surface) ? "#111827" : "#f8fafc";
  const isClassicPreset = appearance.themeKind !== "custom" && presetKey === "killio-default";
  const border = isClassicPreset
    ? mixHex(surface, "#ffffff", 0.1)
    : rgbaFromHex(accent, 0.35);

  return {
    accent,
    accentForeground: isLightColor(accent) ? "#0f172a" : "#f8fafc",
    surface,
    surfaceStrong: mixHex(surface, "#ffffff", isLightColor(surface) ? 0.12 : 0.04),
    text,
    border,
    panel: rgbaFromHex(surface, isLightColor(surface) ? 0.8 : 0.68),
    panelStrong: rgbaFromHex(surface, isLightColor(surface) ? 0.9 : 0.84),
    buttonGhost: rgbaFromHex(accent, 0.14),
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const mondayOffset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - mondayOffset);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateTimeValue(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
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

  const tagsTo = changes.tags?.to;
  if (Array.isArray(tagsTo)) {
    nextCard.tags = tagsTo;
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
  onBoardMetaChange: (patch: { name?: string; description?: string | null }) => void,
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

  const boardName = asString(changes.name);
  if (boardName) {
    onBoardMetaChange({ name: boardName });
  }

  const description = changes.description;
  if (typeof description === "string" || description === null) {
    onBoardMetaChange({ description });
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
  if (listCreated) {
    const createdListId = asString(listCreated.id);
    const createdListName = asString(listCreated.name);
    if (createdListId && createdListName && !lists.some((list) => list.id === createdListId)) {
      return {
        nextLists: dedupeListsById([...lists, { id: createdListId, title: createdListName, cards: [] }]),
        needsFallback: false,
      };
    }
  }

  const listDeleted = changes.listDeleted as Record<string, unknown> | undefined;
  if (listDeleted) {
    const deletedListId = asString(listDeleted.id);
    if (deletedListId) {
      return {
        nextLists: lists.filter(l => l.id !== deletedListId),
        needsFallback: false,
      };
    }
  }

  const listUpdated = changes.listUpdated as Record<string, unknown> | undefined;
  if (listUpdated) {
    const updatedListId = asString(listUpdated.id);
    const updatedListName = asString(listUpdated.name);
    const isArchived = listUpdated.isArchived;

    if (updatedListId) {
      if (isArchived === true) {
        return {
          nextLists: lists.filter(l => l.id !== updatedListId),
          needsFallback: false,
        };
      }
      if (updatedListName) {
        return {
          nextLists: lists.map(l => l.id === updatedListId ? { ...l, title: updatedListName } : l),
          needsFallback: false,
        };
      }
    }
  }

  return { nextLists: lists, needsFallback: false };
}

function applyRealtimeEventToLists(
  lists: BoardListState[],
  event: BoardEvent,
  onBoardMetaChange: (patch: { name?: string; description?: string | null }) => void,
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
      return applyBoardUpdated(lists, event.payload, onBoardMetaChange, onVisibilityChange, onAppearanceChange);
    case "tag.created":
      return { nextLists: lists, needsFallback: true };
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
  const { accessToken, user, activeTeamId } = useSession();
  const [navbarUsageSlotEl, setNavbarUsageSlotEl] = useState<Element | null>(null);

  useEffect(() => {
    const checkDomElement = () => {
      const navSlot = document.getElementById("navbar-usage-slot");
      setNavbarUsageSlotEl((prev) => (prev === navSlot ? prev : navSlot));
    };
    checkDomElement();
    const observer = new MutationObserver(checkDomElement);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const members = useBoardPresence(boardId, user, accessToken);

  const locale = getClientLocale();

  const [lists, setLists] = useState<any[]>([]);
  const [boardName, setBoardName] = useState(t("loadingBoard"));
  const [boardDescription, setBoardDescription] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'copilot' | 'chat' | 'activity'>('activity');
  const [realtimeLog, setRealtimeLog] = useState<string[]>([]);
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [boardTeamId, setBoardTeamId] = useState<string | null>(null);
  const permissions = usePermissions(boardId, boardTeamId, user?.id, accessToken);
  const { ask: askDeleteBoard, ConfirmDialog: DeleteBoardConfirmDialog } = useConfirm();
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

    // Serve from cache immediately (populated by layout sidebar or previous visit)
    const cachedBoards = apiCache.get<BoardSummary[]>(cacheKey.boards(boardTeamId));
    const cachedDocs   = apiCache.get<DocumentSummary[]>(cacheKey.documents(boardTeamId));
    if (cachedBoards) setTeamBoards(cachedBoards);
    if (cachedDocs)   setTeamDocs(cachedDocs);

    // Refresh in background only if cache was cold
    if (!cachedBoards) listTeamBoards(boardTeamId, accessToken).then((d) => { apiCache.set(cacheKey.boards(boardTeamId), d, CACHE_TTL.BOARDS); setTeamBoards(d); }).catch(console.error);
    if (!cachedDocs)   listDocuments(boardTeamId, accessToken).then((d) => { apiCache.set(cacheKey.documents(boardTeamId), d, CACHE_TTL.DOCUMENTS); setTeamDocs(d); }).catch(console.error);
  }, [accessToken, boardTeamId]);

  const lastOverIdRef = useRef<string | null>(null);
  const dragStateRef = useRef<{ activeId: string; sourceListId: string | null; targetListId: string | null; targetIndex: number | null } | null>(null);

  const deleteBoardAction = useAsyncAction(
    async () => {
      if (!accessToken) return;
      await deleteBoard(boardId, accessToken);
    },
    {
      onSuccess: () => router.push("/"),
      onError: (e) => {
        const detail = e instanceof ApiError ? e.message : null;
        toast(detail ? `${t("deleteBoardError")}: ${detail}` : t("deleteBoardError"), "error");
      },
    }
  );

  const handleDeleteBoard = async () => {
    const ok = await askDeleteBoard({
      title: t("confirmDelete.title"),
      description: t("confirmDelete.description"),
      confirmLabel: t("header.deleteBoard"),
      variant: "destructive",
    });
    if (ok) deleteBoardAction.run(undefined);
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
  const [isBoardSettingsOpen, setIsBoardSettingsOpen] = useState(false);
  const [boardVisibility, setBoardVisibility] = useState<"private" | "team" | "public_link">("team");
  const [boardAppearance, setBoardAppearance] = useState<BoardAppearanceState>({
    backgroundKind: "color",
    backgroundValue: "#000000",
  });
  const [boardView, setBoardView] = useState<BoardViewMode>("kanban");
  const [ganttViewMode, setGanttViewMode] = useState<"day" | "week" | "month">("week");
  const [ganttWeekOffset, setGanttWeekOffset] = useState(0);
  const [selectedGanttCard, setSelectedGanttCard] = useState<{ card: any; listId: string; listName: string } | null>(null);
  const [ganttWeekBase] = useState(() => startOfWeek(new Date()));
  const [expandedGanttLists, setExpandedGanttLists] = useState<Set<string>>(new Set());

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isBoardMenuOpen, setIsBoardMenuOpen] = useState(false);
  const [showArchivedLists, setShowArchivedLists] = useState(false);
  const [archivedLists, setArchivedLists] = useState<ArchivedListSummary[]>([]);
  const [archivedListsLoading, setArchivedListsLoading] = useState(false);

  const handleToggleArchivedLists = useCallback(async () => {
    if (showArchivedLists) {
      setShowArchivedLists(false);
      return;
    }
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

  // Calculate days count based on view mode
  const ganttDaysCount = ganttViewMode === "day" ? 1 : ganttViewMode === "week" ? 7 : 30;
  const ganttOffsetMultiplier = ganttViewMode === "day" ? 1 : ganttViewMode === "week" ? 7 : 30;

  const ganttWeekStart = useMemo(() => addDays(ganttWeekBase, ganttWeekOffset * ganttOffsetMultiplier), [ganttWeekBase, ganttWeekOffset, ganttOffsetMultiplier]);
  const ganttWeekEnd = useMemo(() => {
    const end = addDays(ganttWeekStart, ganttDaysCount - 1);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [ganttWeekStart, ganttDaysCount]);
  const ganttWeekEndExclusive = useMemo(() => addDays(ganttWeekStart, ganttDaysCount).getTime(), [ganttWeekStart, ganttDaysCount]);
  const ganttWeekStartMs = ganttWeekStart.getTime();
  const ganttWeekDurationMs = ganttWeekEndExclusive - ganttWeekStartMs;
  const ganttWeekDays = useMemo(() => Array.from({ length: ganttDaysCount }, (_, index) => addDays(ganttWeekStart, index)), [ganttWeekStart, ganttDaysCount]);
  const ganttWeekLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
    if (ganttViewMode === "day") {
      return formatter.format(ganttWeekStart);
    }
    return `${formatter.format(ganttWeekStart)} - ${formatter.format(ganttWeekEnd)}`;
  }, [ganttWeekEnd, ganttWeekStart, locale, ganttViewMode]);

  const realtimeReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyBoardData = useCallback((board: Awaited<ReturnType<typeof getBoard>>) => {
    setBoardName(board.name);
    setBoardDescription(board.description ?? null);
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
    setLists(board.lists.map(list => ({ id: list.id, title: list.name, cards: list.cards })));
  }, []);

  const loadBoard = useCallback(() => {
    if (!accessToken || !boardId) return;

    // Show cached board instantly (no loading flash on revisit)
    const cached = apiCache.get<Awaited<ReturnType<typeof getBoard>>>(cacheKey.board(boardId));
    if (cached) applyBoardData(cached);

    getBoard(boardId, accessToken)
      .then((board) => {
        apiCache.set(cacheKey.board(boardId), board, CACHE_TTL.BOARD_DETAIL);
        applyBoardData(board);
      })
      .catch((err) => {
        console.error("Failed to fetch board", err);
        if (!cached) {
          setBoardName(t("loadBoardError"));
          setBoardDescription(null);
        }
      });
  }, [accessToken, boardId, applyBoardData, t]);

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

  const handleSaveBoardGeneral = useCallback(async ({ name, description }: { name: string; description: string | null }) => {
    if (!accessToken) return;
    await updateBoardDetails(boardId, { name, description }, accessToken);
    setBoardName(name);
    setBoardDescription(description);
    toast(t("settingsUpdated"), "success");
  }, [accessToken, boardId]);

  const handleSaveBoardAppearance = useCallback(async (payload: BoardAppearanceState) => {
    if (!accessToken) return;
    await updateBoardAppearance(boardId, payload, accessToken);
    setBoardAppearance((prev) => ({ ...prev, ...payload }));
    toast(t("appearanceUpdated"), "success");
  }, [accessToken, boardId]);

  const handleUploadBoardImage = useCallback(async (file: File): Promise<string> => {
    if (!accessToken) {
      throw new Error("Sesión expirada. Inicia sesión nuevamente.");
    }
    const uploaded = await uploadFile(file, accessToken, {
      ownerScopeType: 'board',
      ownerScopeId: boardId,
      usage: 'board-cover',
    });
    return uploaded.url;
  }, [accessToken, boardId]);

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
      const result = applyRealtimeEventToLists(
        currentLists,
        event,
        (patch) => {
          if (patch.name) setBoardName(patch.name);
          if (patch.description !== undefined) setBoardDescription(patch.description);
        },
        setBoardVisibility,
        (patch) => {
          setBoardAppearance((prev) => ({ ...prev, ...patch }));
        },
      );
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

  const ganttSections = useMemo<Array<{ listId: string; listName: string; cards: GanttCardRow[] }>>(() => {
    return filteredLists
      .map((list: { id: string; title: string; cards: any[] }) => {
        const cards: GanttCardRow[] = (list.cards || [])
          .map((card: any): GanttCardRow | null => {
            const startAt = typeof card?.startAt === "string" ? card.startAt : null;
            const dueAt = typeof card?.dueAt === "string" ? card.dueAt : null;
            const startMs = parseDateTimeValue(startAt || dueAt);
            const dueMs = parseDateTimeValue(dueAt || startAt);

            if (startMs === null || dueMs === null) {
              return null;
            }

            const windowStart = Math.min(startMs, dueMs);
            const windowEnd = Math.max(startMs, dueMs);
            if (windowEnd < ganttWeekStartMs || windowStart > ganttWeekEndExclusive) {
              return null;
            }

            const clippedStart = Math.max(windowStart, ganttWeekStartMs);
            const clippedEnd = Math.min(windowEnd, ganttWeekEndExclusive);
            const leftPct = ((clippedStart - ganttWeekStartMs) / ganttWeekDurationMs) * 100;
            const widthPct = Math.max(3.5, ((clippedEnd - clippedStart) / ganttWeekDurationMs) * 100);

            return {
              card,
              listId: list.id,
              listName: list.title,
              startAt: startAt || dueAt || "",
              dueAt: dueAt || startAt || "",
              leftPct,
              widthPct,
              isOverdue: Boolean(dueMs < Date.now()),
            };
          })
          .filter((row): row is GanttCardRow => Boolean(row))
          .sort((left, right) => {
            if (left.leftPct !== right.leftPct) return left.leftPct - right.leftPct;
            return left.widthPct - right.widthPct;
          });

        return {
          listId: list.id,
          listName: list.title,
          cards,
        };
      })
      .filter((section) => section.cards.length > 0);
  }, [filteredLists, ganttWeekDurationMs, ganttWeekEndExclusive, ganttWeekStartMs]);

  const ganttWeekDayLabels = useMemo(() => {
    if (ganttViewMode === "day") {
      // Day view: show full day format
      return ganttWeekDays.map((date) => ({
        key: formatDateKey(date),
        label: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date),
        dateLabel: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date),
      }));
    } else if (ganttViewMode === "month") {
      // Month view: show week numbers
      return ganttWeekDays.map((date, index) => ({
        key: formatDateKey(date),
        label: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date),
        dateLabel: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date),
      }));
    }
    // Week view (default): short weekday + date
    return ganttWeekDays.map((date) => ({
      key: formatDateKey(date),
      label: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date),
      dateLabel: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date),
    }));
  }, [ganttWeekDays, locale, ganttViewMode]);

  const formatGanttDateTime = useCallback((value: string) => {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }, [locale]);

  const getCardBarColor = useCallback((card: any): string => {
    // If card has a background color, use it
    if (card.backgroundColor && typeof card.backgroundColor === "string") {
      return card.backgroundColor;
    }

    // If completed, blue
    if (card.completedAt || card.status === "done") {
      return "#3b82f6"; // blue
    }

    // If overdue, red
    if (card.dueAt) {
      const dueMs = parseDateTimeValue(card.dueAt);
      if (dueMs && dueMs < Date.now()) {
        return "#ef4444"; // red
      }
    }

    // If active and not completed, orange
    if (card.status === "active") {
      return "#f97316"; // orange
    }

    // Default blue
    return "#3b82f6";
  }, []);

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
      // preset is now stored as a hex color (not a Tailwind class)
      if (appearance.backgroundValue.startsWith("#") || appearance.backgroundValue.startsWith("rgb")) {
        return { className: "bg-slate-950", style: { backgroundColor: appearance.backgroundValue } };
      }
      return { className: appearance.backgroundValue };
    }

    return { className: "bg-background" };
  };

  const boardBackground = resolveBoardBackground(boardAppearance);
  const boardTheme = resolveThemeTokens(boardAppearance);
  const boardShellStyle = {
    ...(boardBackground.style ?? {}),
    color: boardTheme.text,
    "--board-accent": boardTheme.accent,
    "--board-accent-foreground": boardTheme.accentForeground,
    "--board-surface": boardTheme.surface,
    "--board-surface-strong": boardTheme.surfaceStrong,
    "--board-text": boardTheme.text,
    "--board-border": boardTheme.border,
    "--board-panel": boardTheme.panel,
    "--board-panel-strong": boardTheme.panelStrong,
    "--board-ghost": boardTheme.buttonGhost,
  } as CSSProperties;

  return (
    <div className={`flex flex-col h-full overflow-hidden relative ${boardBackground.className}`} style={boardShellStyle}>
      {/* Board Header */}
      <header
        className="flex items-center justify-between px-6 py-3 border-b backdrop-blur-sm z-10 w-full shrink-0"
        style={{
          backgroundColor: "var(--board-panel-strong)",
          borderColor: "var(--board-border)",
        }}
      >
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--board-text, inherit)" }}>{boardName}</h1>
          <div className="h-4 w-[1px]" style={{ backgroundColor: "var(--board-border)" }}></div>
          <button
            className="flex items-center text-sm px-2.5 py-1 rounded-md font-medium transition-colors"
            style={{
              backgroundColor: "var(--board-ghost)",
              color: "var(--board-accent)",
            }}
          >
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
            {t("header.live")}
          </button>
          <div className="flex items-center rounded-full border border-border/70 bg-background/60 p-1 shadow-sm backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setBoardView("kanban")}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${boardView === "kanban" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <SquareKanban className="h-3.5 w-3.5" />
              {t("header.kanbanView")}
            </button>
            <button
              type="button"
              onClick={() => setBoardView("gantt")}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${boardView === "gantt" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <ChartGantt className="h-3.5 w-3.5" />
              {t("header.ganttView")}
            </button>
          </div>
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

          <div className="relative">
            <button
              onClick={() => setIsBoardMenuOpen((current) => {
                if (current) {
                  setIsFilterMenuOpen(false);
                }
                return !current;
              })}
              className={`h-8 px-3 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border shadow-sm ${isBoardMenuOpen ? "bg-accent/10 border-accent/20 text-accent" : "bg-card border-border hover:bg-accent/10 hover:border-accent hover:text-accent text-muted-foreground"}`}
            >
              <Settings className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t("header.config")}</span>
            </button>

            {isBoardMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden">
                <div className="p-3 border-b border-border bg-muted/20">
                  <h4 className="text-sm font-semibold text-foreground">{t("header.boardSettings")}</h4>
                </div>

                <div className="p-3 space-y-2">
                  <button
                    onClick={() => {
                      setIsFilterMenuOpen(false);
                      setIsBoardMenuOpen(false);
                      setSidebarTab('activity');
                      setIsChatOpen(true);
                    }}
                    className="w-full h-9 px-3 inline-flex items-center justify-start rounded-md text-sm font-medium transition-colors hover:bg-accent/10 text-foreground"
                  >
                    <History className="h-4 w-4 mr-2" />
                    {t("header.activity")}
                  </button>

                  <button
                    onClick={() => setIsFilterMenuOpen((current) => !current)}
                    className={`w-full h-9 px-3 inline-flex items-center justify-start rounded-md text-sm font-medium transition-colors hover:bg-accent/10 ${isFilterMenuOpen || selectedTags.length > 0 ? "text-accent" : "text-foreground"}`}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    <span>{t("header.filters")}</span>
                    {selectedTags.length > 0 ? (
                      <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/15 px-1 text-[10px] font-semibold">
                        {selectedTags.length}
                      </span>
                    ) : null}
                  </button>

                  {isFilterMenuOpen && (
                    <div className="rounded-lg border border-border/70 overflow-hidden">
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

                  <button
                    onClick={() => {
                      setIsBoardMenuOpen(false);
                      setIsFilterMenuOpen(false);
                      handleToggleArchivedLists();
                    }}
                    className={`w-full h-9 px-3 inline-flex items-center justify-start rounded-md text-sm font-medium transition-colors hover:bg-accent/10 ${showArchivedLists ? "text-accent" : "text-foreground"}`}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    {showArchivedLists ? t("list.hideArchived") : t("list.viewArchived")}
                  </button>

                  {permissions.canEdit && (
                    <button
                      onClick={() => {
                        setIsBoardMenuOpen(false);
                        setIsFilterMenuOpen(false);
                        setIsBoardSettingsOpen(true);
                      }}
                      className="w-full h-9 px-3 inline-flex items-center justify-start rounded-md text-sm font-medium transition-colors hover:bg-accent/10 text-foreground"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      {t("header.editBoard")}
                    </button>
                  )}

                  {(permissions.canManageBoard || permissions.canEdit) && (
                    <>
                      <div className="my-1 border-t border-border" />
                    {permissions.canManageBoard && (
                      <button
                        onClick={() => {
                          setIsBoardMenuOpen(false);
                          setIsFilterMenuOpen(false);
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
                          setIsFilterMenuOpen(false);
                          handleDeleteBoard();
                        }}
                        disabled={deleteBoardAction.isPending}
                        className="w-full h-9 px-3 inline-flex items-center justify-start rounded-md text-sm font-medium transition-colors hover:bg-red-500/10 hover:text-red-500 text-muted-foreground disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t("header.deleteBoard")}
                      </button>
                    )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {boardView === "kanban" ? (
      <>
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
                teamId={boardTeamId ?? undefined}
                boardName={boardName}
                isDropTarget={dragVisual.targetListId === list.id}
                dropHintIndex={dragVisual.targetListId === list.id ? dragVisual.targetIndex : null}
                draggingCardId={dragVisual.activeId}
                canEdit={permissions.canEdit}
                canComment={permissions.canComment}
                teamDocs={teamDocs}
                teamBoards={teamBoards}
                accentColor={(boardAppearance.themeCustom as any)?.listColors?.[list.id]}
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
                className="w-72 shrink-0 h-12 rounded-xl border border-dashed border-border/60 bg-transparent flex items-center justify-center hover:bg-accent/5 hover:border-accent transition-all"
                style={{ color: "var(--board-text, rgb(100 116 139))", opacity: 0.75 }}
              >
                <Plus className="h-5 w-5 mr-2" />
                {t("list.addAnother")}
              </button>
            )
          )}
        </div>
      </main>

      {/* Archived Lists Panel */}
      {showArchivedLists && (
        <div className="shrink-0 border-t border-border/60 bg-muted/20 backdrop-blur-sm">
          <div className="px-6 py-3">
            <div className="flex items-center gap-2 mb-3">
              <Archive className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">{t("list.archivedLists")}</h3>
            </div>
            {archivedListsLoading ? (
              <div className="text-xs text-muted-foreground">{t("loadingBoard")}</div>
            ) : archivedLists.length === 0 ? (
              <div className="text-xs text-muted-foreground">{t("list.noArchivedLists")}</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {archivedLists.map((archivedList) => (
                  <div
                    key={archivedList.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-sm"
                  >
                    <span className="font-medium text-foreground">{archivedList.name}</span>
                    {permissions.canEdit && (
                      <button
                        onClick={() => handleUnarchiveList(archivedList.id)}
                        className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                        title={t("list.unarchiveList")}
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        {t("list.unarchiveList")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      </>
      ) : (
      <main className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col overflow-y-auto px-6 py-5">
          <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/80 px-4 py-3 shadow-sm backdrop-blur-sm">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">{t("gantt.title")}</p>
              <div className="mt-1 flex items-center gap-2">
                <ChartGantt className="h-4 w-4 text-accent" />
                <h2 className="text-lg font-semibold text-foreground">{ganttWeekLabel}</h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* View mode selector */}
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => {
                    setGanttViewMode("day");
                    setGanttWeekOffset(0);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    ganttViewMode === "day"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("gantt.dayView")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGanttViewMode("week");
                    setGanttWeekOffset(0);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    ganttViewMode === "week"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("gantt.weekView")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGanttViewMode("month");
                    setGanttWeekOffset(0);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    ganttViewMode === "month"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("gantt.monthView")}
                </button>
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGanttWeekOffset((current) => current - 1)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setGanttWeekOffset(0)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary/90 px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary"
                >
                  <CalendarDays className="h-4 w-4" />
                  {t("gantt.thisWeek")}
                </button>
                <button
                  type="button"
                  onClick={() => setGanttWeekOffset((current) => current + 1)}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="mb-4 overflow-x-auto pb-2">
            <div style={{ minWidth: `${Math.max(1040, ganttDaysCount * 140)}px` }}>
              <div 
                className="overflow-hidden rounded-xl border border-border/60 bg-card/70 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground shadow-sm"
                style={{ display: "grid", gridTemplateColumns: `repeat(${ganttDaysCount}, 1fr)` }}
              >
                {ganttWeekDayLabels.map((day, index) => (
                  <div key={day.key} className={`px-3 py-3 ${index > 0 ? "border-l border-border/60" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span>{day.label}</span>
                      <span className="text-[10px] tracking-normal text-muted-foreground/80">{day.dateLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 overflow-x-auto pb-4">
            <div className="min-w-[1200px]">
              {ganttSections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-card/60 px-6 py-16 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <ChartGantt className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{t("gantt.emptyTitle")}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{t("gantt.emptyDescription")}</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-border/60 bg-card/60 shadow-sm overflow-hidden">
                  {/* Table Header */}
                  <div className="flex border-b border-border/60 bg-muted/30">
                    {/* List column header */}
                    <div className="w-48 shrink-0 px-4 py-3 border-r border-border/60">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("gantt.lists")}</p>
                    </div>
                    {/* Day headers */}
                    <div className="flex flex-1">
                      {ganttWeekDayLabels.map((day, index) => (
                        <div key={day.key} className={`flex-1 px-3 py-3 text-center ${index > 0 ? "border-l border-border/60" : ""}`}>
                          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{day.label}</div>
                          <div className="text-[10px] text-muted-foreground/70 mt-1">{day.dateLabel}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Table Rows (one row per list) */}
                  {filteredLists.map((list) => {
                    const isExpanded = expandedGanttLists.has(list.id);
                    const toggleExpand = () => {
                      setExpandedGanttLists((prev) => {
                        const next = new Set(prev);
                        if (next.has(list.id)) {
                          next.delete(list.id);
                        } else {
                          next.add(list.id);
                        }
                        return next;
                      });
                    };

                    return (
                    <div key={list.id} className="flex border-b border-border/40 last:border-b-0 hover:bg-accent/5 transition-colors">
                      {/* List name with expandable toggle */}
                      <div className="w-48 shrink-0 px-4 py-4 border-r border-border/60 flex flex-col gap-2 bg-background/40">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h4 className="text-sm font-semibold text-foreground">{list.title}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t("gantt.cardsInList", { count: (list.cards || []).length })}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={toggleExpand}
                            className="mt-0.5 p-1 rounded hover:bg-muted/50 transition-colors"
                            title={isExpanded ? "Collapse cards" : "Expand cards"}
                          >
                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          </button>
                        </div>
                        {isExpanded && (list.cards || []).length > 0 && (
                          <div className="space-y-1 pt-2 border-t border-border/40">
                            {(list.cards || []).map((card: any) => (
                              <div
                                key={card.id}
                                className="text-[11px] text-muted-foreground truncate px-2 py-1 rounded bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                                onClick={() => setSelectedGanttCard({ card, listId: list.id, listName: list.title })}
                                title={card.title}
                              >
                                {card.title}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Day cells with cards */}
                      <div className="flex flex-1">
                        {ganttWeekDayLabels.map((dayLabel, dayIndex) => {
                          const dayDate = ganttWeekDays[dayIndex];
                          const dayStartMs = dayDate.getTime();
                          const dayEndMs = addDays(dayDate, 1).getTime();

                          // Filter cards that fall within this day
                          const cardsInDay = (list.cards || []).filter((card: any) => {
                            const startAt = typeof card?.startAt === "string" ? card.startAt : null;
                            const dueAt = typeof card?.dueAt === "string" ? card.dueAt : null;
                            const startMs = parseDateTimeValue(startAt || dueAt);
                            const dueMs = parseDateTimeValue(dueAt || startAt);

                            if (startMs === null || dueMs === null) return false;

                            const windowStart = Math.min(startMs, dueMs);
                            const windowEnd = Math.max(startMs, dueMs);
                            return windowEnd > dayStartMs && windowStart < dayEndMs;
                          });

                          return (
                            <div
                              key={`${list.id}-${dayLabel.key}`}
                              className={`flex-1 relative px-2 py-3 ${dayIndex > 0 ? "border-l border-border/60" : ""} min-h-[100px]`}
                            >
                              {cardsInDay.map((card: any) => {
                                const startAt = typeof card?.startAt === "string" ? card.startAt : null;
                                const dueAt = typeof card?.dueAt === "string" ? card.dueAt : null;
                                const startMs = parseDateTimeValue(startAt || dueAt);
                                const dueMs = parseDateTimeValue(dueAt || startAt);

                                const windowStart = Math.min(startMs!, dueMs!);
                                const windowEnd = Math.max(startMs!, dueMs!);

                                // Clip to this day
                                const clippedStart = Math.max(windowStart, dayStartMs);
                                const clippedEnd = Math.min(windowEnd, dayEndMs);

                                // Calculate position and width within the 24-hour day
                                const dayDurationMs = dayEndMs - dayStartMs;
                                const leftPct = ((clippedStart - dayStartMs) / dayDurationMs) * 100;
                                const widthPct = Math.max(5, ((clippedEnd - clippedStart) / dayDurationMs) * 100);

                                const barColor = getCardBarColor(card);

                                return (
                                  <button
                                    key={card.id}
                                    type="button"
                                    onClick={() => setSelectedGanttCard({ card, listId: list.id, listName: list.title })}
                                    className="absolute top-1 rounded-md px-2 py-1 text-[10px] font-medium text-white shadow-sm hover:shadow-md transition-all overflow-hidden text-ellipsis whitespace-nowrap"
                                    style={{
                                      left: `${leftPct}%`,
                                      width: `${widthPct}%`,
                                      backgroundColor: barColor,
                                      opacity: 0.85,
                                    }}
                                    title={card.title}
                                  >
                                    {card.title}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      )}

      <BoardChatDrawer isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} boardId={boardId} initialTab={sidebarTab} entityType="board" />

      <BoardSettingsModal
        isOpen={isBoardSettingsOpen}
        onClose={() => setIsBoardSettingsOpen(false)}
        boardName={boardName}
        boardDescription={boardDescription}
        boardAppearance={boardAppearance}
        canManageBoard={permissions.canManageBoard}
        canEdit={permissions.canEdit}
        onSaveGeneral={handleSaveBoardGeneral}
        onSaveAppearance={handleSaveBoardAppearance}
        onOpenShare={() => setIsShareModalOpen(true)}
        onOpenDelete={handleDeleteBoard}
        onUploadImage={handleUploadBoardImage}
        kanbanLists={lists.map(l => ({ id: l.id, name: l.title }))}
      />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        boardId={boardId}
        boardName={boardName}
        initialVisibility={boardVisibility}
        accessToken={accessToken!}
      />

      <DeleteBoardConfirmDialog />

      {navbarUsageSlotEl && activeTeamId && accessToken ? createPortal(
        <NavbarAiCredits teamId={activeTeamId} accessToken={accessToken} />,
        navbarUsageSlotEl
      ) : null}

      {selectedGanttCard ? (
        <CardDetailModal
          isOpen={Boolean(selectedGanttCard)}
          onClose={() => setSelectedGanttCard(null)}
          card={selectedGanttCard.card}
          listId={selectedGanttCard.listId}
          listName={selectedGanttCard.listName}
          boardName={boardName}
          boardId={boardId}
          teamId={boardTeamId ?? undefined}
          readonly={!permissions.canEdit}
          canComment={permissions.canComment}
          teamDocs={teamDocs}
          teamBoards={teamBoards}
        />
      ) : null}
    </div>
  );
}
