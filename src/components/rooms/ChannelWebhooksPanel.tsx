"use client";

/**
 * Incoming webhooks of a channel (tab of the channel settings). An external system posts into the channel with a secret URL.
 * The secret is returned by the server ONCE, at creation: it lives only in this component's state until the person closes the reveal.
 * There is no rotate endpoint, so "rotate" creates a new webhook and revokes the old one (lib/api/room-tools.ts).
 * Rules and limits: lib/bots/webhooks.ts (Killio-Backend/src/modules/rooms/room-tools.service.ts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, RefreshCw, ShieldAlert, Trash2, Webhook as WebhookIcon } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { API_BASE_URL } from "@/lib/api/client";
import { createRoomWebhook, listRoomWebhooks, revokeRoomWebhook, rotateRoomWebhook } from "@/lib/api/room-tools";
import {
  WEBHOOK_LIMITS, publicWebhookUrl, validateWebhookForm, webhookCurl, type CreatedWebhook, type RoomWebhook,
} from "@/lib/bots/webhooks";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { roomField, roomGhostButton, roomLabel, roomPrimaryButton } from "./RoomModalShell";

type LoadState = "loading" | "ready" | "forbidden" | "error";

interface Secret {
  webhook: CreatedWebhook;
  url: string;
  /** Rotation: the old webhook could not be revoked and still works. */
  oldStillActive?: boolean;
}

const status = (e: unknown) => (e as { status?: number })?.status;

