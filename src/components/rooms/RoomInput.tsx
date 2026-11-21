"use client";

import { useMemo, useRef, useState } from "react";
import { Send, Bot, Image as ImageIcon, Loader2, FileText, X, Megaphone, Lock, VolumeX, Slash, Paperclip } from "lucide-react";
import { usePlatform } from "@/components/providers/platform-provider";
import { ReferenceTokenInput } from "@/components/ui/reference-token-input";
import { useSession } from "@/components/providers/session-provider";
import { uploadFile } from "@/lib/api/uploads";
import type { RoomMessage, TeamRoleLite } from "@/lib/api/rooms";
import type { DocumentSummary } from "@/lib/api/documents";
import { API_BASE_URL } from "@/lib/api/client";
import type { ComposerMode } from "@/lib/rooms/room-controls";
import { activeSlashQuery, buildSlashCandidates, BUILTIN_COMMANDS, type SlashCommand } from "@/lib/rooms/message-structure";
import { EVERYONE_TOKEN, fromWireMentions, roleMentionToken, toWireMentions } from "@/lib/rooms/mentions";
import { analyzeArgs, checkSlashInput, type ArgSuggestion } from "@/lib/bots/command-args";

const resolveAssetUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return url;
};

type TFn = (key: string, params?: Record<string, string | number>) => string;

type Attachment = { url: string; name: string; type: "img" | "document"; size: number };

const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

interface RoomInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (content?: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
  /** Legacy switch: same as `composer="readonly"`. */
  readOnly?: boolean;
  /** `input` (default), or the notice that replaces the field when the user cannot write. */
  composer?: ComposerMode;
  /** Minutes left of a timed mute, shown in the notice. */
  muteMinutesLeft?: number | null;
  muteReason?: string | null;
  isAiRoom?: boolean;
  roomName?: string;
  documents?: DocumentSummary[];
  boards?: any[];
  users?: any[];
  roles?: TeamRoleLite[];
  canMentionEveryone?: boolean;
  /** Slash commands registered by the team bots (the built-in /poll and /survey are always offered). */
  commands?: SlashCommand[];
  /** Channels of the workspace, offered for `channel` arguments of bot commands. */
  rooms?: Array<{ id: string; name: string }>;
  transcripts?: Array<{ callId: string; roomId: string; roomName: string; startedAt: string }>;
  activeCallId?: string;
  onAiTrigger?: (content: string) => void;
  replyTo?: RoomMessage;
  teamId?: string;
  t: TFn;
}

const AI_PREFIXES = ["#ai ", "#AI "];

