import { useState, useEffect } from "react";
import { Link, CheckCircle2, UserPlus, Loader2, Globe, Lock, Trash2, ChevronDown } from "lucide-react";
import { updateBoardVisibility, getBoardMembers, addBoardMember, removeBoardMember, BoardMemberSummary, listTeamMembers, TeamMemberSummary } from "@/lib/api/contracts";
import { listDocuments, addDocumentMember, DocumentSummary } from "@/lib/api/documents";
import { useSession } from "@/components/providers/session-provider";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { toast } from "@/lib/toast";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useAsyncAction } from "@/hooks/ui";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  boardName: string;
  teamName?: string;
  initialVisibility?: "private" | "team" | "public_link";
  accessToken: string;
}

export function ShareModal({ isOpen, onClose, boardId, boardName, teamName = "Workspace Team", initialVisibility = "team", accessToken }: ShareModalProps) {
  const t = useTranslations("board-detail");
  const [visibility, setVisibility] = useState<"private" | "team" | "public_link">(initialVisibility);
  const [members, setMembers] = useState<BoardMemberSummary[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");

  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isVisDropdownOpen, setIsVisDropdownOpen] = useState(false);

  const { activeTeamId } = useSession();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [isSuggestingDocs, setIsSuggestingDocs] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMemberSummary[]>([]);

  const inviteAction = useAsyncAction(
    async (payload: { email: string; role: string }) => {
      await addBoardMember(boardId, payload.email, payload.role, accessToken);
      for (const docId of selectedDocuments) {
        try {
          await addDocumentMember(docId, payload.email, payload.role as any, accessToken);
        } catch (e) {
          console.error("Failed to share document", docId, e);
        }
      }
      setInviteEmail("");
      setSelectedDocuments([]);
      await loadMembers();
    },
    { onError: () => toast(t("shareModal.inviteError"), "error") }
  );

  const visibilityAction = useAsyncAction(
    async (newVis: "private" | "team" | "public_link") => {
      await updateBoardVisibility(boardId, newVis, accessToken);
    },
    {
      onError: () => setVisibility(visibility),
    }
  );

  const removeAction = useAsyncAction(async (memberId: string) => {
    await removeBoardMember(boardId, memberId, accessToken);
    setMembers(members.filter(m => m.id !== memberId));
  });

  const roleLabels: Record<string, string> = {
    viewer: t("shareModal.viewer"),
    commenter: t("shareModal.commenter"),
    editor: t("shareModal.editor"),
  };

  useEffect(() => {
    if (isOpen && boardId) {
      loadMembers();
      if (activeTeamId) {
        listDocuments(activeTeamId, accessToken)
          .then(setDocuments)
          .catch(console.error);
        listTeamMembers(activeTeamId, accessToken)
          .then(setTeamMembers)
          .catch(console.error);
      }
    }
  }, [isOpen, boardId, activeTeamId, accessToken]);

  const loadMembers = async () => {
    setIsLoadingMembers(true);
    try {
      const data = await getBoardMembers(boardId, accessToken);
      setMembers(data);
    } catch (err) {
      console.error("Failed to load generic members", err);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const handleVisibilityChange = (newVis: "private" | "team" | "public_link") => {
    setVisibility(newVis);
    visibilityAction.run(newVis);
  };

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    inviteAction.run({ email: inviteEmail, role: inviteRole });
  };

  const handleRemove = (memberId: string) => {
    removeAction.run(memberId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-lg rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col mb-[10vh] animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-border/50 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">{t("shareModal.title", { boardName })}</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <p className="text-sm text-muted-foreground">{t("shareModal.subtitle")}</p>
        </div>

        <div className="p-4 space-y-6">
          {/* Add people */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">{t("shareModal.invitePeople")}</label>
            <div className="flex items-center space-x-2">
              <input 
                type="email" 
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t("shareModal.emailPlaceholder")} 
                className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" 
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  className="h-9 w-28 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm flex items-center justify-between focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span className="capitalize">{roleLabels[inviteRole] || inviteRole}</span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </button>
                {isRoleDropdownOpen && (
                  <div className="absolute right-0 top-10 w-28 rounded-md border border-border bg-popover text-popover-foreground shadow-md z-50 overflow-hidden">
                    {["viewer", "commenter", "editor"].map(role => (
                      <div
                        key={role}
                        className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground capitalize"
                        onClick={() => {
                          setInviteRole(role);
                          setIsRoleDropdownOpen(false);
                        }}
                      >
                        {roleLabels[role] || role}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button 
                onClick={handleInvite}
                disabled={inviteAction.isPending || !inviteEmail.trim()}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center"
              >
                {inviteAction.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("shareModal.invite")}
              </button>
            </div>
            
            {/* Auto-suggest documents */}
            {documents.length > 0 && (
              <div className="mt-2">
                <button 
                  onClick={() => setIsSuggestingDocs(!isSuggestingDocs)}
                  className="flex items-center text-xs text-muted-foreground hover:text-accent font-medium mb-2"
                >
                  <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${isSuggestingDocs ? "rotate-180" : ""}`} />
                  {t("shareModal.suggestDocs", { count: documents.length })}
                </button>
                {isSuggestingDocs && (
                  <div className="space-y-1.5 border border-border/50 rounded-lg p-3 bg-muted/10 max-h-32 overflow-y-auto">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">{t("shareModal.autoGrant")}</p>
                    {documents.map(doc => (
                      <label key={doc.id} className="flex items-center space-x-2 cursor-pointer group">
                        <input 
                          type="checkbox"
                          checked={selectedDocuments.includes(doc.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedDocuments([...selectedDocuments, doc.id]);
                            else setSelectedDocuments(selectedDocuments.filter(id => id !== doc.id));
                          }}
                          className="rounded border-border text-accent focus:ring-accent w-4 h-4 bg-transparent"
                        />
                        <span className="text-sm font-medium group-hover:text-accent transition-colors">{doc.title}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Team member suggestions */}
            {teamMembers.filter(tm => !members.some(m => m.id === tm.id)).length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">{t("shareModal.teamSuggestions")}</p>
                <div className="space-y-1 border border-border/50 rounded-lg p-2 bg-muted/10 max-h-36 overflow-y-auto">
                  {teamMembers
                    .filter(tm => !members.some(m => m.id === tm.id))
                    .map(tm => (
                      <button
                        key={tm.id}
                        type="button"
                        onClick={() => inviteAction.run({ email: tm.primaryEmail, role: inviteRole })}
                        disabled={inviteAction.isPending}
                        className="w-full flex items-center gap-2 p-1.5 rounded-md hover:bg-accent/10 transition-colors text-left"
                      >
                        <img
                          src={getUserAvatarUrl(tm.avatarUrl, tm.primaryEmail, 28)}
                          alt={tm.displayName ?? tm.name ?? tm.primaryEmail}
                          className="h-7 w-7 rounded-full border border-border object-cover shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{tm.displayName ?? tm.name ?? tm.primaryEmail}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{tm.primaryEmail}</p>
                        </div>
                        <UserPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Members List */}
            {members.length > 0 && (
              <div className="mt-4 space-y-2 border border-border/50 rounded-lg p-2 bg-muted/10 max-h-40 overflow-y-auto">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/10 group">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-border shadow-sm bg-accent/10">
                        <img 
                          src={getUserAvatarUrl(member.avatarUrl || (member as any).avatar_url, member.email, 32)} 
                          alt={member.displayName || t("shareModal.invitedUser")} 
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium leading-none">{member.displayName || t("shareModal.invitedUser")}</span>
                        <span className="text-xs text-muted-foreground">{member.email}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground bg-accent/10 px-2 py-0.5 rounded capitalize">{member.role}</span>
                      <button onClick={() => handleRemove(member.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* General Access */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">{t("shareModal.generalAccess")}</label>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-full ${visibility === "public_link" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {visibility === "public_link" ? <Globe className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => !visibilityAction.isPending && setIsVisDropdownOpen(!isVisDropdownOpen)}
                    disabled={visibilityAction.isPending}
                    className="flex items-center gap-1 text-sm font-medium bg-transparent border-none focus:outline-none cursor-pointer p-0"
                  >
                    <span>
                      {visibility === "private" && t("shareModal.restrictedMembers")}
                      {visibility === "team" && t("shareModal.teamAccess", { teamName })}
                      {visibility === "public_link" && t("shareModal.anyoneLink")}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </button>

                  {isVisDropdownOpen && (
                    <div className="absolute left-0 mt-2 w-64 rounded-md border border-border bg-popover text-popover-foreground shadow-md z-50 overflow-hidden">
                      <div
                        className="relative flex flex-col cursor-pointer select-none rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                        onClick={() => { handleVisibilityChange("private"); setIsVisDropdownOpen(false); }}
                      >
                        <span className="font-medium">{t("shareModal.restrictedMembers")}</span>
                      </div>
                      <div
                        className="relative flex flex-col cursor-pointer select-none rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                        onClick={() => { handleVisibilityChange("team"); setIsVisDropdownOpen(false); }}
                      >
                        <span className="font-medium">{t("shareModal.teamAccess", { teamName })}</span>
                      </div>
                      <div
                        className="relative flex flex-col cursor-pointer select-none rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                        onClick={() => { handleVisibilityChange("public_link"); setIsVisDropdownOpen(false); }}
                      >
                        <span className="font-medium">{t("shareModal.anyoneLink")}</span>
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {visibility === "public_link" 
                      ? t("shareModal.internetDesc")
                      : visibility === "team" 
                      ? t("shareModal.teamDesc")
                      : t("shareModal.restrictedDesc")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border/50 bg-muted/20 flex justify-between items-center">
          <button
            onClick={() => {
              const url = visibility === "public_link"
                ? `${window.location.origin}/public-board/${boardId}`
                : window.location.href;
              navigator.clipboard.writeText(url);
              toast(t("shareModal.copiedToast"), "success");
            }}
            className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Link className="h-4 w-4 mr-2" />
            {t("shareModal.copyLink")}
          </button>
          <button 
            onClick={onClose} 
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            {t("shareModal.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

