"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, AlignLeft, Image as ImageIcon, CheckSquare, MessageSquare, Plus, GripVertical, FileText, CornerDownRight, Calendar, Tag as TagIcon, Users, UserPlus, Sparkles, Loader2, Bot, Info, History as HistoryIcon, RefreshCcw, Trash2, Layout, CheckCircle2, Search } from "lucide-react";
import * as diff from "diff";
import { updateCard, addCardTag, removeCardTag, addCardAssignee, removeCardAssignee, createCardBrick, updateCardBrick, deleteCardBrick, reorderCardBricks, createCard, getTagsByScope, getBoardMembers, getCardActivity, addCardComment, createTag, improveCardWithAi, updateList, uploadFile } from "../../lib/api/contracts";
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
import { listDocuments } from "@/lib/api/documents";
import { listTeamMembers } from "@/lib/api/contracts";
import { Fragment, type ReactNode, useMemo } from "react";
import { RichText } from "./rich-text";
import { ActivityLogModal } from "./activity-log-modal";
import { ReferenceTokenInput } from "./reference-token-input";

const fieldLabels: Record<string, string> = {
  title: "título",
  summary: "descripción",
  status: "estado",
  urgency_state: "urgencia",
  start_at: "inicio",
  due_at: "fecha límite",
};

