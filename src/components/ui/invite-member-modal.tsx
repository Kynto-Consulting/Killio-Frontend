"use client";

import { useEffect, useState } from "react";
import { X, UserPlus, Check, Mail, Shield, Loader2, Copy } from "lucide-react";
import { createInvite, InviteSummary, TeamRole } from "@/lib/api/contracts";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useForm } from "@/hooks/ui";
import { Select } from "@/components/ui/select";

/** Build a shareable accept-invite URL from either the explicit acceptUrl returned
 *  by the backend or the raw token (fallback when acceptUrl is missing). */
function buildInviteLink(invite: Pick<InviteSummary, "token" | "acceptUrl">): string | null {
  if (invite.acceptUrl) return invite.acceptUrl;
  if (invite.token && typeof window !== "undefined") {
    return `${window.location.origin}/accept-invite?token=${encodeURIComponent(invite.token)}`;
  }
  return null;
}

export function InviteMemberModal({
  isOpen,
  onClose,
  teamName = "Workspace",
  teamId,
  accessToken,
  inviterRole,
  onInvited,
}: {
  isOpen: boolean;
  onClose: () => void;
  teamName?: string;
  teamId: string;
  accessToken: string;
  inviterRole: TeamRole;
  onInvited?: () => void | Promise<void>;
}) {
  const t = useTranslations("modals");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("member");
  const [invited, setInvited] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const form = useForm({
    fields: {
      email: {
        type: "email" as const,
        transform: "trim-lower" as const,
        constraints: { required: true, email: true, maxLength: 255 },
        messages: {
          required: t("inviteMember.emailLabel"),
          email: t("inviteMember.emailInvalid"),
        },
      },
    },
    submit: async ({ values, reset }) => {
      const invite = await createInvite({ email: values.email as string, role }, teamId, accessToken);
      // Capture acceptUrl/token before deciding whether to surface a delivery error so
      // the user still gets a copyable link when SMTP failed/skipped.
      const link = buildInviteLink(invite);
      if (invite.deliveryStatus !== "sent") {
        if (link) {
          // Make the link available even if email delivery failed.
          setInviteLink(link);
        }
        throw new Error(
          invite.deliveryStatus === "skipped"
            ? t("inviteMember.deliverySkipped")
            : t("inviteMember.deliveryFailed"),
        );
      }
      setInvited(true);
      setInviteLink(link);
      reset();
      if (onInvited) await onInvited();
      // Keep modal open a bit longer when there's a copyable link so the user can grab it.
      setTimeout(() => {
        setInvited(false);
        setInviteLink(null);
        setLinkCopied(false);
        onClose();
      }, link ? 4000 : 900);
    },
  });

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Silently ignore clipboard failures (e.g. insecure context).
    }
  };

  const roleOptionsByInviter: Record<
    TeamRole,
    Array<{ value: Exclude<TeamRole, "owner">; label: string; help: string }>
  > = {
    owner: [
      { value: "admin",  label: t("inviteMember.roles.admin"),  help: t("inviteMember.roles.adminHelp") },
      { value: "member", label: t("inviteMember.roles.member"), help: t("inviteMember.roles.memberHelp") },
      { value: "guest",  label: t("inviteMember.roles.guest"),  help: t("inviteMember.roles.guestHelp") },
      { value: "viewer", label: t("inviteMember.roles.viewer"), help: t("inviteMember.roles.viewerHelp") },
    ],
    admin: [
      { value: "admin",  label: t("inviteMember.roles.admin"),  help: t("inviteMember.roles.adminHelp") },
      { value: "member", label: t("inviteMember.roles.member"), help: t("inviteMember.roles.memberHelp") },
      { value: "guest",  label: t("inviteMember.roles.guest"),  help: t("inviteMember.roles.guestHelp") },
      { value: "viewer", label: t("inviteMember.roles.viewer"), help: t("inviteMember.roles.viewerHelp") },
    ],
    member: [
      { value: "member", label: t("inviteMember.roles.member"), help: t("inviteMember.roles.memberHelp") },
      { value: "guest",  label: t("inviteMember.roles.guest"),  help: t("inviteMember.roles.guestHelp") },
      { value: "viewer", label: t("inviteMember.roles.viewer"), help: t("inviteMember.roles.viewerHelp") },
    ],
    guest: [
      { value: "guest",  label: t("inviteMember.roles.guest"),  help: t("inviteMember.roles.guestHelp") },
    ],
    viewer: [
      { value: "viewer", label: t("inviteMember.roles.viewer"), help: t("inviteMember.roles.viewerHelp") },
    ],
  };

  const allowedRoleOptions = roleOptionsByInviter[inviterRole] ?? roleOptionsByInviter.guest;

  const currentRoleAllowed = allowedRoleOptions.some((option) => option.value === role);

  useEffect(() => {
    if (!currentRoleAllowed && allowedRoleOptions[0]?.value) {
      setRole(allowedRoleOptions[0].value);
    }
  }, [currentRoleAllowed, allowedRoleOptions]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-background border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-primary/10 rounded-md text-primary">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold">{t("inviteMember.title", { teamName: teamName || "Workspace" })}</h3>
              <p className="text-xs text-muted-foreground">{t("inviteMember.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={form.submit} className="p-6 space-y-5">
          <div className="space-y-4">

            {/* Email */}
            <div className="space-y-2">
              <label htmlFor={form.fields.email.id} className="text-sm font-medium">
                {t("inviteMember.emailLabel")}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  {...form.fields.email.inputProps}
                  placeholder={t("inviteMember.emailPlaceholder")}
                  className="w-full flex h-10 rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  autoFocus
                />
              </div>
              {form.fields.email.error && (
                <p {...form.fields.email.errorProps} className="text-xs text-destructive">
                  {form.fields.email.error}
                </p>
              )}
            </div>

            {/* Role */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("inviteMember.roleLabel")}</label>
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value as Exclude<TeamRole, "owner">)}
                disabled={form.isSubmitting}
                options={allowedRoleOptions.map((o) => ({ value: o.value, label: o.label }))}
              />
              <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-2">
                {allowedRoleOptions.map((option) => (
                  <div key={option.value} className="text-xs text-muted-foreground flex items-start gap-2">
                    <Shield className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <span>
                      <strong className="text-foreground">{option.label}:</strong> {option.help}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {form.formError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {form.formError}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={invited || form.isSubmitting}
              className="w-full inline-flex h-10 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {invited ? (
                <><Check className="w-4 h-4 mr-2" />{t("inviteMember.inviteSent")}</>
              ) : form.isSubmitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("inviteMember.sending")}</>
              ) : (
                t("inviteMember.send")
              )}
            </button>
          </div>

          {inviteLink && (
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <code className="flex-1 text-xs text-muted-foreground truncate font-mono">{inviteLink}</code>
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border/60 bg-background text-xs font-medium hover:bg-accent/10 transition-colors shrink-0"
                >
                  {linkCopied ? (
                    <><Check className="w-3 h-3" />{t("inviteMember.inviteLinkCopied")}</>
                  ) : (
                    <><Copy className="w-3 h-3" />{t("inviteMember.copyInviteLink")}</>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">{t("inviteMember.inviteLinkExpiresNote")}</p>
            </div>
          )}
        </form>

        <div className="px-6 py-4 bg-muted/30 border-t border-border/50">
          <span className="text-muted-foreground text-xs">{t("createWorkspace.allowedByRole")}</span>
        </div>
      </div>
    </div>
  );
}
