"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import {
  WhatsappManualCredential,
  listWhatsappCredentials,
  saveWhatsappCredential,
  deleteWhatsappCredential,
} from "@/lib/api/integrations";
import { MessageCircle, Loader2, CheckCircle, AlertCircle, Trash2, Plus } from "lucide-react";

interface WhatsappIntegrationPanelProps {
  teamId: string;
  accessToken: string;
}

export function WhatsappIntegrationPanel({ teamId, accessToken }: WhatsappIntegrationPanelProps) {
  const t = useTranslations("integrations");
  const [credentials, setCredentials] = useState<WhatsappManualCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [token, setToken] = useState("");

  const loadCredentials = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listWhatsappCredentials(teamId, accessToken);
      setCredentials(data.filter((item) => item.isActive));
    } catch {
      setError(t("integrations.whatsapp.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCredentials();
  }, [teamId, accessToken]);

  const handleSave = async () => {
    if (!name.trim() || !phoneNumberId.trim() || !token.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveWhatsappCredential(
        teamId,
        {
          name: name.trim(),
          phoneNumberId: phoneNumberId.trim(),
          accessToken: token.trim(),
        },
        accessToken,
      );
      setCredentials((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
      setName("");
      setPhoneNumberId("");
      setToken("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      setError(t("integrations.whatsapp.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (credential: WhatsappManualCredential) => {
    if (!window.confirm(t("integrations.whatsapp.deleteConfirm"))) return;
    try {
      await deleteWhatsappCredential(teamId, credential.id, accessToken);
      setCredentials((previous) => previous.filter((item) => item.id !== credential.id));
    } catch {
      setError(t("integrations.whatsapp.deleteError"));
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-white">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{t("integrations.whatsapp.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("integrations.whatsapp.description")}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("integrations.whatsapp.fields.name")}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="text"
          value={phoneNumberId}
          onChange={(event) => setPhoneNumberId(event.target.value)}
          placeholder={t("integrations.whatsapp.fields.phoneNumberId")}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={t("integrations.whatsapp.fields.accessToken")}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim() || !phoneNumberId.trim() || !token.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("integrations.whatsapp.save")}
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
          {t("integrations.whatsapp.saved")}
        </div>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground">{t("integrations.whatsapp.savedCredentials")}</p>
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
                    {credential.phoneNumberId} · {credential.accessTokenMasked}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(credential)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("integrations.whatsapp.delete")}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("integrations.whatsapp.noCredentials")}</p>
        )}
      </div>
    </div>
  );
}