function getActionTheme(action: string) {
  const lower = action.toLowerCase();
  if (lower === "card.tag_added") return { icon: TagIcon, badge: "Etiqueta", badgeClass: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30" };
  if (lower === "card.tag_removed") return { icon: TagIcon, badge: "Borrado", badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
  if (lower === "card.commented") return { icon: MessageSquare, badge: "Comentario", badgeClass: "bg-amber-500/15 text-amber-500 border-amber-500/30" };
  if (lower === "card.updated") return { icon: Edit2, badge: "Actualizado", badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  if (lower.includes("created")) return { icon: Sparkles, badge: "Creado", badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (lower.includes("deleted") || lower.includes("removed")) return { icon: Trash2, badge: "Eliminado", badgeClass: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (lower.includes("updated") || lower.includes("edited")) return { icon: RefreshCcw, badge: "Cambio", badgeClass: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
  return { icon: Layout, badge: "Actividad", badgeClass: "bg-accent/10 text-accent border-accent/20" };
}

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
  const { accessToken, user } = useSession();
  const [localTitle, setLocalTitle] = useState(card?.title || "");
  const [localDueAt, setLocalDueAt] = useState(normalizeDueDateInputValue(card?.dueAt));
  const [localTags, setLocalTags] = useState<any[]>(card?.tags || []);
  const normalizeAssignee = useCallback((raw: any) => ({
    id: raw?.id,
    name: raw?.name || raw?.displayName || raw?.email || 'Unknown user',
    email: raw?.email || '',
    avatar_url: raw?.avatar_url || raw?.avatarUrl || null,
  }), []);

  const [localAssignees, setLocalAssignees] = useState<any[]>((card?.assignees || []).map(normalizeAssignee));
  const [localBlocks, setLocalBlocks] = useState<BoardBrick[]>(card?.blocks || []);

  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [areTagsExpanded, setAreTagsExpanded] = useState(false);
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [activeTab, setActiveTab] = useState<'comments' | 'activity' | 'copilot'>(card?.id ? 'comments' : 'copilot');
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
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
  const [selectedActivityGroup, setSelectedActivityGroup] = useState<ActivityLogEntry[] | null>(null);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const tagsRowRef = useRef<HTMLDivElement>(null);
  const addTagButtonRef = useRef<HTMLButtonElement>(null);
  const tagChipRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const [visibleTagCount, setVisibleTagCount] = useState(0);

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
      setImproveError("Escribe un titulo o una descripcion antes de mejorar con IA.");
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
    if (!card?.id || !accessToken) return;
    const { action, payload } = actionData;
    try {
      if (action === 'CARD_RENAME') {
        await handleUpdateField('title', payload.title);
      } else if (action === 'TAG_ADD') {
        // Try to find existing tag by name
        let tag = availableTags.find(t => t.name.toLowerCase() === payload.tagName.toLowerCase());
        if (!tag) {
          tag = await createTag({
            scopeType: 'board',
            scopeId: boardId!,
            name: payload.tagName,
            color: payload.color || '#3b82f6',
            tagKind: 'custom'
          }, accessToken);
          setAvailableTags(prev => [...prev, tag]);
        }
        await handleAddTag(tag);
      } else if (action === 'CARD_MOVE') {
        await handleUpdateField('list_id', payload.targetListId);
      } else if (action === 'LIST_RENAME') {
        await updateList(boardId!, payload.listId || card.listId, { name: payload.title }, accessToken);
        window.dispatchEvent(new Event('board:refresh'));
      }
      setAiMessages(prev => [...prev, { role: 'assistant', content: `He ejecutado la acción: ${action}.` }]);
    } catch (err) {
      console.error("Failed to execute AI action", err);
      setAiMessages(prev => [...prev, { role: 'assistant', content: `No pude ejecutar la acción ${action}. Verifica los permisos.` }]);
    }
  };

  const parseAiActions = (text: string) => {
    const actions: any[] = [];
    const regex = /\[ACTION:([^\]]+)\]\s*([\s\S]*?)\s*\[\/ACTION\]/g;
    let match;
    let cleanText = text;
    while ((match = regex.exec(text)) !== null) {
      try {
        const payload = JSON.parse(match[2]);
        actions.push({ type: match[1], ...payload });
        cleanText = cleanText.replace(match[0], '');
      } catch (e) {
        console.error("Failed to parse AI action JSON", e);
      }
    }
    return { cleanText: cleanText.trim(), actions };
  };

  useEffect(() => {
    if (isOpen && boardId && accessToken) {
      getTagsByScope('board', boardId, accessToken).then((res) => {
        setAvailableTags(res);
      }).catch(console.error);

      getBoardMembers(boardId, accessToken).then((res) => {
        setBoardMembers(res.map((m: any) => ({
          id: m.id,
          name: m.displayName || m.email,
          email: m.email,
          avatar_url: m.avatarUrl || m.avatar_url,
          initials: (m.displayName || m.email || '??').substring(0, 2).toUpperCase()
        })));
      }).catch(console.error);

      if (card?.id) {
        getCardActivity(card.id, accessToken).then(setActivities).catch(console.error);
      }
    }
  }, [isOpen, boardId, accessToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hidden = localStorage.getItem('killio_hide_native_tag_suggestions') === '1';
    setHideNativeTagSuggestions(hidden);
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (card) {
        setLocalTitle(card.title || "");
        setLocalDueAt(normalizeDueDateInputValue(card.dueAt));
        setLocalTags(card.tags || []);
        setLocalAssignees((card.assignees || []).map(normalizeAssignee));
        setLocalBlocks(card.blocks || []);
      } else {
        setLocalTitle("New Card");
        setLocalDueAt("");
        setLocalTags([]);
        setLocalAssignees([]);
        setLocalBlocks([]);
      }
      setPendingImprovement(null);
      setImproveError(null);
      setTagSearch("");
      setNewTagColor('#3b82f6');
      setAreTagsExpanded(false);
    }
  }, [isOpen, card, normalizeAssignee]);

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

  const locale = getClientLocale();
  const getTagLabel = (tag: any) => {
    const rawName = String(tag?.name || tag || '');
    return translateNativeTagName(rawName, locale);
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

  const buildDraftBrick = useCallback((input: BrickMutationInput, position: number): BoardBrick => {
    const brickId = `tmp-${crypto.randomUUID()}`;
    if (input.kind === 'text') {
      return {
        id: brickId,
        kind: 'text',
        displayStyle: input.displayStyle,
        markdown: input.markdown,
        tasks: [],
        position,
        parentBlockId: null,
      } as BoardBrick;
    }
    if (input.kind === 'table') {
      return {
        id: brickId,
        kind: 'table',
        rows: input.rows || [],
        position,
        parentBlockId: null,
      } as BoardBrick;
    }
    if (input.kind === 'checklist') {
      return {
        id: brickId,
        kind: 'checklist',
        items: input.items || [],
        position,
        parentBlockId: null,
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
      } as BoardBrick;
    }
    if (input.kind === 'embed') {
      return {
        id: brickId,
        kind: 'embed',
        embedType: input.embedType,
        title: input.title,
        href: input.href,
        targetId: input.targetId,
        summary: input.summary,
        position,
        parentBlockId: null,
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
    if (brick.kind === 'embed') {
      return {
        kind: 'embed',
        embedType: brick.embedType,
        title: brick.title,
        href: brick.href,
        targetId: brick.targetId,
        summary: brick.summary,
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
    return null;
  }, []);

  const handleCreateBrick = async (input: BrickMutationInput) => {
    if (!card?.id || !accessToken) {
      setLocalBlocks(prev => {
        const nextPosition = (prev[prev.length - 1]?.position ?? 0) + 1000;
        return [...prev, buildDraftBrick(input, nextPosition)];
      });
      return;
    }
    try {
      const res = await createCardBrick(card.id, input, accessToken);
      setLocalBlocks(prev => [...prev, res.brick]);
    } catch (err) {
      console.error("Failed to create brick", err);
    }
  };

  const handleUpdateBrick = async (brickId: string, input: Partial<BrickMutationInput>) => {
    if (!card?.id || !accessToken) {
      setLocalBlocks(prev => prev.map(b => b.id === brickId ? { ...b, ...input } : b) as BoardBrick[]);
      return;
    }
    try {
      setLocalBlocks(prev => prev.map(b => b.id === brickId ? { ...b, ...input } : b) as BoardBrick[]);
      await updateCardBrick(card.id, brickId, input as any, accessToken);
    } catch (err) {
      console.error("Failed to update brick", err);
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
    if (!card?.id || !accessToken) return;

    const targetIndex = localBlocks.findIndex((block) => block.id === brickId);
    if (targetIndex < 0) return;

    const target = localBlocks[targetIndex] as any;
    if (target.kind !== 'text') return;

    const sourceMarkdown = typeof markdown === 'string' ? markdown : (target.markdown || '');
    const safeCursor = Math.max(0, Math.min(cursorOffset, sourceMarkdown.length));
    const beforeText = sourceMarkdown.slice(0, safeCursor);
    const afterText = sourceMarkdown.slice(safeCursor);

    try {
      const uploaded = await uploadFile(file, accessToken);

      const prefixIds = localBlocks.slice(0, targetIndex).map((b) => b.id);
      const suffixIds = localBlocks.slice(targetIndex + 1).map((b) => b.id);

      const nextBlockMap = new Map<string, BoardBrick>(localBlocks.map((b) => [b.id, b]));
      const middleIds: string[] = [];

      if (beforeText.trim().length > 0) {
        const updatedText = await updateCardBrick(card.id, brickId, {
          kind: 'text',
          displayStyle: target.displayStyle || 'paragraph',
          markdown: beforeText,
        } as BrickMutationInput, accessToken);
        nextBlockMap.set(brickId, updatedText.brick);
        middleIds.push(brickId);
      } else {
        await deleteCardBrick(card.id, brickId, accessToken);
        nextBlockMap.delete(brickId);
      }

      const mediaBrick = await createCardBrick(card.id, {
        kind: 'media',
        mediaType: 'image',
        title: file.name || 'Imagen',
        url: uploaded.url,
        mimeType: file.type || null,
        sizeBytes: Number.isFinite(file.size) ? file.size : null,
        caption: null,
        assetId: uploaded.key || null,
      }, accessToken);
      nextBlockMap.set(mediaBrick.brick.id, mediaBrick.brick);
      middleIds.push(mediaBrick.brick.id);

      if (afterText.trim().length > 0) {
        const trailingText = await createCardBrick(card.id, {
          kind: 'text',
          displayStyle: target.displayStyle || 'paragraph',
          markdown: afterText,
        }, accessToken);
        nextBlockMap.set(trailingText.brick.id, trailingText.brick);
        middleIds.push(trailingText.brick.id);
      }

      const finalIds = [...prefixIds, ...middleIds, ...suffixIds];
      await reorderCardBricks(card.id, { clientId: crypto.randomUUID(), brickIds: finalIds }, accessToken);

      const reordered = finalIds
        .map((id) => nextBlockMap.get(id))
        .filter(Boolean) as BoardBrick[];
      reordered.forEach((block, index) => {
        block.position = index;
      });
      setLocalBlocks(reordered);
    } catch (err) {
      console.error('Failed to paste image into text block', err);
    }
  }, [card?.id, accessToken, localBlocks]);

  useEffect(() => {
    if (!isOpen) return;
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
    const boardMember = boardMembers.find((member) => member.id === user.id);
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
    if (!newComment.trim() || !card?.id || !accessToken) return;

    if (activeTab === 'copilot') {
      const userMsg = newComment.trim();
      setAiMessages(prev => [...prev, { role: 'user', content: userMsg }]);
      setNewComment("");

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
    }
  };

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const handleUpdateField = useCallback((field: string, value: any, instant: boolean = true) => {
    if (field === 'title') setLocalTitle(value);
    if (field === 'due_at') setLocalDueAt(value);
    if (!card?.id || !accessToken) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const doUpdate = async () => {
      try {
        const payload = withListContext({ [field]: (value === null || value === "") ? null : value });
        await updateCard(card.id, payload, accessToken);
        // Removed legacy description/summary refresh logic
        router.refresh();
        window.dispatchEvent(new Event('board:refresh'));
      } catch (err) {
        console.error("Failed to update card", err);
      }
    };
    if (instant) doUpdate();
    else debounceTimer.current = setTimeout(doUpdate, 500);
  }, [card?.id, accessToken]);

  const submitCreate = async () => {
    if (!listId || !accessToken || isCreating) return;
    setIsCreating(true);
    try {
      const createdCard = await createCard({
        listId,
        title: localTitle || "New Card",
        dueAt: localDueAt || undefined,
        urgency: "normal",
        tags: localTags.map(t => t.id),
        assignees: localAssignees.map(a => a.id)
      }, accessToken);

      if (createdCard?.id && localBlocks.length > 0) {
        const createdBrickIds: string[] = [];
        for (const block of localBlocks) {
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
    const localizedName = translateNativeTagName(t.name || '', locale).toLowerCase();
    return rawName.includes(normalizedTagSearch) || localizedName.includes(normalizedTagSearch);
  });

  const nativeSuggestionsToShow = DEFAULT_NATIVE_TAG_SUGGESTIONS.filter((suggestion) => {
    const suggestionLabel = translateNativeTagName(suggestion.key, locale).toLowerCase();
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
    const labels: Record<string, string> = { title: 'titulo', status: 'estado', urgency_state: 'urgencia', start_at: 'inicio', due_at: 'fecha limite' };
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
    const docIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`;
    const boardIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`;

    const lines = content.split(/\r?\n/);
    return lines.map((line, index) => {
      const richParts = ReferenceResolver.renderRich(line, { documents: teamDocs, boards: teamBoards, users: boardMembers } as any);
      const renderedLine = richParts.map((part, i) => {
        if (typeof part === 'string') return part;

        if (part.type === 'mention') {
          const { mentionType: type, name } = part;
          const isUser = type === 'user';
          return (
            <span key={i} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${isUser ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-accent/10 border-accent/20 text-accent'
              }`}>
              {type === 'doc' && <span dangerouslySetInnerHTML={{ __html: docIcon }} />}
              {type === 'board' && <span dangerouslySetInnerHTML={{ __html: boardIcon }} />}
              {isUser && "@"}
              {name}
            </span>
          );
        }

        if (part.type === 'deep') {
          return (
            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border bg-amber-500/10 border-amber-500/20 text-amber-600">
              {part.label}
            </span>
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
    return { documents: docs, boards, users: members };
  };

  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6 overflow-hidden" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="relative w-full max-w-5xl rounded-2xl border border-border/80 bg-background shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-border bg-card/50">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <span className="hover:text-foreground cursor-pointer transition-colors">{boardName || "Board"}</span>
            <span className="text-border">/</span>
            <span className="hover:text-foreground cursor-pointer transition-colors">{listName || "List"}</span>
            <span className="text-border">/</span>
            <span className="font-semibold text-foreground truncate max-w-[200px]">{localTitle || card?.title || "Untitled Card"}</span>
          </div>
          <div className="flex items-center space-x-2">
            {!card?.id && (
              <button onClick={submitCreate} disabled={isCreating} className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50">
                {isCreating ? "Creating..." : "Create"}
              </button>
            )}
            <button onClick={handleClose} className="rounded-full p-1.5 hover:bg-accent/10 hover:text-foreground transition-colors text-muted-foreground"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          <div className="flex-1 overflow-y-auto p-6 md:p-10 hide-scrollbar border-r border-border min-h-[500px]">
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="group relative">
                <h1 ref={titleRef} className="text-3xl md:text-3xl font-bold tracking-tight text-foreground outline-none focus:border-accent pl-2 -ml-2 transition-colors" contentEditable suppressContentEditableWarning onInput={e => setLocalTitle(e.currentTarget.textContent || "")} onBlur={e => handleUpdateField('title', e.currentTarget.textContent || "")}>{localTitle}</h1>
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
                                  <span>{translateNativeTagName(suggestion.key, locale)}</span>
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
                    <button onClick={() => setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen)} className="h-6 w-6 rounded-full border border-dashed flex items-center justify-center ml-1"><UserPlus className="h-3 w-3" /></button>
                  </div>
                </div>

                <div className="mt-8">
                  <h3 className="font-semibold text-lg text-foreground">Content</h3>
                </div>

                <div className="mt-4">
                  <UnifiedBrickList
                    bricks={localBlocks}
                    canEdit={!readonly}
                    documents={teamDocs}
                    boards={teamBoards}
                    users={boardMembers}
                    addableKinds={['text', 'table', 'checklist', 'image']}
                    onAddBrick={async (kind) => {
                      let input: BrickMutationInput;
                      if (kind === 'checklist') {
                        input = { kind: 'checklist', items: [{ id: crypto.randomUUID(), label: 'Nueva tarea', checked: false }] };
                      } else if (kind === 'table') {
                        input = { kind: 'table', rows: [['Encabezado 1', 'Encabezado 2'], ['', '']] };
                      } else if (kind === 'image') {
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
                      await handleCreateBrick(input);
                    }}
                    onUpdateBrick={handleUpdateBrick}
                    onDeleteBrick={handleDeleteBrick}
                    onReorderBricks={handleReorderBricks}
                    onPasteImageInTextBrick={handlePasteImageInTextBrick}
                  />
                </div>


              </div>
            </div>
          </div>

          <div className="w-full md:w-80 flex flex-col bg-card/20 border-t md:border-t-0 z-10">
            <div className="p-4 border-b flex space-x-4 text-[11px] uppercase tracking-wider font-bold shrink-0 bg-background/50 overflow-x-auto hide-scrollbar">
              <button onClick={() => setActiveTab('copilot')} className={`pb-1 whitespace-nowrap transition-colors ${activeTab === 'copilot' ? 'text-amber-500 border-b-2 border-amber-500' : 'text-muted-foreground hover:text-foreground'}`}>Copilot</button>
              <button onClick={() => setActiveTab('comments')} className={`pb-1 whitespace-nowrap transition-colors ${activeTab === 'comments' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>Comments</button>
              <button onClick={() => setActiveTab('activity')} className={`pb-1 whitespace-nowrap transition-colors ${activeTab === 'activity' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>Activity</button>
            </div>
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
                                context={{ documents: teamDocs, boards: teamBoards, users: boardMembers }}
                              />
                            </div>
                          </div>

                          {actions.map((action, actionIdx) => (
                            <div key={actionIdx} className="ml-11 mr-4 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2 animate-in fade-in slide-in-from-left-2 duration-300">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="text-[10px] uppercase font-black text-emerald-600/80 tracking-widest">Acción Sugerida</span>
                                </div>
                              </div>
                              <p className="text-[11px] font-semibold text-foreground/80">{action.explanation || "Realizar cambios en la tarjeta"}</p>
                              <div className="bg-background/50 rounded border border-emerald-500/10 p-2 text-[10px] font-mono whitespace-pre-wrap text-emerald-800/70">
                                {action.action}: {JSON.stringify(action.payload, null, 2)}
                              </div>
                              <button
                                onClick={() => handleAiAction(action)}
                                className="w-full py-1.5 px-3 rounded-md bg-emerald-500 text-white text-[10px] font-bold hover:bg-emerald-600 shadow-sm transition-all active:scale-[0.98]"
                              >
                                Confirmar y Ejecutar
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })}

                    {!pendingImprovement && (
                      <div className="flex flex-wrap gap-2 pt-2">
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
                            // Mocking a summary response or just adding to history
                            setAiMessages(prev => [...prev, { role: 'assistant', content: 'Esta tarjeta trata sobre: ' + localTitle + '. Contiene ' + localBlocks.length + ' bloques de contenido.' }]);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 text-primary border border-primary/10 rounded-full text-[11px] font-bold hover:bg-primary/10 transition-all"
                        >
                          <FileText className="w-3 h-3" />
                          Resumir
                        </button>
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
                activities.filter(a => a.action === 'card.commented').map(log => {
                  const author = boardMembers.find(m => m.id === log.actorId);
                  return (
                    <div key={log.id} className="flex space-x-3 mt-4">
                      <img src={getUserAvatarUrl(author?.avatar_url, author?.email, 32)} alt={author?.name} className="h-8 w-8 rounded-full shrink-0 object-cover" />
                      <div className="bg-background border p-3 rounded-lg text-sm w-full">
                        <div className="font-semibold text-xs flex justify-between"><span>{author?.name || log.actorId}</span><span className="text-muted-foreground font-normal">{new Date(log.createdAt).toLocaleDateString()}</span></div>
                        <div className="mt-1">
                          <RichText
                            content={log.payload?.text || ""}
                            context={{ documents: teamDocs, boards: teamBoards, users: boardMembers }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
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
                    const author = boardMembers.find(m => m.id === a.actorId);
                    const changes = (a.payload as any)?.changes || {};
                    const changedFields = Object.keys(changes).map(k => fieldLabels[k] || k).join(", ");
                    const resolverContext = getResolverContext(teamDocs, teamBoards, boardMembers);

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
                  placeholder={activeTab === 'copilot' ? "Pregunta algo a la IA o usa @..." : "Write a comment or @ mention..."}
                  value={newComment}
                  onChange={setNewComment}
                  onSubmit={() => {
                    void handleAddComment();
                  }}
                  documents={teamDocs as any}
                  boards={teamBoards as any}
                  users={boardMembers}
                  className="w-full"
                  inputClassName={`rounded-lg min-h-[56px] py-2 pr-10 leading-relaxed ${activeTab === 'copilot' ? 'focus:border-amber-500/50 ring-amber-500/10' : 'focus:border-primary/50'}`}
                />
                <button onClick={handleAddComment} disabled={!newComment.trim() || isImprovingDescription} className={`absolute right-2 bottom-2 p-1.5 rounded-md transition-colors ${activeTab === 'copilot' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                  {isImprovingDescription ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CornerDownRight className="w-3.5 h-3.5" />}
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
          teamDocs={teamDocs}
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