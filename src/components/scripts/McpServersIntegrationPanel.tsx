"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import {
  McpServerConfig,
  listMcpServers,
  saveMcpServer,
  deleteMcpServer,
} from "@/lib/api/integrations";
import {
  Plug,
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
  Plus,
  Link2,
  X,
  KeyRound,
} from "lucide-react";

interface McpServersIntegrationPanelProps {
  teamId: string;
  accessToken: string;
}

/**
 * "Custom MCP servers" panel — users register their OWN MCP servers (name + url +
 * transport + optional auth header), enable/disable and delete them. Configs are
 * persisted by the backend in the existing team env-var store (no new table); the
 * agent discovers each enabled server's tools and proxies tools/call to it.
 */
export function McpServersIntegrationPanel({ teamId, accessToken }: McpServersIntegrationPanelProps) {
  const t = useTranslations("integrations");
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<"http" | "sse">("http");
  const [authHeader, setAuthHeader] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setServers(await listMcpServers(teamId, accessToken));
    } catch {
      setError(t("integrations.mcp.loadError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [teamId, accessToken]);

  const resetForm = () => {
    setName("");
    setUrl("");
    setTransport("http");
    setAuthHeader("");
  };

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveMcpServer(
        teamId,
        {
          name: name.trim(),
          url: url.trim(),
          transport,
          authHeader: authHeader.trim() ? authHeader.trim() : undefined,
          enabled: true,
        },
        accessToken,
      );
      setServers((prev) => [saved, ...prev.filter((s) => s.id !== saved.id)]);
      resetForm();
      setSuccess(true);
      setShowConnectModal(false);
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      setError(t("integrations.mcp.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (server: McpServerConfig) => {
    setError(null);
    try {
      const saved = await saveMcpServer(
        teamId,
        { id: server.id, name: server.name, url: server.url, transport: server.transport, enabled: !server.enabled },
        accessToken,
      );
      setServers((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
    } catch {
      setError(t("integrations.mcp.saveError"));
    }
  };

  const handleDelete = async (server: McpServerConfig) => {
    if (!window.confirm(t("integrations.mcp.deleteConfirm"))) return;
    try {
      await deleteMcpServer(teamId, server.id, accessToken);
      setServers((prev) => prev.filter((s) => s.id !== server.id));
    } catch {
      setError(t("integrations.mcp.deleteError"));
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-700 text-white">
          <Plug className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{t("integrations.mcp.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("integrations.mcp.description")}</p>
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => {
            setError(null);
            resetForm();
            setShowConnectModal(true);
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Link2 className="h-4 w-4" />
          {t("integrations.mcp.connect")}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-violet-300/60 bg-violet-500/10 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
          <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {t("integrations.mcp.saved")}
        </div>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground">{t("integrations.mcp.savedServers")}</p>
        {loading ? (
          <div className="mt-2 flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : servers.length > 0 ? (
          <div className="mt-2 space-y-2">
            {servers.map((server) => (
              <div key={server.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {server.name}
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {server.transport}
                    </span>
                    {server.hasAuthHeader && (
                      <KeyRound className="ml-1 inline h-3 w-3 text-muted-foreground" />
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{server.url}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleToggle(server)}
                    className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] ${
                      server.enabled
                        ? "text-emerald-600 hover:bg-emerald-500/10"
                        : "text-muted-foreground hover:bg-accent/10"
                    }`}
                  >
                    {server.enabled ? t("integrations.mcp.enabled") : t("integrations.mcp.disabled")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(server)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("integrations.mcp.delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("integrations.mcp.noServers")}</p>
        )}
      </div>

      {showConnectModal && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t("integrations.mcp.connectModalTitle")}</h3>
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
                onChange={(e) => setName(e.target.value)}
                placeholder={t("integrations.mcp.fields.name")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("integrations.mcp.fields.url")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <select
                value={transport}
                onChange={(e) => setTransport(e.target.value as "http" | "sse")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="http">{t("integrations.mcp.fields.transportHttp")}</option>
                <option value="sse">{t("integrations.mcp.fields.transportSse")}</option>
              </select>
              <input
                type="password"
                value={authHeader}
                onChange={(e) => setAuthHeader(e.target.value)}
                placeholder={t("integrations.mcp.fields.authHeader")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !name.trim() || !url.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t("integrations.mcp.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
