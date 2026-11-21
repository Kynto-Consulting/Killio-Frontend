"use client";

import { useState } from "react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { useSettings } from "@/components/roles/settings-context";
import { Dialog, btn, btnPrimary, inputCls } from "@/components/roles/ui";
import { createBot } from "@/lib/api/bots";
import { BOT_LIMITS, botBody, validateBotForm, type Bot } from "@/lib/bots/model";
import { toast } from "@/lib/toast";
import { BotAvatar } from "./bot-parts";

/** Create a bot: name, avatar URL and description. Script, commands and rooms are set afterwards in the detail panel. */
export function BotFormDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (bot: Bot) => void | Promise<void> }) {
  const t = useTranslations("bots");
  const s = useSettings();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const issues = validateBotForm({ name, description, avatarUrl });

  const submit = async () => {
    setTouched(true);
    if (issues.length > 0 || saving) return;
    setSaving(true);
    try {
      const bot = await createBot(s.teamId, botBody({ name, description, avatarUrl }), s.accessToken);
      toast(t("toast.created"), "success");
      await onSaved(bot);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("toast.error"), "error");
      setSaving(false);
    }
  };
  const err = (code: string) => touched && issues.includes(code as never) && <p role="alert" className="mt-1 text-[11px] text-red-700 dark:text-red-300">{t(`form.errors.${code}`)}</p>;

  return (
    <Dialog
      title={t("create")}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" className={btn} disabled={saving} onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className={btnPrimary} disabled={saving} onClick={submit}>{saving ? t("common.saving") : t("create")}</button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <BotAvatar name={name || "?"} url={validateBotForm({ name: "x", description: "", avatarUrl }).length === 0 ? avatarUrl.trim() || null : null} size={44} />
        <p className="text-[11px] text-muted-foreground">{t("form.avatarHelp")}</p>
      </div>
      <label className="block text-xs font-semibold text-foreground">
        {t("form.name")}
        <input data-autofocus className={`${inputCls} mt-1`} value={name} maxLength={BOT_LIMITS.name + 10} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} placeholder={t("form.namePlaceholder")} />
        {err("name_required") || err("name_long")}
      </label>
      <label className="block text-xs font-semibold text-foreground">
        {t("form.avatarUrl")}
        <input className={`${inputCls} mt-1`} value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://" inputMode="url" />
        {err("avatar_invalid")}
      </label>
      <label className="block text-xs font-semibold text-foreground">
        {t("form.description")}
        <textarea className={`${inputCls} mt-1 h-20 py-2`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("form.descriptionPlaceholder")} />
        {err("description_long")}
      </label>
    </Dialog>
  );
}
