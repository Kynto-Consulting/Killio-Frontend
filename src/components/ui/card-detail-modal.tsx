"use client";
import { useActionTheme } from "@/hooks/use-action-theme";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, AlignLeft, Image as ImageIcon, CheckSquare, MessageSquare, Plus, GripVertical, FileText, CornerDownRight, Calendar, Tag as TagIcon, Users, UserPlus, Sparkles, Loader2, Bot, Info, History as HistoryIcon, RefreshCcw, Trash2, Layout, CheckCircle2, Search, Clock3, Archive, ArchiveRestore } from "lucide-react";
import * as diff from "diff";
import { updateCard, addCardTag, removeCardTag, addCardAssignee, removeCardAssignee, createCardBrick, updateCardBrick, deleteCardBrick, reorderCardBricks, createCard, getTagsByScope, getBoardMembers, getCardActivity, addCardComment, createTag, improveCardWithAi, updateList, uploadFile, getBoard, listTeamActivity, generateReportDocumentWithAi, ApiError } from "../../lib/api/contracts";
import type { BoardBrick, BrickMutationInput, ActivityLogEntry } from "../../lib/api/contracts";
import { UnifiedBrickList } from "../bricks/unified-brick-list";
import { useSession } from "../providers/session-provider";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getUserAvatarUrl } from "../../lib/gravatar";
import { DEFAULT_NATIVE_TAG_SUGGESTIONS, getClientLocale, NATIVE_PRIORITY_TAG_KEY, translateNativeTagName } from "../../lib/native-tags";
import { BrickDiff } from "../bricks/brick-diff";
import * as jsdiff from "diff";
import { ReferenceResolver } from "@/lib/reference-resolver";
import { listDocuments, createDocument, createDocumentBrick } from "@/lib/api/documents";
import { listTeamMembers } from "@/lib/api/contracts";
import { Fragment, type ReactNode, useMemo } from "react";
import { RichText } from "./rich-text";
import { ActivityLogModal } from "./activity-log-modal";
import { ReferenceTokenInput } from "./reference-token-input";
import { RefPill } from "./ref-pill";
import { extractDocumentReferenceIds, formatDateRangeLabel, GENERATE_REPORT_INTENT_REGEX, isTimestampInDateRange, resolveReportDateRange, toDocumentMentionToken } from "@/lib/ai-report";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";
import { toast } from "@/lib/toast";
import { MediaCarouselItem, parseMediaMeta, buildMediaCaption, uploadFilesAsMediaItems } from "@/lib/media-bricks";
import { getContainerChildIds, getTopLevelBrickIds, insertChildId, setContainerChildIds } from "@/lib/bricks/nesting";

const fieldLabels: Record<string, string> = {
  title: "título",
  summary: "descripción",
  status: "estado",
  start_at: "inicio",
  due_at: "fecha límite",
  completed_at: "completada",
  archived_at: "archivada",
};



function hashString(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getUserTintStyles(seed: string): { bg: string; border: string; text: string } {
  const palette = [
    { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.35)", text: "#93c5fd" },
    { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.35)", text: "#6ee7b7" },
    { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.35)", text: "#fcd34d" },
  ];
  return palette[hashString(seed || "user") % palette.length];
}

import { Edit2 } from "lucide-react";

function normalizeDueDateInputValue(value?: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value.includes('T')) return value.split('T')[0];

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split('T')[0];
}

