"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import {
  OneDriveIntegrationCredential,
  OneDriveFile,
  getOneDriveConnectUrl,
  listOneDriveCredentials,
  deleteOneDriveCredential,
  searchOneDriveFiles,
  makeOneDriveFilePublic,
} from "@/lib/api/integrations";
import { CheckCircle, AlertCircle, Loader2, Trash2, ExternalLink, Search, FolderOpen } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface OneDriveIntegrationPanelProps {
  teamId: string;
  accessToken: string;
}

export function OneDriveIntegrationPanel({ teamId, accessToken }: OneDriveIntegrationPanelProps) {
  const t = useTranslations("integrations");
  const [credentials, setCredentials] = useState<OneDriveIntegrationCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File browser state
  const [browsingCredId, setBrowsingCredId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OneDriveFile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Public confirmation state
  const [pendingInsertFile, setPendingInsertFile] = useState<OneDriveFile | null>(null);
  const [makingPublic, setMakingPublic] = useState(false);

  const [disconnectingCred, setDisconnectingCred] = useState<OneDriveIntegrationCredential | null>(null);

  useEffect(() => {
    listOneDriveCredentials(teamId, accessToken)
      .then(setCredentials)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teamId, accessToken]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const result = await getOneDriveConnectUrl(teamId, accessToken);
      window.location.href = result.url;
    } catch {
      setError(t("integrations.onedrive.connectStartError"));
      setConnecting(false);
    }
  };

  const confirmDisconnect = async () => {
    if (!disconnectingCred) return;
    try {
      await deleteOneDriveCredential(teamId, disconnectingCred.id, accessToken);
      setCredentials((prev) => prev.filter((c) => c.id !== disconnectingCred.id));
      if (browsingCredId === disconnectingCred.id) setBrowsingCredId(null);
    } catch {
      setError(t("integrations.onedrive.deleteError"));
      throw new Error();
    }
  };

  const handleSearch = async (credId: string, q: string) => {
    setIsSearching(true);
    setSearchQuery(q);
    try {
      const results = await searchOneDriveFiles(teamId, credId, q, accessToken);
      setSearchResults(results);
    } catch {
      // ignore
    } finally {
      setIsSearching(false);
    }
  };

  const handleInsertFile = (file: OneDriveFile) => {
    setPendingInsertFile(file);
  };

  const handleMakePublicAndInsert = async () => {
    if (!pendingInsertFile || !browsingCredId) return;
    setMakingPublic(true);
    try {
      const result = await makeOneDriveFilePublic(teamId, browsingCredId, pendingInsertFile.id, accessToken);
      window.dispatchEvent(
        new CustomEvent("drive-file-insert", {
          detail: {
            provider: "onedrive",
            fileId: pendingInsertFile.id,
            fileName: pendingInsertFile.name,
            mimeType: pendingInsertFile.mimeType,
            webUrl: result.webUrl,
            isPublic: true,
            credentialId: browsingCredId,
          },
        }),
      );
    } catch {
      setError(t("integrations.onedrive.makePublicError"));
    } finally {
      setMakingPublic(false);
      setPendingInsertFile(null);
    }
  };

  const handleInsertPrivately = () => {
    if (!pendingInsertFile || !browsingCredId) return;
    window.dispatchEvent(
      new CustomEvent("drive-file-insert", {
        detail: {
          provider: "onedrive",
          fileId: pendingInsertFile.id,
          fileName: pendingInsertFile.name,
          mimeType: pendingInsertFile.mimeType,
          webUrl: pendingInsertFile.webUrl,
          isPublic: false,
          credentialId: browsingCredId,
        },
      }),
    );
    setPendingInsertFile(null);
  };

  const connected = credentials.length > 0;

  return (
    <>
      <ConfirmDialog
        open={!!disconnectingCred}
        title={t("integrations.onedrive.disconnectTitle")}
        description={t("integrations.onedrive.disconnectConfirm")}
        onConfirm={confirmDisconnect}
        onCancel={() => setDisconnectingCred(null)}
      />

      {/* Public confirmation modal */}
      {pendingInsertFile && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1117] p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-[#0078d4]" />
              <h2 className="text-sm font-semibold text-white">
                {t("integrations.onedrive.makePublicTitle")}
              </h2>
            </div>
            <p className="mb-1 truncate text-xs font-medium text-white/70">{pendingInsertFile.name}</p>
            <p className="mb-6 text-xs text-white/50">
              {t("integrations.onedrive.makePublicDescription")}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleMakePublicAndInsert}
                disabled={makingPublic}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0078d4] px-4 py-2 text-xs font-semibold text-white hover:bg-[#006cbe] disabled:opacity-60"
              >
                {makingPublic && <Loader2 className="h-3 w-3 animate-spin" />}
                {t("integrations.onedrive.makePublicConfirm")}
              </button>
              <button
                type="button"
                onClick={handleInsertPrivately}
                disabled={makingPublic}
                className="flex flex-1 items-center justify-center rounded-lg border border-white/15 px-4 py-2 text-xs text-white/70 hover:bg-white/5 disabled:opacity-60"
              >
                {t("integrations.onedrive.makePublicSkip")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minWidth: 0,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(0,120,212,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <FolderOpen style={{ width: 18, height: 18, color: "#0078d4" }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "rgba(255,255,255,0.92)", lineHeight: 1.3 }}>
                {t("integrations.onedrive.title")}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4, marginTop: 2 }}>
                {t("integrations.onedrive.description")}
              </div>
            </div>
          </div>
          {connected && (
            <CheckCircle style={{ width: 16, height: 16, color: "#22c55e", flexShrink: 0 }} />
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#f87171", background: "rgba(248,113,113,0.08)", borderRadius: 8, padding: "8px 10px" }}>
            <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
            <Loader2 style={{ width: 16, height: 16, color: "rgba(255,255,255,0.3)", animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {/* Credentials list */}
        {!loading && credentials.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
              {t("integrations.onedrive.activeAccounts")}
            </div>
            {credentials.map((cred) => (
              <div
                key={cred.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.88)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {cred.name}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{cred.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setBrowsingCredId(browsingCredId === cred.id ? null : cred.id)}
                  style={{ padding: "4px 10px", fontSize: 11, borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}
                >
                  {browsingCredId === cred.id ? "▲" : t("integrations.onedrive.searchFiles")}
                </button>
                <button
                  type="button"
                  onClick={() => setDisconnectingCred(cred)}
                  style={{ padding: 6, borderRadius: 7, border: "none", background: "transparent", color: "rgba(255,80,80,0.7)", cursor: "pointer" }}
                  title={t("integrations.onedrive.disconnect")}
                >
                  <Trash2 style={{ width: 13, height: 13 }} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* File browser (per credential) */}
        {browsingCredId && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "6px 10px" }}>
              <Search style={{ width: 13, height: 13, color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
              <input
                type="text"
                placeholder={t("integrations.onedrive.searchFiles")}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearch(browsingCredId, e.target.value);
                }}
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12, color: "rgba(255,255,255,0.8)" }}
              />
              {isSearching && <Loader2 style={{ width: 12, height: 12, color: "rgba(255,255,255,0.3)", animation: "spin 1s linear infinite" }} />}
            </div>

            {searchResults.length === 0 && !isSearching && searchQuery && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "8px 0" }}>
                {t("integrations.onedrive.noFilesFound")}
              </div>
            )}

            {searchResults.map((file) => (
              <div
                key={file.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                    {file.mimeType ?? (file.size != null ? `${Math.round(file.size / 1024)} KB` : "")}
                  </div>
                </div>
                {file.webUrl && (
                  <a href={file.webUrl} target="_blank" rel="noopener noreferrer" style={{ padding: 4, color: "rgba(255,255,255,0.35)", lineHeight: 1 }}>
                    <ExternalLink style={{ width: 12, height: 12 }} />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => handleInsertFile(file)}
                  style={{ padding: "3px 8px", fontSize: 11, borderRadius: 6, border: "1px solid rgba(0,120,212,0.4)", background: "rgba(0,120,212,0.1)", color: "#0078d4", cursor: "pointer" }}
                >
                  {t("integrations.onedrive.insertFile")}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Connect button */}
        {!loading && (
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 9,
              padding: "9px 16px",
              background: connected ? "rgba(255,255,255,0.05)" : "rgba(0,120,212,0.85)",
              border: connected ? "1px solid rgba(255,255,255,0.1)" : "none",
              color: connected ? "rgba(255,255,255,0.55)" : "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: connecting ? "not-allowed" : "pointer",
              opacity: connecting ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {connecting && <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />}
            {connecting
              ? t("integrations.onedrive.connecting")
              : connected
              ? t("integrations.onedrive.connectButton") + " +"
              : t("integrations.onedrive.connectButton")}
          </button>
        )}
      </div>
    </>
  );
}
