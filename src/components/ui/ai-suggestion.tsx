"use client";

import React from "react";
import { Check, X, Info, PlusCircle } from "lucide-react";
import { updateDocumentBrick } from "@/lib/api/documents";
import { createCard, updateCardBrick } from "@/lib/api/contracts";
import { useSession } from "../providers/session-provider";

export type SuggestionType = "BRICK_UPDATE" | "NEW_CARD" | "TASK_COMPLETE";

interface AiSuggestionProps {
  type: SuggestionType;
  docId?: string;
  id?: string; // brickId, boardId, cardId etc
  payload: any;
  explanation?: string;
  onApply: () => void;
  onReject: () => void;
}

export function AiSuggestion({
  type,
  docId,
  id,
  payload,
  explanation,
  onApply,
  onReject,
}: AiSuggestionProps) {
  const { accessToken } = useSession();
  const [isApplying, setIsApplying] = React.useState(false);

  const handleApply = async () => {
    if (!accessToken) return;
    setIsApplying(true);
    try {
      if (type === "BRICK_UPDATE" && id) {
        const targetDocId = payload.docId || docId;
        const targetCardId = payload.cardId;
        
        if (targetDocId) {
          await updateDocumentBrick(targetDocId, id, payload, accessToken);
        } else if (targetCardId) {
          await updateCardBrick(targetCardId, id, {
            kind: 'text',
            displayStyle: 'paragraph',
            markdown: payload.markdown
          }, accessToken);
        }
      } else if (type === "NEW_CARD" && payload.listId) {
        // payload: { title, listId, content }
        await createCard({
            title: payload.title,
            listId: payload.listId,
            // description and position are not part of createCard body
        }, accessToken);
      }
      onApply();
    } catch (e) {
      console.error("Failed to apply suggestion", e);
    } finally {
      setIsApplying(false);
    }
  };

  const Icon = type === "NEW_CARD" ? PlusCircle : Info;
  const title = type === "NEW_CARD" ? "Sugerencia: Nueva Card" : "Sugerencia de Mejora";
  const accentColor = type === "NEW_CARD" ? "text-emerald-500" : "text-accent";
  const bgColor = type === "NEW_CARD" ? "bg-emerald-500/5 border-emerald-500/30" : "bg-accent/5 border-accent/30";
  const headerBg = type === "NEW_CARD" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-accent/10 border-accent/20";

  return (
    <div className={`my-4 rounded-xl border ${bgColor} overflow-hidden shadow-sm animate-in fade-in zoom-in-95 duration-200`}>
      <div className={`${headerBg} px-3 py-2 border-b flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${accentColor}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${accentColor}`}>{title}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onReject}
            disabled={isApplying}
            className="p-1 px-2 rounded-md hover:bg-rose-500/10 text-rose-500 transition-colors flex items-center gap-1 text-[10px] font-bold uppercase"
          >
            <X className="h-3 w-3" /> Rechazar
          </button>
          <button
            onClick={handleApply}
            disabled={isApplying}
            className={`p-1 px-2 rounded-md ${type === "NEW_CARD" ? "bg-emerald-600" : "bg-accent"} text-white hover:opacity-90 transition-colors flex items-center gap-1 text-[10px] font-bold uppercase shadow-sm`}
          >
            {isApplying ? <span className="h-3 w-3 border-2 border-white/30 border-t-white animate-spin rounded-full" /> : <Check className="h-3 w-3" />} 
            {type === "NEW_CARD" ? "Crear" : "Aplicar"}
          </button>
        </div>
      </div>
      
      <div className="p-3 space-y-3">
        {explanation && (
          <p className="text-xs text-muted-foreground italic leading-relaxed">
            "{explanation}"
          </p>
        )}
        
        <div className="grid grid-cols-1 gap-2">
          <div className="rounded-lg border border-border/50 bg-background/50 p-2.5">
            <p className="text-[9px] uppercase font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${type === "NEW_CARD" ? "bg-emerald-500" : "bg-accent"}`} /> 
              {type === "NEW_CARD" ? "Detalles de la Card" : "Nuevo Contenido Sugerido"}
            </p>
            <div className="text-sm font-medium leading-relaxed">
              {type === "NEW_CARD" ? (
                <div className="space-y-1">
                  <div className="text-foreground font-bold">{payload.title}</div>
                  <div className="text-muted-foreground text-[10px]">Lista ID: {payload.listId}</div>
                </div>
              ) : (
                payload.markdown || payload.text || JSON.stringify(payload)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
