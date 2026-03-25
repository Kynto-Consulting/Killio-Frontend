"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { ToastEventDetail, ToastVariant } from "@/lib/toast";

interface ToastItem extends ToastEventDetail {
  id: string;
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent<ToastEventDetail>;
      const { message, variant = "info", duration = 3000 } = customEvent.detail;
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      setToasts((prev) => [...prev, { id, message, variant, duration }]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    };

    window.addEventListener("killio:toast", handleToast);
    return () => window.removeEventListener("killio:toast", handleToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`
            pointer-events-auto
            flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl 
            bg-card/95 backdrop-blur-md min-w-[300px] max-w-md
            animate-in fade-in slide-in-from-right-4 duration-300
            ${t.variant === "success" ? "border-emerald-500/20 text-emerald-500" : ""}
            ${t.variant === "error" ? "border-red-500/20 text-red-500" : ""}
            ${t.variant === "info" ? "border-accent/20 text-accent" : ""}
          `}
        >
          {t.variant === "success" && <CheckCircle2 className="h-5 w-5 shrink-0" />}
          {t.variant === "error" && <AlertCircle className="h-5 w-5 shrink-0" />}
          {t.variant === "info" && <Info className="h-5 w-5 shrink-0" />}
          
          <div className="flex-1 text-sm font-medium text-foreground">
            {t.message}
          </div>

          <button 
            onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
            className="p-1 hover:bg-foreground/5 rounded-md transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ))}
    </div>
  );
}
