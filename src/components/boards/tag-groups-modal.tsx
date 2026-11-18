"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { moveItem, type TagGroup } from "@/lib/boards/sorting";
import { ModalShell } from "./modal-shell";

export interface AvailableTag {
  name: string;
  color?: string | null;
}

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tg_${Date.now()}_${Math.random().toString(36).slice(2)}`);
const inputCls = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground";
const iconBtn = "h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

/**
 * Manager of tag groups: named, ordered groups of tags. The position of a tag in the group is its rank when sorting by
 * the group (and the order of its categories). A tag can be in several groups. Changes apply immediately (the store
 * persists them); there is no separate save step.
 */
export function TagGroupsModal({ open, onClose, groups, onChange, availableTags }: { open: boolean; onClose: () => void; groups: TagGroup[]; onChange: (groups: TagGroup[]) => void; availableTags: AvailableTag[] }) {
  const t = useTranslations("board-filters");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedId((cur) => (cur && groups.some((g) => g.id === cur) ? cur : groups[0]?.id ?? null));
  }, [open, groups]);

  const selected = groups.find((g) => g.id === selectedId) ?? null;
  const update = (id: string, patch: Partial<TagGroup>) => onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const tagColor = (name: string) => availableTags.find((x) => x.name.toLowerCase() === name.toLowerCase())?.color ?? null;
  const addTag = (name: string) => {
    const clean = name.trim();
    if (!selected || !clean || selected.tags.some((x) => x.toLowerCase() === clean.toLowerCase())) return;
    update(selected.id, { tags: [...selected.tags, clean] });
  };
  const candidates = selected ? availableTags.filter((x) => !selected.tags.some((g) => g.toLowerCase() === x.name.toLowerCase())) : [];

  return (
    <ModalShell open={open} onClose={onClose} title={t("tagGroups.title")} wide>
      <p className="mb-3 text-xs text-muted-foreground">{t("tagGroups.intro")}</p>
      <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
        <div className="space-y-2">
          <div className="space-y-1">
            {groups.length === 0 ? <p className="text-xs text-muted-foreground">{t("tagGroups.empty")}</p> : null}
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedId(g.id)}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${g.id === selectedId ? "bg-accent/10 text-accent" : "text-foreground hover:bg-muted"}`}
              >
                <span className="block truncate font-medium">{g.name}</span>
                <span className="block text-[11px] text-muted-foreground">{t("tagGroups.tagCount", { count: g.tags.length })}</span>
              </button>
            ))}
          </div>
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newName.trim();
              if (!name) return;
              const id = newId();
              onChange([...groups, { id, name, tags: [] }]);
              setSelectedId(id);
              setNewName("");
            }}
          >
            <input className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("tagGroups.newPlaceholder")} maxLength={80} />
            <button type="submit" className="h-8 px-2 inline-flex items-center rounded-md border border-border text-foreground hover:bg-muted" aria-label={t("tagGroups.create")}>
              <Plus className="h-4 w-4" />
            </button>
          </form>
        </div>

        <div className="min-w-0">
          {!selected ? (
            <p className="text-sm text-muted-foreground">{t("tagGroups.selectHint")}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input className={inputCls} value={selected.name} maxLength={80} onChange={(e) => update(selected.id, { name: e.target.value })} aria-label={t("tagGroups.name")} />
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(t("tagGroups.deleteConfirm", { name: selected.name }))) return;
                    onChange(groups.filter((g) => g.id !== selected.id));
                  }}
                  className="h-8 px-2 inline-flex items-center gap-1 rounded-md text-xs text-red-600 dark:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("tagGroups.delete")}
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground">{t("tagGroups.orderHint")}</p>
              <ol className="space-y-1">
                {selected.tags.length === 0 ? <li className="text-xs text-muted-foreground">{t("tagGroups.noTags")}</li> : null}
                {selected.tags.map((tag, i) => (
                  <li key={tag} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1">
                    <span className="w-5 text-center text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-border" style={{ background: tagColor(tag) ?? "transparent" }} />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{tag}</span>
                    <button type="button" className={iconBtn} disabled={i === 0} onClick={() => update(selected.id, { tags: moveItem(selected.tags, i, i - 1) })} aria-label={t("common.moveUp")}>
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button type="button" className={iconBtn} disabled={i === selected.tags.length - 1} onClick={() => update(selected.id, { tags: moveItem(selected.tags, i, i + 1) })} aria-label={t("common.moveDown")}>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button type="button" className={iconBtn} onClick={() => update(selected.id, { tags: selected.tags.filter((x) => x !== tag) })} aria-label={t("common.remove")}>
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ol>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={`${inputCls} sm:w-56`}
                  value=""
                  onChange={(e) => { addTag(e.target.value); e.target.value = ""; }}
                  aria-label={t("tagGroups.addExisting")}
                >
                  <option value="">{candidates.length ? t("tagGroups.addExisting") : t("tagGroups.noMoreTags")}</option>
                  {candidates.map((x) => (
                    <option key={x.name} value={x.name}>{x.name}</option>
                  ))}
                </select>
                <form
                  className="flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addTag(newTag);
                    setNewTag("");
                  }}
                >
                  <input className={`${inputCls} sm:w-40`} value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder={t("tagGroups.addByName")} maxLength={80} />
                  <button type="submit" className="h-8 px-2 inline-flex items-center rounded-md border border-border text-foreground hover:bg-muted" aria-label={t("tagGroups.addTag")}>
                    <Plus className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
