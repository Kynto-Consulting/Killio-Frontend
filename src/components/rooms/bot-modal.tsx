"use client";

/**
 * The modal a bot script opened (`respond_interaction` mode "modal"). It arrives as an ephemeral row with `metadata.modal`; here it is an
 * accessible dialog (role="dialog", aria-modal, focus moves in and is trapped, Escape closes). Submit sends only the declared inputs.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { cx } from "@/components/roles/ui";
import { submitModal } from "@/lib/api/room-tools";
import { interactErrorKey, modalMaxLengthFor, modalSubmitBody, validateModalFields, type ModalDef, type ModalFieldError } from "@/lib/bots/components";

interface Props {
  modal: ModalDef;
  /** Sends the fields; rejects with `{ status }` on failure. */
  onSubmit: (fields: Record<string, string>) => Promise<void>;
  /** Closes without sending (Escape, X, Cancel, click outside). */
  onClose: () => void;
}

export function BotModalDialog({ modal, onSubmit, onClose }: Props) {
  const t = useTranslations("rooms");
  const uid = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(modal.inputs.map((i) => [i.customId, i.value ?? ""])));
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof interactErrorKey> | null>(null);
  const errors: Record<string, ModalFieldError> = validateModalFields(modal, values);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("input, textarea")?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); if (!sending) onClose(); return; }
    if (e.key !== "Tab") return;
    const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input, textarea") ?? []);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length > 0 || sending) return;
    setSending(true);
    setFailure(null);
    try {
      await onSubmit(modalSubmitBody(modal, values).fields);
    } catch (err) {
      setFailure(interactErrorKey((err as { status?: number })?.status));
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4 backdrop-blur-[1px]" onMouseDown={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        onKeyDown={onKeyDown}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border/60 bg-card p-4 text-card-foreground shadow-xl"
      >
        <div className="mb-3 flex items-start gap-2">
          <h2 id={`${uid}-title`} className="min-w-0 flex-1 break-words text-base font-extrabold">{modal.title}</h2>
          <button type="button" onClick={onClose} disabled={sending} aria-label={t("bot.modal.close")} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <form onSubmit={submit} noValidate className="space-y-3">
          {modal.inputs.map((inp) => {
            const id = `${uid}-${inp.customId}`;
            const err = touched ? errors[inp.customId] : undefined;
            const max = inp.maxLength ?? modalMaxLengthFor(inp.style);
            const common = {
              id,
              value: values[inp.customId] ?? "",
              maxLength: max,
              placeholder: inp.placeholder,
              required: inp.required,
              "aria-invalid": err ? true : undefined,
              "aria-describedby": err ? `${id}-err` : undefined,
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [inp.customId]: e.target.value })),
              className: cx("w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", err ? "border-red-500/60" : "border-border/60"),
            };
            return (
              <div key={inp.customId}>
                <label htmlFor={id} className="mb-1 block text-xs font-semibold">
                  {inp.label}{!inp.required && <span className="ml-1 font-normal text-muted-foreground">{t("bot.modal.optional")}</span>}
                </label>
                {inp.style === "paragraph" ? <textarea rows={4} {...common} /> : <input type="text" {...common} />}
                {err && <p id={`${id}-err`} role="alert" className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300">{t(`bot.modal.errors.${err}`, { min: inp.minLength ?? 0, max })}</p>}
              </div>
            );
          })}
          {failure && <p role="alert" className="text-[11px] font-medium text-red-700 dark:text-red-300">{t(`bot.interact.errors.${failure}`)}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={sending} className="inline-flex h-8 items-center rounded-md border border-border/60 px-3 text-xs font-bold hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              {t("bot.modal.cancel")}
            </button>
            <button type="submit" disabled={sending} aria-busy={sending || undefined} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60">
              {sending && <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden />}
              {modal.submitLabel || t("bot.modal.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Opens the pending modal of the room (if a script asked for one) and submits it. The server consumes the modal on submit; on close
 * without sending the private row is dismissed so it does not come back on reload.
 */
export function PendingModalHost({ roomId, accessToken, pending, onFinished }: { roomId: string; accessToken: string | null | undefined; pending: { ephemeral: { id: string }; modal: ModalDef } | null; onFinished: (ephemeralId: string) => void }) {
  if (!pending || !accessToken) return null;
  return (
    <BotModalDialog
      key={pending.ephemeral.id}
      modal={pending.modal}
      onClose={() => onFinished(pending.ephemeral.id)}
      onSubmit={async (fields) => {
        await submitModal(roomId, pending.ephemeral.id, fields, accessToken);
        onFinished(pending.ephemeral.id);
      }}
    />
  );
}
