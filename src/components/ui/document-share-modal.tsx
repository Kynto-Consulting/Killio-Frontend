"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Globe, Link, Loader2, Lock, Trash2, UserPlus } from "lucide-react";
import {
  addDocumentMember,
  getDocumentMembers,
  removeDocumentMember,
  updateDocumentVisibility,
  type DocumentMemberSummary,
  type DocumentMembershipRole,
} from "@/lib/api/documents";
import { useTranslations } from "@/components/providers/i18n-provider";
import { toast } from "@/lib/toast";
import { getUserAvatarUrl } from "@/lib/gravatar";

interface DocumentShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentName: string;
  teamName?: string;
  initialVisibility?: "private" | "team" | "public_link";
  accessToken: string;
}

export function DocumentShareModal({
  isOpen,
  onClose,
  documentId,
  documentName,
  teamName = "Workspace Team",
  initialVisibility = "team",
  accessToken,
}: DocumentShareModalProps) {
  const t = useTranslations("document-detail");
  const [visibility, setVisibility] = useState<"private" | "team" | "public_link">(initialVisibility);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [members, setMembers] = useState<DocumentMemberSummary[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<DocumentMembershipRole>("viewer");
  const [isInviting, setIsInviting] = useState(false);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isVisDropdownOpen, setIsVisDropdownOpen] = useState(false);

  const roleLabels: Record<DocumentMembershipRole, string> = {
    viewer: t("shareModal.viewer"),
    commenter: t("shareModal.commenter"),
    editor: t("shareModal.editor"),
    owner: t("shareModal.owner") || "Owner",
  };

  useEffect(() => {
    if (!isOpen) return;

    setVisibility(initialVisibility);
    loadMembers();
  }, [isOpen, documentId, initialVisibility]);

  const loadMembers = async () => {
    setIsLoadingMembers(true);
    try {
      const data = await getDocumentMembers(documentId, accessToken);
      setMembers(data);
    } catch (error) {
      console.error("Failed to load document members", error);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const handleVisibilityChange = async (newVisibility: "private" | "team" | "public_link") => {
    const previous = visibility;
    setVisibility(newVisibility);
    setIsUpdatingVisibility(true);
    try {
      await updateDocumentVisibility(documentId, newVisibility, accessToken);
    } catch (error) {
      console.error("Failed to update document visibility", error);
      setVisibility(previous);
      toast(t("shareModal.visibilityError") || "No se pudo actualizar el acceso.", "error");
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    try {
      await addDocumentMember(documentId, inviteEmail.trim(), inviteRole, accessToken);
      await loadMembers();
      setInviteEmail("");
      setInviteRole("viewer");
      toast(t("shareSuccess", { email: inviteEmail.trim() }), "success");
    } catch (error: any) {
      console.error("Failed to invite document member", error);
      toast(error?.message || t("shareError"), "error");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      await removeDocumentMember(documentId, memberId, accessToken);
      setMembers((current) => current.filter((member) => member.id !== memberId));
    } catch (error) {
      console.error("Failed to remove document member", error);
    }
  };

  const copyPublicLink = async () => {
    const url = `${window.location.origin}/public-document/${documentId}`;
    await navigator.clipboard.writeText(url);
    toast(t("shareModal.copiedToast") || "Enlace copiado.", "success");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-lg rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col mb-[10vh] animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-border/50 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">{t("shareModal.title", { documentName })}</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
          </div>
          <p className="text-sm text-muted-foreground">{t("shareModal.subtitle")}</p>
        </div>

        <div className="p-4 space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">{t("shareModal.invitePeople")}</label>
            <div className="flex items-center space-x-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder={t("shareModal.emailPlaceholder")}
                className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsRoleDropdownOpen((current) => !current)}
                  className="h-9 w-32 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm flex items-center justify-between focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span className="capitalize">{roleLabels[inviteRole] || inviteRole}</span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </button>
                {isRoleDropdownOpen && (
                  <div className="absolute right-0 top-10 w-32 rounded-md border border-border bg-popover text-popover-foreground shadow-md z-50 overflow-hidden">
                    {(["viewer", "commenter", "editor"] as DocumentMembershipRole[]).map((role) => (
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
                disabled={isInviting || !inviteEmail.trim()}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center"
              >
                {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              </button>
            </div>
          </div>

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
                    onClick={() => !isUpdatingVisibility && setIsVisDropdownOpen((current) => !current)}
                    disabled={isUpdatingVisibility}
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">{t("shareModal.members")}</label>
              <button onClick={loadMembers} className="text-xs font-medium text-muted-foreground hover:text-foreground">{isLoadingMembers ? t("shareModal.loading") : t("shareModal.refresh")}</button>
            </div>
            <div className="space-y-2 border border-border/50 rounded-lg p-2 bg-muted/10 max-h-40 overflow-y-auto">
              {members.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">{t("shareModal.noMembers")}</p>
              ) : (
                members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/10 group">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-border shadow-sm bg-accent/10">
                        <img
                          src={getUserAvatarUrl(member.avatarUrl, member.email, 32)}
                          alt={member.name || member.email}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium leading-none">{member.name || t("shareModal.invitedUser")}</span>
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
                ))
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border/50 bg-muted/20 flex justify-between items-center">
          <button
            onClick={copyPublicLink}
            className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Link className="h-4 w-4 mr-2" />
            {t("shareModal.copyLink")}
          </button>
          <button onClick={onClose} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
            {t("shareModal.done")}
          </button>
        </div>
      </div>
    </div>
  );
}
