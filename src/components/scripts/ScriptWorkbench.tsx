"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import type { ScriptGraph, ScriptSummary } from "@/lib/api/scripts";
import type { WorkbenchTab } from "@/lib/scripts-ui/workbench";
import { RunLogsPanel } from "./RunLogsPanel";
import { ScriptCanvas } from "./ScriptCanvas";
import { LockedScriptPanel } from "./script-lock";
import type { TextEditorApi } from "./ScriptTextEditor";
import { ScriptTopbar } from "./ScriptTopbar";

// The text editor is only loaded when someone opens the "Text" tab, so the main bundle does not grow.
const ScriptTextEditor = dynamic(() => import("./ScriptTextEditor"), {
  ssr: false,
  loading: () => <div className="flex flex-1 items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-foreground/50" /></div>,
});

export interface ScriptWorkbenchProps {
  script: ScriptSummary;
  teamId: string;
  accessToken: string;
  graph: ScriptGraph | null;
  graphLoading: boolean;
  webhookUrl: string | null;
  canRunManually: boolean;
  onSaveGraph: (graph: ScriptGraph) => Promise<void>;
  onToggleActive: (isActive: boolean) => Promise<void>;
  onRunManual: () => Promise<void>;
  onDelete: () => Promise<void>;
  onLockChanged: (locked: boolean) => Promise<void> | void;
  onDuplicated: (copy: ScriptSummary) => void;
  onRenamed: (updated: ScriptSummary) => void;
  listCollapsed?: boolean;
  onToggleList?: () => void;
}

/**
 * Everything to the right of the script list: ONE top bar (title, state, Blocks | Text | Runs, actions, "…") and the body that fills the
 * rest of the window height. A locked script keeps the bar (lock state, unlock, delete) but never loads graph, text or runs.
 */
export function ScriptWorkbench(props: ScriptWorkbenchProps) {
  const { script, teamId, accessToken } = props;
  const [tab, setTab] = useState<WorkbenchTab>("blocks");
  const [textApi, setTextApi] = useState<TextEditorApi | null>(null);
  const locked = script.locked === true;

  useEffect(() => { setTab("blocks"); setTextApi(null); }, [script.id]);
  useEffect(() => { if (tab !== "text") setTextApi(null); }, [tab]);

  const topbar = (canvas: Parameters<NonNullable<React.ComponentProps<typeof ScriptCanvas>["renderTopbar"]>>[0] | null) => (
    <ScriptTopbar
      script={script}
      teamId={teamId}
      accessToken={accessToken}
      tab={tab}
      onTab={setTab}
      canvas={canvas}
      text={tab === "text" ? textApi : null}
      canRunManually={props.canRunManually}
      webhookUrl={props.webhookUrl}
      onToggleActive={props.onToggleActive}
      onDelete={props.onDelete}
      onLockChanged={props.onLockChanged}
      onDuplicated={props.onDuplicated}
      onRenamed={props.onRenamed}
      listCollapsed={props.listCollapsed}
      onToggleList={props.onToggleList}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden lg:h-auto">
      {locked ? (
        <>
          {topbar(null)}
          <LockedScriptPanel script={script} />
        </>
      ) : tab === "blocks" ? (
        props.graphLoading ? (
          <>
            {topbar(null)}
            <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <ScriptCanvas
              scriptId={script.id}
              graph={props.graph}
              isActive={script.isActive}
              webhookUrl={props.webhookUrl}
              teamId={teamId}
              accessToken={accessToken}
              onSave={props.onSaveGraph}
              onToggle={props.onToggleActive}
              canRunManually={props.canRunManually}
              onRunManual={props.onRunManual}
              renderTopbar={(api) => topbar(api)}
            />
          </div>
        )
      ) : tab === "text" ? (
        <>
          {topbar(null)}
          <ScriptTextEditor
            scriptId={script.id}
            teamId={teamId}
            accessToken={accessToken}
            onSave={props.onSaveGraph}
            onBackToBlocks={() => setTab("blocks")}
            onApi={setTextApi}
          />
        </>
      ) : (
        <>
          {topbar(null)}
          <div className="min-h-0 flex-1 overflow-hidden">
            <RunLogsPanel scriptId={script.id} teamId={teamId} accessToken={accessToken} />
          </div>
        </>
      )}
    </div>
  );
}
