"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Copy, Loader2, Plus, Search, Trash2, X } from "lucide-react";

import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useTeamGroups } from "@/hooks/use-team-groups";
import {
  createCardTemplate,
  deleteCardTemplate,
  listCardTemplates,
  resolveCardTemplate,
  updateCardTemplate,
  type CardTemplate,
  type ResolvedCardTemplate,
} from "@/lib/api/card-templates";
import { createTag, getBoard, getBoardMembers, getTagsByScope, listTeamMembers, type BoardBrick } from "@/lib/api/contracts";
import { listTeamTagGroups, type ServerTagGroup } from "@/lib/api/view-settings";
import {
  duplicateForm,
  emptyForm,
  formToInput,
  groupTagsBySection,
  localDateISO,
  previewForm,
  templateToForm,
  toggleId,
  validateForm,
  TEMPLATE_LIMITS,
  type FormErrors,
  type TagLike,
  type TemplateForm,
} from "@/lib/card-templates/model";
import { normalizeWorkspaceMembers } from "@/lib/workspace-members";
import { toast } from "@/lib/toast";
import { UnifiedBrickList } from "../bricks/unified-brick-list";
import { ConfirmDialog } from "./confirm-dialog";

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tpl_${Date.now()}_${Math.random().toString(36).slice(2)}`);
const inputCls = "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60";
const ghostBtn = "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";
const primaryBtn = "inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

const tagDot = (color?: string | null) => (color ? (color.startsWith("#") ? color : `#${color}`) : "transparent");

type Selection = "new" | string | null;

interface Option {
  id: string;
  name: string;
}
type MemberOption = { id: string; name: string; email: string };

