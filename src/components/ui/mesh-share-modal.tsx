"use client";

import { useState, useEffect } from "react";
import { Link, Loader2, Globe, Lock, Trash2, ChevronDown, Users } from "lucide-react";
import {
  updateMeshVisibility, getMeshMembers, addMeshMember, removeMeshMember,
  MeshMemberSummary,
} from "@/lib/api/contracts";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { toast } from "@/lib/toast";

interface MeshShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  meshId: string;
  meshName: string;
  teamName?: string;
  initialVisibility?: "private" | "team" | "public_link";
  accessToken: string;
}

export function MeshShareModal({
  isOpen, onClose, meshId, meshName, teamName = "Workspace Team",
  initialVisibility = "team", accessToken,
}: MeshShareModalProps) {
  const [visibility, setVisibility] = useState<"private" | "team" | "public_link">(initialVisibility);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [members, setMembers] = useState<MeshMemberSummary[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [isInviting, setIsInviting] = useState(false);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isVisDropdownOpen, setIsVisDropdownOpen] = useState(false);

  const roleLabels: Record<string, string> = { viewer: "Lector", commenter: "Comentador", editor: "Editor" };

  useEffect(() => {
    if (isOpen && meshId) loadMembers();
  }, [isOpen, meshId]);

  const loadMembers = async () => {
    setIsLoadingMembers(true);
    try { setMembers(await getMeshMembers(meshId, accessToken)); }
    catch { /* silent — endpoint may not exist yet */ }
    finally { setIsLoadingMembers(false); }
  };

  const handleVisibilityChange = async (newVis: "private" | "team" | "public_link") => {
    const prev = visibility;
    setVisibility(newVis);
    setIsUpdatingVisibility(true);
    try { await updateMeshVisibility(meshId, newVis, accessToken); }
    catch { setVisibility(prev); toast("No se pudo cambiar la visibilidad.", "error"); }
    finally { setIsUpdatingVisibility(false); setIsVisDropdownOpen(false); }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    try {
      await addMeshMember(meshId, inviteEmail, inviteRole, accessToken);
      setInviteEmail("");
      await loadMembers();
    } catch { toast("No se pudo invitar al usuario.", "error"); }
    finally { setIsInviting(false); }
  };

  const handleRemove = async (memberId: string) => {
    try {
      await removeMeshMember(meshId, memberId, accessToken);
      setMembers(members.filter(m => m.id !== memberId));
    } catch { toast("No se pudo eliminar el miembro.", "error"); }
  };

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/public-mesh/${meshId}` : "";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-lg rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col mb-[10vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-border/50 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Compartir &ldquo;{meshName}&rdquo;</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <p className="text-sm text-muted-foreground">Controla quién puede ver y editar este Mesh Board.</p>
        </div>

        <div className="p-4 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Invite */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Invitar personas</label>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
                placeholder="correo@ejemplo.com"
                className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {/* Role picker */}
              <div className="relative">
                <button type="button" onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  className="h-9 w-28 rounded-md border border-input bg-card px-3 py-1 text-sm flex items-center justify-between focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <span className="capitalize">{roleLabels[inviteRole]}</span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </button>
                {isRoleDropdownOpen && (
                  <div className="absolute right-0 top-10 w-32 rounded-md border border-border bg-popover shadow-md z-50 overflow-hidden">
                    {["viewer", "commenter", "editor"].map(role => (
                      <div key={role} className="cursor-pointer px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground capitalize"
                        onClick={() => { setInviteRole(role); setIsRoleDropdownOpen(false); }}>
                        {roleLabels[role]}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={handleInvite} disabled={isInviting || !inviteEmail.trim()}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center">
                {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invitar"}
              </button>
            </div>

            {/* Members */}
            {isLoadingMembers ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Cargando miembros…
              </div>
            ) : members.length > 0 ? (
              <div className="mt-2 space-y-1 border border-border/50 rounded-lg p-2 bg-muted/10 max-h-40 overflow-y-auto">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/10 group">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-border bg-accent/10">
                        <img src={getUserAvatarUrl(member.avatarUrl, member.email, 32)} alt={member.displayName || "Usuario"} className="h-full w-full object-cover" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium leading-none">{member.displayName || "Usuario invitado"}</span>
                        <span className="text-xs text-muted-foreground">{member.email}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground bg-accent/10 px-2 py-0.5 rounded capitalize">{member.role}</span>
                      <button onClick={() => handleRemove(member.id)}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* General access */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Acceso general</label>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${visibility === "public_link" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {visibility === "public_link" ? <Globe className="h-5 w-5" /> : visibility === "team" ? <Users className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                </div>
                <div className="relative">
                  <button type="button"
                    onClick={() => !isUpdatingVisibility && setIsVisDropdownOpen(!isVisDropdownOpen)}
                    disabled={isUpdatingVisibility}
                    className="flex items-center gap-1 text-sm font-medium bg-transparent border-none focus:outline-none cursor-pointer p-0">
                    {isUpdatingVisibility && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    <span>
                      {visibility === "private" && "Solo miembros"}
                      {visibility === "team" && `Acceso del equipo (${teamName})`}
                      {visibility === "public_link" && "Cualquiera con el link"}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </button>
                  {isVisDropdownOpen && (
                    <div className="absolute left-0 mt-2 w-64 rounded-md border border-border bg-popover shadow-md z-50 overflow-hidden">
                      {[
                        { value: "private" as const, label: "Solo miembros", desc: "Solo personas invitadas pueden acceder" },
                        { value: "team" as const, label: `Equipo: ${teamName}`, desc: "Todos los miembros del equipo pueden ver" },
                        { value: "public_link" as const, label: "Cualquiera con el link", desc: "Cualquier persona con el enlace puede ver" },
                      ].map(opt => (
                        <div key={opt.value} className="cursor-pointer px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={() => handleVisibilityChange(opt.value)}>
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">{opt.desc}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {visibility === "public_link" ? "Accesible desde /public-mesh sin iniciar sesión" : visibility === "team" ? "Solo miembros del workspace" : "Requiere invitación explícita"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/50 bg-muted/20 flex justify-between items-center">
          <button
            onClick={() => {
              const url = visibility === "public_link" ? publicUrl : (typeof window !== "undefined" ? window.location.href : "");
              navigator.clipboard.writeText(url);
              toast("Link copiado.", "success");
            }}
            className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors">
            <Link className="h-4 w-4 mr-2" />
            Copiar link
          </button>
          <button onClick={onClose} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
