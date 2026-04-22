"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/components/providers/i18n-provider";
import {
  TrelloIntegrationCredential,
  getTrelloConnectUrl,
  listTrelloCredentials,
  deleteTrelloCredential,
  searchTrelloBoards,
  importTrelloBoard,
  subscribeTrelloImportProgress,
} from "@/lib/api/integrations";
import { CheckCircle, AlertCircle, Loader2, Trash2, ExternalLink, DownloadCloud, Search, LayoutDashboard } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface TrelloIntegrationPanelProps {
  teamId: string;
  accessToken: string;
}

export function TrelloIntegrationPanel({ teamId, accessToken }: TrelloIntegrationPanelProps) {
  const router = useRouter();
  const t = useTranslations("integrations");
  const [credentials, setCredentials] = useState<TrelloIntegrationCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Import UI State
  const [importingCredId, setImportingCredId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; title: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [importingBoardId, setImportingBoardId] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<{ message: string; percent: number } | null>(null);

  useEffect(() => {
    listTrelloCredentials(teamId, accessToken)
      .then(setCredentials)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teamId, accessToken]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const result = await getTrelloConnectUrl(teamId, accessToken);
      // Trello token flow doesn't preserve state — store teamId before redirect
      localStorage.setItem("trello_pending_teamId", teamId);
      window.location.href = result.url;
    } catch {
      setError(t("integrations.trello.connectStartError") || "Failed to start connection");
      setConnecting(false);
    }
  };

  const [disconnectingCred, setDisconnectingCred] = useState<TrelloIntegrationCredential | null>(null);

  const handleDisconnect = async (credential: TrelloIntegrationCredential) => {
    setDisconnectingCred(credential);
  };

  const confirmDisconnect = async () => {
    if (!disconnectingCred) return;
    try {
      await deleteTrelloCredential(teamId, disconnectingCred.id, accessToken);
      setCredentials((prev) => prev.filter((i) => i.id !== disconnectingCred.id));
      if (importingCredId === disconnectingCred.id) setImportingCredId(null);
    } catch {
      setError(t("integrations.trello.deleteError") || "Failed to disconnect");
      throw new Error();
    }
  };

  const handleSearchBoards = async (credId: string, q: string) => {
    setIsSearching(true);
    setSearchQuery(q);
    try {
      const results = await searchTrelloBoards(teamId, credId, q, accessToken);
      setSearchResults(results);
    } catch {
      // ignore
    } finally {
      setIsSearching(false);
    }
  };

  const handleImport = async (boardId: string) => {
    if (!importingCredId) return;
    setImportingBoardId(boardId);
    setImportSuccess(null);
    setImportProgress({ message: 'Starting import...', percent: 0 });
    try {
      const { jobId } = await importTrelloBoard(teamId, importingCredId, boardId, accessToken);
      await new Promise<void>((resolve, reject) => {
        const unsub = subscribeTrelloImportProgress(teamId, importingCredId!, jobId, accessToken, (ev) => {
          setImportProgress({ message: ev.message, percent: ev.percent });
          if (ev.error) { unsub(); reject(new Error(ev.error)); }
          if (ev.done) { unsub(); resolve(); }
        });
      });
      setImportSuccess(t("integrations.trello.importSuccessMessage") || "Board imported successfully!");
      window.dispatchEvent(new CustomEvent('refresh-documents'));
    } catch (err: any) {
      setError(err.message || t("integrations.trello.importError") || "Failed to import.");
    } finally {
      setImportingBoardId(null);
      setImportProgress(null);
    }
  };

  return (
    <>
      {importingBoardId && (
        <div className="fixed top-20 right-8 z-[100] bg-card border border-border shadow-xl rounded-lg p-4 w-80 flex flex-col gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Importing from Trello...</p>
              <p className="text-xs text-muted-foreground truncate">{importProgress?.message ?? 'Starting...'}</p>
            </div>
            <span className="text-xs font-semibold text-primary tabular-nums">{importProgress?.percent ?? 0}%</span>
          </div>
          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${importProgress?.percent ?? 0}%` }}
            />
          </div>
        </div>
      )}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0052CC] text-white">
          <LayoutDashboard className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Trello</h2>
          <p className="text-xs text-muted-foreground">
            {t("integrations.trello.description") || "Import boards and tasks from Trello"}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          {connecting ? (t("integrations.trello.connecting") || "Connecting...") : (t("integrations.trello.connectButton") || "Connect Trello")}
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-xs font-medium text-muted-foreground">{t("integrations.trello.activeWorkspaces") || "Active Connections"}</p>
        {loading ? (
          <div className="mt-2 flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : credentials.length > 0 ? (
          <div className="mt-2 space-y-2">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      {cred.name}
                    </p>
                    <p className="text-xs text-green-600">
                      {cred.isActive ? t("scripts.active") : t("scripts.inactive")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                        setImportingCredId(importingCredId === cred.id ? null : cred.id);
                        if (importingCredId !== cred.id) handleSearchBoards(cred.id, "");
                    }}
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs bg-primary text-primary-foreground hover:opacity-90"
                  >
                    <DownloadCloud className="h-3.5 w-3.5" />
                    {t("integrations.trello.importBoards") || "Import Boards"}
                  </button>
                  <button
                    onClick={() => handleDisconnect(cred)}
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("integrations.trello.disconnect") || "Disconnect"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t("integrations.trello.noWorkspaces") || "No connected accounts yet."}</p>
        )}
      </div>

      {importingCredId && (
        <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground mb-2">{t("integrations.trello.importTrelloBoard") || "Import Trello Board"}</p>
            <div className="relative mb-3">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                    type="text"
                    placeholder={t("integrations.trello.searchBoards") || "Search boards..."}
                    value={searchQuery}
                    onChange={(e) => handleSearchBoards(importingCredId, e.target.value)}
                    className="w-full rounded-md border border-input pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
            </div>
            
            {importSuccess && (
                <div className="mb-3 text-xs text-green-600 bg-green-50 px-3 py-2 rounded-md border border-green-200">
                    {importSuccess}
                </div>
            )}

            <div className="rounded-md border border-border bg-muted/20 max-h-48 overflow-y-auto">
                {isSearching ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                ) : searchResults.length > 0 ? (
                    <div className="divide-y divide-border">
                        {searchResults.map((board) => (
                            <div key={board.id} className="flex items-center justify-between p-3 hover:bg-muted/50">
                                <span className="text-sm truncate w-2/3">{board.title}</span>
                                <button
                                    onClick={() => handleImport(board.id)}
                                    disabled={importingBoardId === board.id}
                                    className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-50"
                                >
                                    {importingBoardId === board.id ? <Loader2 className="h-3 w-3 animate-spin"/> : (t("integrations.trello.importBtn") || "Import")}
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-4 text-center text-xs text-muted-foreground">{t("integrations.trello.noBoardsFound") || "No boards found."}</div>
                )}
            </div>
        </div>
      )}
    </div>
    <ConfirmDialog
      isOpen={!!disconnectingCred}
      onClose={() => setDisconnectingCred(null)}
      onConfirm={confirmDisconnect}
      title={t("integrations.trello.disconnectTitle") || "Desconectar Trello"}
      description={t("integrations.trello.disconnectConfirm") || "¿Estás seguro de que quieres desconectar esta integración de Trello?"}
      confirmLabel={t("integrations.trello.disconnect") || "Desconectar"}
      cancelLabel={t("integrations.cancel") || "Cancelar"}
      variant="danger"
    />
    </>
  );
}
