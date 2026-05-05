"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import {
  StripeIntegrationCredential,
  listStripeCredentials,
  saveStripeCredential,
  deleteStripeCredential,
} from "@/lib/api/integrations";
import { CreditCard, Loader2, CheckCircle, AlertCircle, Trash2, Plus, Link2, X } from "lucide-react";

interface StripeIntegrationPanelProps {
  teamId: string;
  accessToken: string;
}

export function StripeIntegrationPanel({ teamId, accessToken }: StripeIntegrationPanelProps) {
  const t = useTranslations("integrations");
  const [credentials, setCredentials] = useState<StripeIntegrationCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);

  const [name, setName] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState("");

  const loadCredentials = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listStripeCredentials(teamId, accessToken);
      setCredentials(data.filter((item) => item.isActive));
    } catch (err: any) {
      setError(err?.message || t("integrations.payments.stripe.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCredentials();
  }, [teamId, accessToken]);

  const handleSave = async () => {
    if (!name.trim() || !secretKey.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const saved = await saveStripeCredential(
        teamId,
        {
          name: name.trim(),
          publishableKey: publishableKey.trim() || undefined,
          secretKey: secretKey.trim(),
        },
        accessToken,
      );

      setCredentials((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
      setName("");
      setPublishableKey("");
      setSecretKey("");
      setShowConnectModal(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: any) {
      setError(err?.message || t("integrations.payments.stripe.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (credential: StripeIntegrationCredential) => {
    if (!window.confirm(t("integrations.payments.stripe.deleteConfirm"))) return;
    try {
      await deleteStripeCredential(teamId, credential.id, accessToken);
      setCredentials((previous) => previous.filter((item) => item.id !== credential.id));
    } catch (err: any) {
      setError(err?.message || t("integrations.payments.stripe.deleteError"));
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-700 text-white">
          <CreditCard className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{t("integrations.payments.stripe.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("integrations.payments.stripe.description")}</p>
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setShowConnectModal(true);
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Link2 className="h-4 w-4" />
          {t("integrations.payments.stripe.connect")}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-300/60 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {t("integrations.payments.stripe.saved")}
        </div>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground">{t("integrations.payments.stripe.savedCredentials")}</p>
        {loading ? (
          <div className="mt-2 flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : credentials.length > 0 ? (
          <div className="mt-2 space-y-2">
            {credentials.map((credential) => (
              <div key={credential.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">{credential.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {credential.publishableKey ? `${credential.publishableKey} · ` : ""}
                    {credential.secretKeyMasked}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(credential)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("integrations.payments.stripe.delete")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("integrations.payments.stripe.noCredentials")}</p>
        )}
      </div>

      {showConnectModal && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t("integrations.payments.stripe.connectModalTitle")}</h3>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
                aria-label={t("actions.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("integrations.payments.stripe.fields.name")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                value={publishableKey}
                onChange={(event) => setPublishableKey(event.target.value)}
                placeholder={t("integrations.payments.stripe.fields.publishableKey")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="password"
                value={secretKey}
                onChange={(event) => setSecretKey(event.target.value)}
                placeholder={t("integrations.payments.stripe.fields.secretKey")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !name.trim() || !secretKey.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t("integrations.payments.stripe.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
