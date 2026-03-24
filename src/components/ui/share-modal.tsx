import { useState, useEffect } from "react";
import { Link, CheckCircle2, UserPlus, Loader2, Globe, Lock, Trash2, ChevronDown } from "lucide-react";
import { updateBoardVisibility, getBoardMembers, addBoardMember, removeBoardMember, BoardMemberSummary } from "@/lib/api/contracts";
import { listDocuments, addDocumentMember, DocumentSummary } from "@/lib/api/documents";
import { useSession } from "@/components/providers/session-provider";

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
  const [visibility, setVisibility] = useState<"private" | "team" | "public_link">(initialVisibility);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [members, setMembers] = useState<BoardMemberSummary[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [isInviting, setIsInviting] = useState(false);

  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isVisDropdownOpen, setIsVisDropdownOpen] = useState(false);

  const { activeTeamId } = useSession();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [isSuggestingDocs, setIsSuggestingDocs] = useState(false);

  useEffect(() => {
    if (isOpen && boardId) {
      loadMembers();
      if (activeTeamId) {
        listDocuments(activeTeamId, accessToken)
          .then(setDocuments)
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

  const handleVisibilityChange = async (newVis: "private" | "team" | "public_link") => {
    setVisibility(newVis);
    setIsUpdatingVisibility(true);
    try {
      await updateBoardVisibility(boardId, newVis, accessToken);
    } catch (err) {
      console.error("Failed to update visibility", err);
      // Revert if failed
      setVisibility(visibility);
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    try {
      await addBoardMember(boardId, inviteEmail, inviteRole, accessToken);
      
      // Auto share selected documents
      for (const docId of selectedDocuments) {
        try {
          // Grant standard equivalent permissions for the newly added board user
          await addDocumentMember(docId, inviteEmail, inviteRole as any, accessToken);
        } catch (e) {
          console.error("Failed to share document", docId, e);
        }
      }

      setInviteEmail("");
      setSelectedDocuments([]);
      await loadMembers();
    } catch (err) {
      console.error("Failed to invite", err);
      alert("Error inviting user. Make sure the email is registered.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      await removeBoardMember(boardId, memberId, accessToken);
      setMembers(members.filter(m => m.id !== memberId));
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-lg rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col mb-[10vh] animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-border/50 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Share "{boardName}"</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <p className="text-sm text-muted-foreground">Manage who has access to this board.</p>
        </div>

        <div className="p-4 space-y-6">
          {/* Add people */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Invite people</label>
            <div className="flex items-center space-x-2">
              <input 
                type="email" 
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email address..." 
                className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" 
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  className="h-9 w-28 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm flex items-center justify-between focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span className="capitalize">{inviteRole}</span>
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
                        {role}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button 
                onClick={handleInvite}
                disabled={isInviting || !inviteEmail.trim()}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center"
              >
                {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
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
                  Suggest related documents ({documents.length})
                </button>
                {isSuggestingDocs && (
                  <div className="space-y-1.5 border border-border/50 rounded-lg p-3 bg-muted/10 max-h-32 overflow-y-auto">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">Auto-Grant Access</p>
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

            {/* Members List */}
            {members.length > 0 && (
              <div className="mt-4 space-y-2 border border-border/50 rounded-lg p-2 bg-muted/10 max-h-40 overflow-y-auto">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/10 group">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold uppercase">
                        {member.displayName?.substring(0,2) || member.email.substring(0,2)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium leading-none">{member.displayName || "Invited User"}</span>
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
            <label className="text-sm font-medium text-foreground">General access</label>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-full ${visibility === "public_link" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {visibility === "public_link" ? <Globe className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => !isUpdatingVisibility && setIsVisDropdownOpen(!isVisDropdownOpen)}
                    disabled={isUpdatingVisibility}
                    className="flex items-center gap-1 text-sm font-medium bg-transparent border-none focus:outline-none cursor-pointer p-0"
                  >
                    <span>
                      {visibility === "private" && "Restricted (Members only)"}
                      {visibility === "team" && `Team (Anyone in ${teamName})`}
                      {visibility === "public_link" && "Anyone with the link"}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </button>

                  {isVisDropdownOpen && (
                    <div className="absolute left-0 mt-2 w-64 rounded-md border border-border bg-popover text-popover-foreground shadow-md z-50 overflow-hidden">
                      <div
                        className="relative flex flex-col cursor-pointer select-none rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                        onClick={() => { handleVisibilityChange("private"); setIsVisDropdownOpen(false); }}
                      >
                        <span className="font-medium">Restricted (Members only)</span>
                      </div>
                      <div
                        className="relative flex flex-col cursor-pointer select-none rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                        onClick={() => { handleVisibilityChange("team"); setIsVisDropdownOpen(false); }}
                      >
                        <span className="font-medium">Team (Anyone in {teamName})</span>
                      </div>
                      <div
                        className="relative flex flex-col cursor-pointer select-none rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                        onClick={() => { handleVisibilityChange("public_link"); setIsVisDropdownOpen(false); }}
                      >
                        <span className="font-medium">Anyone with the link</span>
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {visibility === "public_link" 
                      ? "Anyone on the internet with the link can access" 
                      : visibility === "team" 
                      ? "Anyone in the workspace team can access"
                      : "Only specifically added members can access"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border/50 bg-muted/20 flex justify-between items-center">
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              alert("Link copied to clipboard!");
            }}
            className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Link className="h-4 w-4 mr-2" />
            Copy link
          </button>
          <button 
            onClick={onClose} 
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

