"use client";

import { useState } from "react";
import { X, Loader2, Building2 } from "lucide-react";
import type { TeamRole } from "@/lib/api/contracts";
import { useTranslations } from "@/components/providers/i18n-provider";
import { useForm, useListField, useInput } from "@/hooks/ui";
import { Select } from "@/components/ui/select";

type InviteRole = Exclude<TeamRole, "owner">;

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; icon?: string; invites: { email: string; role: InviteRole }[] }) => Promise<void>;
}

const EMOJI_OPTIONS = ["🚀", "🏢", "🎨", "💻", "🧠", "🔥", "🌍", "⭐", "📦", "📚", "🎯", "⚡"];

export function CreateWorkspaceModal({ isOpen, onClose, onSubmit }: CreateWorkspaceModalProps) {
  const t       = useTranslations("modals");
  const tCommon = useTranslations("common");

  const [icon, setIcon]                         = useState("🏢");
  const [showIconPicker, setShowIconPicker]     = useState(false);
  const [newInviteRole, setNewInviteRole]       = useState<InviteRole>("member");

  const ROLE_OPTIONS = [
    { value: "admin"  as InviteRole, label: t("inviteMember.roles.admin") },
    { value: "member" as InviteRole, label: t("inviteMember.roles.member") },
    { value: "guest"  as InviteRole, label: t("inviteMember.roles.guest") },
  ];

  // ── Hooks ───────────────────────────────────────────────────────────────────
  const form = useForm({
    fields: {
      name: {
        type: "text" as const,
        transform: "trim" as const,
        constraints: { required: true, minLength: 1, maxLength: 80 },
      },
    },
    submit: async ({ values, reset }) => {
      await onSubmit({ name: values.name as string, icon, invites: inviteList.items });
      reset();
      inviteList.clear();
      setIcon("🏢");
      onClose();
    },
  });

  const inviteEmailInput = useInput({
    type: "email" as const,
    transform: "trim-lower" as const,
    constraints: { email: true, maxLength: 255 },
    validateOn: "change" as const,
  });

  const inviteList = useListField<{ email: string; role: InviteRole }>({
    maxItems: 20,
    unique: (a, b) => a.email === b.email,
    validate: (item) => (item.email.includes("@") ? null : "Invalid email"),
  });

  if (!isOpen) return null;

  const handleAddInvite = () => {
    const email = (inviteEmailInput.value as string).trim().toLowerCase();
    if (!email.includes("@")) return;
    const added = inviteList.add({ email, role: newInviteRole });
    if (added) inviteEmailInput.reset();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">{tCommon("actions.close")}</span>
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("createWorkspace.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("createWorkspace.subtitle")}</p>
          </div>
        </div>

        <form onSubmit={form.submit} className="space-y-4">

          {/* Name + icon */}
          <div className="space-y-2">
            <label htmlFor={form.fields.name.id} className="text-sm font-medium leading-none">
              {t("createWorkspace.nameAndIcon")}
            </label>
            <div className="flex gap-2">
              {/* Icon picker */}
              <div className="relative isolate">
                <button
                  type="button"
                  onClick={() => setShowIconPicker(!showIconPicker)}
                  disabled={form.isSubmitting}
                  className="flex h-10 w-12 items-center justify-center rounded-md border border-input bg-background text-lg shadow-sm hover:bg-accent/10 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {icon}
                </button>
                {showIconPicker && (
                  <div className="absolute top-12 left-0 z-50 w-48 rounded-lg border border-border bg-card p-2 shadow-xl grid grid-cols-4 gap-1 animate-in fade-in zoom-in-95">
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => { setIcon(emoji); setShowIconPicker(false); }}
                        className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent/20 text-base transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                {...form.fields.name.inputProps}
                placeholder={t("createWorkspace.namePlaceholder")}
                autoFocus
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-all"
              />
            </div>
            {form.fields.name.error && (
              <p {...form.fields.name.errorProps} className="text-sm text-destructive">
                {form.fields.name.error}
              </p>
            )}
            {form.formError && (
              <p className="text-sm font-medium text-destructive">{form.formError}</p>
            )}
          </div>

          {/* Invites */}
          <div className="space-y-2 pt-2 border-t border-border/50">
            <label className="text-sm font-medium leading-none">
              {t("createWorkspace.inviteMembers")}{" "}
              <span className="text-muted-foreground font-normal">({t("createWorkspace.optional")})</span>
            </label>
            <div className="flex gap-2">
              <input
                {...inviteEmailInput.inputProps}
                placeholder={t("createWorkspace.inviteEmailPlaceholder")}
                className="flex h-9 min-w-0 w-full rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddInvite(); } }}
              />
              <Select
                value={newInviteRole}
                onChange={(e) => setNewInviteRole(e.target.value as InviteRole)}
                sizeVariant="sm"
                options={ROLE_OPTIONS}
                wrapperClassName="w-28 shrink-0"
              />
              <button
                type="button"
                onClick={handleAddInvite}
                disabled={inviteList.isFull || !inviteEmailInput.value || !!inviteEmailInput.error}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
              >
                {t("createWorkspace.add")}
              </button>
            </div>

            {inviteList.items.length > 0 && (
              <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto rounded-md border border-border/50 p-2 bg-muted/20">
                {inviteList.items.map((invite, i) => (
                  <div
                    key={invite.email}
                    className="flex items-center justify-between bg-card px-2 py-1.5 rounded border border-border/50 text-sm"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-medium truncate">{invite.email}</span>
                      <span className="text-xs text-muted-foreground bg-accent/10 px-1.5 py-0.5 rounded capitalize">
                        {invite.role}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => inviteList.remove(i)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <button
              type="button"
              onClick={onClose}
              disabled={form.isSubmitting}
              className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-50"
            >
              {tCommon("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={!form.fields.name.value || form.isSubmitting}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {form.isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("createWorkspace.creating")}</>
              ) : (
                t("createWorkspace.create")
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