export function RoomInput({
  value, onChange, onSend, onTyping, disabled = false, readOnly = false, composer, muteMinutesLeft, muteReason, isAiRoom = false, roomName = "",
  documents, boards, users, roles, canMentionEveryone = false, commands, rooms, transcripts, activeCallId, replyTo, teamId, t,
}: RoomInputProps) {
  const { accessToken } = useSession();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [argIndex, setArgIndex] = useState(0);
  const [argDismissed, setArgDismissed] = useState(false);
  /** Problems the backend's own parser found in the arguments just typed (shown instead of sending a call that would be refused). */
  const [argProblem, setArgProblem] = useState<ReturnType<typeof checkSlashInput>>(null);

  const platform = usePlatform();
  const isMobile = platform === "mobile";
  const mode: ComposerMode = composer ?? (readOnly ? "readonly" : "input");

  const isAiQuery = AI_PREFIXES.some((p) => value.startsWith(p));

  const extraMentions = useMemo(() => [
    ...(canMentionEveryone ? [{ token: EVERYONE_TOKEN, label: "everyone", mentionType: "everyone" as const, subtitle: t("mention.everyoneHint"), search: "everyone todos all here" }] : []),
    ...(roles ?? []).filter((r) => r.mentionable).map((r) => ({
      token: roleMentionToken(r), label: r.name, mentionType: "role" as const, color: r.color, subtitle: t("mention.role"), search: `role rol ${r.name}`,
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [roles, canMentionEveryone]);

  const slashQuery = slashDismissed ? null : activeSlashQuery(value);
  const slashCandidates = useMemo(
    () => (slashQuery === null ? [] : buildSlashCandidates([...BUILTIN_COMMANDS, ...(commands ?? [])], slashQuery)),
    [slashQuery, commands],
  );
  const slashOpen = slashCandidates.length > 0;
  const slashActive = Math.min(slashIndex, Math.max(0, slashCandidates.length - 1));

  // Bot commands that declare typed options: autocomplete of the next argument and validation before sending.
  const commandDefs = useMemo(() => (commands ?? []).filter((c) => c.source !== "builtin").map((c) => ({ name: c.name, options: c.options ?? [] })), [commands]);
  const wireValue = useMemo(() => toWireMentions(value), [value]);
  const argSources = useMemo(
    () => ({
      users: (users ?? []).map((u: any) => ({ id: String(u.id), name: String(u.name ?? u.displayName ?? "") })).filter((u) => u.id && u.name),
      roles: (roles ?? []).filter((r) => r.mentionable).map((r) => ({ id: r.id, name: r.name })),
      rooms: rooms ?? [],
    }),
    [users, roles, rooms],
  );
  const analysis = useMemo(() => {
    const m = /^\/([a-z0-9_-]{1,32})\s([\s\S]*)$/i.exec(wireValue);
    if (!m) return null;
    const def = commandDefs.find((d) => d.name.toLowerCase() === m[1].toLowerCase() && d.options.length > 0);
    if (!def) return null;
    const a = analyzeArgs(def.name, def.options, m[2], argSources);
    // A mention token the editor already turned into a chip, or an @ being typed (the editor's own picker handles it): nothing to add here.
    const tail = m[2].slice(m[2].length - a.partialLength);
    return { ...a, command: def.name, suggestions: tail.includes("](") || tail.startsWith("@") ? [] : a.suggestions };
  }, [wireValue, commandDefs, argSources]);
  // While the problem banner is up the list stays closed (they would overlap); typing again clears the banner and brings the list back.
  const argSuggestions = argDismissed || argProblem || !analysis ? [] : analysis.suggestions;
  const argOpen = argSuggestions.length > 0;
  const argActive = Math.min(argIndex, Math.max(0, argSuggestions.length - 1));

  const handleChange = (v: string) => {
    setSlashDismissed(false);
    setSlashIndex(0);
    setArgDismissed(false);
    setArgIndex(0);
    setArgProblem(null);
    onChange(v);
    onTyping?.();
  };

  const pickArg = (s: ArgSuggestion) => {
    if (!analysis) return;
    const base = value.slice(0, value.length - analysis.partialLength);
    onChange(`${base}${fromWireMentions(s.insert)}${s.kind === "option" ? "" : " "}`);
    setArgDismissed(false);
    setArgIndex(0);
    setInputKey((k) => k + 1);
  };

  const pickSlash = (c: SlashCommand) => {
    onChange(`/${c.name} `);
    setSlashDismissed(true);
    setInputKey((k) => k + 1); // the field does not take outside edits while focused: remount with the new text
  };

  const handleSubmit = () => {
    if (!value.trim() && attachments.length === 0) return;

    const problem = checkSlashInput(wireValue, commandDefs);
    if (problem) {
      setArgProblem(problem);
      return;
    }

    let finalContent = value;
    if (attachments.length > 0) {
      const assetTags = attachments.map((att) =>
        att.type === "img"
          ? `<asset type="img" src="${att.url}" />`
          : `<asset type="document" src="${att.url}" title="${att.name.replace(/"/g, "&quot;")}" />`
      ).join("\n");
      finalContent = finalContent.trim() ? `${finalContent}\n\n${assetTags}` : assetTags;
    }

    onSend(finalContent);
    setAttachments([]);
  };

  const performUpload = async (file: File) => {
    if (!accessToken) return;
    try {
      setIsUploading(true);
      setUploadError(null);
      const res = await uploadFile(file, accessToken, { ownerScopeType: "team", ownerScopeId: teamId, usage: "chat_attachment" });
      setAttachments((prev) => [...prev, { url: res.url, name: file.name, type: file.type.startsWith("image/") ? "img" : "document", size: file.size }]);
    } catch (err) {
      console.error("Failed to upload file:", err);
      setUploadError(t("composer.uploadFailed", { name: file.name }));
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await performUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    if (file) await performUpload(file);
  };

  const pad = isMobile ? "px-3 py-2.5" : "px-4 py-3";

  // The user cannot write here: a clear notice instead of a field that would fail.
  if (mode !== "input") {
    const Icon = mode === "announcement" ? Megaphone : mode === "muted" ? VolumeX : Lock;
    const text =
      mode === "announcement" ? t("composer.announcement")
        : mode === "muted"
          ? muteMinutesLeft ? t("composer.mutedFor", { time: muteMinutesLeft < 60 ? t("mod.duration.minutes", { count: muteMinutesLeft }) : muteMinutesLeft < 1440 ? t("mod.duration.hours", { count: Math.ceil(muteMinutesLeft / 60) }) : t("mod.duration.days", { count: Math.ceil(muteMinutesLeft / 1440) }) }) : t("composer.muted")
          : t("chat.readOnly");
    return (
      <div className={`shrink-0 border-t border-border/50 bg-background/50 ${pad}`}>
        <div role="status" className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p>{text}</p>
            {mode === "muted" && muteReason && <p className="mt-0.5 italic">{t("composer.mutedReason", { reason: muteReason })}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${isMobile ? "sticky bottom-0 z-30 bg-background/95 backdrop-blur-sm" : "bg-background/40"} shrink-0 border-t border-border/50 ${pad}`}
      onPaste={handlePaste}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2 px-1" aria-label={t("composer.attachments")}>
          {attachments.map((att, idx) => (
            <li key={`${att.url}-${idx}`} className="group/att relative">
              {att.type === "img" ? (
                <div className="h-16 w-16 overflow-hidden rounded-xl border border-border bg-muted/30">
                  <img src={resolveAssetUrl(att.url)} alt={att.name} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div className="flex h-16 max-w-[180px] items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 text-[11px]">
                  <FileText className="h-5 w-5 shrink-0 text-violet-500" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{att.name}</span>
                    <span className="block text-[10px] text-muted-foreground">{formatSize(att.size)}</span>
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                aria-label={t("composer.removeAttachment", { name: att.name })}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-600 p-1 text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:opacity-0 md:group-hover/att:opacity-100 md:focus-visible:opacity-100"
              >
                <X className="h-2.5 w-2.5" aria-hidden />
              </button>
            </li>
          ))}
          {isUploading && (
            <li className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-border" role="status" aria-label={t("composer.uploading")}>
              <Loader2 className="h-4 w-4 animate-spin text-violet-400 motion-reduce:animate-none" aria-hidden />
            </li>
          )}
        </ul>
      )}

      {uploadError && <p role="alert" className="mb-2 px-1 text-xs text-destructive">{uploadError}</p>}

      {argProblem && (
        <div role="alert" className="mb-2 rounded-xl border-2 border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-foreground">
          <p className="font-bold text-destructive">{t("composer.args.invalid", { command: argProblem.command })}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {argProblem.errors.map((e, i) => (
              <li key={i}>
                {e.option && <span className="font-mono font-semibold">{e.option}: </span>}
                {t(`composer.args.errors.${e.code}`, e.params ?? {})}
              </li>
            ))}
          </ul>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{t("composer.args.usage", { usage: argProblem.usage })}</p>
        </div>
      )}

      {isAiQuery && (
        <div className="mb-1 flex items-center gap-1 px-1 text-[10px] font-medium text-violet-500">
          <Bot className="h-3 w-3" aria-hidden />
          <span>{t("chat.aiCopilotMode")}</span>
        </div>
      )}

      <div className="relative flex items-center gap-0.5">
        <input type="file" accept="image/*,application/pdf,text/markdown,.md" className="sr-only" tabIndex={-1} ref={fileInputRef} onChange={handleFileChange} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 motion-reduce:transition-none"
          aria-label={t("chat.attachFile")}
          title={t("chat.attachFile")}
        >
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Paperclip className="h-4 w-4" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="hidden shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 motion-reduce:transition-none sm:block"
          aria-label={t("chat.attachImage")}
          title={t("chat.attachImage")}
        >
          <ImageIcon className="h-4 w-4" aria-hidden />
        </button>

        <div className="relative min-w-0 flex-1">
          {slashOpen && (
            <ul
              role="listbox"
              aria-label={t("composer.commands")}
              className="absolute bottom-full left-0 z-40 mb-2 max-h-56 w-full max-w-sm overflow-y-auto rounded-xl border border-border bg-popover py-1 shadow-lg"
            >
              {slashCandidates.map((c, i) => (
                <li key={`${c.source}:${c.name}`} role="option" aria-selected={i === slashActive}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => { e.preventDefault(); pickSlash(c); }}
                    className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs ${i === slashActive ? "bg-muted" : "hover:bg-muted/60"}`}
                  >
                    <Slash className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold">/{c.name}</span>
                        {c.source !== "builtin" && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-violet-500/15 px-1 text-[9px] font-bold uppercase text-violet-700 dark:text-violet-300"><Bot className="h-2 w-2" aria-hidden />{c.source}</span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">{c.source === "builtin" ? t(`composer.builtin.${c.name}`) : c.description || c.usage}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {argOpen && analysis && (
            <div className="absolute bottom-full left-0 z-40 mb-2 w-full max-w-sm overflow-hidden rounded-xl border-2 border-[var(--memphis-line)] bg-popover shadow-[3px_3px_0_0_var(--memphis-shadow)]">
              <p className="border-b border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                {analysis.usage}
                {analysis.expecting && (
                  <span className="mt-0.5 block font-sans">
                    <span className="font-semibold text-foreground">{analysis.expecting.name}</span>
                    {analysis.expecting.required ? ` (${t("composer.args.required")})` : ""}
                    {analysis.expecting.description ? ` - ${analysis.expecting.description}` : ""}
                  </span>
                )}
              </p>
              <ul role="listbox" aria-label={t("composer.args.suggestions")} className="max-h-48 overflow-y-auto py-1">
                {argSuggestions.map((s, i) => (
                  <li key={`${s.kind}:${s.insert}`} role="option" aria-selected={i === argActive}>
                    <button type="button" tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); pickArg(s); }} className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs ${i === argActive ? "bg-muted" : "hover:bg-muted/60"}`}>
                      <span className="font-semibold">{s.label}</span>
                      <span className="rounded bg-muted px-1 text-[9px] font-bold uppercase text-muted-foreground">{t(`composer.args.kinds.${s.kind}`)}</span>
                      {s.hint && <span className="min-w-0 truncate text-[11px] text-muted-foreground">{s.hint}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!argOpen && !argProblem && analysis && !analysis.suggestions.length && analysis.expecting && (
            <p className="absolute bottom-full left-0 mb-1.5 max-w-full truncate rounded-md border border-border bg-popover px-2 py-0.5 font-mono text-[10px] text-muted-foreground shadow-sm">{analysis.usage}</p>
          )}
          <ReferenceTokenInput
            key={inputKey}
            value={value}
            onChange={handleChange}
            placeholder={isAiRoom ? t("chat.inputPlaceholderAi") : t("chat.inputPlaceholder", { roomName })}
            documents={documents}
            boards={boards}
            users={users}
            roles={roles}
            extraMentions={extraMentions}
            transcripts={transcripts}
            activeCallId={activeCallId}
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              if (argOpen) {
                if (e.key === "ArrowDown") { e.preventDefault(); setArgIndex((argActive + 1) % argSuggestions.length); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setArgIndex((argActive - 1 + argSuggestions.length) % argSuggestions.length); }
                // Enter only completes real values (choices, people...); when the list only offers "name:" shortcuts, Enter sends and Tab completes.
                else if (e.key === "Tab" || (e.key === "Enter" && argSuggestions.some((s) => s.kind !== "option"))) { e.preventDefault(); pickArg(argSuggestions[argActive]); }
                else if (e.key === "Escape") { e.preventDefault(); setArgDismissed(true); }
                return;
              }
              if (!slashOpen) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((slashActive + 1) % slashCandidates.length); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((slashActive - 1 + slashCandidates.length) % slashCandidates.length); }
              else if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); pickSlash(slashCandidates[slashActive]); }
              else if (e.key === "Escape") { e.preventDefault(); setSlashDismissed(true); }
            }}
            submitOnEnter
            focusSignal={inputKey > 0 ? `slash-${inputKey}` : replyTo?.id}
            disabled={disabled || isUploading}
            className="w-full"
            inputClassName={isMobile ? "pr-12 shadow-sm" : "pr-10 shadow-sm"}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || isUploading || (!value.trim() && attachments.length === 0)}
            aria-label={t("chat.send")}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-2 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40 motion-reduce:transition-none ${
              isAiQuery ? "bg-violet-600 text-white hover:bg-violet-700" : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {isAiQuery ? <Bot className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
}
