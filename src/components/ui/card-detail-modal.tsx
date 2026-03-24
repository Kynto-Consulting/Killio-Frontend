"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X, AlignLeft, Image as ImageIcon, CheckSquare, MessageSquare, Plus, GripVertical, FileText, CornerDownRight, Calendar, Tag as TagIcon, Users, UserPlus, Sparkles, Loader2 } from "lucide-react";
import { updateCard, addCardTag, removeCardTag, addCardAssignee, removeCardAssignee, createCardBrick, updateCardBrick, deleteCardBrick, reorderCardBricks, createCard, getTagsByScope, getBoardMembers, getCardActivity, addCardComment, createTag, improveCardWithAi } from "../../lib/api/contracts";
import type { BoardBrick } from "../../lib/api/contracts";
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
  boardId
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  card?: any;
  listId?: string;
  listName?: string;
  boardName?: string;
  boardId?: string;
}) {
  const { accessToken, user } = useSession();
  const [localTitle, setLocalTitle] = useState(card?.title || "");
  const [localSummary, setLocalSummary] = useState(card?.summary || "");
  const [localDueAt, setLocalDueAt] = useState(normalizeDueDateInputValue(card?.dueAt));
  const [localTags, setLocalTags] = useState<any[]>(card?.tags || []);
  const normalizeAssignee = useCallback((raw: any) => ({
    id: raw?.id,
    name: raw?.name || raw?.displayName || raw?.email || 'Unknown user',
    email: raw?.email || '',
    avatar_url: raw?.avatar_url || raw?.avatarUrl || null,
  }), []);

  const [localAssignees, setLocalAssignees] = useState<any[]>((card?.assignees || []).map(normalizeAssignee));

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
    summaryHtml: string;
  } | null>(null);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [hideNativeTagSuggestions, setHideNativeTagSuggestions] = useState(false);

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
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

  const htmlToPlainText = (html: string) => {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();
  };

  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  const plainTextToHtml = (text: string) => {
    if (!text.trim()) return "";
    return escapeHtml(text).replace(/\n/g, "<br />");
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

  const normalizeSectionTitle = (key: string) => {
    const compact = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!compact) return "Seccion";
    return compact.charAt(0).toUpperCase() + compact.slice(1);
  };

  const renderStructuredValueHtml = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '<p class="text-sm text-muted-foreground">No especificado en el texto original.</p>';
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return '<p class="text-sm text-muted-foreground">No especificado en el texto original.</p>';
      }

      const items = value
        .map((item) => `<li>${escapeHtml(normalizeAiText(item))}</li>`)
        .join("");
      return `<ul class="list-disc pl-5 space-y-1 text-sm text-foreground">${items}</ul>`;
    }

    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        return '<p class="text-sm text-muted-foreground">No especificado en el texto original.</p>';
      }

      const rows = entries
        .map(([k, v]) => `<li><strong>${escapeHtml(normalizeSectionTitle(k))}:</strong> ${escapeHtml(normalizeAiText(v))}</li>`)
        .join("");
      return `<ul class="list-disc pl-5 space-y-1 text-sm text-foreground">${rows}</ul>`;
    }

    const text = normalizeAiText(value).trim();
    if (!text) {
      return '<p class="text-sm text-muted-foreground">No especificado en el texto original.</p>';
    }
    return `<p class="text-sm text-foreground whitespace-pre-wrap">${escapeHtml(text)}</p>`;
  };

  const structuredObjectToHtml = (obj: Record<string, unknown>): string => {
    const entries = Object.entries(obj);
    if (entries.length === 0) return "";

    return entries
      .map(([key, value]) => {
        return [
          '<section class="mb-3">',
          `<p class="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">${escapeHtml(normalizeSectionTitle(key))}</p>`,
          renderStructuredValueHtml(value),
          '</section>',
        ].join("");
      })
      .join("");
  };

  const formatAiDescriptionToHtml = (value: unknown, fallbackText: string): string => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const html = structuredObjectToHtml(value as Record<string, unknown>);
      if (html.trim()) return html;
    }

    const text = normalizeAiText(value).trim();
    if (!text) return plainTextToHtml(fallbackText);

    const maybeJson = text.replace(/^```json\n?|```$/gm, "").trim();
    if (maybeJson.startsWith("{") && maybeJson.endsWith("}")) {
      try {
        const parsed = JSON.parse(maybeJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const html = structuredObjectToHtml(parsed as Record<string, unknown>);
          if (html.trim()) return html;
        }
      } catch {
        // Fall through to plain text format if parsing fails.
      }
    }

    return plainTextToHtml(text);
  };

  const handleImproveDescriptionWithAi = async () => {
    if (!accessToken || isImprovingDescription) return;

    const sourceTitle = readCurrentTitle();
    const sourceSummaryHtml = isEditingDescription && editorRef.current ? editorRef.current.innerHTML : (localSummary || "");
    const sourceSummaryText = htmlToPlainText(sourceSummaryHtml);

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
      const improvedSummaryHtml = formatAiDescriptionToHtml(improved?.description, sourceSummaryText);

      setPendingImprovement({
        title: improvedTitle,
        summaryHtml: improvedSummaryHtml,
      });
    } catch (err) {
      console.error("Failed to improve card with AI", err);
      setImproveError("No se pudo mejorar el texto con IA en este momento.");
    } finally {
      setIsImprovingDescription(false);
    }
  };

  const applyImprovement = async () => {
    if (!pendingImprovement) return;

    setLocalTitle(pendingImprovement.title);
    setLocalSummary(pendingImprovement.summaryHtml);
    setPendingImprovement(null);
    setImproveError(null);

    if (titleRef.current) {
      titleRef.current.textContent = pendingImprovement.title;
    }

    if (editorRef.current) {
      editorRef.current.innerHTML = pendingImprovement.summaryHtml;
    }

    if (card?.id && accessToken) {
      try {
        const payload = withListContext({
          title: pendingImprovement.title,
          summary: pendingImprovement.summaryHtml === "" ? null : pendingImprovement.summaryHtml,
        });
        await updateCard(card.id, payload, accessToken);
        router.refresh();
        window.dispatchEvent(new Event('board:refresh'));
      } catch (err) {
        console.error("Failed to apply AI improvement", err);
        setImproveError("No se pudo guardar automaticamente la mejora. Puedes intentar guardar manualmente.");
      }
    }
  };

  const rejectImprovement = () => {
    setPendingImprovement(null);
    setImproveError(null);
  };

  const handleSaveDescription = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      setLocalSummary(html);
      setIsEditingDescription(false);
      
      if (card?.id && accessToken) {
        try {
          const payload = withListContext({ summary: html === "" ? null : html });
          await updateCard(card.id, payload, accessToken);
          router.refresh();
      window.dispatchEvent(new Event('board:refresh'));

        } catch (err) {
          console.error("Failed to update summary", err);
        }
      }
    } else {
      setIsEditingDescription(false);
    }
  };

  const handlePasteDescription = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    let hasImage = false;
    for (const item of items) {
      if (item.type.indexOf('image') === 0) {
        hasImage = true;
        const blob = item.getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = `<img src="${event.target?.result}" class="my-4 max-w-full rounded-lg border border-border" />`;
            document.execCommand('insertHTML', false, img);
          };
          reader.readAsDataURL(blob);
        }
      }
    }
    if (hasImage) {
      e.preventDefault();
    }
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
        setLocalSummary(card.summary || "");
        setLocalDueAt(normalizeDueDateInputValue(card.dueAt));
        setLocalTags(card.tags || []);
        setLocalAssignees((card.assignees || []).map(normalizeAssignee));
      } else {
        setLocalTitle("New Card");
        setLocalSummary("");
        setLocalDueAt("");
        setLocalTags([]);
        setLocalAssignees([]);
      }
      setIsEditingDescription(!card?.id);
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

      if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
        return true;
      }

      if (target instanceof HTMLTextAreaElement) {
        return !target.readOnly && !target.disabled;
      }

      if (target instanceof HTMLInputElement) {
        return !target.readOnly && !target.disabled;
      }

      return false;
    };

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Backspace outside editable controls can trigger browser "back" and close the modal unexpectedly.
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
        nativeTag = await createTag(
          {
            scopeType: 'board',
            scopeId: boardId,
            name: suggestion.key,
            color: suggestion.color,
            tagKind: 'custom',
          },
          accessToken,
        );
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

  useEffect(() => {
    if (!isOpen) return;

    recalculateVisibleTags();
    const resizeHandler = () => recalculateVisibleTags();
    window.addEventListener('resize', resizeHandler);

    const observer = typeof ResizeObserver !== 'undefined' && tagsRowRef.current
      ? new ResizeObserver(() => recalculateVisibleTags())
      : null;

    if (observer && tagsRowRef.current) {
      observer.observe(tagsRowRef.current);
    }

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
    if (field === 'summary') setLocalSummary(value);
    if (field === 'due_at') setLocalDueAt(value);

    if (!card?.id || !accessToken) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const doUpdate = async () => {
      try {
        const payload = withListContext({ [field]: (value === null || value === "") ? null : value });
        await updateCard(card.id, payload, accessToken);
        router.refresh();
      window.dispatchEvent(new Event('board:refresh'));
      } catch (err) {
        console.error("Failed to update card", err);
      }
    };

    if (instant) {
      doUpdate();
    } else {
      debounceTimer.current = setTimeout(doUpdate, 500);
    }
  }, [card?.id, accessToken]);

  const submitCreate = async () => {
    if (!listId || !accessToken || isCreating) return;
    setIsCreating(true);

    let finalSummary = localSummary;
    if (isEditingDescription && editorRef.current) {
      finalSummary = editorRef.current.innerHTML;
    }

    try {
      const newCard = await createCard({
        listId,
        title: localTitle || "New Card",
        summary: finalSummary,
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
    if (isEditingDescription && editorRef.current && card?.id && accessToken) {
      const html = editorRef.current.innerHTML;
      try {
        const payload = withListContext({ summary: html === "" ? null : html });
        await updateCard(card.id, payload, accessToken);
      } catch (err) {
        console.error("Failed to update card summary on close", err);
      }
    }
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
    return {
      borderColor: `${color}66`,
      backgroundColor: `${color}22`,
      color,
    } as const;
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
      const created = await createTag(
        {
          scopeType: 'board',
          scopeId: boardId,
          name,
          color: newTagColor || pickColorForName(name),
          tagKind: 'custom',
        },
        accessToken,
      );

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
    const localizedName = getTagLabel(t).toLowerCase();
    return rawName.includes(normalizedTagSearch) || localizedName.includes(normalizedTagSearch);
  });

  const nativeSuggestionsToShow = DEFAULT_NATIVE_TAG_SUGGESTIONS.filter((suggestion) => {
    const suggestionLabel = translateNativeTagName(suggestion.key, locale).toLowerCase();
    const existsEquivalent = availableTags.some((t) => {
      const rawName = String(t?.name || '').trim().toLowerCase();
      const rawSlug = String(t?.slug || '').trim().toLowerCase();
      const localizedName = getTagLabel(t).trim().toLowerCase();

      if (rawName === suggestion.key.toLowerCase()) return true;
      if (rawSlug === suggestion.key.toLowerCase().replace(/\./g, '-')) return true;
      if (localizedName === suggestionLabel) return true;

      if (suggestion.key === NATIVE_PRIORITY_TAG_KEY) {
        return (
          rawName === 'prioridad' ||
          rawName === 'priority' ||
          rawSlug === 'prioridad' ||
          rawSlug === 'priority' ||
          rawSlug === 'tag-native-priority'
        );
      }

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
      summary: 'descripcion',
      status: 'estado',
      urgency_state: 'urgencia',
      start_at: 'inicio',
      due_at: 'fecha limite',
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
      case 'card.created':
        return {
          badge: 'Creada',
          badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          message: `Creo la card ${payload.title ? `"${payload.title}"` : `"${cardTitle}"`}`,
          detail: 'Se creo una nueva tarjeta',
          dotClass: 'border-emerald-400',
        };
      case 'card.updated':
        return {
          badge: 'Actualizada',
          badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
          message: `Actualizo la card "${cardTitle}"`,
          detail: formatActivityChanges(payload.changes as Record<string, { from: unknown; to: unknown }>),
          dotClass: 'border-blue-400',
        };
      case 'card.tag_added': {
        const tagName = resolveTagNameById(payload.tagId as string);
        return {
          badge: 'Tag agregado',
          badgeClass: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
          message: `Agrego el tag "${tagName}"`,
          detail: `En la card "${cardTitle}"`,
          dotClass: 'border-fuchsia-400',
        };
      }
      case 'card.tag_removed': {
        const tagName = resolveTagNameById(payload.tagId as string);
        return {
          badge: 'Tag removido',
          badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
          message: `Removio el tag "${tagName}"`,
          detail: `En la card "${cardTitle}"`,
          dotClass: 'border-rose-400',
        };
      }
      case 'card.commented':
        return {
          badge: 'Comentario',
          badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          message: `Comento en "${cardTitle}"`,
          detail: payload.text ? String(payload.text) : 'Nuevo comentario',
          dotClass: 'border-amber-400',
        };
      case 'brick.created':
        return {
          badge: 'Bloque creado',
          badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
          message: `Agrego un bloque ${payload.kind ? `(${payload.kind})` : ''}`.trim(),
          detail: `En la card "${cardTitle}"`,
          dotClass: 'border-cyan-400',
        };
      case 'brick.updated':
        return {
          badge: 'Bloque actualizado',
          badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
          message: `Actualizo un bloque ${payload.kind ? `(${payload.kind})` : ''}`.trim(),
          detail: `En la card "${cardTitle}"`,
          dotClass: 'border-sky-400',
        };
      case 'brick.deleted':
        return {
          badge: 'Bloque eliminado',
          badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
          message: 'Elimino un bloque de contenido',
          detail: `En la card "${cardTitle}"`,
          dotClass: 'border-orange-400',
        };
      case 'brick.reordered':
        return {
          badge: 'Orden cambiado',
          badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
          message: 'Reordeno los bloques de la card',
          detail: `En "${cardTitle}"`,
          dotClass: 'border-violet-400',
        };
      default:
        return {
          badge: 'Actividad',
          badgeClass: 'bg-muted text-muted-foreground border-border',
          message: String(log.action || 'Evento'),
          detail: '',
          dotClass: 'border-primary',
        };
    }
  };

  const ACTIVITY_GROUP_WINDOW_MS = 35 * 60 * 1000;

  const groupedActivities = (() => {
    const groups: any[][] = [];

    for (const log of activities) {
      const lastGroup = groups[groups.length - 1];
      const previous = lastGroup?.[lastGroup.length - 1];

      if (!lastGroup || !previous) {
        groups.push([log]);
        continue;
      }

      const sameAction = String(previous.action || '') === String(log.action || '');
      const sameActor = String(previous.actorId || '') === String(log.actorId || '');
      const previousAt = new Date(previous.createdAt).getTime();
      const currentAt = new Date(log.createdAt).getTime();
      const withinWindow = Number.isFinite(previousAt) && Number.isFinite(currentAt)
        ? Math.abs(previousAt - currentAt) <= ACTIVITY_GROUP_WINDOW_MS
        : false;

      if (sameAction && sameActor && withinWindow) {
        lastGroup.push(log);
      } else {
        groups.push([log]);
      }
    }

    return groups;
  })();

  const formatGroupedActivity = (group: any[]) => {
    const head = group[0];
    const base = formatActivity(head);

    if (group.length === 1) {
      return {
        ...base,
        groupedMeta: '',
      };
    }

    const oldest = group[group.length - 1];
    const newestTs = new Date(head.createdAt).getTime();
    const oldestTs = new Date(oldest.createdAt).getTime();
    const spanMinutes = Number.isFinite(newestTs) && Number.isFinite(oldestTs)
      ? Math.max(1, Math.round(Math.abs(newestTs - oldestTs) / 60000))
      : 35;

    const action = String(head?.action || '').toLowerCase();
    const groupedMeta = `${group.length} eventos en ${spanMinutes} min`;

    if (action === 'card.tag_added' || action === 'card.tag_removed') {
      const names = Array.from(new Set(group.map((item) => resolveTagNameById(item?.payload?.tagId as string)))).filter(Boolean);
      const verb = action === 'card.tag_added' ? 'Agrego' : 'Removio';
      const noun = action === 'card.tag_added' ? 'tags' : 'tags';
      return {
        ...base,
        message: `${verb} ${names.length} ${noun}`,
        detail: names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : ''),
        groupedMeta,
      };
    }

    if (action === 'card.updated') {
      return {
        ...base,
        message: `Actualizo la card ${group.length} veces`,
        detail: 'Cambios consecutivos agrupados',
        groupedMeta,
      };
    }

    if (action === 'card.commented') {
      return {
        ...base,
        message: `Comento ${group.length} veces`,
        detail: 'Mensajes consecutivos agrupados',
        groupedMeta,
      };
    }

    return {
      ...base,
      message: `${base.message} (${group.length} veces)`,
      groupedMeta,
    };
  };

  if (!isOpen) return null;

  const content = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-6 overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="relative w-full max-w-5xl rounded-2xl border border-border/80 bg-background shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
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
              <button
                onClick={submitCreate}
                disabled={isCreating}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
            )}
            <button
              onClick={handleClose}
              className="rounded-full p-1.5 hover:bg-accent/10 hover:text-foreground transition-colors text-muted-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body - Split View */}
        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          
          {/* Main Notion Body */}
          <div className="flex-1 overflow-y-auto p-6 md:p-10 hide-scrollbar border-r border-border min-h-[500px]">
            <div className="max-w-2xl mx-auto space-y-6">
              
              {/* Title Area */}
              <div className="group relative">
                <h1 
                  ref={titleRef}
                  className="text-3xl md:text-3xl font-bold tracking-tight text-foreground outline-none border-l-2 border-transparent focus:border-accent pl-2 -ml-2 transition-colors" 
                  contentEditable 
                  suppressContentEditableWarning
                  onInput={(e) => setLocalTitle(e.currentTarget.textContent || "")}
                  onBlur={(e) => handleUpdateField('title', e.currentTarget.textContent || "")}
                >
                  {localTitle}
                </h1>
                
                {/* Metadata Fields */}
                <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground border-b border-border/50 pb-4">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4" />
                      <span className="bg-transparent border-none text-sm outline-none focus:ring-1 focus:ring-accent rounded px-1 text-muted-foreground">{new Date(card.updatedAt || card.createdAt || new Date()).toLocaleString()}</span>

                  </div>

                  <div
                    className={`flex gap-1.5 relative min-w-0 flex-1 ${areTagsExpanded ? 'items-start flex-wrap' : 'items-center'}`}
                    ref={tagsRowRef}
                  >
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mr-1">
                      <TagIcon className="h-3 w-3" /> Tags
                    </span>

                    <div
                      className={`flex gap-1.5 min-w-0 ${areTagsExpanded ? 'flex-wrap overflow-visible' : 'items-center overflow-hidden'}`}
                    >
                    {visibleTags.map((tag: any) => (
                      <span
                        key={getTagKey(tag)}
                        ref={(el) => {
                          const key = getTagKey(tag);
                          if (el) tagChipRefs.current.set(key, el);
                          else tagChipRefs.current.delete(key);
                        }}
                        style={buildTagPillStyle(tag)}
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border group transition-all animate-in fade-in zoom-in-95 duration-200"
                      >
                        <span>{getTagLabel(tag)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag); }}
                          className="ml-1.5 opacity-50 group-hover:opacity-100 hover:text-destructive transition-all disabled:opacity-50"
                          title="Remove tag"
                          disabled={isAddingTag}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    </div>

                    {hiddenTags.length > 0 && (
                      <div className="shrink-0">
                        <button
                          type="button"
                          onClick={() => setAreTagsExpanded(true)}
                          className="inline-flex items-center h-6 px-2 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                          title="Mostrar todos los tags"
                        >
                          +{hiddenTags.length} tags
                        </button>
                      </div>
                    )}

                    <button
                      ref={addTagButtonRef}
                      onClick={(e) => { e.stopPropagation(); setIsTagDropdownOpen(prev => !prev); }}
                      className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-dashed border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-all hover:bg-secondary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Agregar tag"
                      disabled={isAddingTag || isCreatingTag}
                    >
                      {isAddingTag || isCreatingTag ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {isTagDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsTagDropdownOpen(false)} />
                        <div className="absolute top-full left-0 mt-2 w-72 bg-popover text-popover-foreground border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
                          <div className="p-3 border-b border-border/50 bg-muted/20 space-y-2">
                            <input
                              type="text"
                              placeholder="Buscar o crear tag..."
                              value={tagSearch}
                              onChange={e => setTagSearch(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && tagSearch.trim() && !isCreatingTag) {
                                  handleCreateTag();
                                }
                              }}
                              className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all placeholder:text-muted-foreground disabled:opacity-50"
                              autoFocus
                              disabled={isCreatingTag || isAddingTag}
                            />

                            {tagError && (
                              <div className="px-2 py-1.5 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs">
                                {tagError}
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Color</span>
                              <div className="flex items-center gap-1.5">
                                {tagColorPalette.map((hex) => (
                                  <button
                                    key={hex}
                                    type="button"
                                    onClick={() => setNewTagColor(hex)}
                                    className={`h-4 w-4 rounded-full border ${newTagColor === hex ? 'ring-2 ring-offset-1 ring-accent border-white' : 'border-white/20'}`}
                                    style={{ backgroundColor: hex }}
                                    title={hex}
                                  />
                                ))}
                                <input
                                  type="color"
                                  value={newTagColor}
                                  onChange={(e) => setNewTagColor(e.target.value)}
                                  className="h-5 w-5 rounded border border-border bg-transparent p-0"
                                  title="Custom color"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="max-h-[240px] overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-border">
                            {showNativeTagSuggestions ? (
                              <div className="mb-2 rounded-md border border-border/60 bg-muted/20 p-1.5">
                                <div className="mb-1.5 flex items-center justify-between px-1">
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Sugerencias</span>
                                  <button
                                    type="button"
                                    onClick={dismissNativeTagSuggestions}
                                    className="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent/20"
                                    title="Ocultar sugerencias"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                                <div className="space-y-1">
                                  {nativeSuggestionsToShow.map((suggestion) => (
                                    <button
                                      key={suggestion.key}
                                      onClick={() => handleSelectNativeSuggestion(suggestion)}
                                      disabled={isCreatingTag || isAddingTag}
                                      className="w-full text-left px-2 py-1.5 text-xs rounded-md border border-border bg-background hover:bg-muted/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <span className="font-medium">{translateNativeTagName(suggestion.key, locale)}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {tagSearch.trim().length > 0 && !availableTags.some((t: any) => t.name.toLowerCase() === tagSearch.trim().toLowerCase()) && !DEFAULT_NATIVE_TAG_SUGGESTIONS.some((s) => s.key === tagSearch.trim()) ? (
                              <button
                                onClick={handleCreateTag}
                                disabled={isCreatingTag || isAddingTag}
                                className="w-full text-left px-2.5 py-2 text-xs rounded-md border border-dashed border-accent/50 text-accent hover:bg-accent/10 mb-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
                              >
                                <span>Crear tag "{tagSearch.trim()}"</span>
                                {isCreatingTag && <Loader2 className="h-3 w-3 animate-spin" />}
                              </button>
                            ) : null}

                            {filteredAvailableTags.length === 0 ? (
                              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                                No hay tags.
                              </div>
                            ) : (
                              filteredAvailableTags.map(tag => {
                                const isSelected = localTags.some((t: any) => (t.id || t) === tag.id || (t.name || t) === tag.name);
                                return (
                                  <button
                                    key={tag.id}
                                    onClick={() => {
                                      if (!isSelected) handleAddTag(tag);
                                      else handleRemoveTag(tag);
                                    }}
                                    className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors mb-0.5 ${
                                      isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent hover:text-accent-foreground text-foreground/90'
                                    }`}
                                  >
                                    <div className="flex items-center space-x-2">
                                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: normalizeColor(tag.color) }} />
                                      <span>{getTagLabel(tag)}</span>
                                    </div>
                                    {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Assignees Area */}
                  <div className="flex items-center space-x-2 relative ml-auto">
                    <Users className="w-4 h-4" />
                    <div className="flex -space-x-2 overflow-hidden">
                      {localAssignees.map(user => (
                        <img 
                          key={user.id} 
                          src={getUserAvatarUrl(user.avatar_url, user.email, 24)}
                          alt={user.name || user.email}
                          title={user.name}
                          className="inline-block h-6 w-6 rounded-full border-2 border-background object-cover"
                        />
                      ))}
                    </div>
                    <button 
                      onClick={() => setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen)}
                      className="h-6 w-6 rounded-full border border-dashed border-border flex items-center justify-center hover:bg-accent/10 transition-colors ml-1"
                      title="Add Assignee"
                    >
                      <UserPlus className="h-3 w-3" />
                    </button>

                    {isAssigneeDropdownOpen && (
                      <div className="absolute top-full right-0 mt-1 w-48 bg-card border border-border rounded-md shadow-lg z-10 overflow-hidden">
                        <div className="p-2 border-b border-border text-xs font-semibold">Assign to...</div>
                        {user?.id && (
                          <div className="p-1 border-b border-border/60">
                            <button
                              onClick={assignCurrentUser}
                              className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent/10 rounded flex items-center justify-between text-foreground/90"
                            >
                              <span>Assign to me</span>
                              {localAssignees.some((assignee) => assignee.id === user.id) && <CheckSquare className="h-3 w-3 text-primary" />}
                            </button>
                          </div>
                        )}
                        <div className="max-h-40 overflow-y-auto p-1">
                            {boardMembers.map(user => {
                            const isSelected = localAssignees.some(a => a.id === user.id);
                            return (
                              <button
                                key={user.id}
                                onClick={() => toggleAssignee(user)}
                                className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent/10 rounded flex items-center justify-between text-foreground/90"
                              >
                                <div className="flex items-center space-x-2">
                                  <img 
                                    src={getUserAvatarUrl(user.avatar_url, user.email, 20)}
                                    alt={user.name}
                                    className="h-5 w-5 rounded-full object-cover border border-border/50"
                                  />
                                  <span>{user.name}</span>
                                </div>
                                {isSelected && <CheckSquare className="h-3 w-3 text-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 flex justify-between items-center">
                  <h3 className="font-semibold text-lg text-foreground">Description</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleImproveDescriptionWithAi}
                      disabled={isImprovingDescription}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isImprovingDescription ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Mejorar con IA
                    </button>
                    {!isEditingDescription && (
                      <button
                        onClick={() => setIsEditingDescription(true)}
                        className="px-3 py-1.5 text-sm bg-accent/20 hover:bg-accent/40 text-foreground font-medium rounded-md transition-colors border border-border"
                      >
                        Edit
                      </button>
                    )}
                    {isEditingDescription && (
                      <button
                        onClick={handleSaveDescription}
                        className="px-3 py-1.5 text-sm bg-primary text-primary-foreground font-medium rounded-md transition-colors hover:bg-primary/90"
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>
                {improveError && (
                  <div className="mt-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                    {improveError}
                  </div>
                )}
                <div className="mt-4">
                  {isEditingDescription ? (
                    <div 
                      ref={editorRef}
                      contentEditable 
                      onPaste={handlePasteDescription}
                      className="w-full min-h-[150px] p-4 bg-background border border-accent rounded-lg outline-none focus:ring-2 focus:ring-primary/20 text-foreground text-base leading-relaxed break-words whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: localSummary || '' }}
                    />
                  ) : (
                    <div 
                      className="w-full min-h-[100px] p-4 bg-background/50 border border-transparent rounded-lg text-foreground/90 text-base leading-relaxed break-words whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: localSummary || '<p class="text-muted-foreground italic">Add a deeper description...</p>' }}
                    />
                  )}
                </div>
                {pendingImprovement && (
                  <div className="mt-4 rounded-xl border border-accent/30 bg-card/90 p-4 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">Vista previa de mejora IA</p>
                      <span className="text-[11px] text-muted-foreground">No se aplica hasta que confirmes</span>
                    </div>
                    <div className="rounded-lg border border-border bg-background/70 p-3 space-y-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Titulo sugerido</p>
                        <p className="text-sm font-semibold text-foreground">{pendingImprovement.title}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Descripcion sugerida</p>
                        <div
                          className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: pendingImprovement.summaryHtml || '<span class="text-muted-foreground italic">Sin descripcion sugerida.</span>' }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={rejectImprovement}
                        className="px-3 py-1.5 text-sm rounded-md border border-border bg-background hover:bg-muted transition-colors font-medium"
                      >
                        No, mantener lo mio
                      </button>
                      <button
                        onClick={applyImprovement}
                        className="px-3 py-1.5 text-sm rounded-md bg-accent text-accent-foreground hover:bg-accent/90 transition-colors font-medium"
                      >
                        Si, aplicar mejoras
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Right Sidebar - Comments & Activity */}
          <div className="w-full md:w-80 flex flex-col bg-card/20 border-t md:border-t-0 z-10">
            <div className="p-4 border-b border-border flex space-x-6 text-sm font-medium shrink-0 bg-background/50 backdrop-blur-sm">
              <button 
                onClick={() => setActiveTab('comments')}
                className={`transition-colors flex items-center space-x-2 pb-1 ${activeTab === 'comments' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <MessageSquare className="h-4 w-4" />
                <span>Comments</span>
              </button>
              <button 
                onClick={() => setActiveTab('activity')}
                className={`transition-colors flex items-center space-x-2 pb-1 ${activeTab === 'activity' ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <AlignLeft className="h-4 w-4" />
                <span>Activity</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'comments' ? (
                <>
                  {activities.filter(a => a.action === 'card.commented').length === 0 && (
                    <div className="text-sm text-muted-foreground text-center mt-10 p-4 border border-dashed border-border rounded-lg bg-background/50">
                      No comments yet. Start a discussion!
                    </div>
                  )}
                  {activities.filter(a => a.action === 'card.commented').map(log => {
                    const author = boardMembers.find(m => m.id === log.actorId);
                    return (
                      <div key={log.id} className="flex space-x-3 mt-4 animate-in fade-in zoom-in-95 duration-200">
                         <img
                           src={getUserAvatarUrl(author?.avatar_url, author?.email, 32)}
                           alt={author?.name || 'User avatar'}
                           className="h-8 w-8 rounded-full shrink-0 border border-border/50 object-cover"
                         />
                        <div className="bg-background border border-border p-3 rounded-lg rounded-tl-none text-sm space-y-1 w-full">
                          <div className="font-semibold text-xs flex justify-between">
                            <span>{author?.name || log.actorId}</span>
                            <span className="text-muted-foreground font-normal ml-2">{new Date(log.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-foreground/90 whitespace-pre-wrap mt-1">{log.payload?.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  {groupedActivities.map((group) => {
                    const log = group[0];
                    const author = boardMembers.find(m => m.id === log.actorId);
                    const formatted = formatGroupedActivity(group);
                    return (
                    <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active mt-4">
                      <div className={`flex items-center justify-center w-4 h-4 rounded-full border bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow ml-3 md:ml-0 z-10 ${formatted.dotClass}`}></div>
                      <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-lg border border-border bg-background shadow-sm z-10">
                        <div className="flex items-start justify-between space-x-2 mb-1">
                          <div className="font-bold text-xs leading-5">{author?.name || log.actorId}</div>
                          <time className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleDateString()}</time>
                        </div>
                        <div className="mb-1">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${formatted.badgeClass}`}>
                            {formatted.badge}
                          </span>
                        </div>
                        <div className="text-xs text-foreground break-words leading-relaxed">{formatted.message}</div>
                        {formatted.groupedMeta ? (
                          <div className="text-[11px] text-muted-foreground break-words mt-1">{formatted.groupedMeta}</div>
                        ) : null}
                        {formatted.detail ? (
                          <div className="text-[11px] text-muted-foreground break-words mt-1 line-clamp-3">{formatted.detail}</div>
                        ) : null}
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>

            {/* Input area for comments */}
            <div className="p-4 border-t border-border bg-background/50 shrink-0">
              <div className="relative">
                <textarea
                  placeholder={activeTab === 'comments' ? "Write a comment..." : "Notes available in comments tab..."}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-10 text-sm outline-none focus:border-primary resize-none placeholder:text-muted-foreground"
                  rows={2}
                  disabled={activeTab !== 'comments'}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                />
                <button 
                  onClick={handleAddComment} 
                  disabled={activeTab !== 'comments' || !newComment.trim()} 
                  className="absolute right-2 bottom-2 p-1.5 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                  <CornerDownRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          
        </div>
        
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
