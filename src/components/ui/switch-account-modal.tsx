"use client";

import { useState } from "react";
import { X, ArrowRightLeft, Loader2, UserPlus, CheckCircle2 } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { getUserAvatarUrl } from "@/lib/gravatar";

interface SwitchAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SwitchAccountModal({ isOpen, onClose }: SwitchAccountModalProps) {
  const { user, accounts, switchAccount } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(user?.id || null);

  if (!isOpen) return null;

  const handleSwitch = async () => {
    if (!selectedUserId || selectedUserId === user?.id) {
      onClose();
      return;
    }
    
    setIsSubmitting(true);
    try {
      switchAccount(selectedUserId);
      // Wait a moment for redirect/reload to happen gracefully
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error(e);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ArrowRightLeft className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Switch Account</h2>
            <p className="text-sm text-muted-foreground">Select an account to continue with.</p>
          </div>
        </div>

        <div className="space-y-3 mb-6 max-h-[40vh] overflow-y-auto pr-1">
          {/* List all registered accounts */}
          {accounts.map((acc) => {
            const isSelected = selectedUserId === acc.user.id;
            const isCurrentActive = user?.id === acc.user.id;
            
            return (
              <button 
                key={acc.user.id}
                onClick={() => setSelectedUserId(acc.user.id)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-border/80 hover:bg-accent/5"
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="h-10 w-10 shrink-0 rounded-full overflow-hidden border border-border shadow-sm bg-accent/10">
                    <img 
                      src={getUserAvatarUrl((acc.user as { avatar_url?: string | null }).avatar_url, acc.user.email, 40)} 
                      alt={acc.user.displayName || "User"} 
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col items-start overflow-hidden">
                    <span className="text-sm font-semibold truncate w-full content-start">
                      {acc.user.displayName || "User"} {isCurrentActive && <span className="ml-1 text-xs font-normal text-muted-foreground">(Active)</span>}
                    </span>
                    <span className="text-xs text-muted-foreground truncate w-full content-start">{acc.user.email}</span>
                  </div>
                </div>
                {isSelected && (
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 ml-2" />
                )}
              </button>
            )
          })}
          
          {/* Add Account fake option */}
          <button 
            onClick={() => {
              onClose();
              window.location.href = '/login';
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border/60 hover:border-accent hover:bg-accent/5 transition-all text-muted-foreground hover:text-foreground"
          >
            <div className="h-10 w-10 shrink-0 rounded-full bg-accent/10 flex items-center justify-center text-accent">
              <UserPlus className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">Add another account</span>
          </button>
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
            type="button"
            onClick={handleSwitch}
            disabled={isSubmitting || selectedUserId === user?.id}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Switching...
              </>
            ) : (
              "Switch Account"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