function Section({ title, hint, error, children }: { title: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}

/**
 * Manager of the board's card templates (admins and owners only; the API enforces it too): a list on the left, the form
 * in the middle and a live preview on the right. Everything a LabROE-style tracker row needs maps to a field here:
 * tags (grouped by the team's tag groups), the target list (status), assignees, relative dates and description blocks.
 */
export function CardTemplateEditor({ open, onClose, boardId, teamId }: { open: boolean; onClose: () => void; boardId: string; teamId?: string | null }) {
  const t = useTranslations("board-detail");
  const { accessToken } = useSession();
  const { groups: userGroups } = useTeamGroups(open ? teamId ?? null : null);

  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [lists, setLists] = useState<Option[]>([]);
  const [tags, setTags] = useState<TagLike[]>([]);
  const [tagGroups, setTagGroups] = useState<ServerTagGroup[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [selected, setSelected] = useState<Selection>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm());
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagPriority, setNewTagPriority] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [serverResult, setServerResult] = useState<ResolvedCardTemplate | null>(null);
  const [serverTesting, setServerTesting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const selectedTemplate = useMemo(() => templates.find((x) => x.id === selected) ?? null, [templates, selected]);

  const patch = useCallback((next: Partial<TemplateForm>) => {
    setForm((cur) => ({ ...cur, ...next }));
    setDirty(true);
    setServerResult(null);
  }, []);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const rows = await listCardTemplates(boardId, accessToken);
      setTemplates(rows);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [accessToken, boardId]);

  // Reference data (lists, tags, tag groups, people): loaded once per open; each source may fail on its own.
  useEffect(() => {
    if (!open || !accessToken) return;
    let alive = true;
    void load();
    getBoard(boardId, accessToken)
      .then((b) => { if (alive) setLists((b.lists ?? []).map((l) => ({ id: l.id, name: l.name }))); })
      .catch(() => {});
    getTagsByScope("board", boardId, accessToken)
      .then((rows: any[]) => { if (alive) setTags(rows as TagLike[]); })
      .catch(() => {});
    if (teamId) {
      listTeamTagGroups(teamId, accessToken).then((rows) => { if (alive) setTagGroups(rows); }).catch(() => {});
    }
    Promise.all([
      teamId ? listTeamMembers(teamId, accessToken).catch(() => []) : Promise.resolve([]),
      getBoardMembers(boardId, accessToken).catch(() => []),
    ]).then(([teamRes, boardRes]) => {
      if (!alive) return;
      const seen = new Set<string>();
      const all = [...normalizeWorkspaceMembers(teamRes as any[]), ...normalizeWorkspaceMembers(boardRes as any[])].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
      setMembers(all.map((m) => ({ id: m.id, name: m.name || m.primaryEmail || m.id, email: m.primaryEmail || "" })));
    });
    return () => { alive = false; };
  }, [open, accessToken, boardId, teamId, load]);

  // Reset the transient state each time the editor closes.
  useEffect(() => {
    if (open) return;
    setSelected(null);
    setForm(emptyForm());
    setDirty(false);
    setErrors({});
    setServerResult(null);
    setConfirmDelete(false);
  }, [open]);

  const confirmDiscard = useCallback(() => !dirty || window.confirm(t("cardTemplates.editor.unsavedConfirm")), [dirty, t]);

  const requestClose = useCallback(() => {
    if (confirmDiscard()) onClose();
  }, [confirmDiscard, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmDelete) {
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose, confirmDelete]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const select = (id: Selection) => {
    if (id === selected) return;
    if (!confirmDiscard()) return;
    setSelected(id);
    setErrors({});
    setDirty(false);
    setServerResult(null);
    if (id === "new") setForm(emptyForm());
    else {
      const tpl = templates.find((x) => x.id === id);
      setForm(tpl ? templateToForm(tpl, newId) : emptyForm());
    }
  };

  const save = async () => {
    if (!accessToken || saving) return;
    const res = formToInput(form);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      let saved: CardTemplate | null;
      if (selected === "new" || !selectedTemplate) {
        saved = await createCardTemplate(boardId, { ...res.value, position: templates.length }, accessToken);
      } else {
        saved = await updateCardTemplate(boardId, selectedTemplate.id, res.value, accessToken);
      }
      await load();
      if (saved) {
        setSelected(saved.id);
        setForm(templateToForm(saved, newId));
      }
      setDirty(false);
      setServerResult(null);
      toast(t("cardTemplates.editor.saved"), "success");
    } catch (err) {
      toast(`${t("cardTemplates.editor.saveError")}${err instanceof Error && err.message ? `: ${err.message}` : ""}`, "error", 5000);
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!accessToken || !selectedTemplate || saving) return;
    const copy = duplicateForm(templateToForm(selectedTemplate, newId), templates.map((x) => x.name), t("cardTemplates.editor.copySuffix"), newId);
    const res = formToInput(copy);
    if (!res.ok) return;
    setSaving(true);
    try {
      const created = await createCardTemplate(boardId, { ...res.value, position: templates.length }, accessToken);
      await load();
      if (created) {
        setSelected(created.id);
        setForm(templateToForm(created, newId));
        setDirty(false);
      }
      toast(t("cardTemplates.editor.duplicated"), "success");
    } catch (err) {
      toast(`${t("cardTemplates.editor.saveError")}${err instanceof Error && err.message ? `: ${err.message}` : ""}`, "error", 5000);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!accessToken || !selectedTemplate) return;
    try {
      await deleteCardTemplate(boardId, selectedTemplate.id, accessToken);
      toast(t("cardTemplates.editor.deleted"), "success");
      setSelected(null);
      setForm(emptyForm());
      setDirty(false);
      await load();
    } catch (err) {
      toast(`${t("cardTemplates.editor.saveError")}${err instanceof Error && err.message ? `: ${err.message}` : ""}`, "error", 5000);
      throw err;
    }
  };

  const testOnServer = async () => {
    if (!accessToken || !selectedTemplate || dirty) return;
    setServerTesting(true);
    try {
      setServerResult(await resolveCardTemplate(boardId, selectedTemplate.id, { today: localDateISO() }, accessToken));
    } catch {
      toast(t("cardTemplates.editor.serverError"), "error");
    } finally {
      setServerTesting(false);
    }
  };

  const createBoardTag = async () => {
    const name = newTagName.trim();
    if (!name || !accessToken || creatingTag) return;
    const existing = tags.find((x) => String(x.name ?? "").toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!form.tagIds.includes(existing.id)) patch({ tagIds: [...form.tagIds, existing.id] });
      setNewTagName("");
      return;
    }
    setCreatingTag(true);
    try {
      const created = await createTag({ scopeType: "board", scopeId: boardId, name, color: "#3b82f6", tagKind: newTagPriority ? "priority" : "custom" }, accessToken);
      setTags((cur) => [...cur, created as unknown as TagLike]);
      patch({ tagIds: [...form.tagIds, created.id] });
      setNewTagName("");
      setNewTagPriority(false);
    } catch {
      toast(t("cardTemplates.editor.tagCreateError"), "error");
    } finally {
      setCreatingTag(false);
    }
  };

  // ── Derived ──
  const sections = useMemo(() => groupTagsBySection(tags, tagGroups, t("cardTemplates.editor.tagsOther")), [tags, tagGroups, t]);
  const q = tagSearch.trim().toLowerCase();
  const visibleSections = useMemo(
    () => sections.map((s) => ({ ...s, tags: q ? s.tags.filter((x) => String(x.name ?? "").toLowerCase().includes(q)) : s.tags })).filter((s) => s.tags.length > 0),
    [sections, q],
  );
  const uq = userSearch.trim().toLowerCase();
  const visibleMembers = useMemo(() => (uq ? members.filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(uq)) : members), [members, uq]);
  const today = localDateISO();
  const preview = useMemo(
    () => previewForm(form, today, { tags, members, groups: userGroups.map((g) => ({ id: g.id, name: g.name })), lists }),
    [form, today, tags, members, userGroups, lists],
  );
  const liveErrors = useMemo(() => (Object.keys(errors).length > 0 ? validateForm(form) : {}), [errors, form]);
  const errText = (key?: string) => (key ? t(`cardTemplates.editor.errors.${key}`) : undefined);

  // ── Blocks (text and checklist) through the same brick editor the card uses ──
  const blocks = form.blocks;
  const setBlocks = (next: BoardBrick[]) => patch({ blocks: next.map((b, i) => ({ ...b, position: (i + 1) * 1000 })) });

  if (!open || typeof document === "undefined") return null;

  const isEditing = selected !== null;
  const fieldErr = (k: keyof FormErrors) => errText(liveErrors[k] ?? errors[k]);

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-2 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("cardTemplates.editor.title")}
        className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl outline-none"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">{t("cardTemplates.editor.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("cardTemplates.editor.intro")}</p>
          </div>
          <button type="button" onClick={requestClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={t("cardTemplates.editor.close")}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* List */}
          <nav aria-label={t("cardTemplates.editor.listTitle")} className="flex max-h-48 shrink-0 flex-col gap-1 overflow-y-auto border-b border-border p-3 md:max-h-none md:w-60 md:border-b-0 md:border-r">
            <button type="button" onClick={() => select("new")} className={`${ghostBtn} w-full justify-center ${selected === "new" ? "border-primary text-primary" : ""}`}>
              <Plus className="h-4 w-4" />
              {t("cardTemplates.editor.new")}
            </button>
            {loading ? <p className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("loadingBoard")}</p> : null}
            {loadFailed ? <p role="alert" className="px-1 py-2 text-xs text-destructive">{t("cardTemplates.editor.loadError")}</p> : null}
            {!loading && !loadFailed && templates.length === 0 ? <p className="px-1 py-2 text-xs text-muted-foreground">{t("cardTemplates.editor.empty")}</p> : null}
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => select(tpl.id)}
                aria-current={selected === tpl.id ? "true" : undefined}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected === tpl.id ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted"}`}
              >
                <span aria-hidden="true" className="w-5 shrink-0 text-center">{tpl.icon || ""}</span>
                <span className="min-w-0 flex-1 truncate">{tpl.name}</span>
              </button>
            ))}
          </nav>

          {!isEditing ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">{t("cardTemplates.editor.selectHint")}</div>
          ) : (
            <>
              {/* Form */}
              <form
                className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4"
                onSubmit={(e) => { e.preventDefault(); void save(); }}
                noValidate
              >
                <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold">{t("cardTemplates.editor.name")}</span>
                    <input className={inputCls} value={form.name} maxLength={TEMPLATE_LIMITS.name + 20} onChange={(e) => patch({ name: e.target.value })} placeholder={t("cardTemplates.editor.namePlaceholder")} aria-invalid={Boolean(fieldErr("name"))} />
                    {fieldErr("name") ? <span role="alert" className="text-xs text-destructive">{fieldErr("name")}</span> : null}
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold">{t("cardTemplates.editor.icon")}</span>
                    <input className={inputCls} value={form.icon} maxLength={TEMPLATE_LIMITS.icon} onChange={(e) => patch({ icon: e.target.value })} placeholder={t("cardTemplates.editor.iconPlaceholder")} />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-sm font-semibold">{t("cardTemplates.editor.description")}</span>
                  <input className={inputCls} value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder={t("cardTemplates.editor.descriptionPlaceholder")} />
                  {fieldErr("description") ? <span role="alert" className="text-xs text-destructive">{fieldErr("description")}</span> : null}
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold">{t("cardTemplates.editor.titlePattern")}</span>
                    <input className={inputCls} value={form.titlePattern} onChange={(e) => patch({ titlePattern: e.target.value })} placeholder={t("cardTemplates.editor.titlePatternPlaceholder")} aria-describedby="tpl-title-hint" />
                    <span id="tpl-title-hint" className="block text-xs text-muted-foreground">{t("cardTemplates.editor.titlePatternHint")}</span>
                    {fieldErr("titlePattern") ? <span role="alert" className="text-xs text-destructive">{fieldErr("titlePattern")}</span> : null}
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold">{t("cardTemplates.editor.targetList")}</span>
                    <select className={inputCls} value={form.targetListId} onChange={(e) => patch({ targetListId: e.target.value })} aria-describedby="tpl-list-hint">
                      <option value="">{t("cardTemplates.editor.targetListNone")}</option>
                      {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      {form.targetListId && !lists.some((l) => l.id === form.targetListId) ? <option value={form.targetListId}>{t("cardTemplates.editor.targetListMissing")}</option> : null}
                    </select>
                    <span id="tpl-list-hint" className="block text-xs text-muted-foreground">{t("cardTemplates.editor.targetListHint")}</span>
                  </label>
                </div>

                <Section title={t("cardTemplates.editor.dates")} hint={t("cardTemplates.editor.offsetHint")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("cardTemplates.editor.startOffset")}</span>
                      <input className={inputCls} inputMode="numeric" value={form.startOffset} onChange={(e) => patch({ startOffset: e.target.value })} placeholder={t("cardTemplates.editor.offsetPlaceholder")} aria-invalid={Boolean(fieldErr("startOffset"))} />
                      {fieldErr("startOffset") ? <span role="alert" className="text-xs text-destructive">{fieldErr("startOffset")}</span> : null}
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">{t("cardTemplates.editor.dueOffset")}</span>
                      <input className={inputCls} inputMode="numeric" value={form.dueOffset} onChange={(e) => patch({ dueOffset: e.target.value })} placeholder={t("cardTemplates.editor.offsetPlaceholder")} aria-invalid={Boolean(fieldErr("dueOffset"))} />
                      {fieldErr("dueOffset") ? <span role="alert" className="text-xs text-destructive">{fieldErr("dueOffset")}</span> : null}
                    </label>
                  </div>
                </Section>

                <Section title={t("cardTemplates.editor.tags")} hint={t("cardTemplates.editor.tagsHint")} error={fieldErr("tagIds")}>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input className={`${inputCls} pl-8`} value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder={t("cardTemplates.editor.tagsSearch")} aria-label={t("cardTemplates.editor.tagsSearch")} />
                  </div>
                  <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border border-border bg-background/50 p-3">
                    {visibleSections.length === 0 ? <p className="text-xs text-muted-foreground">{t("cardTemplates.editor.tagsEmpty")}</p> : null}
                    {visibleSections.map((section) => (
                      <div key={section.id} role="group" aria-label={section.name} className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section.name}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {section.tags.map((tag) => {
                            const on = form.tagIds.includes(tag.id);
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() => patch({ tagIds: toggleId(form.tagIds, tag.id) })}
                                className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}
                              >
                                <span className="h-2 w-2 rounded-full border border-border/60" style={{ background: tagDot(tag.color) }} />
                                {tag.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{t("cardTemplates.editor.tagsSelected", { count: form.tagIds.length })}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className={`${inputCls} sm:w-56`}
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createBoardTag(); } }}
                      placeholder={t("cardTemplates.editor.tagCreatePlaceholder")}
                      aria-label={t("cardTemplates.editor.tagCreatePlaceholder")}
                      maxLength={60}
                    />
                    <label className="inline-flex items-center gap-1.5 text-xs text-foreground">
                      <input type="checkbox" checked={newTagPriority} onChange={(e) => setNewTagPriority(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                      {t("cardTemplates.editor.tagCreatePriority")}
                    </label>
                    <button type="button" onClick={() => void createBoardTag()} disabled={!newTagName.trim() || creatingTag} className={ghostBtn}>
                      {creatingTag ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      {t("cardTemplates.editor.tagCreate")}
                    </button>
                  </div>
                </Section>

                <Section title={t("cardTemplates.editor.assignees")}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">{t("cardTemplates.editor.assigneeUsers")}</p>
                      <input className={inputCls} value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder={t("cardTemplates.editor.usersSearch")} aria-label={t("cardTemplates.editor.usersSearch")} />
                      <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border bg-background/50 p-1.5">
                        {visibleMembers.length === 0 ? <li className="px-1 py-1 text-xs text-muted-foreground">{t("cardTemplates.editor.noMembers")}</li> : null}
                        {visibleMembers.map((m) => (
                          <li key={m.id}>
                            <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                              <input type="checkbox" checked={form.assigneeUserIds.includes(m.id)} onChange={() => patch({ assigneeUserIds: toggleId(form.assigneeUserIds, m.id) })} className="h-3.5 w-3.5 accent-primary" />
                              <span className="min-w-0 flex-1 truncate">{m.name}</span>
                              {m.email && m.email !== m.name ? <span className="hidden truncate text-xs text-muted-foreground sm:inline">{m.email}</span> : null}
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">{t("cardTemplates.editor.assigneeGroups")}</p>
                      <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border bg-background/50 p-1.5">
                        {userGroups.length === 0 ? <li className="px-1 py-1 text-xs text-muted-foreground">{t("cardTemplates.editor.noGroups")}</li> : null}
                        {userGroups.map((g) => (
                          <li key={g.id}>
                            <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                              <input type="checkbox" checked={form.assigneeGroupIds.includes(g.id)} onChange={() => patch({ assigneeGroupIds: toggleId(form.assigneeGroupIds, g.id) })} className="h-3.5 w-3.5 accent-primary" />
                              <span className="min-w-0 flex-1 truncate">{g.name}</span>
                              <span className="text-xs text-muted-foreground">{t("cardTemplates.editor.groupMembers", { count: g.memberCount })}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-amber-700 dark:text-amber-300">{t("cardTemplates.editor.groupsHint")}</p>
                    </div>
                  </div>
                </Section>

                <Section title={t("cardTemplates.editor.blocks")} hint={t("cardTemplates.editor.blocksHint")} error={fieldErr("blocks")}>
                  <div className="rounded-md border border-border bg-background/50 p-2">
                    <UnifiedBrickList
                      isCompact
                      bricks={blocks}
                      activeBricks={blocks}
                      canEdit
                      users={members as any}
                      addableKinds={["text", "checklist"]}
                      emptyPlaceholder={t("cardTemplates.editor.blocksEmpty")}
                      onAddBrick={(kind, afterBrickId, _parent, initContent) => {
                        const base = { id: `tmp-${newId()}`, position: 0, parentBlockId: null };
                        const brick: BoardBrick = kind === "checklist"
                          ? { ...base, kind: "checklist", items: [{ id: newId(), label: "", checked: false }] }
                          : { ...base, kind: "text", displayStyle: "paragraph", markdown: initContent?.markdown ?? "", tasks: [] };
                        const at = afterBrickId ? blocks.findIndex((b) => b.id === afterBrickId) + 1 : blocks.length;
                        setBlocks([...blocks.slice(0, at), brick, ...blocks.slice(at)]);
                      }}
                      onUpdateBrick={(id, content) => setBlocks(blocks.map((b) => (b.id === id ? ({ ...b, ...(content ?? {}) } as BoardBrick) : b)))}
                      onDeleteBrick={(id) => setBlocks(blocks.filter((b) => b.id !== id))}
                      onReorderBricks={(ids) => setBlocks([...blocks].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)))}
                    />
                    {blocks.length === 0 ? (
                      <button type="button" className={`${ghostBtn} mt-2`} onClick={() => setBlocks([{ id: `tmp-${newId()}`, position: 0, parentBlockId: null, kind: "text", displayStyle: "paragraph", markdown: "", tasks: [] }])}>
                        <Plus className="h-3.5 w-3.5" />
                        {t("cardTemplates.editor.addBlock")}
                      </button>
                    ) : null}
                  </div>
                </Section>

                <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
                  <div className="flex items-center gap-2">
                    {selectedTemplate ? (
                      <>
                        <button type="button" onClick={() => void duplicate()} disabled={saving} className={ghostBtn}>
                          <Copy className="h-4 w-4" />
                          {t("cardTemplates.editor.duplicate")}
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(true)} disabled={saving} className={`${ghostBtn} text-destructive hover:bg-destructive/10`}>
                          <Trash2 className="h-4 w-4" />
                          {t("cardTemplates.editor.delete")}
                        </button>
                      </>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {dirty ? <span className="text-xs text-muted-foreground">{t("cardTemplates.editor.unsaved")}</span> : null}
                    <button type="submit" disabled={saving || (!dirty && selected !== "new")} className={primaryBtn}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {saving ? t("cardTemplates.editor.saving") : t("cardTemplates.editor.save")}
                    </button>
                  </div>
                </div>
              </form>

              {/* Preview */}
              <aside aria-label={t("cardTemplates.editor.preview")} className="max-h-72 shrink-0 space-y-3 overflow-y-auto border-t border-border bg-background/40 p-4 md:max-h-none md:w-72 md:border-l md:border-t-0">
                <div>
                  <h3 className="text-sm font-semibold">{t("cardTemplates.editor.preview")}</h3>
                  <p className="text-xs text-muted-foreground">{t("cardTemplates.editor.previewHint")}</p>
                </div>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("cardTemplates.editor.previewTitle")}</dt>
                    <dd className="break-words font-medium">{preview.title || <span className="font-normal text-muted-foreground">{t("cardTemplates.editor.previewTitleEmpty")}</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("cardTemplates.editor.previewList")}</dt>
                    <dd>{preview.listName ?? <span className="text-muted-foreground">{t("cardTemplates.editor.targetListNone")}</span>}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("cardTemplates.editor.previewStart")}</dt>
                      <dd>{preview.startDay ?? <span className="text-muted-foreground">{t("cardTemplates.editor.previewNoDate")}</span>}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("cardTemplates.editor.previewDue")}</dt>
                      <dd>{preview.dueDay ?? <span className="text-muted-foreground">{t("cardTemplates.editor.previewNoDate")}</span>}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("cardTemplates.editor.previewTags")}</dt>
                    <dd className="flex flex-wrap gap-1">
                      {preview.tagNames.length === 0 ? <span className="text-muted-foreground">{t("cardTemplates.editor.previewNone")}</span> : preview.tagNames.map((n) => <span key={n} className="rounded-full border border-border bg-background px-2 py-0.5 text-xs">{n}</span>)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("cardTemplates.editor.previewPeople")}</dt>
                    <dd>{preview.assigneeNames.length === 0 ? <span className="text-muted-foreground">{t("cardTemplates.editor.previewNone")}</span> : preview.assigneeNames.join(", ")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("cardTemplates.editor.previewGroups")}</dt>
                    <dd>{preview.groupNames.length === 0 ? <span className="text-muted-foreground">{t("cardTemplates.editor.previewNone")}</span> : preview.groupNames.join(", ")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("cardTemplates.editor.blocks")}</dt>
                    <dd>{t("cardTemplates.editor.previewBlocks", { count: preview.blockCount })}</dd>
                  </div>
                </dl>
                {preview.missing > 0 ? <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{t("cardTemplates.editor.previewMissing", { count: preview.missing })}</p> : null}

                <div className="space-y-2 border-t border-border pt-3">
                  <button type="button" onClick={() => void testOnServer()} disabled={!selectedTemplate || dirty || serverTesting} className={`${ghostBtn} w-full justify-center`}>
                    {serverTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t("cardTemplates.editor.serverTest")}
                  </button>
                  {!selectedTemplate || dirty ? <p className="text-xs text-muted-foreground">{t("cardTemplates.editor.serverTestNeedsSave")}</p> : null}
                  {serverResult ? (
                    <div className="space-y-1 rounded-md border border-border bg-card p-2 text-xs" role="status">
                      <p className="font-semibold">{t("cardTemplates.editor.serverResult")}</p>
                      <p className="break-words">{serverResult.title || t("cardTemplates.editor.previewTitleEmpty")}</p>
                      <p className="text-muted-foreground">
                        {(serverResult.startAt ?? "-").slice(0, 10)} {"->"} {(serverResult.dueAt ?? "-").slice(0, 10)}
                      </p>
                      <p className="text-muted-foreground">
                        {t("cardTemplates.editor.serverCounts", { tags: serverResult.tagIds.length, people: serverResult.assigneeIds.length, blocks: serverResult.blocks.length })}
                      </p>
                      {serverResult.warnings.length > 0 ? (
                        <ul className="list-disc pl-4 text-amber-700 dark:text-amber-300">
                          {serverResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </aside>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t("cardTemplates.editor.deleteTitle")}
        description={t("cardTemplates.editor.deleteConfirm", { name: selectedTemplate?.name ?? "" })}
        confirmLabel={t("cardTemplates.editor.delete")}
        variant="danger"
      />
    </div>,
    document.body,
  );
}

