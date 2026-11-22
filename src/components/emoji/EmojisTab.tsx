"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Pencil, Trash2, Upload, X } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { useSettings } from "@/components/roles/settings-context";
import { EmptyState, btn, btnIcon, btnPrimary, card, cx, inputCls } from "@/components/roles/ui";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { useTeamRealtime } from "@/hooks/useTeamRealtime";
import { ApiError, API_BASE_URL } from "@/lib/api/client";
import { createTeamEmoji, deleteTeamEmoji, listTeamEmojis, renameTeamEmoji } from "@/lib/api/emojis";
import {
  EMOJI_NAME_PATTERN, canChangeEmoji, emojiErrorKey, formatBytes, nameFromFileName, normalizeEmojiName, precheckFile,
  resolveEmojiUrl, sortEmojis, type EmojiDto, type EmojiList,
} from "@/lib/emoji/custom";
import { toast } from "@/lib/toast";

/** "Emojis" tab of /teams: upload, list, rename and delete the custom emojis of the team. */
export function EmojisTab() {
  const t = useTranslations("emoji");
  const s = useSettings();
  const [data, setData] = useState<EmojiList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [deleting, setDeleting] = useState<EmojiDto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      setData(await listTeamEmojis(s.teamId, s.accessToken));
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.teamId, s.accessToken]);

  useEffect(() => { void reload(); }, [reload]);
  useTeamRealtime(s.teamId, (e) => { if (/^(team\.)?emoji\.(created|updated|deleted)$/.test(String(e.type ?? ""))) void reload(); });
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  /** Human text for an API error, using its `code` (and kind/limit for EMOJI_LIMIT_REACHED). */
  function errorText(e: unknown): string {
    const code = e instanceof ApiError ? e.code : undefined;
    const d = e instanceof ApiError ? e.details : undefined;
    const lim = data?.limits;
    return t(emojiErrorKey(code), {
      kind: d?.kind === "animated" ? t("tab.kindAnimated") : t("tab.kindStatic"),
      limit: String(d?.limit ?? ""),
      max: lim ? formatBytes(lim.maxBytes) : "",
      min: String(lim?.minDimension ?? ""),
      maxDim: String(lim?.maxDimension ?? ""),
      ratio: String(lim?.maxAspectRatio ?? ""),
    });
  }

  const emojis = useMemo(() => sortEmojis(data?.emojis ?? []), [data]);
  const perms = data?.permissions ?? { canCreate: false, canManage: false };
  const normalized = normalizeEmojiName(name);
  const nameBad = name.trim() !== "" && !EMOJI_NAME_PATTERN.test(normalized);

  const pickFile = (f: File | null) => {
    setFormError(null);
    if (preview) URL.revokeObjectURL(preview);
    if (!f) { setFile(null); setPreview(null); return; }
    const problem = data ? precheckFile(f, data.limits) : null;
    if (problem) {
      setFile(null); setPreview(null);
      setFormError(t(problem === "tooLarge" ? "errors.tooLarge" : "errors.unsupportedType", { max: data ? formatBytes(data.limits.maxBytes) : "" }));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!name.trim()) setName(nameFromFileName(f.name));
  };

  const upload = async () => {
    if (!file || busy || nameBad) return;
    setBusy(true);
    setFormError(null);
    try {
      await createTeamEmoji(s.teamId, file, normalized || undefined, s.accessToken);
      toast(t("tab.uploaded"), "success");
      setFile(null); setPreview(null); setName("");
      if (fileRef.current) fileRef.current.value = "";
      await reload();
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async (emoji: EmojiDto) => {
    const next = normalizeEmojiName(draft);
    if (next === emoji.name) { setRenaming(null); return; }
    if (!EMOJI_NAME_PATTERN.test(next)) { setRowError({ id: emoji.id, text: t("errors.nameInvalid") }); return; }
    try {
      await renameTeamEmoji(s.teamId, emoji.id, next, s.accessToken);
      setRenaming(null);
      setRowError(null);
      await reload();
    } catch (e) {
      setRowError({ id: emoji.id, text: errorText(e) });
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteTeamEmoji(s.teamId, deleting.id, s.accessToken);
      toast(t("tab.deleted"), "success");
      setDeleting(null);
      await reload();
    } catch (e) {
      setDeleting(null);
      toast(errorText(e), "error");
    }
  };

  const lim = data?.limits;
  const use = data?.usage;

  return (
    <div className="space-y-4">
      <div className={cx(card, "p-5")}>
        <h2 className="text-base font-semibold">{t("tab.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("tab.intro")}</p>
        {lim && use && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {([["static", t("tab.kindStatic")], ["animated", t("tab.kindAnimated")]] as const).map(([k, label]) => {
              const used = use[k]; const max = lim[k];
              const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 100;
              return (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{label}</span><span>{used} / {max}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={used} aria-label={label}>
                    <div className={cx("h-full rounded-full", pct >= 100 ? "bg-amber-500" : "bg-primary")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {lim && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("tab.rules", { types: lim.allowedTypes.map((x) => x.replace("image/", "").toUpperCase()).join(", "), max: formatBytes(lim.maxBytes), min: String(lim.minDimension), maxDim: String(lim.maxDimension), ratio: String(lim.maxAspectRatio) })}
          </p>
        )}
      </div>

      {loadError && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{loadError}</p>}

      {perms.canCreate && (
        <div className={cx(card, "p-5")}>
          <h3 className="text-sm font-semibold">{t("tab.upload")}</h3>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted/60">
              {preview
                // eslint-disable-next-line @next/next/no-img-element -- local preview
                ? <img src={preview} alt="" className="h-10 w-10 object-contain" />
                : <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="emoji-file" className="mb-1 block text-xs font-medium text-muted-foreground">{t("tab.file")}</label>
              <input id="emoji-file" ref={fileRef} type="file" accept={(lim?.allowedTypes ?? ["image/png", "image/gif", "image/webp"]).join(",")} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs file:font-medium file:text-foreground hover:file:bg-accent" />
            </div>
            <div className="sm:w-56">
              <label htmlFor="emoji-name" className="mb-1 block text-xs font-medium text-muted-foreground">{t("tab.name")}</label>
              <input id="emoji-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("tab.namePlaceholder")} maxLength={40} aria-invalid={nameBad} className={inputCls} />
            </div>
            <button type="button" onClick={() => void upload()} disabled={!file || busy || nameBad} className={btnPrimary}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />} {t("tab.uploadButton")}
            </button>
          </div>
          {normalized && !nameBad && <p className="mt-2 text-xs text-muted-foreground">{t("tab.willBe", { code: `:${normalized}:` })}</p>}
          {nameBad && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{t("errors.nameInvalid")}</p>}
          {formError && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{formError}</p>}
        </div>
      )}

      {data && emojis.length === 0 && <EmptyState title={t("tab.emptyTitle")} body={perms.canCreate ? t("tab.emptyBody") : undefined} />}

      {emojis.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {emojis.map((e) => {
            const editable = canChangeEmoji(e, s.userId, perms);
            const isRenaming = renaming === e.id;
            return (
              <li key={e.id} className={cx(card, "flex items-center gap-3 p-3")}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/60">
                  {/* eslint-disable-next-line @next/next/no-img-element -- custom emoji of the team */}
                  <img src={resolveEmojiUrl(e.url, API_BASE_URL)} alt={e.shortcode} className="h-9 w-9 object-contain" loading="lazy" />
                </div>
                <div className="min-w-0 flex-1">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(ev) => setDraft(ev.target.value)}
                      onKeyDown={(ev) => { if (ev.key === "Enter") void saveRename(e); else if (ev.key === "Escape") { setRenaming(null); setRowError(null); } }}
                      aria-label={t("tab.rename")}
                      className={cx(inputCls, "h-8")}
                    />
                  ) : (
                    <p className="truncate text-sm font-medium">{e.shortcode}</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {[e.animated ? t("tab.kindAnimated") : null, `${e.width}x${e.height}`, formatBytes(e.sizeBytes), e.createdBy?.name].filter(Boolean).join(" · ")}
                  </p>
                  {rowError?.id === e.id && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{rowError.text}</p>}
                </div>
                {editable && (
                  <div className="flex shrink-0 gap-1">
                    {isRenaming ? (
                      <>
                        <button type="button" onClick={() => void saveRename(e)} aria-label={t("tab.save")} title={t("tab.save")} className={btnIcon}><Check className="h-4 w-4" aria-hidden /></button>
                        <button type="button" onClick={() => { setRenaming(null); setRowError(null); }} aria-label={t("tab.cancel")} title={t("tab.cancel")} className={btnIcon}><X className="h-4 w-4" aria-hidden /></button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => { setRenaming(e.id); setDraft(e.name); setRowError(null); }} aria-label={t("tab.rename")} title={t("tab.rename")} className={btnIcon}><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
                        <button type="button" onClick={() => setDeleting(e)} aria-label={t("tab.delete")} title={t("tab.delete")} className={cx(btnIcon, "text-red-600 dark:text-red-400")}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDeleteModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={t("tab.deleteTitle")}
        description={t("tab.deleteBody", { code: deleting?.shortcode ?? "" })}
        itemName={deleting?.shortcode}
      />
    </div>
  );
}
