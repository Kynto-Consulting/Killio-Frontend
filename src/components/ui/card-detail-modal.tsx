"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, AlignLeft, Image as ImageIcon, CheckSquare, MessageSquare, Plus, GripVertical, FileText, CornerDownRight, Calendar, Tag as TagIcon, Users, UserPlus, Sparkles, Loader2 } from "lucide-react";
import * as diff from "diff";
import { updateCard, addCardTag, removeCardTag, addCardAssignee, removeCardAssignee, createCardBrick, updateCardBrick, deleteCardBrick, reorderCardBricks, createCard, getTagsByScope, getBoardMembers, getCardActivity, addCardComment, createTag, improveCardWithAi } from "../../lib/api/contracts";
import type { BoardBrick, BrickMutationInput } from "../../lib/api/contracts";
import { UnifiedBrickList } from "../bricks/unified-brick-list";
import { useSession } from "../providers/session-provider";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getUserAvatarUrl } from "../../lib/gravatar";
import { DEFAULT_NATIVE_TAG_SUGGESTIONS, getClientLocale, NATIVE_PRIORITY_TAG_KEY, translateNativeTagName } from "../../lib/native-tags";

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
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');
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
  } | null>(null);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [hideNativeTagSuggestions, setHideNativeTagSuggestions] = useState(false);

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

    try {
      const { scope, scopeId } = resolveAiScope();
      const improved = await improveCardWithAi(
        {
          scope,
          scopeId,
          currentTitle: sourceTitle,
          currentDescription: sourceSummaryText || undefined,
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
      });
    } catch (err) {
      console.error("Failed to improve card with AI", err);
      setImproveError("No se pudo mejorar el texto con IA en este momento.");
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
      const textBricksData = pendingImprovement.bricks.filter(b => b.kind === 'text');
      const otherBricksData = pendingImprovement.bricks.filter(b => b.kind !== 'text');

      const existingTextBricks = localBlocks.filter(b => b.kind === 'text');

      if (existingTextBricks.length > 0 && textBricksData.length > 0) {
        await handleUpdateBrick(existingTextBricks[0].id, { markdown: textBricksData[0].content.markdown });
        for (const b of [...textBricksData.slice(1), ...otherBricksData]) {
          await handleCreateBrick({
            kind: b.kind,
            markdown: b.content.markdown || '',
            items: b.content.items || [],
            displayStyle: 'paragraph'
          });
        }
      } else {
        for (const b of pendingImprovement.bricks) {
          await handleCreateBrick({
            kind: b.kind,
            markdown: b.content.markdown || '',
            items: b.content.items || [],
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

  const handleCreateBrick = async (input: BrickMutationInput) => {
    if (!card?.id || !accessToken) return;
    try {
      const res = await createCardBrick(card.id, input, accessToken);
      setLocalBlocks(prev => [...prev, res.brick]);
    } catch (err) {
      console.error("Failed to create brick", err);
    }
  };

  const handleUpdateBrick = async (brickId: string, input: Partial<BrickMutationInput>) => {
    if (!card?.id || !accessToken) return;
    try {
      setLocalBlocks(prev => prev.map(b => b.id === brickId ? { ...b, ...input } : b) as BoardBrick[]);
      await updateCardBrick(card.id, brickId, input as any, accessToken);
    } catch (err) {
      console.error("Failed to update brick", err);
    }
  };

  const handleDeleteBrick = async (brickId: string) => {
    if (!card?.id || !accessToken) return;
    try {
      setLocalBlocks(prev => prev.filter(b => b.id !== brickId));
      await deleteCardBrick(card.id, brickId, accessToken);
    } catch (err) {
      console.error("Failed to delete brick", err);
    }
  };

  const handleReorderBricks = async (brickIds: string[]) => {
    if (!card?.id || !accessToken) return;
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
      await createCard({
        listId,
        title: localTitle || "New Card",
        dueAt: localDueAt || undefined,
        urgency: "normal",
        tags: localTags.map(t => t.id),
        assignees: localAssignees.map(a => a.id)
      }, accessToken);
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

  const ACTIVITY_GROUP_WINDOW_MS = 35 * 60 * 1000;
  const groupedActivities = (() => {
    const groups: any[][] = [];
    for (const log of activities) {
      const lastGroup = groups[groups.length - 1];
      const previous = lastGroup?.[lastGroup.length - 1];
      if (!lastGroup || !previous) { groups.push([log]); continue; }
      const sameAction = String(previous.action || '') === String(log.action || '');
      const sameActor = String(previous.actorId || '') === String(log.actorId || '');
      const prevTs = new Date(previous.createdAt).getTime();
      const currTs = new Date(log.createdAt).getTime();
      if (sameAction && sameActor && Math.abs(prevTs - currTs) <= ACTIVITY_GROUP_WINDOW_MS) lastGroup.push(log);
      else groups.push([log]);
    }
    return groups;
  })();

  const formatGroupedActivity = (group: any[]) => {
    const head = group[0];
    const base = formatActivity(head);
    if (group.length === 1) return { ...base, groupedMeta: '' };
    const spanMin = Math.max(1, Math.round(Math.abs(new Date(head.createdAt).getTime() - new Date(group[group.length - 1].createdAt).getTime()) / 60000));
    return { ...base, message: `${base.message} (${group.length} veces)`, groupedMeta: `${group.length} eventos en ${spanMin} min` };
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
                  <div className="flex items-center space-x-2"><Calendar className="w-4 h-4" /><span>{new Date(card.updatedAt || card.createdAt || new Date()).toLocaleString()}</span></div>
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
                      <div className="absolute top-full left-0 mt-2 w-72 bg-popover border rounded-lg shadow-xl z-50 p-3 space-y-2">
                        <input type="text" placeholder="Buscar o crear tag..." value={tagSearch} onChange={e => setTagSearch(e.target.value)} className="w-full bg-background border rounded-md px-3 py-1.5 text-xs outline-none" autoFocus />
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {filteredAvailableTags.map(tag => (
                            <button key={tag.id} onClick={() => handleAddTag(tag)} className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent rounded flex items-center space-x-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: normalizeColor(tag.color) }} />
                              <span>{getTagLabel(tag)}</span>
                            </button>
                          ))}
                        </div>
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

                <div className="mt-8 flex justify-between items-center group/ai">
                  <h3 className="font-semibold text-lg text-foreground">Content</h3>
                  <button onClick={handleImproveDescriptionWithAi} disabled={isImprovingDescription} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 font-medium rounded-md transition-colors disabled:opacity-50">
                    {isImprovingDescription ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Mejorar con IA
                  </button>
                </div>

                <div className="mt-4">
                  <UnifiedBrickList bricks={localBlocks} canEdit={!!card?.id} documents={teamDocs} boards={teamBoards} onAddBrick={async (kind) => {
                    let input: any;
                    if (kind === 'checklist') input = { kind: 'checklist', items: [{ id: crypto.randomUUID(), label: 'Nueva tarea', checked: false }] };
                    else input = { kind: 'text', displayStyle: 'paragraph', markdown: '' };
                    handleCreateBrick(input);
                  }} onUpdateBrick={handleUpdateBrick} onDeleteBrick={handleDeleteBrick} onReorderBricks={handleReorderBricks} />
                </div>

                {pendingImprovement && (
                  <div className="mt-4 rounded-xl border border-accent/30 bg-card/90 p-4 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between"><p className="text-sm font-semibold">Vista previa de mejora IA</p></div>
                    <div className="rounded-lg border bg-background/70 p-3 space-y-3">
                      <div><p className="text-[11px] uppercase text-muted-foreground mb-1">Titulo sugerido</p><p className="text-sm font-semibold">{pendingImprovement.title}</p></div>
                      <div>
                        <p className="text-[11px] uppercase text-muted-foreground mb-1">Cambios sugeridos</p>
                        <div className="rounded-lg border bg-background/50 overflow-hidden font-mono text-[13px]">
                          {diff.diffLines(pendingImprovement.originalText || "", pendingImprovement.diffText || "").map((part, i) => (
                            <div key={i} className={`${part.added ? 'bg-emerald-500/20 text-emerald-300' : part.removed ? 'bg-rose-500/20 text-rose-300' : 'text-foreground/70'} px-3 py-0.5 flex gap-2`}>
                              <span className="opacity-50 w-3 shrink-0">{part.added ? '+' : part.removed ? '-' : ' '}</span>
                              <span className="whitespace-pre-wrap">{part.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={rejectImprovement} className="px-3 py-1.5 text-sm rounded-md border hover:bg-muted font-medium">No, mantener lo mio</button>
                      <button onClick={applyImprovement} className="px-3 py-1.5 text-sm rounded-md bg-accent text-accent-foreground hover:bg-accent/90 font-medium">Si, aplicar mejoras</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="w-full md:w-80 flex flex-col bg-card/20 border-t md:border-t-0 z-10">
            <div className="p-4 border-b flex space-x-6 text-sm font-medium shrink-0 bg-background/50">
              <button onClick={() => setActiveTab('comments')} className={`pb-1 ${activeTab === 'comments' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground'}`}>Comments</button>
              <button onClick={() => setActiveTab('activity')} className={`pb-1 ${activeTab === 'activity' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground'}`}>Activity</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'comments' ? (
                activities.filter(a => a.action === 'card.commented').map(log => {
                  const author = boardMembers.find(m => m.id === log.actorId);
                  return (
                    <div key={log.id} className="flex space-x-3 mt-4">
                      <img src={getUserAvatarUrl(author?.avatar_url, author?.email, 32)} alt={author?.name} className="h-8 w-8 rounded-full shrink-0 object-cover" />
                      <div className="bg-background border p-3 rounded-lg text-sm w-full">
                        <div className="font-semibold text-xs flex justify-between"><span>{author?.name || log.actorId}</span><span className="text-muted-foreground font-normal">{new Date(log.createdAt).toLocaleDateString()}</span></div>
                        <p className="text-foreground/90 whitespace-pre-wrap mt-1">{log.payload?.text}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="space-y-4">
                  {groupedActivities.map(group => {
                    const log = group[0];
                    const author = boardMembers.find(m => m.id === log.actorId);
                    const formatted = formatGroupedActivity(group);
                    return (
                      <div key={log.id} className="p-3 rounded-lg border bg-background shadow-sm">
                        <div className="flex justify-between text-xs mb-1"><strong>{author?.name || log.actorId}</strong><span>{new Date(log.createdAt).toLocaleDateString()}</span></div>
                        <div className="text-xs">{formatted.message}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-background/50 shrink-0">
              <div className="relative">
                <textarea placeholder="Write a comment..." className="w-full bg-background border rounded-lg px-3 py-2 pr-10 text-sm outline-none resize-none" rows={2} value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAddComment())} />
                <button onClick={handleAddComment} disabled={!newComment.trim()} className="absolute right-2 bottom-2 p-1.5 bg-primary text-primary-foreground rounded-md"><CornerDownRight className="w-3 h-3" /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
