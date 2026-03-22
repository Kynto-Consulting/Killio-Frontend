"use client";

import { useEffect, useState } from "react";
import { X, UserPlus, Check, Mail, Shield, Loader2 } from "lucide-react";
import { createInvite, TeamRole } from "@/lib/api/contracts";

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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, 'owner'>>('member');
  const [invited, setInvited] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleOptionsByInviter: Record<TeamRole, Array<{ value: Exclude<TeamRole, 'owner'>; label: string; help: string }>> = {
    owner: [
      { value: 'admin', label: 'Admin', help: 'Gestiona miembros, invitaciones y contenido del workspace.' },
      { value: 'member', label: 'Member', help: 'Puede crear tableros e invitar miembros y guests.' },
      { value: 'guest', label: 'Guest', help: 'Acceso limitado. No puede invitar ni crear tableros.' },
    ],
    admin: [
      { value: 'admin', label: 'Admin', help: 'Gestiona miembros, invitaciones y contenido del workspace.' },
      { value: 'member', label: 'Member', help: 'Puede crear tableros e invitar miembros y guests.' },
      { value: 'guest', label: 'Guest', help: 'Acceso limitado. No puede invitar ni crear tableros.' },
    ],
    member: [
      { value: 'member', label: 'Member', help: 'Puede crear tableros e invitar miembros y guests.' },
      { value: 'guest', label: 'Guest', help: 'Acceso limitado. No puede invitar ni crear tableros.' },
    ],
    guest: [{ value: 'guest', label: 'Guest', help: 'Acceso limitado. No puede invitar ni crear tableros.' }],
  };

  const allowedRoleOptions = roleOptionsByInviter[inviterRole] ?? roleOptionsByInviter.guest;

  const currentRoleAllowed = allowedRoleOptions.some((option) => option.value === role);

  useEffect(() => {
    if (!currentRoleAllowed && allowedRoleOptions[0]?.value) {
      setRole(allowedRoleOptions[0].value);
    }
  }, [currentRoleAllowed, allowedRoleOptions]);

  if (!isOpen) return null;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isInviting) return;

    setIsInviting(true);
    setError(null);

    try {
      await createInvite({ email: email.trim(), role }, teamId, accessToken);
      setInvited(true);
      setEmail("");
      if (onInvited) {
        await onInvited();
      }
      setTimeout(() => {
        setInvited(false);
        onClose();
      }, 900);
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : 'No se pudo enviar la invitacion.';
      setError(message);
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-md bg-background border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-primary/10 rounded-md text-primary">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold">Invite to {teamName}</h3>
              <p className="text-xs text-muted-foreground">Add new members to your workspace</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-md hover:bg-accent/10 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleInvite} className="p-6 space-y-5">
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input 
                  id="email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full flex h-10 rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="role" className="text-sm font-medium">
                Role
              </label>
              <select 
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as Exclude<TeamRole, 'owner'>)}
                className="w-full flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {allowedRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-2">
                {allowedRoleOptions.map((option) => (
                  <div key={option.value} className="text-xs text-muted-foreground flex items-start gap-2">
                    <Shield className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
                    <span><strong className="text-foreground">{option.label}:</strong> {option.help}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="pt-2">
            <button 
              type="submit"
              disabled={!email || invited || isInviting}
              className="w-full inline-flex h-10 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {invited ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Invite sent!
                </>
              ) : isInviting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending invite...
                </>
              ) : (
                "Send invite"
              )}
            </button>
          </div>
        </form>

        <div className="px-6 py-4 bg-muted/30 border-t border-border/50 text-sm">
          <span className="text-muted-foreground text-xs">Las invitaciones se envian por email y respetan los permisos del rol seleccionado.</span>
        </div>
      </div>
    </div>
  );
}