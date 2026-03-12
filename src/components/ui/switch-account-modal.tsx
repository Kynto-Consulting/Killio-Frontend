"use client";

import { useState } from "react";
import { X, ArrowRightLeft, Loader2, UserPlus, CheckCircle2 } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";

interface SwitchAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SwitchAccountModal({ isOpen, onClose }: SwitchAccountModalProps) {
  const { user } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(user?.email || null);

  if (!isOpen) return null;

  const handleSwitch = async () => {
    setIsSubmitting(true);
    try {
      // TODO: Actual implementation to switch auth context
      await new Promise((res) => setTimeout(res, 800));
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
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

        <div className="space-y-3 mb-6">
          {/* Current Active Account */}
          <button 
            onClick={() => setSelectedPreview(user?.email || "current")}
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
              selectedPreview === (user?.email || "current")
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border hover:border-border/80 hover:bg-accent/5"
            }`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-tr from-accent to-primary/60 flex items-center justify-center text-primary-foreground font-semibold text-sm border border-border shadow-sm">
                {user?.displayName ? user.displayName.substring(0, 2).toUpperCase() : "US"}
              </div>
              <div className="flex flex-col items-start overflow-hidden">
                <span className="text-sm font-semibold truncate w-full content-start">{user?.displayName || "Current User"}</span>
                <span className="text-xs text-muted-foreground truncate w-full content-start">{user?.email || "Signed in"}</span>
              </div>
            </div>
            {selectedPreview === (user?.email || "current") && (
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 ml-2" />
            )}
          </button>
          
          {/* Add Account fake option */}
          <button className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border/60 hover:border-accent hover:bg-accent/5 transition-all text-muted-foreground hover:text-foreground">
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
            disabled={isSubmitting || selectedPreview === (user?.email || "current")}
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
