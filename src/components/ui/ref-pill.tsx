"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, LayoutDashboard, User, Hash, Database, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { getCardContext, listTeamMembers } from "@/lib/api/contracts";
import { useSession } from "@/components/providers/session-provider";
import { Portal } from "./portal";
import {
  normalizeWorkspaceMember,
  type WorkspaceMember,
  type WorkspaceMemberLike,
} from "@/lib/workspace-members";

interface RefPillProps {
  type: 'doc' | 'board' | 'mesh' | 'card' | 'user' | 'deep' | 'mention';
  id: string;
  name: string;
  label?: string;
  onClick?: () => void;
  workspaceUsers?: WorkspaceMemberLike[];
  workspaceName?: string;
}

function normalizeRoleLabel(role: string | null): string {
  const value = String(role || "").trim().toLowerCase();
  if (!value) return "Sin definir";

  const labels: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    member: "Member",
    guest: "Guest",
    editor: "Editor",
    commenter: "Commenter",
    viewer: "Viewer",
  };

  return labels[value] || value;
}

function normalizeStatusLabel(status: string | null): string | null {
  const value = String(status || "").trim().toLowerCase();
  if (!value) return null;

  const labels: Record<string, string> = {
    active: "Activo",
    invited: "Invitado",
    pending: "Pendiente",
    removed: "Removido",
    suspended: "Suspendido",
  };

  return labels[value] || value;
}

function findMemberByReferenceId(referenceId: string, members: WorkspaceMember[]): WorkspaceMember | null {
  const normalizedReference = String(referenceId || "").trim().toLowerCase();
  if (!normalizedReference) {
    return null;
  }

  for (const member of members) {
    const candidates = [
      member.id,
      member.primaryEmail,
      member.name,
      member.alias,
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim().toLowerCase());

    if (candidates.includes(normalizedReference)) {
      return member;
    }
  }

  return null;
}

