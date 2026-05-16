"use client";

import { useRef, useState } from "react";
import { Send, Bot, Image as ImageIcon, Loader2, FileText, X } from "lucide-react";
import { usePlatform } from "@/components/providers/platform-provider";
import { ReferenceTokenInput } from "@/components/ui/reference-token-input";
import { useSession } from "@/components/providers/session-provider";
import { uploadFile } from "@/lib/api/uploads";
import type { RoomMessage, RoomMember } from "@/lib/api/rooms";
import type { DocumentSummary } from "@/lib/api/documents";
import { API_BASE_URL } from "@/lib/api/client";

const resolveAssetUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return url;
};

type TFn = (key: string, params?: Record<string, string | number>) => string;

interface RoomInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (content?: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  roomName?: string;
  documents?: DocumentSummary[];
  boards?: any[];
  users?: any[];
  transcripts?: Array<{ callId: string; roomId: string; roomName: string; startedAt: string }>;
  activeCallId?: string;
  onAiTrigger?: (content: string) => void;
  replyTo?: RoomMessage;
  teamId?: string;
  t: TFn;
}

const AI_PREFIXES = ["#ai ", "#AI "];

export function RoomInput({
  value,
  onChange,
  onSend,
  onTyping,
  disabled = false,
  readOnly = false,
  roomName = "",
  documents,
  boards,
  users,
  transcripts,
  activeCallId,
  onAiTrigger,
  replyTo,
  teamId,
  t,
}: RoomInputProps) {
  const { accessToken } = useSession();
  const [isUploading, setIsUploading] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string; name: string; type: 'img' | 'document' }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const platform = usePlatform();
  const isMobile = platform === "mobile";

  const isAiQuery = AI_PREFIXES.some((p) => value.startsWith(p));

  const handleChange = (v: string) => {
    onChange(v);
    onTyping?.();
  };

  const handleSubmit = () => {
    if (!value.trim() && attachments.length === 0) return;

    let finalContent = value;
    if (attachments.length > 0) {
      const assetTags = attachments.map(att =>
        att.type === 'img'
          ? `<asset type="img" src="${att.url}" />`
          : `<asset type="document" src="${att.url}" title="${att.name}" />`
      ).join('\n');
      finalContent = finalContent.trim() ? `${finalContent}\n\n${assetTags}` : assetTags;
    }

    onSend(finalContent);
    setAttachments([]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;
    await performUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const performUpload = async (file: File) => {
    if (!accessToken) return;
    try {
      setIsUploading(true);
      const res = await uploadFile(file, accessToken, {
        ownerScopeType: "team",
        ownerScopeId: teamId,
        usage: "chat_attachment"
      });

      const isImage = file.type.startsWith("image/");
      setAttachments(prev => [...prev, {
        url: res.url,
        name: file.name,
        type: isImage ? 'img' : 'document'
      }]);
    } catch (err) {
      console.error("Failed to upload file:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1 || items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          await performUpload(file);
        }
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await performUpload(file);
    }
  };

  if (readOnly) {
    return (
      <div className={isMobile ? "px-3 py-3 border-t border-border/50 bg-background/30" : "px-4 py-3 border-t border-border/50 bg-background/30"}>
        <div className="rounded-xl bg-muted/30 border border-border/30 px-3 py-2 text-xs text-muted-foreground italic text-center">
          {t("chat.readOnly")}
        </div>
      </div>
    );
  }

  const containerClass = isMobile
    ? "sticky bottom-0 z-50 px-3 py-3 border-t border-border/50 bg-background/90 backdrop-blur-sm"
    : "px-4 py-3 border-t border-border/50 bg-background/30 shrink-0";

  return (
    <div
      className={containerClass}
      onPaste={handlePaste}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 px-1 animate-in slide-in-from-bottom-2 duration-300">
          {attachments.map((att, idx) => (
            <div key={idx} className="relative group/att">
              {att.type === 'img' ? (
                <div className="w-16 h-16 rounded-xl border border-border/50 overflow-hidden bg-muted/20">
                  <img src={resolveAssetUrl(att.url)} alt="preview" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-16 px-3 flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 text-[10px] font-medium text-muted-foreground">
                  <FileText className="w-4 h-4 text-violet-500" />
                  <span className="max-w-[80px] truncate">{att.name}</span>
                </div>
              )}
              <button
                onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover/att:opacity-100 transition-opacity shadow-sm"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          {isUploading && (
            <div className="w-16 h-16 rounded-xl border border-dashed border-border/50 flex items-center justify-center bg-muted/5">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
            </div>
          )}
        </div>
      )}

      {isAiQuery && (
        <div className="flex items-center gap-1 text-[10px] text-violet-400 font-medium mb-1 px-1">
          <Bot className="w-3 h-3" />
          <span>AI Copilot mode — press Enter to send to chat</span>
        </div>
      )}
      <div className="relative flex items-center">
        <input
          type="file"
          accept="image/*,application/pdf,text/markdown,.md"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-1.5 rounded-lg hover:bg-violet-400/10 text-violet-500/60 hover:text-violet-500 transition-all"
          title="Adjuntar imagen"
        >
          <ImageIcon className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-1.5 rounded-lg hover:bg-violet-400/10 text-violet-500/60 hover:text-violet-500 transition-all"
          title="Adjuntar archivo"
        >
          <div className="relative">
            <FileText className="w-4 h-4" />
            <div className="absolute -top-1 -right-1 bg-violet-500 text-white rounded-full w-2.5 h-2.5 flex items-center justify-center text-[7px] font-bold">+</div>
          </div>
        </button>
        <ReferenceTokenInput
          value={value}
          onChange={handleChange}
          placeholder={t("chat.inputPlaceholder", { roomName })}
          documents={documents}
          boards={boards}
          users={users}
          transcripts={transcripts}
          activeCallId={activeCallId}
          onSubmit={handleSubmit}
          submitOnEnter
          focusSignal={replyTo?.id}
          disabled={disabled || isUploading}
          className="w-full"
          inputClassName={isMobile ? "pr-12 shadow-sm" : "pr-10 shadow-sm"}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || isUploading || (!value.trim() && attachments.length === 0)}
          className={`absolute right-1.5 p-2 rounded-full transition-colors shadow-sm disabled:opacity-40 ${isAiQuery
              ? "bg-violet-600 text-white hover:bg-violet-700"
              : "bg-accent text-accent-foreground hover:bg-accent/90"
            }`}
        >
          {isAiQuery ? <Bot className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
