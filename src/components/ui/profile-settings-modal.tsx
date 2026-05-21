"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Upload, User, Shield, Camera, Check } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { getOtpLoginPreference, setOtpLoginPreference, updateProfile } from "@/lib/api/contracts";
import { uploadFile } from "@/lib/api/uploads";
import { useAsyncAction } from "@/hooks/ui";

type Tab = "profile" | "security";

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileSettingsModal({ isOpen, onClose }: ProfileSettingsModalProps) {
  const { user, accessToken, updateUser } = useSession();
  const t = useTranslations("profile");
  const tCommon = useTranslations("common");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [name, setName] = useState(user?.displayName || "");
  const [savedName, setSavedName] = useState(false);
  const [isOtpLoading, setIsOtpLoading] = useState(false);
  const [otpLoginEnabled, setOtpLoginEnabledState] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(user?.displayName || "");
      setSelectedFile(null);
      setPreviewUrl(null);
      setFileError(null);
      setSavedName(false);
      setActiveTab("profile");
    }
  }, [isOpen, user?.displayName]);

  const saveAvatarAction = useAsyncAction(async (_: void) => {
    if (!accessToken || !user || !selectedFile) return;

    const uploadResult = await uploadFile(selectedFile, accessToken, {
      ownerScopeType: "user",
      ownerScopeId: user.id,
      usage: "avatar"
    });

    await updateProfile(accessToken, { name: name.trim() || user.name || "", avatarUrl: uploadResult.url });
    updateUser({ avatarUrl: uploadResult.url });
    setSelectedFile(null);
    setPreviewUrl(null);
  });

  const saveNameAction = useAsyncAction(async (_: void) => {
    if (!name.trim() || !accessToken || !user) return;

    await updateProfile(accessToken, { name: name.trim(), avatarUrl: user.avatarUrl || "" });
    updateUser({ name: name.trim(), displayName: name.trim() });
    setSavedName(true);
    setTimeout(() => setSavedName(false), 2000);
  });

  const otpAction = useAsyncAction(async (enabled: boolean) => {
    if (!accessToken) return;
    const result = await setOtpLoginPreference(accessToken, enabled);
    setOtpLoginEnabledState(Boolean(result.enabled));
  });

  useEffect(() => {
    if (!isOpen || !accessToken) return;

    let cancelled = false;
    setIsOtpLoading(true);
    getOtpLoginPreference(accessToken)
      .then((result) => { if (!cancelled) setOtpLoginEnabledState(Boolean(result.enabled)); })
      .catch(() => { if (!cancelled) setOtpLoginEnabledState(false); })
      .finally(() => { if (!cancelled) setIsOtpLoading(false); });

    return () => { cancelled = true; };
  }, [isOpen, accessToken]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    if (file.size > 5 * 1024 * 1024) {
      setFileError(t("avatarTooLarge") || "Image must be less than 5MB");
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const avatarSrc = previewUrl || getUserAvatarUrl(user?.avatarUrl, user?.email, 96);
  const displayName = user?.displayName || user?.username || "";
  const email = user?.email || user?.primaryEmail || "";
  const nameHasChanged = name.trim() !== (user?.displayName || user?.name || "");

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "profile", label: t("tabs.profile") || "Profile", icon: User },
    { id: "security", label: t("tabs.security") || "Security", icon: Shield },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold tracking-tight">{t("title") || "Account settings"}</h2>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-md opacity-60 hover:opacity-100 hover:bg-accent/10 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <aside className="w-44 shrink-0 border-r border-border bg-muted/20 p-2 flex flex-col gap-0.5">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left ${
                  activeTab === id
                    ? "bg-accent/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent/5 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0">
            {activeTab === "profile" && (
              <div className="space-y-6">
                {/* User identity card */}
                <div className="flex items-center gap-4 p-4 rounded-xl border border-border/60 bg-background/50">
                  <div className="relative group shrink-0">
                    <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-border shadow-sm bg-accent/10">
                      <img
                        src={avatarSrc}
                        alt={displayName}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-base truncate">{displayName || "—"}</p>
                    {email && <p className="text-sm text-muted-foreground truncate">{email}</p>}
                  </div>
                </div>

                {/* Avatar section */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    {t("avatar") || "Profile image"}
                  </p>
                  <div className="flex items-center gap-4">
                    <div
                      className="group relative h-20 w-20 rounded-full overflow-hidden border-2 border-border cursor-pointer shrink-0 bg-accent/10"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <img
                        src={avatarSrc}
                        alt={displayName}
                        className="h-full w-full object-cover group-hover:brightness-75 transition-all"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera className="h-5 w-5 text-white drop-shadow" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground max-w-[200px]">
                        {t("avatarHint") || "JPG, PNG or GIF. Max 5MB."}
                      </p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-accent/10 transition-colors"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {t("changePhoto") || "Change photo"}
                      </button>
                      {selectedFile && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground truncate max-w-[140px]">{selectedFile.name}</span>
                          <button
                            type="button"
                            disabled={saveAvatarAction.isPending}
                            onClick={() => void saveAvatarAction.run(undefined)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                          >
                            {saveAvatarAction.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            {tCommon("actions.save") || "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setSelectedFile(null); setPreviewUrl(null); }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {tCommon("actions.cancel") || "Cancel"}
                          </button>
                        </div>
                      )}
                      {fileError && <p className="text-xs text-destructive">{fileError}</p>}
                      {saveAvatarAction.error && <p className="text-xs text-destructive">{saveAvatarAction.error}</p>}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>

                {/* Display name section */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    {t("displayName") || "Display name"}
                  </p>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={saveNameAction.isPending}
                        placeholder={t("displayNamePlaceholder") || "Your name"}
                        className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50 transition-all"
                      />
                      {saveNameAction.error && (
                        <p className="text-xs text-destructive mt-1">{saveNameAction.error}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={!nameHasChanged || !name.trim() || saveNameAction.isPending}
                      onClick={() => void saveNameAction.run(undefined)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
                    >
                      {saveNameAction.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : savedName ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : null}
                      {savedName ? (tCommon("actions.saved") || "Saved!") : (tCommon("actions.save") || "Save")}
                    </button>
                  </div>
                </div>

                {/* Email (read-only) */}
                {email && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      {t("email") || "Email address"}
                    </p>
                    <div className="flex h-9 w-full items-center rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                      {email}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    {t("otpLogin.title") || "Login options"}
                  </p>
                  <div className="rounded-xl border border-border/70 bg-background/50 p-4">
                    <label className="flex items-start gap-3 cursor-pointer" htmlFor="otp-login-enabled">
                      <div className="relative mt-0.5">
                        <input
                          id="otp-login-enabled"
                          type="checkbox"
                          checked={otpLoginEnabled}
                          onChange={(e) => void otpAction.run(e.target.checked)}
                          disabled={isOtpLoading || otpAction.isPending || !accessToken}
                          className="sr-only peer"
                        />
                        <div className="h-5 w-9 rounded-full border border-input bg-muted peer-checked:bg-primary transition-colors peer-disabled:opacity-50">
                          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${otpLoginEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{t("otpLogin.title") || "One-time password login"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("otpLogin.description") || "Receive a code by email each time you log in"}</p>
                      </div>
                    </label>
                    {(isOtpLoading || otpAction.isPending) && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>{tCommon("actions.loading")}</span>
                      </div>
                    )}
                    {otpAction.error && (
                      <p className="mt-2 text-xs text-destructive">{otpAction.error}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors hover:bg-accent/10 text-muted-foreground hover:text-foreground"
          >
            {tCommon("actions.close") || "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
