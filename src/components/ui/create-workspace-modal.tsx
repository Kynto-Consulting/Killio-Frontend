"use client";

import { useState } from "react";
import { X, Loader2, Building2 } from "lucide-react";

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; icon?: string; invites: {email: string; role: string}[] }) => Promise<void>;
}

const EMOJI_OPTIONS = ["🚀", "🏢", "🎨", "💻", "🧠", "🔥", "🌍", "⭐", "📦", "📚", "🎯", "⚡"];
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "visualizer", label: "Visualizer" }
];

export function CreateWorkspaceModal({ isOpen, onClose, onSubmit }: CreateWorkspaceModalProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏢");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [invites, setInvites] = useState<{email: string; role: string}[]>([]);
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [newInviteRole, setNewInviteRole] = useState("editor");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    // Reset state on close
    if (name) setName("");
    if (invites.length > 0) setInvites([]);
    if (showIconPicker) setShowIconPicker(false);
    return null;
  }

  const handleAddInvite = () => {
    if (!newInviteEmail.includes('@')) return;
    if (invites.find(i => i.email === newInviteEmail)) return;
    setInvites([...invites, { email: newInviteEmail, role: newInviteRole }]);
    setNewInviteEmail("");
  };

  const handleRemoveInvite = (email: string) => {
    setInvites(invites.filter(i => i.email !== email));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), icon, invites });
      setName("");
      setInvites([]);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "An error occurred while creating the workspace.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Create Workspace</h2>
            <p className="text-sm text-muted-foreground">Add a new workspace to organize teams.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="workspace-name" className="text-sm font-medium leading-none">
                Workspace Name & Icon
              </label>
              <div className="flex gap-2">
                <div className="relative isolate">
                  <button
                    type="button"
                    onClick={() => setShowIconPicker(!showIconPicker)}
                    disabled={isSubmitting}
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
                  id="workspace-name"
                  type="text"
                  placeholder="e.g. Acme Corp, Engineering Team"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all focus:border-primary"
                />
              </div>
              {error && (
                <p className="text-sm font-medium text-destructive mt-1">{error}</p>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-border/50">
              <label className="text-sm font-medium leading-none">
                Invite Members <span className="text-muted-foreground font-normal">(Optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="colleague@acme.com"
                  value={newInviteEmail}
                  onChange={(e) => setNewInviteEmail(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddInvite(); } }}
                />
                <select 
                  value={newInviteRole}
                  onChange={(e) => setNewInviteRole(e.target.value)}
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button
                  type="button"
                  onClick={handleAddInvite}
                  disabled={!newInviteEmail.includes('@')}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-3 py-1 text-sm font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              {invites.length > 0 && (
                <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto rounded-md border border-border/50 p-2 bg-muted/20">
                  {invites.map((invite) => (
                    <div key={invite.email} className="flex items-center justify-between bg-card px-2 py-1.5 rounded border border-border/50 text-sm">
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-medium text-foreground truncate">{invite.email}</span>
                        <span className="text-xs text-muted-foreground bg-accent/10 px-1.5 py-0.5 rounded capitalize">{invite.role}</span>
                      </div>
                      <button type="button" onClick={() => handleRemoveInvite(invite.email)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/10 hover:text-accent disabled:pointer-events-none disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Workspace"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
