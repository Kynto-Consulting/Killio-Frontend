"use client";

import { useEffect, useState } from "react";
import { Bot, Check, Loader2 } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Select } from "@/components/ui/select";
import { getAiProvider, removeAiProvider, saveAiProvider, type AiProviderMode, type AiProviderState } from "@/lib/api/ai-provider";

const INPUT =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/**
 * User settings → AI Provider. "Host" is the deployment's AI, billed in credits. OpenAI / Anthropic use the
 * person's own account (any compatible URL, key and model) and spend no credits. Renders nothing when the
 * deployment does not allow personal providers. Saves on its own button: it is not part of the modal's form.
 */
export function AiProviderSettings() {
  const { accessToken } = useSession();
  const t = useTranslations("preferences");
  const [state, setState] = useState<AiProviderState | null>(null);
  const [mode, setMode] = useState<AiProviderMode>("host");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const apply = (next: AiProviderState) => {
    setState(next);
    setMode(next.mode);
    setBaseUrl(next.provider?.baseUrl ?? "");
    setModel(next.provider?.model ?? "");
    setApiKey("");
  };

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getAiProvider(accessToken)
      .then((next) => { if (!cancelled) apply(next); })
      .catch(() => { /* older server or AI disabled: the section stays hidden */ });
    return () => { cancelled = true; };
  }, [accessToken]);

  if (!state || !state.enabled) return null;

  const own = mode !== "host";
  const stored = state.provider && state.provider.kind === mode ? state.provider : null;
  const defaultUrl = own ? state.defaults[mode] : "";

  const save = async () => {
    if (!accessToken || saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const next = own
        ? await saveAiProvider(accessToken, { kind: mode, baseUrl: baseUrl.trim() || undefined, model: model.trim(), apiKey: apiKey.trim() || undefined })
        : await removeAiProvider(accessToken);
      apply(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div className="h-px w-full bg-border/50" />
    <div className="space-y-3">
      <label className="text-sm font-medium leading-none flex items-center">
        <Bot className="w-4 h-4 mr-2 text-muted-foreground" />
        {t("aiProvider.label")}
      </label>
      <Select
        value={mode}
        onChange={(e) => { setMode(e.target.value as AiProviderMode); setSaved(false); setError(""); }}
        disabled={saving}
        options={[
          { value: "host", label: t("aiProvider.modes.host") },
          { value: "openai", label: "OpenAI" },
          { value: "anthropic", label: "Anthropic" },
        ]}
      />
      <p className="text-xs text-muted-foreground">{own ? t("aiProvider.ownDesc") : t("aiProvider.hostDesc")}</p>

      {own ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-xs text-muted-foreground">
            {t("aiProvider.url")}
            <input className={INPUT} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={defaultUrl} disabled={saving} inputMode="url" autoComplete="off" spellCheck={false} />
          </label>
          <label className="block space-y-1 text-xs text-muted-foreground">
            {t("aiProvider.apiKey")}
            <input
              className={INPUT}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={stored ? t("aiProvider.keyStored", { hint: stored.keyHint || "••••" }) : ""}
              disabled={saving}
              autoComplete="off"
            />
          </label>
          <label className="block space-y-1 text-xs text-muted-foreground">
            {t("aiProvider.model")}
            <input className={INPUT} value={model} onChange={(e) => setModel(e.target.value)} placeholder={mode === "anthropic" ? "claude-sonnet-4-6" : "gpt-5"} disabled={saving} autoComplete="off" spellCheck={false} />
          </label>
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}

      <button
        type="button"
        onClick={save}
        disabled={saving || (own && !model.trim()) || (own && !stored && !apiKey.trim())}
        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-50"
      >
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : saved ? <Check className="mr-2 h-4 w-4" /> : null}
        {saved ? t("aiProvider.saved") : t("aiProvider.save")}
      </button>
    </div>
    </>
  );
}
