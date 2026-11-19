"use client";

// KillioImportChip — rendered in the agent chat whenever the agent calls the
// `killio_import` tool. Shows the proposed file (.kd / .kb / .km / .ks / .kf)
// as a clickable card (.kt card templates and .kg tag groups too, created server-side); clicking it decodes the KAML payload and creates the
// matching entity in the user's active team (or writes it to the local
// workspace FS handle when localMode is on).

import React from "react";
import { FileText, Layout, Network, Workflow, Folder, LayoutTemplate, Tags, Loader2, Check, X, Download } from "lucide-react";
import { importKillioFile } from "@/lib/killio-import-actions";
import { useSession } from "@/components/providers/session-provider";
import { useLocalWorkspace } from "@/components/providers/local-workspace-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { toast } from "@/lib/toast";

type KillioKind = "kd" | "kb" | "km" | "ks" | "kt" | "kg" | "kf";

interface Props {
  path: string;
  kind: KillioKind;
  name: string;
  label: string;
  description?: string | null;
  content: string;
  size: number;
}

const ICON: Record<KillioKind, React.ReactNode> = {
  kd: <FileText className="h-4 w-4" />,
  kb: <Layout className="h-4 w-4" />,
  km: <Network className="h-4 w-4" />,
  ks: <Workflow className="h-4 w-4" />,
  kt: <LayoutTemplate className="h-4 w-4" />,
  kg: <Tags className="h-4 w-4" />,
  kf: <Folder className="h-4 w-4" />,
};

export function KillioImportChip({ path, kind, name, label, description, content }: Props) {
  const t = useTranslations("common");
  const { accessToken, activeTeamId } = useSession();
  const { mode: workspaceMode, writeFile: writeLocalFile } = useLocalWorkspace();
  const isLocal = workspaceMode === "local";

  const KIND_LABEL: Record<KillioKind, string> = {
    kd: t("aiPanel.killioImport.kd"),
    kb: t("aiPanel.killioImport.kb"),
    km: t("aiPanel.killioImport.km"),
    ks: t("aiPanel.killioImport.ks"),
    kt: t("aiPanel.killioImport.kt"),
    kg: t("aiPanel.killioImport.kg"),
    kf: t("aiPanel.killioImport.kf"),
  };

  const [state, setState] = React.useState<"idle" | "importing" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  const handleImport = async () => {
    if (state === "importing" || state === "done") return;
    setState("importing");
    setErrMsg(null);
    try {
      if (isLocal) {
        if (kind === "kt" || kind === "kg") throw new Error(t("aiPanel.draftWorkspace.errLocalOnly"));
        // Local workspace: write the raw KAML straight into the FS handle —
        // a local workspace IS a folder of .kd/.kb/.km/.ks/.kf files, so the
        // agent's output is already the native format.
        await importKillioFile(
          { kind, name, label, content },
          { mode: "local", writeLocal: writeLocalFile },
        );
        toast(t("aiPanel.killioImport.imported", { kind: KIND_LABEL[kind] }), "success");
        setState("done");
        return;
      }
      if (!activeTeamId || !accessToken) throw new Error(t("aiPanel.killioImport.noTarget"));
      if (kind === "kf") {
        toast(t("aiPanel.killioImport.folderAck"), "info");
        setState("done");
        return;
      }
      const res = await importKillioFile(
        { kind, name, label, content },
        { mode: "cloud", accessToken, activeTeamId },
      );
      if (res.status === "skipped") toast(res.message || t("aiPanel.draftWorkspace.skipped"), "info");
      else toast(t("aiPanel.killioImport.imported", { kind: KIND_LABEL[kind] }), "success");
      setState("done");
    } catch (err: any) {
      setErrMsg(err?.message || t("aiPanel.killioImport.errGeneric"));
      setState("error");
    }
  };

  const isDone = state === "done";
  const isErr = state === "error";
  const isBusy = state === "importing";

  return (
    <button
      type="button"
      onClick={handleImport}
      disabled={isBusy || isDone}
      className={`my-2 inline-flex items-start gap-3 rounded-xl border p-3 text-left transition-colors w-full max-w-md ${
        isDone
          ? "border-emerald-500/40 bg-emerald-500/5"
          : isErr
          ? "border-red-500/40 bg-red-500/5"
          : "border-accent/40 bg-accent/5 hover:bg-accent/10 cursor-pointer"
      }`}
    >
      <div className={`shrink-0 mt-0.5 ${isDone ? "text-emerald-500" : isErr ? "text-red-500" : "text-accent"}`}>
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : isDone ? <Check className="h-4 w-4" /> : isErr ? <X className="h-4 w-4" /> : ICON[kind]}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground truncate">{label}</span>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent/10 text-accent">{kind}</span>
        </div>
        {description ? (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={path}>{path}</p>
        )}
        <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
          {isBusy && <span>{t("aiPanel.killioImport.importing")}</span>}
          {isDone && <span className="text-emerald-500">{t("aiPanel.killioImport.doneLabel")}</span>}
          {isErr && <span className="text-red-500">{t("aiPanel.killioImport.errPrefix")}{errMsg}</span>}
          {!isBusy && !isDone && !isErr && (
            <><Download className="h-3 w-3" /> {t("aiPanel.killioImport.cta")}</>
          )}
        </div>
      </div>
    </button>
  );
}