export function RefPill({
  type,
  id,
  name,
  label,
  onClick,
  workspaceUsers = [],
  workspaceName,
}: RefPillProps) {
  const router = useRouter();
  const { accessToken, activeTeamId } = useSession();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [resolvedUser, setResolvedUser] = useState<WorkspaceMember | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(false);

  const normalizedWorkspaceUsers = useMemo(
    () => workspaceUsers.map((member) => normalizeWorkspaceMember(member)),
    [workspaceUsers]
  );

  const fallbackUser = useMemo(
    () =>
      normalizeWorkspaceMember({
        id,
        name: label || name || "User",
        alias: null,
      }),
    [id, label, name]
  );

  const openUserMenu = useCallback((button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    const estimatedWidth = 320;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - estimatedWidth - 8));
    const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 8));

    setMenuPosition({ top, left });
    setIsUserMenuOpen(true);
  }, []);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (onClick) {
      onClick();
      return;
    }

    if (type === "user") {
      openUserMenu(e.currentTarget as HTMLButtonElement);
      return;
    }

    // Default navigation
    if (type === 'doc') router.push(`/d/${id}`);
    if (type === 'board') router.push(`/b/${id}`);
    if (type === 'mesh') router.push(`/m/${id}`);
    if (type === 'card' || (type as string) === 'mention' && id.startsWith('card:')) {
      const cardId = id.replace('card:', '');
      try {
        const context = await getCardContext(cardId, accessToken!);
        router.push(`/b/${context.boardId}?cardId=${cardId}`);
      } catch (e) {
        console.error("Failed to navigate to card", e);
      }
    }
    if (type === 'deep') {
        const tokens = id.split(':').map((token) => token.trim()).filter(Boolean);
        if (tokens.length >= 4) {
          const scopeType = tokens[0]?.toLowerCase();
          const scopeId = tokens[1];
          if (scopeType === 'mesh' && scopeId) {
            router.push(`/m/${scopeId}`);
            return;
          }
          if ((scopeType === 'doc' || scopeType === 'document') && scopeId) {
            router.push(`/d/${scopeId}`);
            return;
          }
        }

        const docId = tokens[0];
        if (docId) router.push(`/d/${docId}`);
    }
  };

  useEffect(() => {
    if (!isUserMenuOpen || type !== "user") {
      return;
    }

    const closeMenu = () => setIsUserMenuOpen(false);

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setIsUserMenuOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [isUserMenuOpen, type]);

  useEffect(() => {
    if (!isUserMenuOpen || type !== "user") {
      return;
    }

    let cancelled = false;
    setResolvedUser(fallbackUser);
    setIsLoadingUser(false);

    const localMatch = findMemberByReferenceId(id, normalizedWorkspaceUsers);
    if (localMatch) {
      setResolvedUser(localMatch);
      return;
    }

    if (!accessToken || !activeTeamId) {
      setResolvedUser(fallbackUser);
      return;
    }

    setIsLoadingUser(true);
    listTeamMembers(activeTeamId, accessToken)
      .then((members) => {
        if (cancelled) return;
        const normalizedMembers = members.map((member) => normalizeWorkspaceMember(member));
        const remoteMatch = findMemberByReferenceId(id, normalizedMembers);
        setResolvedUser(remoteMatch || fallbackUser);
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedUser(fallbackUser);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingUser(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isUserMenuOpen, type, id, accessToken, activeTeamId, normalizedWorkspaceUsers, fallbackUser]);

  const colors: Record<string, string> = {
    doc: "bg-blue-500/10 border-blue-500/20 text-blue-600 hover:bg-blue-500/20",
    board: "bg-purple-500/10 border-purple-500/20 text-purple-600 hover:bg-purple-500/20",
    mesh: "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 hover:bg-indigo-500/20",
    card: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/20",
    user: "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20",
    deep: "bg-amber-500/10 border-amber-500/20 text-amber-600 hover:bg-amber-500/20",
    mention: "bg-accent/10 border-accent/20 text-accent hover:bg-accent/20",
  };

  const Icons: Record<string, any> = {
    doc: FileText,
    board: LayoutDashboard,
    mesh: LayoutDashboard,
    card: Hash,
    user: User,
    deep: Database,
    mention: Hash
  };

  const Icon = Icons[type] || Database;
  const userForMenu = resolvedUser || fallbackUser;
  const normalizedStatus = normalizeStatusLabel(userForMenu.status);
  const infoRows = [
    userForMenu.alias
      ? { label: "Alias", value: userForMenu.alias }
      : null,
    userForMenu.alias && userForMenu.name && userForMenu.alias !== userForMenu.name
      ? { label: "Nombre base", value: userForMenu.name }
      : null,
    userForMenu.primaryEmail
      ? { label: "Email", value: userForMenu.primaryEmail }
      : null,
    userForMenu.role
      ? { label: "Rol", value: normalizeRoleLabel(userForMenu.role) }
      : null,
    normalizedStatus
      ? { label: "Estado", value: normalizedStatus }
      : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row));
  const displayText = type === "user"
    ? (label || userForMenu.alias || userForMenu.name || name)
    : (label || name);
  return (
    <>
      <button
        ref={triggerRef}
        type="button" // Siempre es buena práctica definir el tipo
        onClick={handleClick}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 mx-1 rounded-md border text-[10px] font-bold tracking-tight transition-all active:scale-95 group shadow-sm align-middle relative -top-px ${colors[type] || colors.deep}`}
      >
        <Icon className="h-3 w-3 transition-transform group-hover:scale-110" />
        <span>{displayText}</span>
        <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" />
      </button>

      {isUserMenuOpen && type === "user" && (
        <Portal>
          <div
            ref={menuRef}
            role="dialog"
            aria-modal="false"
            className="fixed z-[180] w-[320px] rounded-xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            {isLoadingUser ? (
              <div className="text-xs text-muted-foreground">Buscando usuario en el workspace...</div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{userForMenu.alias || userForMenu.name || name}</div>
                    {userForMenu.alias && userForMenu.name && userForMenu.alias !== userForMenu.name ? (
                      <div className="truncate text-xs text-muted-foreground">{userForMenu.name}</div>
                    ) : null}
                  </div>
                </div>

                {workspaceName ? (
                  <div className="text-[11px] text-muted-foreground">Workspace: {workspaceName}</div>
                ) : null}

                {infoRows.length > 0 ? (
                  <div className="grid grid-cols-[94px_1fr] gap-x-2 gap-y-1 text-xs">
                    {infoRows.map((row) => (
                      <React.Fragment key={row.label}>
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="truncate text-foreground">{row.value}</span>
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">No hay más información disponible para este usuario.</div>
                )}
              </div>
            )}
          </div>
        </Portal>
      )}
    </>
  );
}