export function ChannelWebhooksPanel({ roomId, accessToken }: { roomId: string; accessToken: string }) {
  const t = useTranslations("rooms");
  const [state, setState] = useState<LoadState>("loading");
  const [list, setList] = useState<RoomWebhook[]>([]);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: "rotate" | "revoke" } | null>(null);
  const [copied, setCopied] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      setList(await listRoomWebhooks(roomId, accessToken));
      setState("ready");
    } catch (e) {
      setState(status(e) === 403 ? "forbidden" : "error");
    }
  }, [roomId, accessToken]);

  useEffect(() => {
    void load();
    // The secret must not outlive the panel.
    return () => setSecret(null);
  }, [load]);

  const issues = validateWebhookForm({ name, avatarUrl });
  const atLimit = list.length >= WEBHOOK_LIMITS.maxPerRoom;

  const errorOf = (e: unknown): string => {
    const s = status(e);
    if (s === 403) return t("webhooks.errors.forbidden");
    if (s === 409) return t("webhooks.errors.limit", { max: WEBHOOK_LIMITS.maxPerRoom });
    if (s === 400) return e instanceof Error && e.message ? e.message : t("webhooks.errors.generic");
    return t("webhooks.errors.generic");
  };

  const reveal = (webhook: CreatedWebhook, oldStillActive = false) => {
    setCopied(false);
    setSecret({ webhook, url: publicWebhookUrl(API_BASE_URL, webhook.path), oldStillActive });
  };

  const create = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTouched(true);
    if (issues.length > 0 || atLimit || busy) return;
    setBusy("create");
    setError(null);
    try {
      const created = await createRoomWebhook(roomId, { name, avatarUrl }, accessToken);
      setName("");
      setAvatarUrl("");
      setTouched(false);
      reveal(created);
      await load();
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (w: RoomWebhook) => {
    setBusy(w.id);
    setError(null);
    try {
      await revokeRoomWebhook(roomId, w.id, accessToken);
      setConfirm(null);
      if (secret?.webhook.id === w.id) setSecret(null);
      await load();
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(null);
    }
  };

  const rotate = async (w: RoomWebhook) => {
    setBusy(w.id);
    setError(null);
    try {
      const out = await rotateRoomWebhook(roomId, w, accessToken);
      setConfirm(null);
      reveal(out.created, !out.revoked);
      await load();
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission: select the text so Ctrl+C works.
      urlRef.current?.select();
    }
  };

  return (
    <div className="space-y-4" data-testid="webhooks-panel">
      <div role="note" className="flex gap-2 rounded-xl border border-amber-500/60 bg-amber-500/10 p-3 text-xs text-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        <div className="space-y-1">
          <p className="font-bold">{t("webhooks.security.title")}</p>
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
            <li>{t("webhooks.security.secret")}</li>
            <li>{t("webhooks.security.once")}</li>
            <li>{t("webhooks.security.rotate")}</li>
            <li>{t("webhooks.security.limits", { rate: WEBHOOK_LIMITS.messagesPerMinute })}</li>
          </ul>
        </div>
      </div>

      {secret && (
        <section aria-label={t("webhooks.reveal.title")} className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold"><KeyRound className="h-4 w-4" aria-hidden />{t("webhooks.reveal.title", { name: secret.webhook.name })}</p>
          <p className="text-[11px] text-muted-foreground">{t("webhooks.reveal.body")}</p>
          {secret.oldStillActive && <p role="alert" className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-2 py-1.5 text-[11px] text-foreground">{t("webhooks.reveal.oldStillActive")}</p>}
          <label htmlFor="webhook-url" className={roomLabel}>{t("webhooks.reveal.url")}</label>
          <div className="flex gap-1.5">
            <input id="webhook-url" ref={urlRef} readOnly value={secret.url} onFocus={(e) => e.currentTarget.select()} className={`${roomField} font-mono text-xs`} spellCheck={false} />
            <button type="button" onClick={() => void copy(secret.url)} className={roomGhostButton}>
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? t("webhooks.reveal.copied") : t("webhooks.reveal.copy")}
            </button>
          </div>
          <span className="sr-only" role="status" aria-live="polite">{copied ? t("webhooks.reveal.copied") : ""}</span>
          <details className="text-[11px]">
            <summary className="cursor-pointer font-semibold text-muted-foreground">{t("webhooks.reveal.example")}</summary>
            <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-background p-2 font-mono text-[10px]">{webhookCurl(secret.url)}</pre>
            <p className="mt-1 text-muted-foreground">{t("webhooks.reveal.payload")}</p>
          </details>
          <div className="flex justify-end">
            <button type="button" onClick={() => setSecret(null)} className={roomPrimaryButton}>{t("webhooks.reveal.done")}</button>
          </div>
        </section>
      )}

      <form onSubmit={create} className="space-y-2 rounded-xl border border-border p-3" aria-label={t("webhooks.new.title")} noValidate>
        <p className="text-xs font-bold">{t("webhooks.new.title")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="webhook-name" className={roomLabel}>{t("webhooks.new.name")}</label>
            <input id="webhook-name" value={name} maxLength={WEBHOOK_LIMITS.name + 10} onChange={(e) => setName(e.target.value)} placeholder={t("webhooks.new.namePlaceholder")} aria-invalid={touched && issues.some((i) => i.startsWith("name")) ? true : undefined} aria-describedby="webhook-name-err" className={roomField} />
            {touched && issues.some((i) => i.startsWith("name")) && <p id="webhook-name-err" role="alert" className="mt-1 text-xs text-destructive">{t(`webhooks.new.errors.${issues.find((i) => i.startsWith("name"))}`, { max: WEBHOOK_LIMITS.name })}</p>}
          </div>
          <div>
            <label htmlFor="webhook-avatar" className={roomLabel}>{t("webhooks.new.avatar")}</label>
            <input id="webhook-avatar" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://" inputMode="url" aria-invalid={touched && issues.includes("avatar_invalid") ? true : undefined} aria-describedby="webhook-avatar-err" className={roomField} />
            {touched && issues.includes("avatar_invalid") && <p id="webhook-avatar-err" role="alert" className="mt-1 text-xs text-destructive">{t("webhooks.new.errors.avatar_invalid")}</p>}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">{atLimit ? t("webhooks.errors.limit", { max: WEBHOOK_LIMITS.maxPerRoom }) : t("webhooks.new.count", { count: list.length, max: WEBHOOK_LIMITS.maxPerRoom })}</p>
          <button type="submit" disabled={Boolean(busy) || atLimit} className={roomPrimaryButton}>
            {busy === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
            {t("webhooks.new.submit")}
          </button>
        </div>
      </form>

      {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">{error}</p>}

      <div>
        <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t("webhooks.list.title")}</h3>
        {state === "loading" && <div role="status" className="flex items-center gap-2 py-3 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{t("webhooks.list.loading")}</div>}
        {state === "forbidden" && <p role="status" className="rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">{t("webhooks.errors.forbiddenList")}</p>}
        {state === "error" && (
          <p role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {t("webhooks.errors.load")}
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 font-semibold underline"><RefreshCw className="h-3 w-3" aria-hidden />{t("errors.retry")}</button>
          </p>
        )}
        {state === "ready" && list.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            <WebhookIcon className="h-6 w-6 opacity-50" aria-hidden />
            <p className="font-semibold text-foreground">{t("webhooks.list.emptyTitle")}</p>
            <p>{t("webhooks.list.emptyHint")}</p>
          </div>
        )}
        <ul className="space-y-2">
          {list.map((w) => {
            const asking = confirm?.id === w.id ? confirm.kind : null;
            const working = busy === w.id;
            return (
              <li key={w.id} className="rounded-xl border border-border p-2.5">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={getUserAvatarUrl(w.avatarUrl ?? undefined, `${w.id}@webhook.killio.local`, 28)} alt="" referrerPolicy="no-referrer" className="h-7 w-7 shrink-0 rounded-full border border-border object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{w.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {w.lastUsedAt ? t("webhooks.list.lastUsed", { when: new Date(w.lastUsedAt).toLocaleString() }) : t("webhooks.list.neverUsed")}
                      {w.createdAt ? ` · ${t("webhooks.list.created", { when: new Date(w.createdAt).toLocaleDateString() })}` : ""}
                    </p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground" aria-label={t("webhooks.list.urlHidden")}>{`/hooks/rooms/${w.id}/••••••••`}</p>
                  </div>
                  {!asking && (
                    <div className="flex shrink-0 gap-1">
                      <button type="button" disabled={Boolean(busy)} onClick={() => setConfirm({ id: w.id, kind: "rotate" })} className={roomGhostButton}>
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />{t("webhooks.list.rotate")}
                      </button>
                      <button type="button" disabled={Boolean(busy)} onClick={() => setConfirm({ id: w.id, kind: "revoke" })} className={`${roomGhostButton} !text-destructive`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />{t("webhooks.list.revoke")}
                      </button>
                    </div>
                  )}
                </div>
                {asking && (
                  <div role="alertdialog" aria-label={t(`webhooks.confirm.${asking}Title`, { name: w.name })} className="mt-2 rounded-lg border border-border bg-muted/50 p-2.5 text-xs">
                    <p className="font-semibold">{t(`webhooks.confirm.${asking}Title`, { name: w.name })}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{t(`webhooks.confirm.${asking}Body`)}</p>
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" disabled={working} onClick={() => setConfirm(null)} className={roomGhostButton}>{t("webhooks.confirm.cancel")}</button>
                      <button type="button" disabled={working} onClick={() => void (asking === "rotate" ? rotate(w) : revoke(w))} className={asking === "revoke" ? `${roomGhostButton} !border-destructive !bg-destructive !text-destructive-foreground` : roomPrimaryButton}>
                        {working && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                        {t(`webhooks.confirm.${asking}Button`)}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
