"use client";

import { ComponentProps, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { ScriptCanvas } from "./ScriptCanvas";

// The text editor is only loaded when someone opens the "Text" tab, so the main bundle does not grow.
const ScriptTextEditor = dynamic(() => import("./ScriptTextEditor"), {
  ssr: false,
  loading: () => <div className="flex flex-1 items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-foreground/50" /></div>,
});

type CanvasProps = ComponentProps<typeof ScriptCanvas>;

/** "Blocks | Text" switch around the block editor. The graph stays the canonical script; the text is another view of it. */
export function ScriptEditorSwitch(props: CanvasProps) {
  const t = useTranslations("integrations");
  const [mode, setMode] = useState<"blocks" | "text">("blocks");
  const tab = (id: "blocks" | "text", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === id}
      onClick={() => setMode(id)}
      className={`rounded-md px-3 py-1 text-xs font-semibold transition ${mode === id ? "bg-foreground/15 text-foreground" : "text-foreground/55 hover:text-foreground"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex shrink-0 items-center gap-1 px-3 pt-2">
        <div className="inline-flex gap-0.5 rounded-lg bg-foreground/5 p-0.5">
          {tab("blocks", t("scripts.dsl.blocks"))}
          {tab("text", t("scripts.dsl.text"))}
        </div>
      </div>
      {mode === "blocks" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden"><ScriptCanvas {...props} /></div>
      ) : (
        <ScriptTextEditor
          scriptId={props.scriptId}
          teamId={props.teamId ?? ""}
          accessToken={props.accessToken ?? ""}
          onSave={props.onSave}
          onBackToBlocks={() => setMode("blocks")}
        />
      )}
    </div>
  );
}