function formatDurationParts(totalMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(totalMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function clampTimerValue(value: string, max: number): string {
  const parsed = Number.parseInt(value || '0', 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) return '0';
  return String(Math.min(parsed, max));
}

export function CardDetailModal({
  isOpen,
  onClose,
  card,
  listId,
  listName,
  boardName,
  boardId,
  readonly = false,
  canComment = true,
  teamDocs = [],
  teamBoards = []
}: {
  isOpen: boolean;
  onClose: () => void;
  card?: any;
  listId?: string;
  listName?: string;
  boardName?: string;
  boardId?: string;
  readonly?: boolean;
  canComment?: boolean;
  teamDocs?: any[];
  teamBoards?: any[];
}) {
  const getActionTheme = useActionTheme();
  const t = useTranslations("board-detail");
  const { locale } = useI18n();
  const { accessToken, activeTeamId, user } = useSession();
  const [contextDocs, setContextDocs] = useState<any[]>(teamDocs);
  const [localTitle, setLocalTitle] = useState(card?.title || "");
  const [localDueAt, setLocalDueAt] = useState(normalizeDueDateInputValue(card?.dueAt));
  const [localStartAt, setLocalStartAt] = useState<string | null>(card?.startAt || null);
  const [localDueAtTimestamp, setLocalDueAtTimestamp] = useState<string | null>(card?.dueAt || null);
  const [localCompletedAt, setLocalCompletedAt] = useState<string | null>(card?.completedAt || null);
  const [localArchivedAt, setLocalArchivedAt] = useState<string | null>(card?.archivedAt || null);
  const [localTags, setLocalTags] = useState<any[]>(card?.tags || []);
  const normalizeAssignee = useCallback((raw: any) => ({
    id: raw?.id,
    name: raw?.name || raw?.displayName || raw?.email || 'Unknown user',
    email: raw?.email || '',
    avatar_url: raw?.avatar_url || raw?.avatarUrl || null,
  }), []);

  const [localAssignees, setLocalAssignees] = useState<any[]>((card?.assignees || []).map(normalizeAssignee));
  const createEmptyTextBrick = useCallback((): BoardBrick => ({
    id: `temp-${crypto.randomUUID()}`,
    kind: 'text',
    displayStyle: 'paragraph',
    markdown: '',
    position: 0,
    parentBlockId: null,
    tasks: [],
  }), []);

  const [localBlocks, setLocalBlocks] = useState<BoardBrick[]>(
    card?.blocks?.length ? card.blocks : (card ? [] : [createEmptyTextBrick()])
  );

  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [areTagsExpanded, setAreTagsExpanded] = useState(false);
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
  const [isTimerDropdownOpen, setIsTimerDropdownOpen] = useState(false);
  const [timerHoursInput, setTimerHoursInput] = useState("1");
  const [timerMinutesInput, setTimerMinutesInput] = useState("0");
  const [isTimerSubmitting, setIsTimerSubmitting] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'activity' | 'copilot'>('details');
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const router = useRouter();

  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [boardMembers, setBoardMembers] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isImprovingDescription, setIsImprovingDescription] = useState(false);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [pendingImprovement, setPendingImprovement] = useState<{
    title: string;
    bricks: Array<{ kind: 'text' | 'checklist', content: any }>;
    diffText: string;
    originalText: string;
    explanation?: string;
  } | null>(null);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [hideNativeTagSuggestions, setHideNativeTagSuggestions] = useState(false);
  const [reportFromDate, setReportFromDate] = useState("");
  const [reportToDate, setReportToDate] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [selectedActivityGroup, setSelectedActivityGroup] = useState<ActivityLogEntry[] | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const titleRef = useRef<HTMLHeadingElement>(null);
  const tagsRowRef = useRef<HTMLDivElement>(null);
  const addTagButtonRef = useRef<HTMLButtonElement>(null);
  const tagChipRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const [visibleTagCount, setVisibleTagCount] = useState(0);

  const syncTitleDom = useCallback((value: string) => {
    if (!titleRef.current) return;
    if (titleRef.current.textContent !== value) {
      titleRef.current.textContent = value;
    }
  }, []);

  const withListContext = (payload: Record<string, any>) => {
    if (!listId) return payload;
    return { ...payload, list_id: listId };
  };

  const readCurrentTitle = () => {
    const liveTitle = titleRef.current?.textContent?.trim();
    if (liveTitle) return liveTitle;
    if (localTitle?.trim()) return localTitle.trim();
    return card?.title?.trim() || "";
  };

  const emitCardRefresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('board:refresh'));
    window.dispatchEvent(new Event('card-timer:refresh'));
  }, []);

  const isCardArchived = Boolean(localArchivedAt);
  const isCardCompleted = Boolean(localCompletedAt);
  const isCurrentUserAssigned = Boolean(user?.id && localAssignees.some((assignee) => assignee.id === user.id));
  const isTimerActive = Boolean(localStartAt && localDueAtTimestamp && !localCompletedAt && !localArchivedAt);
  const timerDueMs = localDueAtTimestamp ? new Date(localDueAtTimestamp).getTime() : null;
  const timerRemainingMs = timerDueMs ? timerDueMs - now : null;
  const timerRemainingLabel = timerRemainingMs !== null
    ? t(timerRemainingMs >= 0 ? 'cardModal.timer.remaining' : 'cardModal.timer.overdue', { duration: formatDurationParts(Math.abs(timerRemainingMs)) })
    : null;
  const formatUiDateTime = useCallback((value: string) => new Date(value).toLocaleString(locale), [locale]);
  const timerDueLabel = localDueAtTimestamp
    ? `${t('cardModal.timer.dueDate')}: ${formatUiDateTime(localDueAtTimestamp)}`
    : null;

  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const resolveAiScope = (): { scope: 'personal' | 'team' | 'board' | 'list'; scopeId: string } => {
    if (boardId) return { scope: 'board', scopeId: boardId };
    if (listId) return { scope: 'list', scopeId: listId };
    return { scope: 'personal', scopeId: 'personal' };
  };

  const normalizeAiText = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item : String(item ?? "")))
        .join("\n")
        .trim();
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return "";
      }
    }
    return String(value);
  };

  const handleImproveDescriptionWithAi = async () => {
    if (!accessToken || isImprovingDescription) return;

    const sourceTitle = readCurrentTitle();
    const textBricks = localBlocks.filter(b => b.kind === 'text');
    const sourceSummaryText = textBricks.map(b => b.markdown).join("\n\n");

    if (!sourceTitle && !sourceSummaryText) {
      setImproveError("Escribe un título o una descripción antes de mejorar con IA.");
      return;
    }

    setImproveError(null);
    setPendingImprovement(null);
    setIsImprovingDescription(true);

    // Add user message to history
    setAiMessages(prev => [...prev, { role: 'user', content: 'Mejorar contenido de la tarjeta con IA' }]);

    try {
      const { scope, scopeId } = resolveAiScope();
      const improved = await improveCardWithAi(
        {
          scope,
          scopeId,
          currentTitle: sourceTitle,
          currentDescription: sourceSummaryText || undefined,
          currentBricks: localBlocks,
        },
        accessToken,
      );

      const improvedTitle = (normalizeAiText(improved?.title) || sourceTitle || "").trim() || "New Card";
      const improvedBricks = improved.bricks || [{ kind: 'text', content: { markdown: sourceSummaryText } }];
      const improvedText = improvedBricks.map((b: any) => b.kind === 'text' ? b.content.markdown : `[Checklist: ${b.content.items?.length || 0} ítems]`).join('\n\n');

      setPendingImprovement({
        title: improvedTitle,
        bricks: improvedBricks,
        diffText: improvedText,
        originalText: sourceSummaryText,
        explanation: improved.explanation
      });

      setAiMessages(prev => [...prev, { role: 'assistant', content: 'He analizado la tarjeta y tengo algunas sugerencias interesantes para mejorarla. ¿Quieres revisarlas?' }]);
    } catch (err) {
      console.error("Failed to improve card with AI", err);
      setImproveError("No se pudo mejorar el texto con IA en este momento.");
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, hubo un error al intentar mejorar la tarjeta. Por favor intenta de nuevo.' }]);
    } finally {
      setIsImprovingDescription(false);
    }
  };

  const applyImprovement = async () => {
    if (!pendingImprovement || !accessToken) return;

    setLocalTitle(pendingImprovement.title);
    if (titleRef.current) {
      titleRef.current.textContent = pendingImprovement.title;
    }

    if (pendingImprovement.bricks) {
      // Precise mutation logic:
      // 1. Identify which ones to Update
      // 2. Identify which ones to Create
      // 3. Identify which ones to Delete

      const newBricks = pendingImprovement.bricks;
      const oldBrickIds = localBlocks.map(b => b.id);
      const suggestedBrickIds = newBricks.filter((b: any) => b.id).map((b: any) => b.id);

      // Deletions: in local but NOT in suggested
      const toDelete = oldBrickIds.filter(id => !suggestedBrickIds.includes(id));
      for (const id of toDelete) {
        await handleDeleteBrick(id);
      }

      // Updates and Creates
      for (const b of newBricks as any[]) {
        if (b.id && oldBrickIds.includes(b.id)) {
          // Update
          await handleUpdateBrick(b.id, {
            kind: b.kind,
            markdown: b.content?.markdown || '',
            items: b.content?.items || [],
          });
        } else {
          // Create
          await handleCreateBrick({
            kind: b.kind,
            markdown: b.content?.markdown || '',
            items: b.content?.items || [],
            displayStyle: 'paragraph'
          });
        }
      }
    }

    setPendingImprovement(null);
    setImproveError(null);

    if (card?.id) {
      try {
        const payload = withListContext({ title: pendingImprovement.title });
        await updateCard(card.id, payload, accessToken);
        router.refresh();
        window.dispatchEvent(new Event('board:refresh'));
      } catch (err) {
        console.error("Failed to apply title improvement", err);
      }
    }
  };
  const rejectImprovement = () => {
    setPendingImprovement(null);
    setImproveError(null);
  };

  const handleAiAction = async (actionData: any) => {
    if (!accessToken) return;

    const action = String(actionData?.action || actionData?.type || '').toUpperCase();
    const payload = (actionData?.payload && typeof actionData.payload === 'object') ? actionData.payload : actionData;
    const entityId = String(actionData?.id || payload?.id || payload?.entityId || '').trim();

    try {
      if (action === 'CARD_RENAME') {
        const cardId = entityId || String(payload?.cardId || card?.id || '').trim();
        const title = String(payload?.title || '').trim();
        if (!cardId || !title) throw new Error('CARD_RENAME requiere cardId y title');

        if (card?.id && cardId === card.id) {
          await handleUpdateField('title', title);
        } else {
          await updateCard(cardId, { title }, accessToken);
          window.dispatchEvent(new Event('board:refresh'));
        }
      } else if (action === 'TAG_ADD') {
        if (!boardId) throw new Error('TAG_ADD requiere contexto de board');
        const cardId = entityId || String(payload?.cardId || card?.id || '').trim();
        const tagName = String(payload?.tagName || '').trim();
        if (!cardId || !tagName) throw new Error('TAG_ADD requiere cardId y tagName');

        let tag = availableTags.find(t => String(t.name || '').toLowerCase() === tagName.toLowerCase());
        if (!tag) {
          tag = await createTag({
            scopeType: 'board',
            scopeId: boardId,
            name: tagName,
            color: payload?.color || '#3b82f6',
            tagKind: 'custom'
          }, accessToken);
          setAvailableTags(prev => [...prev, tag]);
        }

        if (card?.id && cardId === card.id) {
          await handleAddTag(tag);
        } else {
          const { addCardTag } = await import("@/lib/api/contracts");
          await addCardTag(cardId, tag.id, accessToken);
          window.dispatchEvent(new Event('board:refresh'));
        }
      } else if (action === 'CARD_MOVE') {
        const cardId = entityId || String(payload?.cardId || card?.id || '').trim();
        const targetListId = String(payload?.targetListId || payload?.listId || '').trim();
        if (!cardId || !targetListId) throw new Error('CARD_MOVE requiere cardId y targetListId');

        if (card?.id && cardId === card.id) {
          await handleUpdateField('list_id', targetListId);
        } else {
          await updateCard(cardId, { list_id: targetListId }, accessToken);
          window.dispatchEvent(new Event('board:refresh'));
        }
      } else if (action === 'CARD_UPDATE') {
        const cardId = entityId || String(payload?.cardId || card?.id || '').trim();
        if (!cardId) throw new Error('CARD_UPDATE requiere cardId');

        const updates: Record<string, any> = {};
        if (payload?.title !== undefined) updates.title = payload.title;
        if (payload?.summary !== undefined) updates.summary = payload.summary;
        if (payload?.status !== undefined) updates.status = payload.status;
        if (payload?.start_at !== undefined) updates.start_at = payload.start_at;
        if (payload?.due_at !== undefined) updates.due_at = payload.due_at;
        if (payload?.completed_at !== undefined) updates.completed_at = payload.completed_at;
        if (payload?.archived_at !== undefined) updates.archived_at = payload.archived_at;
        if (payload?.targetListId !== undefined || payload?.list_id !== undefined) {
          updates.list_id = payload?.list_id ?? payload?.targetListId;
        }
        if (Object.keys(updates).length === 0) throw new Error('CARD_UPDATE no contiene campos a actualizar');

        if (card?.id && cardId === card.id && updates.title !== undefined) {
          await handleUpdateField('title', updates.title);
          delete updates.title;
        }

        if (Object.keys(updates).length > 0) {
          if (card?.id && cardId === card.id && updates.list_id !== undefined) {
            await handleUpdateField('list_id', updates.list_id);
            delete updates.list_id;
          }
        }

        if (Object.keys(updates).length > 0) {
          await updateCard(cardId, updates, accessToken);
          window.dispatchEvent(new Event('board:refresh'));
        }
      } else if (action === 'LIST_RENAME') {
        if (!boardId) throw new Error('LIST_RENAME requiere contexto de board');
        const listId = entityId || String(payload?.listId || (card as any)?.listId || '').trim();
        const name = String(payload?.title || payload?.name || '').trim();
        if (!listId || !name) throw new Error('LIST_RENAME requiere listId y title/name');
        await updateList(boardId, listId, { name }, accessToken);
        window.dispatchEvent(new Event('board:refresh'));
      } else if (action === 'REPORT_GENERATE') {
        const prompt = String(payload?.prompt || 'Generar reporte técnico').trim();
        await generateReportFromCardContext(prompt);
      } else {
        throw new Error(`Accion no soportada: ${action || 'UNKNOWN'}`);
      }

      if (action !== 'REPORT_GENERATE') {
        setAiMessages(prev => [...prev, { role: 'assistant', content: `He ejecutado la acción: ${action}.` }]);
      }
    } catch (err) {
      console.error("Failed to execute AI action", err);
      setAiMessages(prev => [...prev, { role: 'assistant', content: `No pude ejecutar la acción ${action || 'UNKNOWN'}. Verifica IDs y permisos.` }]);
    }
  };

  const parseAiActions = (text: string) => {
    const actions: any[] = [];
    let cleanText = text;

    const processMatch = (declaredType: string, jsonStr: string, fullMatch: string) => {
      try {
        const raw = JSON.parse(jsonStr);
        const action = String(raw?.action || raw?.type || declaredType).trim().toUpperCase();
        const explanation = String(raw?.explanation || '').trim();
        const id = String(raw?.id || raw?.entityId || raw?.cardId || raw?.listId || '').trim();

        let payload = raw?.payload;
        if (!payload || typeof payload !== 'object') {
          payload = { ...raw };
          delete payload.action;
          delete payload.type;
          delete payload.id;
          delete payload.entityId;
          delete payload.explanation;
        }

        actions.push({
          type: declaredType,
          action,
          id,
          payload,
          explanation,
        });
        cleanText = cleanText.replace(fullMatch, ''); if (explanation && !cleanText.includes(explanation)) cleanText = cleanText.trim() + '\n\n' + explanation;
      } catch (e) {
        console.error("Failed to parse AI action JSON", e);
      }
    };

    const regex = /\[ACTION:([^\]]+)\]\s*([\s\S]*?)\s*\[\/ACTION\]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      processMatch(match[1], match[2], match[0]);
    }

    const fallbackRegex = /\[([A-Z_]+)\]\s*(\{[\s\S]*?\})\s*\[\/\1\]/g;
    while ((match = fallbackRegex.exec(text)) !== null) {
      if (match[1] === 'ACTION') continue;
      processMatch(match[1], match[2], match[0]);
    }

    return { cleanText: cleanText.trim(), actions };
  };

  const clipAiContext = (value: unknown, max = 140) => {
    const normalized = String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max)}...`;
  };

  const summarizeBrickForAi = (brick: any) => {
    const kind = String(brick?.kind || "unknown");
    if (kind === "text") {
      const markdown = brick?.markdown ?? brick?.content?.markdown;
      const displayStyle = brick?.displayStyle ?? brick?.content?.displayStyle;
      return `text(style=${displayStyle || "paragraph"}, md=${clipAiContext(markdown) || "empty"})`;
    }
    if (kind === "table") {
      const rows = Array.isArray(brick?.rows) ? brick.rows : Array.isArray(brick?.content?.rows) ? brick.content.rows : [];
      const rowCount = rows.length;
      const colCount = rowCount > 0 && Array.isArray(rows[0]) ? rows[0].length : 0;
      const preview = rowCount > 0 ? clipAiContext((rows[0] || []).join(" | "), 100) : "empty";
      return `table(rows=${rowCount}, cols=${colCount}, head=${preview || "empty"})`;
    }
    if (kind === "checklist") {
      const items = Array.isArray(brick?.items) ? brick.items : Array.isArray(brick?.content?.items) ? brick.content.items : [];
      const done = items.filter((item: any) => !!item?.checked).length;
      const preview = items.slice(0, 3).map((item: any) => clipAiContext(item?.label, 60)).filter(Boolean).join("; ");
      return `checklist(done=${done}/${items.length}, items=${preview || "none"})`;
    }
    if (kind === "media") {
      return `media(type=${brick?.mediaType || brick?.content?.mediaType || "file"}, title=${clipAiContext(brick?.title ?? brick?.content?.title, 70) || "none"}, caption=${clipAiContext(brick?.caption ?? brick?.content?.caption, 70) || "none"}, url=${clipAiContext(brick?.url ?? brick?.content?.url, 90) || "none"})`;
    }
    if (kind === "ai") {
      return `ai(status=${brick?.status || brick?.content?.status || "unknown"}, title=${clipAiContext(brick?.title ?? brick?.content?.title, 70) || "none"}, prompt=${clipAiContext(brick?.prompt ?? brick?.content?.prompt, 90) || "none"}, response=${clipAiContext(brick?.response ?? brick?.content?.response, 90) || "none"})`;
    }
    if (kind === "graph") {
      const graphData = Array.isArray(brick?.data) ? brick.data : Array.isArray(brick?.content?.data) ? brick.content.data : [];
      const tableSource = brick?.tableSource ?? brick?.content?.tableSource;
      const sourceLabel = tableSource?.brickId ? `table:${String(tableSource.brickId).slice(0, 8)}` : "manual";
      return `graph(type=${brick?.type || brick?.content?.type || "line"}, title=${clipAiContext(brick?.title ?? brick?.content?.title, 70) || "none"}, source=${sourceLabel}, points=${graphData.length})`;
    }
    if (kind === "accordion") {
      return `accordion(title=${clipAiContext(brick?.title ?? brick?.content?.title, 70) || "none"}, expanded=${(brick?.isExpanded ?? brick?.content?.isExpanded) ? "yes" : "no"}, body=${clipAiContext(brick?.body ?? brick?.content?.body, 100) || "empty"})`;
    }
    return `${kind}(raw=${clipAiContext(JSON.stringify(brick), 120) || "none"})`;
  };

  const summarizeCardForAi = (cardData: any, listLabel?: string) => {
    const tags = (cardData?.tags || []).map((tag: any) => tag?.name).filter(Boolean).join(', ') || 'none';
    const assignees = (cardData?.assignees || []).map((member: any) => member?.name || member?.displayName || member?.email).filter(Boolean).join(', ') || 'none';
    const bricks = Array.isArray(cardData?.blocks) ? cardData.blocks : [];
    const brickDetails = bricks.slice(0, 12).map((brick: any, index: number) => `[${index + 1}] ${summarizeBrickForAi(brick)}`).join(' || ') || 'none';
    return [
      listLabel ? `[${listLabel}]` : null,
      `Card: ${cardData?.title || 'Untitled'}`,
      `status: ${cardData?.status || 'active'}`,
      `due: ${cardData?.dueAt || 'none'}`,
      `tags: ${tags}`,
      `assignees: ${assignees}`,
      `bricks: ${bricks.length}`,
      `brickDetails: ${brickDetails}`,
    ].filter(Boolean).join(' | ');
  };

  const generateReportFromCardContext = async (sourcePrompt: string) => {
    if (!accessToken || !activeTeamId || isGeneratingReport) return;

    const effectiveRange = resolveReportDateRange(sourcePrompt, {
      from: reportFromDate || undefined,
      to: reportToDate || undefined,
    });
    const dateRangeLabel = formatDateRangeLabel(effectiveRange);

    setIsGeneratingReport(true);
    setAiMessages((prev) => [...prev, { role: 'assistant', content: 'Generando reporte técnico con el contexto de tablero y tarjetas...' }]);

    try {
      const docsCatalog = await listDocuments(activeTeamId, accessToken);
      let boardCards: Array<{ listName: string; card: any }> = [];
      let boardActivity: ActivityLogEntry[] = [];
      let cardActivityByCard: Array<{ cardId: string; logs: ActivityLogEntry[] }> = [];
      let scope: 'personal' | 'team' | 'board' | 'list' | 'document' = 'list';
      let scopeId = listId || 'personal';
      let boardLabel = boardName || 'Board';

      if (boardId) {
        const [boardData, teamActivity] = await Promise.all([
          getBoard(boardId, accessToken),
          listTeamActivity(activeTeamId, accessToken),
        ]);

        boardLabel = boardData.name;
        boardCards = boardData.lists.flatMap((list) => list.cards.map((entry) => ({ listName: list.name, card: entry })));
        cardActivityByCard = await Promise.all(
          boardCards.map(async ({ card: boardCard }) => {
            try {
              const logs = await getCardActivity(boardCard.id, accessToken);
              return { cardId: boardCard.id, logs: (logs || []) as ActivityLogEntry[] };
            } catch {
              return { cardId: boardCard.id, logs: [] as ActivityLogEntry[] };
            }
          }),
        );

        boardActivity = teamActivity.filter((entry) => {
          const payloadBoardId = (entry.payload as Record<string, unknown> | undefined)?.boardId;
          const matchesBoard = (entry.scope === 'board' && entry.scopeId === boardId) || payloadBoardId === boardId;
          return matchesBoard && isTimestampInDateRange(entry.createdAt, effectiveRange);
        });

        cardActivityByCard = cardActivityByCard.map((entry) => ({
          cardId: entry.cardId,
          logs: entry.logs.filter((log) => isTimestampInDateRange(log.createdAt, effectiveRange)),
        }));

        scope = 'board';
        scopeId = boardId;
      } else if (card?.id) {
        const selfLogs = await getCardActivity(card.id, accessToken);
        boardCards = [{ listName: listName || 'List', card: { ...card, blocks: localBlocks } }];
        cardActivityByCard = [{
          cardId: card.id,
          logs: (selfLogs || []).filter((log: ActivityLogEntry) => isTimestampInDateRange(log.createdAt, effectiveRange)),
        }];
      }

      const referencedDocIds = new Set<string>();
      boardCards.forEach(({ card: boardCard }) => extractDocumentReferenceIds(boardCard, referencedDocIds));
      boardActivity.forEach((entry) => extractDocumentReferenceIds(entry, referencedDocIds));
      cardActivityByCard.forEach((entry) => extractDocumentReferenceIds(entry.logs, referencedDocIds));

      const referencedDocs = docsCatalog.filter((doc) => referencedDocIds.has(doc.id));
      const referencedDocTokens = referencedDocs.map((doc) => toDocumentMentionToken(doc.id, doc.title));

      const cardLines = boardCards
        .slice(0, 80)
        .map(({ listName: sourceListName, card: boardCard }) => `- ${summarizeCardForAi(boardCard, sourceListName)}`);

      const cardChatLines = boardCards.flatMap(({ card: boardCard }) => {
        const logs = cardActivityByCard.find((entry) => entry.cardId === boardCard.id)?.logs || [];
        return logs
          .filter((entry) => entry.action === 'card.commented')
          .slice(0, 25)
            .map((entry) => {
              const actor = boardMembers.find(m => m.id === entry.actorId || m.userId === entry.actorId);
              const actorName = actor?.displayName || actor?.name || actor?.email || entry.actorId || "User";
              return `- [${entry.createdAt}] ${actorName} in ${boardCard.title}: ${String((entry.payload as any)?.text || '')}`;
            });
        }).slice(0, 220);

        const activityLines = [...boardActivity, ...cardActivityByCard.flatMap((entry) => entry.logs)]
          .slice(0, 260)
          .map((entry) => {
              const actor = boardMembers.find(m => m.id === entry.actorId || m.userId === entry.actorId);
              const actorName = actor?.displayName || actor?.name || actor?.email || entry.actorId || "User";
              return `- [${entry.createdAt}] ${actorName} did ${entry.action} (${entry.scope}:${entry.scopeId})`;
          });

      const contextSummary = [
        `Board/Card context: ${boardLabel}`,
        `Date range: ${dateRangeLabel}`,
        `Cards in scope: ${boardCards.length}`,
        '',
        'Cards snapshot:',
        ...(cardLines.length > 0 ? cardLines : ['- none']),
        '',
        'Card conversations:',
        ...(cardChatLines.length > 0 ? cardChatLines : ['- none']),
        '',
        'Activity timeline:',
        ...(activityLines.length > 0 ? activityLines : ['- none']),
        '',
        'Referenced docs:',
        ...(referencedDocTokens.length > 0 ? referencedDocTokens.map((token) => `- ${token}`) : ['- none']),
      ].join('\n').slice(0, 16000);

      const reportResult = await generateReportDocumentWithAi(
        {
          scope,
          scopeId,
          contextSummary,
          dateRangeLabel,
          userPrompt: sourcePrompt,
          referencedDocuments: referencedDocs.map((doc) => ({ id: doc.id, title: doc.title })),
        },
        accessToken,
      );

      const reportTitle = reportResult.title?.trim() || `Tech Report · ${boardLabel} · ${dateRangeLabel}`;
      const createdDoc = await createDocument({ teamId: activeTeamId, title: reportTitle }, accessToken);

      const reportBricks = Array.isArray(reportResult.bricks) && reportResult.bricks.length > 0
        ? reportResult.bricks
        : [
          {
            kind: 'text' as const,
            content: { markdown: `# Technical Report\n\n- Context: ${boardLabel}\n- Date range: ${dateRangeLabel}` },
          },
        ];

      for (let i = 0; i < reportBricks.length; i += 1) {
        const brick = reportBricks[i];
        await createDocumentBrick(
          createdDoc.id,
          {
            kind: brick.kind,
            position: i,
            content: brick.content,
          },
          accessToken,
        );
      }

      setContextDocs((prev) => (prev.some((doc) => doc.id === createdDoc.id) ? prev : [createdDoc, ...prev]));
      setAiMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Reporte técnico generado: ${toDocumentMentionToken(createdDoc.id, createdDoc.title)}` },
      ]);
    } catch (error) {
      console.error('Failed to generate technical report from card context', error);
      setAiMessages((prev) => [...prev, { role: 'assistant', content: 'No pude generar el reporte técnico. Intenta de nuevo.' }]);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  useEffect(() => {
    setContextDocs(teamDocs);
  }, [teamDocs]);

  useEffect(() => {
    if (!isOpen || !accessToken) return;

    if (boardId) {
      getTagsByScope('board', boardId, accessToken).then((res) => {
        setAvailableTags(res);
      }).catch(console.error);

      getBoardMembers(boardId, accessToken).then((res) => {
        setBoardMembers(res.map((m: any) => ({
          id: m.id,
          name: m.displayName || m.workspaceAlias || m.email || m.primaryEmail,
          email: m.email || m.primaryEmail,
          alias: m.workspaceAlias || m.displayName || m.email || m.primaryEmail,
          avatar_url: m.avatarUrl || m.avatar_url,
          initials: (m.displayName || m.email || '??').substring(0, 2).toUpperCase()
        })));
      }).catch(console.error);
    }

    if (card?.id) {
      getCardActivity(card.id, accessToken).then(setActivities).catch(console.error);
    }
  }, [isOpen, boardId, accessToken, card?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hidden = localStorage.getItem('killio_hide_native_tag_suggestions') === '1';
    setHideNativeTagSuggestions(hidden);
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (card) {
        const nextTitle = card.title || "";
        setLocalTitle(nextTitle);
        syncTitleDom(nextTitle);
        setLocalDueAt(normalizeDueDateInputValue(card.dueAt));
        setLocalStartAt(card.startAt || null);
        setLocalDueAtTimestamp(card.dueAt || null);
        setLocalCompletedAt(card.completedAt || null);
        setLocalArchivedAt(card.archivedAt || null);
        setLocalTags(card.tags || []);
        setLocalAssignees((card.assignees || []).map(normalizeAssignee));
        setLocalBlocks(card.blocks || []);
      } else {
        setLocalTitle("New Card");
        syncTitleDom("New Card");
        setLocalDueAt("");
        setLocalStartAt(null);
        setLocalDueAtTimestamp(null);
        setLocalCompletedAt(null);
        setLocalArchivedAt(null);
        setLocalTags([]);
        setLocalAssignees([]);
        setLocalBlocks([createEmptyTextBrick()]);
      }
      setPendingImprovement(null);
      setImproveError(null);
      setTagSearch("");
      setNewTagColor('#3b82f6');
      setAreTagsExpanded(false);
      setIsAssigneeDropdownOpen(false);
      setIsTimerDropdownOpen(false);
    }
  }, [isOpen, card, createEmptyTextBrick, normalizeAssignee, syncTitleDom]);

  useEffect(() => {
    if (!isOpen || !isTimerActive) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isOpen, isTimerActive]);

  useEffect(() => {
    if (!isOpen) return;

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
      if (target instanceof HTMLTextAreaElement) return !target.readOnly && !target.disabled;
      if (target instanceof HTMLInputElement) return !target.readOnly && !target.disabled;
      return false;
    };

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace') return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [isOpen]);

  const handleAddTag = async (tag: any) => {
    if (localTags.find(t => (t.id || t.name || t) === tag.id || (t.name || t) === tag.name)) return;
    setIsAddingTag(true);
    setTagError(null);
    try {
      setLocalTags(prev => [...prev, tag]);
      if (card?.id && accessToken) {
        await addCardTag(card.id, tag.id, accessToken);
        setIsTagDropdownOpen(false);
      }
    } catch (err) {
      console.error("Failed to add tag", err);
      setTagError("Error al agregar tag");
      setLocalTags(prev => prev.filter(t => t !== tag));
    } finally {
      setIsAddingTag(false);
    }
  };

  const getTagKey = (tag: any) => String(tag?.id || tag?.name || tag);

  const recalculateVisibleTags = useCallback(() => {
    if (!tagsRowRef.current) {
      setVisibleTagCount(localTags.length);
      return;
    }
    if (localTags.length === 0) {
      setVisibleTagCount(0);
      return;
    }
    const containerWidth = tagsRowRef.current.clientWidth;
    if (containerWidth <= 0) {
      setVisibleTagCount(localTags.length);
      return;
    }
    const addButtonWidth = addTagButtonRef.current?.offsetWidth ?? 28;
    const gap = 6;
    const overflowButtonReserve = 72;
    const availableWidth = Math.max(0, containerWidth - addButtonWidth - gap);
    let used = 0;
    let visible = 0;
    for (let i = 0; i < localTags.length; i += 1) {
      const tag = localTags[i];
      const key = getTagKey(tag);
      const chipWidth = tagChipRefs.current.get(key)?.offsetWidth ?? 90;
      const remainingAfterThis = localTags.length - (i + 1);
      const reserve = remainingAfterThis > 0 ? overflowButtonReserve : 0;
      const projected = used + chipWidth + (visible > 0 ? gap : 0) + reserve;
      if (projected <= availableWidth) {
        used += chipWidth + (visible > 0 ? gap : 0);
        visible += 1;
      } else {
        break;
      }
    }
    setVisibleTagCount(Math.max(1, Math.min(visible, localTags.length)));
  }, [localTags]);

  const nativeTagLocale = getClientLocale();
  const getTagLabel = (tag: any) => {
    const rawName = String(tag?.name || tag || '');
    return translateNativeTagName(rawName, nativeTagLocale);
  };

  const handleSelectNativeSuggestion = async (suggestion: { key: string; color: string }) => {
    if (!boardId || !accessToken) return;
    let nativeTag = availableTags.find((t: any) => t.name === suggestion.key);
    if (!nativeTag) {
      try {
        nativeTag = await createTag({ scopeType: 'board', scopeId: boardId, name: suggestion.key, color: suggestion.color, tagKind: 'custom' }, accessToken);
        setAvailableTags((prev) => [...prev, nativeTag!]);
      } catch (err) {
        console.error('Failed to create native tag', err);
        setTagError('Error al crear el tag nativo');
        return;
      }
    }
    if (!nativeTag) return;
    await handleAddTag(nativeTag);
    setTagSearch('');
  };

  const dismissNativeTagSuggestions = () => {
    setHideNativeTagSuggestions(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('killio_hide_native_tag_suggestions', '1');
    }
  };

  const handleRemoveTag = async (tagToRemove: any) => {
    setLocalTags(prev => prev.filter(t => t !== tagToRemove));
    if (card?.id && accessToken && tagToRemove.id) {
      try {
        await removeCardTag(card.id, tagToRemove.id, accessToken);
      } catch (err) {
        console.error("Failed to remove tag", err);
      }
    }
  };

  const handleToggleAssignee = useCallback(async (member: any) => {
    const normalizedMember = normalizeAssignee(member);
    const isAssigned = localAssignees.some((assignee) => assignee.id === normalizedMember.id);

    setLocalAssignees((current) => {
      if (isAssigned) {
        return current.filter((assignee) => assignee.id !== normalizedMember.id);
      }
      return [...current, normalizedMember];
    });

    if (!card?.id || !accessToken) {
      return;
    }

    try {
      if (isAssigned) {
        await removeCardAssignee(card.id, normalizedMember.id, accessToken);
      } else {
        await addCardAssignee(card.id, normalizedMember.id, accessToken);
      }
      router.refresh();
      window.dispatchEvent(new Event('board:refresh'));
    } catch (err) {
      console.error('Failed to update assignee', err);
      setLocalAssignees((current) => {
        if (isAssigned) {
          return [...current, normalizedMember];
        }
        return current.filter((assignee) => assignee.id !== normalizedMember.id);
      });
    }
  }, [accessToken, card?.id, localAssignees, normalizeAssignee, router]);

  const buildDraftBrick = useCallback((input: BrickMutationInput, position: number): BoardBrick => {
    const brickId = `tmp-${crypto.randomUUID()}`;
    const baseContent = {
      ...(input as any).content || {},
    };

    if (input.kind === 'text') {
      return {
        id: brickId,
        kind: 'text',
        displayStyle: input.displayStyle,
        markdown: input.markdown,
        tasks: [],
        position,
        parentBlockId: null,
        content: baseContent,
      } as BoardBrick;
    }
    if (input.kind === 'table') {
      return {
        id: brickId,
        kind: 'table',
        rows: input.rows || [],
        position,
        parentBlockId: null,
        content: baseContent,
      } as BoardBrick;
    }
    if (input.kind === 'checklist') {
      return {
        id: brickId,
        kind: 'checklist',
        items: input.items || [],
        position,
        parentBlockId: null,
        content: baseContent,
      } as BoardBrick;
    }
    if (input.kind === 'media') {
      return {
        id: brickId,
        kind: 'media',
        mediaType: input.mediaType,
        title: input.title,
        url: input.url,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        caption: input.caption,
        assetId: input.assetId,
        position,
        parentBlockId: null,
        content: baseContent,
      } as BoardBrick;
    }
    if (input.kind === 'ai') {
      return {
        id: brickId,
        kind: 'ai',
        status: input.status,
        title: input.title,
        prompt: input.prompt,
        response: input.response,
        model: input.model,
        confidence: input.confidence,
        position,
        parentBlockId: null,
        content: baseContent,
      } as BoardBrick;
    }
    if (input.kind === 'graph') {
      return {
        id: brickId,
        kind: 'graph',
        type: input.type,
        data: input.data,
        title: input.title,
        position,
        parentBlockId: null,
        content: baseContent,
      } as BoardBrick;
    }
    if (input.kind === 'accordion') {
      return {
        id: brickId,
        kind: 'accordion',
        title: input.title,
        body: input.body,
        isExpanded: input.isExpanded,
        position,
        parentBlockId: null,
        content: baseContent,
      } as BoardBrick;
    }
    if (input.kind === 'tabs') {
      return {
        id: brickId,
        kind: 'tabs',
        tabs: input.tabs,
        position,
        parentBlockId: null,
        content: baseContent,
      } as BoardBrick;
    }
    if (input.kind === 'columns') {
      return {
        id: brickId,
        kind: 'columns',
        columns: input.columns || [],
        position,
        parentBlockId: null,
        content: baseContent,
      } as BoardBrick;
    }
    return {
      id: brickId,
      kind: 'text',
      displayStyle: 'paragraph',
      markdown: '',
      tasks: [],
      position,
      parentBlockId: null,
      content: baseContent,
    } as BoardBrick;
  }, []);

  const brickToMutationInput = useCallback((brick: BoardBrick): BrickMutationInput | null => {
    if (brick.kind === 'text') {
      return {
        kind: 'text',
        displayStyle: brick.displayStyle || 'paragraph',
        markdown: brick.markdown || '',
      };
    }
    if (brick.kind === 'table') {
      return {
        kind: 'table',
        rows: (brick.rows || []).map((row: any) => Array.isArray(row) ? row.map((cell: any) => String(cell ?? '')) : []),
      };
    }
    if (brick.kind === 'checklist') {
      return {
        kind: 'checklist',
        items: (brick.items || []).map((item: any, index: number) => ({
          id: String(item.id || `task-${index}`),
          label: String(item.label ?? item.text ?? ''),
          checked: !!item.checked,
        })),
      };
    }
    if (brick.kind === 'media') {
      return {
        kind: 'media',
        mediaType: brick.mediaType,
        title: brick.title,
        url: brick.url,
        mimeType: brick.mimeType,
        sizeBytes: brick.sizeBytes,
        caption: brick.caption,
        assetId: brick.assetId,
      };
    }
    if (brick.kind === 'ai') {
      return {
        kind: 'ai',
        status: brick.status,
        title: brick.title,
        prompt: brick.prompt,
        response: brick.response,
        model: brick.model,
        confidence: brick.confidence,
      };
    }
    if (brick.kind === 'graph') {
      return {
        kind: 'graph',
        type: brick.type,
        data: brick.data,
        title: brick.title,
        content: (brick as any).content || {},
      } as BrickMutationInput;
    }
    if (brick.kind === 'accordion') {
      return {
        kind: 'accordion',
        title: brick.title || '',
        body: brick.body || '',
        isExpanded: !!brick.isExpanded,
        content: (brick as any).content || {},
      } as BrickMutationInput;
    }
    if (brick.kind === 'tabs') {
      return {
        kind: 'tabs',
        tabs: (brick as any).tabs || [],
        content: (brick as any).content || {},
      } as BrickMutationInput;
    }
    if (brick.kind === 'columns') {
      return {
        kind: 'columns',
        columns: (brick as any).columns || [],
        content: (brick as any).content || {},
      } as BrickMutationInput;
    }
    return null;
  }, []);

  const handleCreateBrick = async (input: BrickMutationInput): Promise<BoardBrick | null> => {
    if (!card?.id || !accessToken) {
      const draft = buildDraftBrick(input, (localBlocks[localBlocks.length - 1]?.position ?? 0) + 1000);
      setLocalBlocks(prev => {
        return [...prev, draft];
      });
      return draft;
    }
    try {
      const res = await createCardBrick(card.id, input, accessToken);
      setLocalBlocks(prev => [...prev, res.brick]);
      return res.brick;
    } catch (err) {
      console.error("Failed to create brick", err);
      return null;
    }
  };

  const handleCreateBrickWithNesting = useCallback(async (
    input: BrickMutationInput,
    parentProps?: { parentId: string; containerId: string },
    afterBrickId?: string,
  ) => {
    const created = await handleCreateBrick(input);
    if (!created || !parentProps) return;

    const parent = localBlocks.find((b) => b.id === parentProps.parentId);
    if (!parent) return;

    const siblings = getContainerChildIds((parent as any).content, parentProps.containerId);
    const base = siblings.filter((id) => id !== created.id);
    const insertAt = afterBrickId ? Math.max(0, base.indexOf(afterBrickId) + 1) : base.length;
    base.splice(insertAt, 0, created.id);
    const nextParentContent = setContainerChildIds((parent as any).content || {}, parentProps.containerId, base);
    const parentToPersist = { ...(parent as any), content: nextParentContent } as BoardBrick;

    setLocalBlocks((prev) => prev.map((b) => b.id === parent.id ? parentToPersist : b));

    if (card?.id && accessToken) {
      const payload = brickToMutationInput(parentToPersist);
      if (payload) {
        try {
          await updateCardBrick(card.id, parentToPersist.id, payload, accessToken);
        } catch (err) {
          console.error('Failed to persist parent container after nested create', err);
        }
      }
    }
  }, [accessToken, brickToMutationInput, card?.id, handleCreateBrick, localBlocks]);

  const handleUpdateBrick = async (brickId: string, input: Partial<BrickMutationInput>) => {
    if (!accessToken) {
      console.log('[UpdateBrick] early exit: missing accessToken');
      return;
    }
    
    console.log('[UpdateBrick] updating brick', { brickId, input });

    // Handle legacy summary fallback: dynamically convert to a real database brick
    if (brickId.endsWith(':summary') && card?.id) {
      console.log('[UpdateBrick] converting :summary fallback to a real brick');
      try {
        const fullInput: BrickMutationInput = {
          ...input,
          kind: input.kind || 'text',
          markdown: (input as any).markdown || '',
        } as BrickMutationInput;
        const res = await createCardBrick(card.id, fullInput, accessToken);
        setLocalBlocks(prev => prev.map(b => (b.id === brickId ? res.brick : b)));
        console.log('[UpdateBrick] server fallback conversion complete', res.brick);
        return;
      } catch (err) {
        console.error("Failed to convert fallback summary to brick", err);
        return;
      }
    }
    
    // Always update locally (optimistic update)
    setLocalBlocks(prev => prev.map(b => {
      if (b.id !== brickId) return b;

      const inData = input as any;
      // For text bricks, ensure we properly update markdown
      if (b.kind === 'text' && inData.markdown !== undefined) {
        return { ...b, markdown: inData.markdown, displayStyle: inData.displayStyle || (b as any).displayStyle };
      }

      // For other brick types, merge normally
      return { ...b, ...input };
    }) as BoardBrick[]);
    
    console.log('[UpdateBrick] local update complete');
    
    // If we have card.id, also sync with server
    if (!card?.id) {
      console.log('[UpdateBrick] no card.id, updated locally only (optimistic)');
      return;
    }
    
    try {
      await updateCardBrick(card.id, brickId, input as any, accessToken);
      console.log('[UpdateBrick] server update complete');
    } catch (err) {
      console.error("Failed to update brick on server", err);
    }
  };

  const handleDeleteBrick = async (brickId: string) => {
    if (!card?.id || !accessToken) {
      setLocalBlocks(prev => prev.filter(b => b.id !== brickId));
      return;
    }
    try {
      setLocalBlocks(prev => prev.filter(b => b.id !== brickId));
      await deleteCardBrick(card.id, brickId, accessToken);
    } catch (err) {
      console.error("Failed to delete brick", err);
    }
  };

  const handleReorderBricks = async (brickIds: string[]) => {
    if (!card?.id || !accessToken) {
      setLocalBlocks(prev => {
        const newBlocks = [...prev];
        newBlocks.sort((a, b) => brickIds.indexOf(a.id) - brickIds.indexOf(b.id));
        newBlocks.forEach((b, i) => b.position = i);
        return newBlocks;
      });
      return;
    }
    try {
      const clientId = crypto.randomUUID();
      setLocalBlocks(prev => {
        const newBlocks = [...prev];
        newBlocks.sort((a, b) => brickIds.indexOf(a.id) - brickIds.indexOf(b.id));
        newBlocks.forEach((b, i) => b.position = i);
        return newBlocks;
      });
      await reorderCardBricks(card.id, { clientId, brickIds }, accessToken);
    } catch (err) {
      console.error("Failed to reorder bricks", err);
    }
  };

  const handleCrossContainerDrop = useCallback(async (activeId: string, overId: string) => {
    const activeBlock = localBlocks.find(b => b.id === activeId);
    if (!activeBlock) return;

    let targetParentId: string | null = null;
    let targetContainerId: string | null = null;

    if (overId.includes(':')) {
      const parts = overId.split(':');
      targetParentId = parts[0];
      targetContainerId = parts[1];
    } else {
      const overBlock = localBlocks.find(b => b.id === overId);
      if (overBlock) {
        for (const parent of localBlocks) {
          const map = ((parent as any).content?.childrenByContainer || {}) as Record<string, string[]>;
          for (const [containerId, ids] of Object.entries(map)) {
            if (Array.isArray(ids) && ids.includes(overBlock.id)) {
              targetParentId = parent.id;
              targetContainerId = containerId;
            }
          }
        }
      }
    }

    let sourceParentId: string | null = null;
    let sourceContainerId: string | null = null;
    for (const parent of localBlocks) {
      const map = ((parent as any).content?.childrenByContainer || {}) as Record<string, string[]>;
      for (const [containerId, ids] of Object.entries(map)) {
        if (Array.isArray(ids) && ids.includes(activeId)) {
          sourceParentId = parent.id;
          sourceContainerId = containerId;
        }
      }
    }

    let sourceParentToPersist: BoardBrick | undefined;
    let targetParentToPersist: BoardBrick | undefined;

    const nextBlocks = localBlocks.map((brick) => {
      if (sourceParentId && sourceContainerId && brick.id === sourceParentId) {
        const currentIds = getContainerChildIds((brick as any).content, sourceContainerId).filter((id) => id !== activeId);
        const nextContent = setContainerChildIds((brick as any).content || {}, sourceContainerId, currentIds);
        sourceParentToPersist = { ...(brick as any), content: nextContent } as BoardBrick;
        return sourceParentToPersist;
      }
      if (targetParentId && targetContainerId && brick.id === targetParentId) {
        const currentIds = getContainerChildIds((brick as any).content, targetContainerId).filter((id) => id !== activeId);
        const insertAt = overId && currentIds.includes(overId) ? currentIds.indexOf(overId) + 1 : currentIds.length;
        currentIds.splice(insertAt, 0, activeId);
        const nextContent = setContainerChildIds((brick as any).content || {}, targetContainerId, currentIds);
        targetParentToPersist = { ...(brick as any), content: nextContent } as BoardBrick;
        return targetParentToPersist;
      }
      return brick;
    });

    setLocalBlocks(nextBlocks);

    if (!card?.id || !accessToken) return;

    const persistTargets = [sourceParentToPersist, targetParentToPersist]
      .filter((brick): brick is BoardBrick => Boolean(brick))
      .filter((brick, index, arr) => arr.findIndex((x) => x.id === brick.id) === index);

    for (const parent of persistTargets) {
      const payload = brickToMutationInput(parent);
      if (!payload) continue;
      try {
        await updateCardBrick(card.id, parent.id, payload, accessToken);
      } catch (err) {
        console.error('Failed to persist parent container after cross-container drop', err);
      }
    }
  }, [accessToken, brickToMutationInput, card?.id, localBlocks]);

  const handleUploadMediaFiles = useCallback(async ({
    brickId,
    files,
  }: {
    brickId: string;
    files: File[];
  }) => {
    if (!files.length) return;

    const target = localBlocks.find((block) => block.id === brickId) as any;
    if (!target || target.kind !== 'media') {
      console.error('[MediaUpload] target brick is not media', { brickId });
      return;
    }

    const fallback: MediaCarouselItem = {
      url: target.url || '',
      title: target.title || '',
      mimeType: target.mimeType || null,
      sizeBytes: target.sizeBytes || null,
      assetId: target.assetId || null,
    };
    const existingMeta = parseMediaMeta(target.caption, fallback);

    const uploadedItems = await uploadFilesAsMediaItems({
      files,
      accessToken,
      uploadFile,
      onUploadError: (err) => {
        console.error('[MediaUpload] backend upload failed, using local blob fallback', err);
        toast('No se pudo subir uno de los archivos. Se mostrara localmente en esta sesion.', 'error');
      },
      allowLocalBlobFallback: true,
    });

    if (!uploadedItems.length) return;

    const nextItems = [...existingMeta.items.filter((it) => it.url), ...uploadedItems];
    const first = nextItems[0];
    await handleUpdateBrick(brickId, {
      kind: 'media',
      mediaType: first?.mimeType?.startsWith('image/') ? 'image' : 'file',
      title: first?.title || target.title || 'Media',
      url: first?.url || target.url || '',
      mimeType: first?.mimeType || null,
      sizeBytes: first?.sizeBytes || null,
      caption: buildMediaCaption({ subtitle: existingMeta.subtitle || '', items: nextItems }),
      assetId: first?.assetId || null,
    } as Partial<BrickMutationInput>);
  }, [accessToken, handleUpdateBrick, localBlocks, toast]);

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
      console.log('[CardTextPaste] start', {
        brickId,
        fileName: file?.name,
        fileType: file?.type,
        fileSize: file?.size,
        cursorOffset,
        markdownLength: markdown?.length ?? 0,
      });
    }

    const targetIndex = localBlocks.findIndex((block) => block.id === brickId);
    if (targetIndex < 0) {
      console.log('[CardTextPaste] early exit: brick not found', {
        brickId,
        availableBrickIds: localBlocks.map((b) => b.id),
      });
      return;
    }

    const target = localBlocks[targetIndex] as any;
    if (target.kind !== 'text') {
      console.log('[CardTextPaste] early exit: brick is not text kind', {
        brickId,
        actualKind: target.kind,
      });
      return;
    }

    const sourceMarkdown = typeof markdown === 'string' ? markdown : (target.markdown || '');
    const safeCursor = Math.max(0, Math.min(cursorOffset, sourceMarkdown.length));
    
    // Determine position: start, end, or middle
    const isAtStart = safeCursor === 0;
    const isAtEnd = safeCursor >= sourceMarkdown.length;
    const isAtMiddle = !isAtStart && !isAtEnd;
    
    console.log('[CardTextPaste] cursor position', {
      cursorOffset: safeCursor,
      textLength: sourceMarkdown.length,
      isAtStart,
      isAtEnd,
      isAtMiddle,
    });

    try {
      let imageUrl: string | null = null;
      let assetKey: string | null = null;
      let uploadedToServer = false;

      if (accessToken) {
        try {
          console.log('[CardTextPaste] attempting upload...');
          const uploaded = await uploadFile(file, accessToken);
          imageUrl = uploaded.url;
          assetKey = uploaded.key;
          uploadedToServer = true;
          console.log('[CardTextPaste] upload successful', {
            url: uploaded.url,
            key: uploaded.key,
          });
        } catch (uploadErr) {
          console.error('[CardTextPaste] upload failed, using local blob fallback', uploadErr);
          imageUrl = URL.createObjectURL(file);
          assetKey = null;
          toast('No se pudo subir la imagen. Se mostrara localmente en esta sesion.', 'error');
        }
      } else {
        imageUrl = URL.createObjectURL(file);
        assetKey = null;
        console.log('[CardTextPaste] using local blob URL (no card.id/accessToken)');
      }

      if (!imageUrl) {
        toast('No se pudo procesar la imagen pegada.', 'error');
        return;
      }

      // Create media brick for the image
      const mediaBrick: any = {
        id: `temp-${crypto.randomUUID()}`,
        kind: 'media',
        mediaType: 'image',
        title: file.name || 'Image',
        url: imageUrl,
        mimeType: file.type,
        sizeBytes: file.size,
        caption: null,
        assetId: assetKey,
        position: 0, // Will be set correctly below
        parentBlockId: null,
      };

      const newBlocks: BoardBrick[] = [...localBlocks];
      
      if (isAtStart) {
        // Insert media brick BEFORE text brick
        console.log('[CardTextPaste] inserting media brick at start');
        mediaBrick.position = target.position - 0.5; // Between previous and current
        newBlocks.splice(targetIndex, 0, mediaBrick);
      } else if (isAtEnd) {
        // Insert media brick AFTER text brick
        console.log('[CardTextPaste] inserting media brick at end');
        mediaBrick.position = target.position + 0.5; // Between current and next
        newBlocks.splice(targetIndex + 1, 0, mediaBrick);
      } else if (isAtMiddle) {
        // Split text brick and insert media brick in the middle
        console.log('[CardTextPaste] splitting text brick and inserting media in middle');
        const beforeText = sourceMarkdown.slice(0, safeCursor).trimEnd();
        const afterText = sourceMarkdown.slice(safeCursor).trimStart();

        // Create new brick for text after cursor
        const afterBrick: BoardBrick = {
          id: `temp-${crypto.randomUUID()}`,
          kind: 'text',
          displayStyle: target.displayStyle || 'paragraph',
          markdown: afterText,
          tasks: [],
          position: target.position + 1,
          parentBlockId: null,
        };

        // Update current brick with text before cursor
        const beforeBrick = { ...target, markdown: beforeText, position: target.position };

        // Set media brick position between
        mediaBrick.position = target.position + 0.5;

        // Replace original brick and insert new bricks
        newBlocks[targetIndex] = beforeBrick;
        newBlocks.splice(targetIndex + 1, 0, mediaBrick, afterBrick);
      }

      // Re-index positions
      newBlocks.forEach((block, idx) => {
        block.position = idx;
      });

      // Optimistic update: just update local state
      setLocalBlocks(newBlocks as BoardBrick[]);

      // If card has an ID, persist to server
      if (card?.id && accessToken && uploadedToServer) {
        console.log('[CardTextPaste] persisting to server...');
        
        // Create or update each brick on server
        for (const block of newBlocks) {
          if (block.id.startsWith('temp-')) {
            // New brick, create it
            await createCardBrick(card.id, {
              kind: block.kind,
              ...(block.kind === 'text' ? {
                displayStyle: (block as any).displayStyle,
                markdown: (block as any).markdown,
              } : {}),
              ...(block.kind === 'media' ? {
                mediaType: (block as any).mediaType,
                title: (block as any).title,
                url: (block as any).url,
                mimeType: (block as any).mimeType,
                sizeBytes: (block as any).sizeBytes,
                caption: (block as any).caption,
                assetId: (block as any).assetId,
              } : {}),
            } as BrickMutationInput, accessToken);
          }
        }
        
        // Reorder all bricks
        await reorderCardBricks(
          card.id,
          { clientId: crypto.randomUUID(), brickIds: newBlocks.map(b => b.id) },
          accessToken
        );
      }

      console.log('[CardTextPaste] image paste complete');
      return; // Success, no string return needed since we created new bricks
    } catch (err) {
      console.error('[CardTextPaste] EXCEPTION caught', {
        error: err instanceof Error ? err.message : String(err),
        errorFull: err,
      });
      console.error('Failed to paste image into text block', err);
      toast('No se pudo pegar la imagen.', 'error');
      return;
    }
  }, [accessToken, card, localBlocks, toast]);

  useEffect(() => {
    recalculateVisibleTags();
    const resizeHandler = () => recalculateVisibleTags();
    window.addEventListener('resize', resizeHandler);
    const observer = typeof ResizeObserver !== 'undefined' && tagsRowRef.current ? new ResizeObserver(() => recalculateVisibleTags()) : null;
    if (observer && tagsRowRef.current) observer.observe(tagsRowRef.current);
    return () => {
      window.removeEventListener('resize', resizeHandler);
      observer?.disconnect();
    };
  }, [isOpen, recalculateVisibleTags]);

  const toggleAssignee = async (user: any) => {
    const isAssigned = localAssignees.find(a => a.id === user.id);
    const normalizedUser = normalizeAssignee(user);
    if (isAssigned) {
      setLocalAssignees(prev => prev.filter(a => a.id !== user.id));
      if (card?.id && accessToken) {
        try {
          await removeCardAssignee(card.id, user.id, accessToken);
          window.dispatchEvent(new Event('board:refresh'));
        } catch (err) {
          console.error("Failed to remove assignee", err);
          setLocalAssignees(prev => [...prev, normalizedUser]);
        }
      }
    } else {
      setLocalAssignees(prev => [...prev, normalizedUser]);
      if (card?.id && accessToken) {
        try {
          await addCardAssignee(card.id, user.id, accessToken);
          window.dispatchEvent(new Event('board:refresh'));
        } catch (err) {
          console.error("Failed to add assignee", err);
          setLocalAssignees(prev => prev.filter(a => a.id !== user.id));
        }
      }
    }
  };

  const assignCurrentUser = async () => {
    if (!user?.id) return;
    const boardMember = boardMembers.find((member) => member.id === user.id || member.userId === user.id);
    const currentUserAsAssignee = boardMember || {
      id: user.id,
      name: user.displayName || user.email,
      email: user.email,
      avatar_url: null,
      initials: (user.displayName || user.email || '??').substring(0, 2).toUpperCase(),
    };
    await toggleAssignee(currentUserAsAssignee);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !card?.id || !accessToken || isSubmittingComment) return;
    setIsSubmittingComment(true);

    if (activeTab === 'copilot') {
      try {
        const userMsg = newComment.trim();
        setAiMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setNewComment("");

        if (GENERATE_REPORT_INTENT_REGEX.test(userMsg)) {
          await generateReportFromCardContext(userMsg);
          return;
        }

        setIsImprovingDescription(true);
        try {
          const { scope, scopeId } = resolveAiScope();
          const response = await improveCardWithAi(
            {
              scope,
              scopeId,
              currentTitle: card.title,
              currentDescription: card.summary || '',
              currentBricks: localBlocks,
              userPrompt: userMsg
            },
            accessToken
          );

          const assistantMsg = response.explanation || "He analizado tu solicitud. ¿Deseas aplicar los cambios sugeridos?";
          setAiMessages(prev => [...prev, { role: 'assistant', content: assistantMsg }]);

          if (response.title || response.bricks) {
            setPendingImprovement({
              title: response.title || (card?.title || ""),
              bricks: response.bricks || [],
              diffText: response.bricks?.filter((b: any) => b.kind === 'text').map((b: any) => b.content.markdown).join('\n\n') || "",
              originalText: localBlocks.filter(b => b.kind === 'text').map(b => b.markdown).join("\n\n"),
              explanation: response.explanation
            });
          }
        } catch (err) {
          console.error("AI Chat failed", err);
          setAiMessages(prev => [...prev, { role: 'assistant', content: "Lo siento, hubo un error al procesar tu solicitud." }]);
        } finally {
          setIsImprovingDescription(false);
        }
      } finally {
        setIsSubmittingComment(false);
      }
      return;
    }

    if (!canComment) {
      toast("No tienes permisos para comentar en esta tarjeta.", "error");
      setIsSubmittingComment(false);
      return;
    }

    try {
      await addCardComment(card.id, newComment.trim(), accessToken);
      setNewComment("");
      const logs = await getCardActivity(card.id, accessToken);
      setActivities(logs);
      router.refresh();
      window.dispatchEvent(new Event('board:refresh'));
    } catch (err) {
      console.error("Failed to add comment", err);
      const message = err instanceof ApiError ? err.message : "No se pudo enviar el comentario.";
      toast(message, "error");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const applyCardPatch = useCallback(async (updates: Record<string, any>) => {
    if (!card?.id || !accessToken) return;
    await updateCard(card.id, withListContext(updates), accessToken);
    router.refresh();
    emitCardRefresh();
  }, [accessToken, card?.id, emitCardRefresh, router]);

  const handleStartTask = useCallback(async () => {
    if (readonly || !card?.id || !accessToken || localAssignees.length === 0 || !isCurrentUserAssigned || isTimerSubmitting) return;

    const hours = Number.parseInt(timerHoursInput || '0', 10) || 0;
    const minutes = Number.parseInt(timerMinutesInput || '0', 10) || 0;
    const totalMinutes = hours * 60 + minutes;

    if (totalMinutes <= 0) {
      toast(t('cardModal.timer.durationRequired'), 'info');
      return;
    }

    if (totalMinutes > 72 * 60) {
      toast(t('cardModal.timer.maxDuration'), 'info');
      return;
    }

    const startAt = new Date();
    const dueAt = new Date(startAt.getTime() + totalMinutes * 60_000);

    setIsTimerSubmitting(true);
    try {
      await applyCardPatch({
        status: 'active',
        start_at: startAt.toISOString(),
        due_at: dueAt.toISOString(),
        completed_at: null,
      });
      setLocalStartAt(startAt.toISOString());
      setLocalDueAtTimestamp(dueAt.toISOString());
      setLocalDueAt(normalizeDueDateInputValue(dueAt.toISOString()));
      setLocalCompletedAt(null);
      setIsTimerDropdownOpen(false);
      toast(t('cardModal.timer.startedSuccess', { duration: formatDurationParts(totalMinutes * 60_000) }), 'success');
    } catch (err) {
      console.error('Failed to start task timer', err);
      toast(t('cardModal.timer.startedError'), 'error');
    } finally {
      setIsTimerSubmitting(false);
    }
  }, [accessToken, applyCardPatch, card?.id, isCurrentUserAssigned, isTimerSubmitting, localAssignees.length, readonly, timerHoursInput, timerMinutesInput]);

  const handleCancelTask = useCallback(async () => {
    if (readonly || !card?.id || !accessToken || !isCurrentUserAssigned || isTimerSubmitting) return;
    setIsTimerSubmitting(true);
    try {
      await applyCardPatch({
        status: localCompletedAt ? 'done' : 'active',
        start_at: null,
        due_at: null,
        completed_at: null,
      });
      setLocalStartAt(null);
      setLocalDueAtTimestamp(null);
      setLocalDueAt('');
      setLocalCompletedAt(null);
      toast(t('cardModal.timer.cancelledSuccess'), 'info');
    } catch (err) {
      console.error('Failed to cancel task timer', err);
      toast(t('cardModal.timer.cancelledError'), 'error');
    } finally {
      setIsTimerSubmitting(false);
    }
  }, [accessToken, applyCardPatch, card?.id, isCurrentUserAssigned, isTimerSubmitting, localCompletedAt, readonly]);

  const handleCompleteTask = useCallback(async () => {
    if (readonly || !card?.id || !accessToken || !isCurrentUserAssigned || !localDueAtTimestamp || isTimerSubmitting) return;
    const completedAt = new Date();
    const remainingMs = new Date(localDueAtTimestamp).getTime() - completedAt.getTime();

    setIsTimerSubmitting(true);
    try {
      await applyCardPatch({
        status: 'done',
        completed_at: completedAt.toISOString(),
      });
      setLocalCompletedAt(completedAt.toISOString());
      if (remainingMs > 0) {
        toast(t('cardModal.timer.completedEarly', { duration: formatDurationParts(remainingMs) }), 'success');
      } else {
        toast(t('cardModal.timer.completedSuccess'), 'success');
      }
    } catch (err) {
      console.error('Failed to complete task timer', err);
      toast(t('cardModal.timer.completedError'), 'error');
    } finally {
      setIsTimerSubmitting(false);
    }
  }, [accessToken, applyCardPatch, card?.id, isCurrentUserAssigned, isTimerSubmitting, localDueAtTimestamp, readonly]);

  const handleToggleArchive = useCallback(async () => {
    if (readonly || !card?.id || !accessToken || isTimerSubmitting) return;
    const nextArchivedAt = localArchivedAt ? null : new Date().toISOString();

    setIsTimerSubmitting(true);
    try {
      await applyCardPatch({
        status: nextArchivedAt ? 'archived' : (localCompletedAt ? 'done' : 'active'),
        archived_at: nextArchivedAt,
        start_at: nextArchivedAt ? null : localStartAt,
        due_at: nextArchivedAt ? null : localDueAtTimestamp,
      });
      setLocalArchivedAt(nextArchivedAt);
      if (nextArchivedAt) {
        setLocalStartAt(null);
        setLocalDueAtTimestamp(null);
        setLocalDueAt('');
        toast(t('cardModal.timer.archivedSuccess'), 'info');
      } else {
        toast(t('cardModal.timer.restoredSuccess'), 'success');
      }
    } catch (err) {
      console.error('Failed to toggle archive state', err);
      toast(t('cardModal.timer.archiveError'), 'error');
    } finally {
      setIsTimerSubmitting(false);
    }
  }, [accessToken, applyCardPatch, card?.id, isTimerSubmitting, localArchivedAt, localCompletedAt, localDueAtTimestamp, localStartAt, readonly]);

  const handleUpdateField = useCallback((field: string, value: any, instant: boolean = true) => {
    if (field === 'title') setLocalTitle(value);
    if (field === 'due_at') {
      setLocalDueAt(value);
      setLocalDueAtTimestamp(value || null);
    }
    if (field === 'start_at') setLocalStartAt(value || null);
    if (field === 'completed_at') setLocalCompletedAt(value || null);
    if (field === 'archived_at') setLocalArchivedAt(value || null);
    if (!card?.id || !accessToken) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const doUpdate = async () => {
      try {
        const payload = withListContext({ [field]: (value === null || value === "") ? null : value });
        await updateCard(card.id, payload, accessToken);
        // Removed legacy description/summary refresh logic
        router.refresh();
        emitCardRefresh();
      } catch (err) {
        console.error("Failed to update card", err);
      }
    };
    if (instant) doUpdate();
    else debounceTimer.current = setTimeout(doUpdate, 500);
  }, [accessToken, card?.id, emitCardRefresh, router]);

  const submitCreate = async () => {
    if (!listId || !accessToken || isCreating) return;
    setIsCreating(true);
    try {
      const createdCard = await createCard({
        listId,
        title: localTitle || "New Card",
        dueAt: localDueAt || undefined,
        tags: localTags.map(t => t.id),
        assignees: localAssignees.map(a => a.id)
      }, accessToken);

      const bricksToCreate = localBlocks.filter((block) => {
        if (block.kind !== 'text') return true;
        return Boolean((block.markdown || '').trim());
      });

      if (createdCard?.id && bricksToCreate.length > 0) {
        const createdBrickIds: string[] = [];
        for (const block of bricksToCreate) {
          const payload = brickToMutationInput(block);
          if (!payload) continue;
          const created = await createCardBrick(createdCard.id, payload, accessToken);
          createdBrickIds.push(created.brick.id);
        }
        if (createdBrickIds.length > 1) {
          await reorderCardBricks(createdCard.id, { clientId: crypto.randomUUID(), brickIds: createdBrickIds }, accessToken);
        }
      }

      router.refresh();
      window.dispatchEvent(new Event('board:refresh'));
      onClose();
    } catch (err) {
      console.error("Failed to create card", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = async () => {
    router.refresh();
    window.dispatchEvent(new Event('board:refresh'));
    setTimeout(() => onClose(), 50);
  };

  const tagColorPalette = ['#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

  const normalizeColor = (raw?: string) => {
    if (!raw) return '#64748b';
    if (raw.startsWith('#')) return raw;
    return `#${raw}`;
  };

  const pickColorForName = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = (hash << 5) - hash + name.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % tagColorPalette.length;
    return tagColorPalette[idx];
  };

  const buildTagPillStyle = (tag: any) => {
    const color = normalizeColor(tag?.color);
    return { borderColor: `${color}66`, backgroundColor: `${color}22`, color } as const;
  };

  const handleCreateTag = async () => {
    const name = tagSearch.trim();
    if (!name || !boardId || !accessToken) return;
    const already = availableTags.find((t: any) => t.name.toLowerCase() === name.toLowerCase());
    if (already) {
      await handleAddTag(already);
      setTagSearch("");
      return;
    }
    setIsCreatingTag(true);
    setTagError(null);
    try {
      const created = await createTag({ scopeType: 'board', scopeId: boardId, name, color: newTagColor || pickColorForName(name), tagKind: 'custom' }, accessToken);
      setAvailableTags((prev) => [...prev, created]);
      await handleAddTag(created);
      setTagSearch("");
      setNewTagColor('#3b82f6');
    } catch (err) {
      console.error('Failed to create tag', err);
      setTagError("Error al crear tag");
    } finally {
      setIsCreatingTag(false);
    }
  };

  const normalizedTagSearch = tagSearch.trim().toLowerCase();
  const filteredAvailableTags = availableTags.filter((t) => {
    const rawName = String(t?.name || '').toLowerCase();
    const localizedName = translateNativeTagName(t.name || '', nativeTagLocale).toLowerCase();
    return rawName.includes(normalizedTagSearch) || localizedName.includes(normalizedTagSearch);
  });

  const nativeSuggestionsToShow = DEFAULT_NATIVE_TAG_SUGGESTIONS.filter((suggestion) => {
    const suggestionLabel = translateNativeTagName(suggestion.key, nativeTagLocale).toLowerCase();
    const existsEquivalent = availableTags.some((t) => {
      const rawName = String(t?.name || '').trim().toLowerCase();
      const rawSlug = String(t?.slug || '').trim().toLowerCase();
      if (rawName === suggestion.key.toLowerCase()) return true;
      if (rawSlug === suggestion.key.toLowerCase().replace(/\./g, '-')) return true;
      return false;
    });
    if (existsEquivalent) return false;
    if (!normalizedTagSearch) return true;
    return suggestion.key.toLowerCase().includes(normalizedTagSearch) || suggestionLabel.includes(normalizedTagSearch);
  });

  const showNativeTagSuggestions = !hideNativeTagSuggestions && nativeSuggestionsToShow.length > 0;
  const safeVisibleTagCount = Math.min(visibleTagCount || localTags.length, localTags.length);
  const visibleTags = areTagsExpanded ? localTags : localTags.slice(0, safeVisibleTagCount);
  const hiddenTags = areTagsExpanded ? [] : localTags.slice(safeVisibleTagCount);

  const resolveTagNameById = (tagId?: string) => {
    if (!tagId) return 'tag';
    const allKnownTags = [...availableTags, ...localTags];
    const match = allKnownTags.find((tag: any) => tag?.id === tagId);
    if (!match) return 'tag';
    return getTagLabel(match);
  };

  const formatActivityChanges = (changes: Record<string, { from: unknown; to: unknown }> | undefined) => {
    if (!changes) return '';
    const labels: Record<string, string> = {
      title: 'titulo',
      status: 'estado',
      start_at: 'inicio',
      due_at: 'fecha limite',
      completed_at: 'completada',
      archived_at: 'archivada',
    };
    const entries = Object.entries(changes);
    if (entries.length === 0) return '';
    const fields = entries.map(([field]) => labels[field] || field);
    if (fields.length === 1) return `Cambio ${fields[0]}`;
    if (fields.length === 2) return `Cambios: ${fields[0]} y ${fields[1]}`;
    return `Cambios: ${fields.slice(0, 2).join(', ')} +${fields.length - 2}`;
  };

  const formatActivity = (log: any) => {
    const cardTitle = localTitle || card?.title || 'esta tarjeta';
    const action = String(log?.action || '').toLowerCase();
    const payload = (log?.payload || {}) as Record<string, any>;
    switch (action) {
      case 'card.created': return { badge: 'Creada', badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', message: `Creo la card ${payload.title ? `"${payload.title}"` : `"${cardTitle}"`}`, detail: 'Se creo una nueva tarjeta', dotClass: 'border-emerald-400' };
      case 'card.updated': return { badge: 'Actualizada', badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30', message: `Actualizo la card "${cardTitle}"`, detail: formatActivityChanges(payload.changes), dotClass: 'border-blue-400' };
      case 'card.tag_added': { const tagName = resolveTagNameById(payload.tagId as string); return { badge: 'Tag agregado', badgeClass: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30', message: `Agrego el tag "${tagName}"`, detail: `En la card "${cardTitle}"`, dotClass: 'border-fuchsia-400' }; }
      case 'card.tag_removed': { const tagName = resolveTagNameById(payload.tagId as string); return { badge: 'Tag removido', badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30', message: `Removio el tag "${tagName}"`, detail: `En la card "${cardTitle}"`, dotClass: 'border-rose-400' }; }
      case 'card.commented': return { badge: 'Comentario', badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30', message: `Comento en "${cardTitle}"`, detail: payload.text || 'Nuevo comentario', dotClass: 'border-amber-400' };
      default: return { badge: 'Actividad', badgeClass: 'bg-muted text-muted-foreground border-border', message: String(log.action || 'Evento'), detail: '', dotClass: 'border-primary' };
    }
  };

  const renderCommentWithMentions = (content: string): ReactNode => {
    const lines = content.split(/\r?\n/);
    return lines.map((line, index) => {
      const richParts = ReferenceResolver.renderRich(line, getResolverContext(contextDocs, teamBoards, boardMembers) as any);
      const renderedLine = richParts.map((part, i) => {
        if (typeof part === 'string') return part;

        if (part.type === 'mention') {
          const mentionType = part.mentionType as 'doc' | 'board' | 'card' | 'user';
          return (
            <RefPill key={i} type={mentionType} id={part.id} name={part.name} />
          );
        }

        if (part.type === 'deep') {
          return (
            <RefPill key={i} type="deep" id={part.inner?.split(':')[0] || ''} name={part.label} />
          );
        }
        return null;
      });
      return (
        <Fragment key={`line-${index}`}>
          {renderedLine}
          {index < lines.length - 1 ? <br /> : null}
        </Fragment>
      );
    });
  };

  const ACTIVITY_GROUP_WINDOW_MS = 3 * 60 * 1000;
  const groupedActivities = useMemo(() => {
    const groups: any[][] = [];
    for (const log of activities) {
      const lastGroup = groups[groups.length - 1];
      const previous = lastGroup?.[0];
      if (!lastGroup || !previous) { groups.push([log]); continue; }
      const sameAction = String(previous.action || '') === String(log.action || '');
      const sameActor = String(previous.actorId || '') === String(log.actorId || '');
      const prevTs = new Date(previous.createdAt).getTime();
      const currTs = new Date(log.createdAt).getTime();
      if (sameAction && sameActor && Math.abs(prevTs - currTs) <= ACTIVITY_GROUP_WINDOW_MS) lastGroup.push(log);
      else groups.push([log]);
    }
    return groups;
  }, [activities]);

  const prettifyAction = (action: string): string => {
    const lower = action.toLowerCase();
    if (lower === "card.tag_added") return "Añadió etiqueta";
    if (lower === "card.tag_removed") return "Quitó etiqueta";
    if (lower === "card.commented") return "Comentó";
    if (lower === "card.updated") return "Actualizó tarjeta";
    if (lower === "card.created") return "Creó tarjeta";
    return action.replace(/\./g, " ").replace(/_/g, " ").replace("created", "creado").replace("updated", "actualizado");
  };

  const getResolverContext = (docs: any[], boards: any[], members: any[]) => {
    const cardScopeId = String(card?.id || "");
    return {
      documents: docs,
      boards,
      users: members,
      activeBricks: localBlocks,
      cardBricksById: cardScopeId ? { [cardScopeId]: localBlocks } : {},
    };
  };

  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-md p-2 sm:p-4 overflow-hidden" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="relative w-full max-w-6xl rounded-2xl border border-border/80 bg-background shadow-2xl flex flex-col h-[96vh] max-h-[96vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex shrink-0 items-center justify-between p-4 border-b border-border bg-card/50">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <span className="hover:text-foreground cursor-pointer transition-colors">{boardName || "Board"}</span>
            <span className="text-border">/</span>
            <span className="hover:text-foreground cursor-pointer transition-colors">{listName || "List"}</span>
            <span className="text-border">/</span>
            <span className="font-semibold text-foreground truncate max-w-[200px]">{localTitle || card?.title || "Untitled Card"}</span>
          </div>
          <div className="flex items-center gap-2">
            {!card?.id && (
              <button onClick={submitCreate} disabled={isCreating} className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50">
                {isCreating ? "Creating..." : "Create"}
              </button>
            )}
            {card?.id && timerDueLabel ? (
              <span className="hidden rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground md:inline-flex">
                {timerDueLabel}
              </span>
            ) : null}
            {card?.id && isTimerActive && timerRemainingLabel ? (
              <span className="hidden rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300 md:inline-flex">
                {timerRemainingLabel}
              </span>
            ) : null}
            {card?.id && isTimerActive && !readonly && isCurrentUserAssigned ? (
              <>
                <button type="button" onClick={() => void handleCancelTask()} disabled={isTimerSubmitting} className="hidden rounded-xl border border-border/70 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50 md:inline-flex">{t('cardModal.timer.cancel')}</button>
                <button type="button" onClick={() => void handleCompleteTask()} disabled={isTimerSubmitting} className="hidden rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 md:inline-flex">{t('cardModal.timer.finish')}</button>
              </>
            ) : null}
            {card?.id ? (
              <button
                onClick={() => void handleToggleArchive()}
                disabled={isTimerSubmitting || readonly}
                className="rounded-full p-1.5 hover:bg-accent/10 hover:text-foreground transition-colors text-muted-foreground disabled:opacity-50"
                title={isCardArchived ? t('cardModal.unarchiveCard') : t('cardModal.archiveCard')}
              >
                {isCardArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              </button>
            ) : null}
            <button onClick={handleClose} className="rounded-full p-1.5 hover:bg-accent/10 hover:text-foreground transition-colors text-muted-foreground"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex items-center space-x-6 px-6 border-b border-border bg-card/50 overflow-x-auto hide-scrollbar text-sm font-semibold text-muted-foreground shrink-0">
          <button onClick={() => setActiveTab('details')} className={`py-3 whitespace-nowrap transition-colors border-b-2 ${activeTab === 'details' ? 'text-foreground border-primary' : 'border-transparent hover:text-foreground'}`}>Detalles</button>
          <button onClick={() => setActiveTab('copilot')} className={`py-3 whitespace-nowrap transition-colors border-b-2 ${activeTab === 'copilot' ? 'text-amber-500 border-amber-500' : 'border-transparent hover:text-foreground'}`}>Copilot</button>
          <button onClick={() => setActiveTab('comments')} className={`py-3 whitespace-nowrap transition-colors border-b-2 ${activeTab === 'comments' ? 'text-foreground border-primary' : 'border-transparent hover:text-foreground'}`}>Comentarios</button>
          <button onClick={() => setActiveTab('activity')} className={`py-3 whitespace-nowrap transition-colors border-b-2 ${activeTab === 'activity' ? 'text-foreground border-primary' : 'border-transparent hover:text-foreground'}`}>Actividad</button>
        </div>
        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          <div className={`flex-1 overflow-y-auto p-4 md:p-8 hide-scrollbar border-r border-border ${activeTab === 'details' ? 'block' : 'hidden'}`}>
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="group relative">
                <h1 ref={titleRef} className="text-3xl md:text-3xl font-bold tracking-tight text-foreground outline-none focus:border-accent pl-2 -ml-2 transition-colors" contentEditable suppressContentEditableWarning onInput={e => setLocalTitle(e.currentTarget.textContent || "")} onBlur={e => handleUpdateField('title', e.currentTarget.textContent || "")} />
                <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground border-b border-border/50 pb-4">
                  {(card?.updatedAt || card?.createdAt) && (
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4" />
                      <span>{new Date(card.updatedAt || card.createdAt).toLocaleString()}</span>
                    </div>
                  )}
                  <div className={`flex gap-1.5 relative min-w-0 flex-1 ${areTagsExpanded ? 'items-start flex-wrap' : 'items-center'}`} ref={tagsRowRef}>
                    <TagIcon className="h-3 w-3" />
                    <div className={`flex gap-1.5 min-w-0 ${areTagsExpanded ? 'flex-wrap overflow-visible' : 'items-center overflow-hidden'}`}>
                      {visibleTags.map(tag => (
                        <span key={getTagKey(tag)} ref={el => { const key = getTagKey(tag); if (el) tagChipRefs.current.set(key, el); else tagChipRefs.current.delete(key); }} style={buildTagPillStyle(tag)} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border group transition-all">
                          <span>{getTagLabel(tag)}</span>
                          <button onClick={e => { e.stopPropagation(); handleRemoveTag(tag); }} className="ml-1.5 opacity-50 group-hover:opacity-100"><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                    {hiddenTags.length > 0 && <button onClick={() => setAreTagsExpanded(true)} className="text-xs text-muted-foreground">+{hiddenTags.length} tags</button>}
                    <button onClick={e => { e.stopPropagation(); setIsTagDropdownOpen(!isTagDropdownOpen); }} className="h-6 w-6 rounded-md border border-dashed flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></button>
                    {isTagDropdownOpen && (
                      <div className="absolute top-full left-0 mt-2 w-72 bg-popover border rounded-lg shadow-xl z-50 p-3 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Buscar o crear tag..."
                            value={tagSearch}
                            onChange={e => setTagSearch(e.target.value)}
                            className="w-full bg-background border rounded-md pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-accent transition-all"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && tagSearch.trim() && filteredAvailableTags.length === 0) {
                                e.preventDefault();
                                handleCreateTag();
                              }
                            }}
                          />
                        </div>

                        {filteredAvailableTags.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground/60 px-2 tracking-wider">Tags existentes</p>
                            <div className="max-h-32 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                              {filteredAvailableTags.map(tag => (
                                <button
                                  key={tag.id}
                                  onClick={() => {
                                    handleAddTag(tag);
                                    setTagSearch("");
                                  }}
                                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent rounded-md flex items-center justify-between group transition-colors"
                                >
                                  <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: normalizeColor(tag.color) }} />
                                    <span className="font-medium">{getTagLabel(tag)}</span>
                                  </div>
                                  <Plus className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {showNativeTagSuggestions && (
                          <div className="space-y-1 pt-1 border-t border-border/40">
                            <div className="flex items-center justify-between px-2">
                              <p className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">Sugerencias</p>
                              <button onClick={dismissNativeTagSuggestions} className="text-[9px] text-muted-foreground hover:text-foreground">Ocultar</button>
                            </div>
                            <div className="flex flex-wrap gap-1.5 p-1.5">
                              {nativeSuggestionsToShow.map((suggestion) => (
                                <button
                                  key={suggestion.key}
                                  onClick={() => handleSelectNativeSuggestion(suggestion)}
                                  className="flex items-center space-x-1.5 px-2 py-1 rounded bg-muted/50 hover:bg-accent border border-border/50 text-[10px] transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: suggestion.color }} />
                                  <span>{translateNativeTagName(suggestion.key, nativeTagLocale)}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {tagSearch.trim() && !filteredAvailableTags.find(t => t.name.toLowerCase() === tagSearch.trim().toLowerCase()) && (
                          <div className="pt-2 border-t border-border/40 space-y-3">
                            <div className="px-2 space-y-2">
                              <p className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">Nuevo tag</p>
                              <div className="flex items-center space-x-2">
                                {tagColorPalette.map(color => (
                                  <button
                                    key={color}
                                    onClick={() => setNewTagColor(color)}
                                    className={`w-5 h-5 rounded-full border-2 transition-all ${newTagColor === color ? 'border-primary scale-110 shadow-sm' : 'border-transparent hover:scale-105'}`}
                                    style={{ backgroundColor: color }}
                                  />
                                ))}
                              </div>
                            </div>
                            <button
                              onClick={handleCreateTag}
                              disabled={isCreatingTag}
                              className="w-full flex items-center justify-center space-x-2 py-2 bg-accent/10 border border-accent/20 text-accent rounded-md text-xs font-bold hover:bg-accent/20 transition-all active:scale-[0.98] disabled:opacity-50"
                            >
                              {isCreatingTag ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                              <span>Crear "{tagSearch}"</span>
                            </button>
                          </div>
                        )}

                        {tagError && (
                          <p className="text-[10px] text-destructive px-2 text-center font-medium animate-in slide-in-from-top-1">{tagError}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 relative ml-auto">
                    <Users className="w-4 h-4" />
                    <div className="flex -space-x-2 overflow-hidden">
                      {localAssignees.map(u => <img key={u.id} src={getUserAvatarUrl(u.avatar_url, u.email, 24)} alt={u.name} className="h-6 w-6 rounded-full border-2 border-background object-cover" />)}
                    </div>
                    <button onClick={() => { setIsTimerDropdownOpen(false); setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen); }} disabled={readonly} className="h-6 w-6 rounded-full border border-dashed flex items-center justify-center ml-1 disabled:opacity-40"><UserPlus className="h-3 w-3" /></button>
                    {card?.id && localAssignees.length > 0 && isCurrentUserAssigned ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAssigneeDropdownOpen(false);
                          setIsTimerDropdownOpen((prev) => !prev);
                        }}
                        disabled={isCardArchived || readonly}
                        className="h-6 w-6 rounded-full border border-border/70 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-accent/50 disabled:opacity-40"
                        title={t('cardModal.timer.startTimer')}
                      >
                        <Clock3 className="h-3 w-3" />
                      </button>
                    ) : null}
                    {isAssigneeDropdownOpen && (
                      <div className="absolute right-0 top-9 z-30 w-72 rounded-xl border border-border/80 bg-card shadow-2xl p-2 space-y-1">
                        <div className="px-2 pb-2 border-b border-border/50">
                          <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Asignar miembros</p>
                        </div>
                        <div className="max-h-56 overflow-y-auto space-y-1 py-1">
                          {boardMembers.length === 0 ? (
                            <div className="px-2 py-3 text-xs text-muted-foreground">No hay miembros disponibles en este board.</div>
                          ) : (
                            boardMembers.map((member) => {
                              const isAssigned = localAssignees.some((assignee) => assignee.id === member.id);
                              return (
                                <button
                                  key={member.id}
                                  type="button"
                                  onClick={() => void handleToggleAssignee(member)}
                                  className={`w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors ${isAssigned ? 'bg-accent/10' : 'hover:bg-muted/50'}`}
                                >
                                  <img
                                    src={getUserAvatarUrl(member.avatar_url, member.email, 28)}
                                    alt={member.name}
                                    className="h-7 w-7 rounded-full border border-border/60 object-cover"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                                  </div>
                                  {isAssigned ? (
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-accent">Asignado</span>
                                  ) : null}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                    {isTimerDropdownOpen && card?.id ? (
                      <div className="absolute right-0 top-9 z-30 w-72 rounded-xl border border-border/80 bg-card shadow-2xl p-3 space-y-3">
                        <div>
                          <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">{t('cardModal.timer.durationTitle')}</p>
                          <p className="text-xs text-muted-foreground mt-1">{t('cardModal.timer.durationDescription')}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="space-y-1 text-xs text-muted-foreground">
                            <span>{t('cardModal.timer.hours')}</span>
                            <input
                              type="number"
                              min={0}
                              max={72}
                              value={timerHoursInput}
                              onChange={(event) => setTimerHoursInput(clampTimerValue(event.target.value, 72))}
                              disabled={readonly}
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-60"
                            />
                          </label>
                          <label className="space-y-1 text-xs text-muted-foreground">
                            <span>{t('cardModal.timer.minutes')}</span>
                            <input
                              type="number"
                              min={0}
                              max={59}
                              value={timerMinutesInput}
                              onChange={(event) => setTimerMinutesInput(clampTimerValue(event.target.value, 59))}
                              disabled={readonly}
                              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-60"
                            />
                          </label>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => setIsTimerDropdownOpen(false)} className="px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">{t('cardModal.timer.cancel')}</button>
                          <button type="button" onClick={() => void handleStartTask()} disabled={isTimerSubmitting || isCardArchived || readonly || !isCurrentUserAssigned} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                            {isTimerSubmitting ? t('cardModal.timer.starting') : t('cardModal.timer.startTimer')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-8">
                  <h3 className="font-semibold text-lg text-foreground">Content</h3>
                </div>

                <div className="mt-4">
                  <UnifiedBrickList
                    isCompact
                    bricks={localBlocks.filter((b) => getTopLevelBrickIds(localBlocks as any[]).has(b.id))}
                    activeBricks={localBlocks}
                    canEdit={!readonly}
                    documents={contextDocs}
                    boards={teamBoards}
                    users={boardMembers}
                      addableKinds={['text', 'table', 'graph', 'checklist', 'accordion', 'image']}
                    onAddBrick={async (kind, afterBrickId, parentProps, initContent) => {
                      let input: BrickMutationInput;
                      if (kind === 'checklist') {
                        input = { kind: 'checklist', items: [{ id: crypto.randomUUID(), label: 'Nueva tarea', checked: false }] };
                      } else if (kind === 'table') {
                        input = { kind: 'table', rows: [['Encabezado 1', 'Encabezado 2'], ['', '']] };
                        } else if (kind === 'graph') {
                          input = {
                            kind: 'graph',
                            type: 'line',
                            title: 'Análisis de datos',
                            data: [
                              { name: 'A', value: 10 },
                              { name: 'B', value: 20 },
                              { name: 'C', value: 15 },
                            ],
                          };
                        } else if (kind === 'accordion') {
                          input = {
                            kind: 'accordion',
                            title: 'Nuevo acordeón',
                            body: '',
                            isExpanded: true,
                          };
                      } else if (kind === 'text' && initContent) { input = { kind: 'text', markdown: initContent.markdown, displayStyle: 'paragraph' }; } else if (kind === 'image') {
                        input = {
                          kind: 'media',
                          mediaType: 'image',
                          title: 'Imagen',
                          url: null,
                          mimeType: null,
                          sizeBytes: null,
                          caption: null,
                          assetId: null,
                        };
                      } else {
                        input = { kind: 'text', displayStyle: 'paragraph', markdown: '' };
                      }
                      
                      if (kind === 'accordion') {
                        (input as any).content = { childrenByContainer: { body: [] } };
                      }
                      if (kind === 'tabs') {
                        (input as any).tabs = [{ id: '1', label: 'Tab 1' }];
                        (input as any).content = { childrenByContainer: { '1': [] } };
                      }
                      if (kind === 'columns') {
                        (input as any).columns = [{ id: '1' }, { id: '2' }];
                        (input as any).content = { childrenByContainer: { '1': [], '2': [] } };
                      }

                      await handleCreateBrickWithNesting(input, parentProps, afterBrickId);
                    }}
                    onUpdateBrick={handleUpdateBrick}
                    onDeleteBrick={handleDeleteBrick}
                    onReorderBricks={handleReorderBricks}
                    onCrossContainerDrop={handleCrossContainerDrop}
                    onPasteImageInTextBrick={handlePasteImageInTextBrick}
                    onUploadMediaFiles={handleUploadMediaFiles}
                  />
                </div>


              </div>
            </div>
          </div>

          <div className={`w-full flex-1 flex flex-col bg-card/20 border-t md:border-t-0 z-10 ${activeTab !== 'details' ? 'flex' : 'hidden'}`}>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'copilot' ? (
                <div className="flex flex-col h-full space-y-4">
                  <div className="flex-1 space-y-4">
                    <div className="flex gap-3">
                      <div className="h-8 w-8 shrink-0 rounded shadow-sm border flex items-center justify-center bg-amber-500/10 border-amber-500/20 text-amber-500">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="max-w-[85%] p-3 rounded-xl text-sm shadow-sm border bg-muted/50 border-border/50 rounded-tl-none">
                        <p>¡Hola! Soy tu asistente de IA. Puedo ayudarte a mejorar el contenido de esta tarjeta, resumir información o resolver dudas. ¿En qué puedo ayudarte hoy?</p>
                      </div>
                    </div>

                    {aiMessages.map((msg, i) => {
                      const { cleanText, actions } = parseAiActions(msg.content);
                      const userTint = getUserTintStyles(user?.id || user?.email || "user");

                      return (
                        <div key={i} className="space-y-3">
                          <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`h-8 w-8 shrink-0 rounded shadow-sm border flex items-center justify-center ${msg.role === 'assistant'
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                              : 'rounded-full bg-primary/10 border-primary/20 text-primary font-bold text-[10px]'
                              }`} style={msg.role === 'user' ? { backgroundColor: userTint.bg, borderColor: userTint.border, color: userTint.text } : undefined}>
                              {msg.role === 'assistant' ? <Bot className="h-4 w-4" /> : (user?.displayName?.[0] || 'U')}
                            </div>
                            <div className={`max-w-[85%] p-3 rounded-xl text-sm shadow-sm border ${msg.role === 'user'
                              ? 'bg-primary text-primary-foreground rounded-tr-none border-primary/20'
                              : 'bg-muted/50 border-border/50 rounded-tl-none'
                              }`} style={msg.role === 'user' ? { backgroundColor: userTint.bg, borderColor: userTint.border, color: "inherit" } : undefined}>
                              <RichText
                                content={cleanText}
                                context={getResolverContext(contextDocs, teamBoards, boardMembers) as any}
                              />
                            </div>
                          </div>

                          {actions.map((action, actionIdx) => (
                      <div key={actionIdx} className="ml-11 mr-4 mt-2 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 shadow-sm space-y-3 animate-in fade-in slide-in-from-left-2 duration-300">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs uppercase font-black text-emerald-700 tracking-wider">Acción Sugerida</span>
                        </div>
                        
                        <div className="bg-emerald-500/20 rounded-md border border-emerald-500/30 px-3 py-2 flex items-center justify-between">
                          <span className="text-sm font-bold text-emerald-800">{String(action.action || "").replace(/_/g, " ")}</span>
                        </div>

                        <button
                          onClick={() => handleAiAction(action)}
                          className="w-full py-2 px-3 rounded-md bg-emerald-600/90 text-white text-xs font-bold hover:bg-emerald-600 shadow-sm transition-all active:scale-[0.98]"
                        >
                          Confirmar y Ejecutar
                        </button>
                      </div>
                    ))}
                        </div>
                      );
                    })}

                    {!pendingImprovement && (
                      <div className="space-y-3 pt-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={handleImproveDescriptionWithAi}
                            disabled={isImprovingDescription}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-full text-[11px] font-bold hover:bg-amber-500/20 transition-all disabled:opacity-50"
                          >
                            {isImprovingDescription ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            Mejorar con IA
                          </button>
                          <button
                            onClick={() => {
                              setAiMessages(prev => [...prev, { role: 'user', content: 'Resume esta tarjeta' }]);
                              setAiMessages(prev => [...prev, { role: 'assistant', content: 'Esta tarjeta trata sobre: ' + localTitle + '. Contiene ' + localBlocks.length + ' bloques de contenido.' }]);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 text-primary border border-primary/10 rounded-full text-[11px] font-bold hover:bg-primary/10 transition-all"
                          >
                            <FileText className="w-3 h-3" />
                            Resumir
                          </button>
                          <button
                            onClick={() => {
                              const prompt = 'Generar reporte técnico con el contexto de este tablero y tarjeta.';
                              setAiMessages(prev => [...prev, { role: 'user', content: prompt }]);
                              void generateReportFromCardContext(prompt);
                            }}
                            disabled={isGeneratingReport || isImprovingDescription}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 rounded-full text-[11px] font-bold hover:bg-indigo-500/20 transition-all disabled:opacity-50"
                          >
                            {isGeneratingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                            Generar reporte
                          </button>
                        </div>
                      </div>
                    )}

                    {pendingImprovement && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex gap-3">
                          <div className="h-8 w-8 shrink-0 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 border shadow-sm">
                            <Bot className="h-4 w-4" />
                          </div>
                          <div className="flex-1 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 shadow-sm rounded-tl-none">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] uppercase font-bold text-amber-500/80 tracking-widest">Mejora sugerida</p>
                            </div>
                            <div className="space-y-3">
                              <div>
                                <p className="text-[10px] uppercase text-muted-foreground/60 font-bold mb-1">Título</p>
                                <BrickDiff kind="text" oldContent={{ markdown: localTitle }} newContent={{ markdown: pendingImprovement.title }} />
                              </div>
                              <div>
                                <p className="text-[10px] uppercase text-muted-foreground/60 font-bold mb-1">Cambios en Bloques</p>
                                <div className="space-y-3 rounded-lg border bg-background/30 p-3">
                                  {pendingImprovement.bricks.map((brick: any, idx: number) => {
                                    const oldBrick = localBlocks.find(b => b.id === brick.id) as any;

                                    return (
                                      <div key={idx} className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <span className="px-1.5 py-0.5 rounded bg-muted text-[9px] font-black uppercase text-muted-foreground border border-border/50">{brick.kind}</span>
                                          {!oldBrick && <span className="text-[8px] text-emerald-500 font-bold uppercase tracking-tighter">[Nuevo]</span>}
                                        </div>
                                        <BrickDiff
                                          kind={brick.kind}
                                          oldContent={oldBrick ? { ...oldBrick, ...oldBrick.content, markdown: oldBrick.markdown } : null}
                                          newContent={{ ...brick, ...brick.content, markdown: brick.markdown || brick.content?.markdown }}
                                        />
                                      </div>
                                    );
                                  })}
                                  {/* Show deletions if any */}
                                  {localBlocks.filter((ob: any) => !pendingImprovement.bricks.some((nb: any) => nb.id === ob.id)).map((ob: any) => (
                                    <div key={ob.id} className="space-y-1 opacity-50 grayscale">
                                      <div className="flex items-center gap-2">
                                        <span className="px-1.5 py-0.5 rounded bg-muted text-[9px] font-black uppercase text-muted-foreground border border-border/50">{ob.kind}</span>
                                        <span className="text-[8px] text-rose-500 font-bold uppercase tracking-tighter">[Eliminado]</span>
                                      </div>
                                      <BrickDiff
                                        kind={ob.kind}
                                        oldContent={{ ...ob, ...ob.content, markdown: ob.markdown }}
                                        newContent={null}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 justify-end pt-1">
                              <button onClick={rejectImprovement} className="px-2 py-1 text-[11px] rounded-md border bg-background hover:bg-muted font-bold transition-colors">Rechazar</button>
                              <button onClick={applyImprovement} className="px-2 py-1 text-[11px] rounded-md bg-amber-500 text-white hover:bg-amber-600 font-bold shadow-sm transition-colors">Aplicar</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeTab === 'comments' ? (
                (() => {
                  const commentLogs = activities.filter((a) => a.action === 'card.commented');
                  if (commentLogs.length === 0) {
                    return (
                      <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2 opacity-70 font-medium">
                        <MessageSquare className="h-8 w-8 mb-2" />
                        <p>Aún no hay comentarios en esta tarjeta.</p>
                      </div>
                    );
                  }

                  return commentLogs.map((log) => {
                    const author = boardMembers.find((m) => m.id === log.actorId || m.userId === log.actorId);
                    return (
                      <div key={log.id} className="flex space-x-3 mt-4">
                        <img src={getUserAvatarUrl(author?.avatar_url, author?.email, 32)} alt={author?.name} className="h-8 w-8 rounded-full shrink-0 object-cover" />
                        <div className="bg-background border p-3 rounded-lg text-sm w-full">
                          <div className="font-semibold text-xs flex justify-between"><span>{author?.name || log.actorId}</span><span className="text-muted-foreground font-normal">{new Date(log.createdAt).toLocaleDateString()}</span></div>
                          <div className="mt-1">
                            <RichText
                              content={log.payload?.text || ""}
                              context={getResolverContext(contextDocs, teamBoards, boardMembers) as any}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="space-y-6 pr-1">
                  {groupedActivities.length === 0 && (
                    <div className="h-40 flex flex-col items-center justify-center text-muted-foreground text-xs space-y-2 opacity-60 font-medium">
                      <HistoryIcon className="h-8 w-8 mb-2" />
                      <p>No hay actividad reciente.</p>
                    </div>
                  )}
                  {groupedActivities.map(group => {
                    const a = group[0];
                    const theme = getActionTheme(a.action);
                    const Icon = theme.icon;
                    const author = boardMembers.find(m => m.id === a.actorId || m.userId === a.actorId);
                    const changes = (a.payload as any)?.changes || {};
                    const changedFields = Object.keys(changes).map(k => fieldLabels[k] || k).join(", ");
                    const resolverContext = getResolverContext(contextDocs, teamBoards, boardMembers);

                    return (
                      <div key={a.id} className="relative pl-6 pb-2 border-l border-border/40 last:border-0 group">
                        <div className="absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full bg-border ring-2 ring-background group-hover:bg-accent transition-colors" />
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3 w-3 text-muted-foreground/60" />
                            <div className="flex items-center gap-1 group/badge relative">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border shadow-sm ${theme.badgeClass}`}>
                                {theme.badge}
                                {group.length > 1 && ` x${group.length}`}
                              </span>
                              {group.length > 1 && (
                                <button
                                  onClick={() => {
                                    setSelectedActivityGroup(group);
                                    setIsActivityModalOpen(true);
                                  }}
                                  className="p-0.5 hover:bg-muted rounded-full transition-colors relative group/info"
                                  title="Click para ver historial detallado"
                                >
                                  <Info className="h-2.5 w-2.5 text-muted-foreground/60" />

                                  <div className="absolute left-full ml-2 top-0 z-50 invisible group-hover/info:visible bg-card border border-border shadow-xl rounded-lg p-2 min-w-32 animate-in fade-in zoom-in-95 duration-150">
                                    <div className="text-[9px] font-bold uppercase tracking-tight text-muted-foreground/80 mb-1 border-b border-border/40 pb-1">Resumen de Cambios</div>
                                    <div className="space-y-1">
                                      {group.map((item, idx) => {
                                        const itemChanges = (item.payload as any)?.changes || {};
                                        const itemFields = Object.keys(itemChanges).map(k => fieldLabels[k] || k).join(", ");
                                        return (
                                          <div key={item.id} className="text-[8px] leading-tight text-foreground/80 flex items-start gap-1">
                                            <span className="text-muted-foreground">•</span>
                                            <span>{itemFields || prettifyAction(item.action)}</span>
                                          </div>
                                        );
                                      }).slice(0, 5)}
                                      {group.length > 5 && <div className="text-[8px] text-muted-foreground italic pl-2">y {group.length - 5} más...</div>}
                                    </div>
                                  </div>
                                </button>
                              )}
                            </div>
                            <time className="text-[9px] text-muted-foreground font-medium ml-auto">
                              {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </time>
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs text-foreground/80 leading-relaxed">
                              <span className="font-bold text-foreground">{author?.name || a.actorId}</span>
                              <span className="text-muted-foreground/80"> {prettifyAction(a.action)}</span>
                            </p>

                            {changedFields && (
                              <p className="text-[10px] bg-muted/30 px-2 py-1 rounded border border-border/30 text-muted-foreground italic">
                                Campos: {changedFields}
                              </p>
                            )}

                            {(a.payload as any)?.text && (
                              <div className="text-[10px] text-muted-foreground px-2 border-l-2 border-border/50 bg-background/30 py-0.5">
                                <RichText content={(a.payload as any).text} context={resolverContext} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-background/50 shrink-0 relative">
              <div className="relative">
                <ReferenceTokenInput
                  placeholder={activeTab === 'copilot' ? "Pregunta algo a la IA o usa @..." : (canComment ? "Escribe un comentario o menciona con @..." : "No tienes permiso para comentar")}
                  value={newComment}
                  onChange={setNewComment}
                  onSubmit={() => {
                    void handleAddComment();
                  }}
                  disabled={activeTab !== 'copilot' && !canComment}
                  documents={contextDocs as any}
                  boards={teamBoards as any}
                  users={boardMembers.map((m: any) => ({
                    id: m.id || m.userId,
                    name: m.displayName || m.name || m.email || m.username || "User",
                    avatarUrl: m.avatarUrl || m.avatar_url || null,
                  }))}
                  activeBricks={localBlocks as any}
                  className="w-full"
                  inputClassName={`rounded-lg min-h-[56px] py-2 pr-10 leading-relaxed ${activeTab === 'copilot' ? 'focus:border-amber-500/50 ring-amber-500/10' : 'focus:border-primary/50'}`}
                />
                <button onClick={handleAddComment} disabled={!newComment.trim() || isImprovingDescription || isSubmittingComment || (activeTab !== 'copilot' && !canComment)} className={`absolute right-2 bottom-2 p-1.5 rounded-md transition-colors ${activeTab === 'copilot' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                  {(isImprovingDescription || isSubmittingComment) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CornerDownRight className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedActivityGroup && (
        <ActivityLogModal
          isOpen={isActivityModalOpen}
          onClose={() => setIsActivityModalOpen(false)}
          title={prettifyAction(selectedActivityGroup[0].action)}
          activities={selectedActivityGroup}
          teamMembers={boardMembers}
          teamDocs={contextDocs}
          allAvailableTags={[]}
          getActionTheme={getActionTheme}
          prettifyAction={prettifyAction}
          fieldLabels={fieldLabels}
          getResolverContext={getResolverContext}
        />
      )}
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
