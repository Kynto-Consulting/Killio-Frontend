"use client";

import { useEffect, useState } from "react";
import { X, Loader2, UserCircle, Upload } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { getOtpLoginPreference, setOtpLoginPreference } from "@/lib/api/contracts";

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileSettingsModal({ isOpen, onClose }: ProfileSettingsModalProps) {
  const { user, accessToken } = useSession();
  const t = useTranslations("profile");
  const tCommon = useTranslations("common");
  const [name, setName] = useState(user?.displayName || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOtpLoading, setIsOtpLoading] = useState(false);
  const [isOtpSaving, setIsOtpSaving] = useState(false);
  const [otpLoginEnabled, setOtpLoginEnabledState] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !accessToken) return;

    let cancelled = false;
    setIsOtpLoading(true);
    getOtpLoginPreference(accessToken)
      .then((result) => {
        if (!cancelled) {
          setOtpLoginEnabledState(Boolean(result.enabled));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOtpLoginEnabledState(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsOtpLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken]);

  if (!isOpen) return null;

  const handleToggleOtp = async (enabled: boolean) => {
    if (!accessToken) return;
    setIsOtpSaving(true);
    setError(null);
    try {
      const result = await setOtpLoginPreference(accessToken, enabled);
      setOtpLoginEnabledState(Boolean(result.enabled));
    } catch (err: any) {
      setError(err?.message || t("updateError"));
    } finally {
      setIsOtpSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    setIsSubmitting(true);
    setError(null);
    try {
      // TODO: Wire up to actual updateProfile API when available
      await new Promise(resolve => setTimeout(resolve, 800));
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || t("updateError"));
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
          <span className="sr-only">{tCommon("actions.close")}</span>
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserCircle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="group relative flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border shadow-sm bg-accent/10">
                <img 
                  src={getUserAvatarUrl(undefined, user?.email, 80)} 
                  alt={user?.displayName || tCommon("account.fallbackUser")} 
                  className="h-full w-full object-cover group-hover:opacity-40 transition-opacity"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Upload className="h-6 w-6 text-white" />
                </div>
            </div>
            <div className="space-y-1 text-center sm:text-left">
              <h3 className="text-sm font-medium">{t("avatar")}</h3>
              <p className="text-xs text-muted-foreground max-w-[200px]">{t("avatarHint")}</p>
              <button type="button" className="mt-2 text-xs font-semibold text-accent hover:underline">{t("changePhoto")}</button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="display-name" className="text-sm font-medium leading-none">
                {t("displayName")}
              </label>
              <input
                id="display-name"
                type="text"
                placeholder={t("displayNamePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all focus:border-primary"
              />
              {error && (
                <p className="text-sm font-medium text-destructive mt-1">{error}</p>
              )}
            </div>
            
            {/* Email y mensajes ocultos temporalmente */}

            <div className="rounded-xl border border-border/70 bg-background/60 p-4">
              <label className="flex items-start gap-3 text-sm text-muted-foreground" htmlFor="otp-login-enabled">
                <input
                  id="otp-login-enabled"
                  type="checkbox"
                  checked={otpLoginEnabled}
                  onChange={(e) => void handleToggleOtp(e.target.checked)}
                  disabled={isOtpLoading || isOtpSaving || !accessToken}
                  className="mt-0.5 h-4 w-4 rounded border border-input bg-background accent-white"
                />
                <span className="leading-6">
                  <span className="block text-foreground">{t("otpLogin.title")}</span>
                  <span className="block text-xs text-muted-foreground">{t("otpLogin.description")}</span>
                </span>
              </label>
              {(isOtpLoading || isOtpSaving) && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{tCommon("actions.loading")}</span>
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
              {tCommon("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting || name === user?.displayName}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tCommon("actions.saving")}
                </>
              ) : (
                t("saveChanges")
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
