"use client";

import { useEffect, useState } from "react";
import { Bot, Check, Loader2 } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { Select } from "@/components/ui/select";
import { getAiProvider, removeAiProvider, saveAiProvider, type AiProviderMode, type AiProviderState } from "@/lib/api/ai-provider";
import { killioApp, type KillioClaudeStatus } from "@/lib/app-shell";
import { readLocalAiProvider, writeLocalAiProvider } from "@/lib/app-shell/local-provider";

/** The account's modes plus "claude", which exists only on this device (Killio App on a computer). */
type Mode = AiProviderMode | "claude";

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
  const [mode, setMode] = useState<Mode>("host");
  // Killio App on a computer: the person's own Claude Code.
  const [claude, setClaude] = useState<KillioClaudeStatus | null>(null);
  const [claudeModels, setClaudeModels] = useState<string[]>([]);
  const [claudeModel, setClaudeModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const apply = (next: AiProviderState) => {
    setState(next);
    // The device's choice wins on this device; the account's applies everywhere else.
    setMode(killioApp()?.claude && readLocalAiProvider(window.localStorage) ? "claude" : next.mode);
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

  useEffect(() => {
    const bridge = killioApp()?.claude;
    if (!bridge) return;
    let cancelled = false;
    bridge.status().then((status) => { if (!cancelled && status.supported) setClaude(status); }).catch(() => {});
    const stored = readLocalAiProvider(window.localStorage);
    if (stored) setClaudeModel(stored.model);
    return () => { cancelled = true; };
  }, []);

  // The model list comes from the person's Claude Code: asked only once they pick the mode (it starts the bridge).
  useEffect(() => {
    const bridge = killioApp()?.claude;
    if (mode !== "claude" || !bridge || !claude?.bun || !claude.claude || claudeModels.length > 0) return;
    let cancelled = false;
    bridge.models()
      .then((list) => {
        if (cancelled) return;
        const ids = (list.data ?? []).map((m) => m.id).filter(Boolean);
        setClaudeModels(ids);
        setClaudeModel((current) => current || ids[0] || "");
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [mode, claude, claudeModels.length]);

  if (!state || !state.enabled) return null;

  const isClaude = mode === "claude";
  const own = mode === "openai" || mode === "anthropic";
  const stored = state.provider && state.provider.kind === mode ? state.provider : null;
  const defaultUrl = mode === "openai" || mode === "anthropic" ? state.defaults[mode] : "";
  const claudeReady = Boolean(claude?.bun && claude.claude);

  const save = async () => {
    if (!accessToken || saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      if (isClaude) {
        // Kept on this device only; the account's provider is left as it is for the person's other devices.
        writeLocalAiProvider(window.localStorage, { mode: "claude", model: claudeModel });
        setSaved(true);
        return;
      }
      writeLocalAiProvider(window.localStorage, null);
      const next = mode === "openai" || mode === "anthropic"
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
        onChange={(e) => { setMode(e.target.value as Mode); setSaved(false); setError(""); }}
        disabled={saving}
        options={[
          { value: "host", label: t("aiProvider.modes.host") },
          { value: "openai", label: "OpenAI" },
          { value: "anthropic", label: "Anthropic" },
          ...(claude ? [{ value: "claude", label: t("aiProvider.modes.claude") }] : []),
        ]}
      />
      <p className="text-xs text-muted-foreground">{isClaude ? t("aiProvider.claudeDesc") : own ? t("aiProvider.ownDesc") : t("aiProvider.hostDesc")}</p>

      {isClaude ? (
        <div className="space-y-2">
          {!claudeReady ? (
            <p className="rounded-md border border-border bg-muted/40 p-2 text-xs" role="status">
              {!claude?.claude ? t("aiProvider.claudeMissingClaude") : t("aiProvider.claudeMissingBun")}
            </p>
          ) : (
            <label className="block space-y-1 text-xs text-muted-foreground">
              {t("aiProvider.model")}
              <Select
                value={claudeModel}
                onChange={(e) => { setClaudeModel(e.target.value); setSaved(false); }}
                disabled={saving || claudeModels.length === 0}
                options={claudeModels.length > 0 ? claudeModels.map((id) => ({ value: id, label: id })) : [{ value: claudeModel, label: claudeModel || "…" }]}
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">{t("aiProvider.claudeTerms")}</p>
        </div>
      ) : null}

      {own ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs text-muted-foreground sm:col-span-2">
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
        disabled={saving || (own && !model.trim()) || (own && !stored && !apiKey.trim()) || (isClaude && (!claudeReady || !claudeModel))}
        className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-accent/10 disabled:opacity-50"
      >
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : saved ? <Check className="mr-2 h-4 w-4" /> : null}
        {saved ? t("aiProvider.saved") : t("aiProvider.save")}
      </button>
    </div>
    </>
  );
}
