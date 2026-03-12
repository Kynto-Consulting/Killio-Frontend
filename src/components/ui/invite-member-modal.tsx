"use client";

import { useState } from "react";
import { X, Search, UserPlus, Check, Mail } from "lucide-react";

export function InviteMemberModal({
  isOpen,
  onClose,
  teamName = "Workspace"
}: {
  isOpen: boolean;
  onClose: () => void;
  teamName?: string;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [invited, setInvited] = useState(false);

  if (!isOpen) return null;

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    // Simulate API call
    setInvited(true);
    setTimeout(() => {
      setInvited(false);
      setEmail("");
      onClose();
    }, 2000);
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
                onChange={(e) => setRole(e.target.value)}
                className="w-full flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="member">Member (Can edit and create boards)</option>
                <option value="viewer">Viewer (Read-only access)</option>
                <option value="admin">Admin (Full access, including billing)</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <button 
              type="submit"
              disabled={!email || invited}
              className="w-full inline-flex h-10 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {invited ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Invite sent!
                </>
              ) : (
                "Send invite"
              )}
            </button>
          </div>
        </form>

        {/* Footer info / link mockup */}
        <div className="px-6 py-4 bg-muted/30 border-t border-border/50 text-sm flex items-center justify-between">
          <span className="text-muted-foreground text-xs">Anyone with the link can join</span>
          <button type="button" className="text-primary hover:underline text-xs font-medium">
            Copy invite link
          </button>
        </div>
      </div>
    </div>
  );
}