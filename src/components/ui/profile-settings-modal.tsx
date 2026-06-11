"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Loader2, Upload, User, Shield, Camera, Check, Globe, Clock, Sparkles } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { useTranslations } from "@/components/providers/i18n-provider";
import { getUserAvatarUrl } from "@/lib/gravatar";
import { getOtpLoginPreference, setOtpLoginPreference, updateProfile } from "@/lib/api/contracts";
import { uploadFile } from "@/lib/api/uploads";
import { useAsyncAction } from "@/hooks/ui";
import { ModelSelector } from "@/components/agent/model-selector";

type Tab = "profile" | "security";

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function useSavedFeedback() {
  const [saved, setSaved] = useState(false);
  const show = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return { saved, show };
}

export function ProfileSettingsModal({ isOpen, onClose }: ProfileSettingsModalProps) {
  const { user, accessToken, updateUser, activeTeamId } = useSession();
  const t = useTranslations("profile");
  const tCommon = useTranslations("common");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<Tab>("profile");

  // Profile fields
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [timezone, setTimezone] = useState("");
  const [locale, setLocale] = useState("");

  // Avatar
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Default AI model
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const modelSaved = useSavedFeedback();

  // OTP
  const [isOtpLoading, setIsOtpLoading] = useState(false);
  const [otpLoginEnabled, setOtpLoginEnabledState] = useState(false);

  // Save feedback
  const nameSaved = useSavedFeedback();
  const infoSaved = useSavedFeedback();

  const allTimezones = useMemo(() => {
    try {
      return (Intl as any).supportedValuesOf?.("timeZone") as string[] ?? [];
    } catch {
      return ["UTC", "America/New_York", "America/Los_Angeles", "America/Chicago", "America/Denver",
        "America/Lima", "America/Bogota", "America/Mexico_City", "America/Sao_Paulo",
        "Europe/London", "Europe/Madrid", "Europe/Paris", "Europe/Berlin",
        "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Asia/Dubai",
        "Australia/Sydney", "Pacific/Auckland"];
    }
  }, []);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setName(user?.displayName || user?.name || "");
      setBio(user?.bio || "");
      setTimezone(user?.timezone || "");
      setLocale(user?.locale || "");
      setDefaultModel(user?.defaultModel || null);
      setSelectedFile(null);
      setPreviewUrl(null);
      setFileError(null);
      setActiveTab("profile");
    }
  }, [isOpen, user?.displayName, user?.name, user?.bio, user?.timezone, user?.locale, user?.defaultModel]);

  // OTP preference
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

  const saveAvatarAction = useAsyncAction(async (_: void) => {
    if (!accessToken || !user || !selectedFile) return;
    const uploadResult = await uploadFile(selectedFile, accessToken, {
      ownerScopeType: "user",
      ownerScopeId: user.id,
      usage: "avatar",
    });
    await updateProfile(accessToken, { name: name.trim() || user.name || "", avatarUrl: uploadResult.url });
    updateUser({ avatarUrl: uploadResult.url });
    setSelectedFile(null);
    setPreviewUrl(null);
  });

  const saveNameAction = useAsyncAction(async (_: void) => {
    if (!name.trim() || !accessToken || !user) return;
    await updateProfile(accessToken, { name: name.trim() });
    updateUser({ name: name.trim(), displayName: name.trim() });
    nameSaved.show();
  });

  const saveInfoAction = useAsyncAction(async (_: void) => {
    if (!accessToken || !user) return;
    await updateProfile(accessToken, {
      bio: bio.trim(),
      timezone: timezone || undefined,
      locale: locale || undefined,
    });
    updateUser({ bio: bio.trim() || null, timezone: timezone || null, locale: locale || null });
    infoSaved.show();
  });

  const saveModelAction = useAsyncAction(async (modelId: string) => {
    if (!accessToken || !user) return;
    await updateProfile(accessToken, { defaultModel: modelId });
    updateUser({ defaultModel: modelId });
    setDefaultModel(modelId);
    modelSaved.show();
  });

  const otpAction = useAsyncAction(async (enabled: boolean) => {
    if (!accessToken) return;
    const result = await setOtpLoginPreference(accessToken, enabled);
    setOtpLoginEnabledState(Boolean(result.enabled));
  });

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    if (file.size > 5 * 1024 * 1024) {
      setFileError(t("avatarTooLarge") || "Image must be less than 5 MB");
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const avatarSrc = previewUrl || getUserAvatarUrl(user?.avatarUrl, user?.email, 96);
  const displayName = user?.displayName || user?.name || "";
  const email = user?.email || user?.primaryEmail || "";
  const nameHasChanged = name.trim() !== (user?.displayName || user?.name || "");
  const infoHasChanged =
    bio.trim() !== (user?.bio || "") ||
    timezone !== (user?.timezone || "") ||
    locale !== (user?.locale || "");

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "profile", label: t("tabs.profile") || "Profile", icon: User },
    { id: "security", label: t("tabs.security") || "Security", icon: Shield },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200 p-0 sm:p-4">
      <div className="relative w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col max-h-[92dvh] sm:max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold tracking-tight">{t("title") || "Account settings"}</h2>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-md opacity-60 hover:opacity-100 hover:bg-accent/10 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab bar — shown inline on mobile, as sidebar on desktop */}
        <div className="flex sm:hidden border-b border-border shrink-0 px-2 gap-1 bg-muted/20">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar — desktop only */}
          <aside className="hidden sm:flex w-44 shrink-0 border-r border-border bg-muted/20 p-2 flex-col gap-0.5">
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

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-5 space-y-6">

              {activeTab === "profile" && (
                <>
                  {/* Identity card */}
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-background/50">
                    <div className="h-12 w-12 rounded-full overflow-hidden border border-border shrink-0 bg-accent/10">
                      <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{displayName || "—"}</p>
                      {email && <p className="text-xs text-muted-foreground truncate">{email}</p>}
                    </div>
                  </div>

                  {/* Avatar section */}
                  <section>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      {t("avatar") || "Profile image"}
                    </p>
                    <div className="flex items-start gap-4">
                      <div
                        className="group relative h-16 w-16 rounded-full overflow-hidden border-2 border-border cursor-pointer shrink-0 bg-accent/10"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <img
                          src={avatarSrc}
                          alt={displayName}
                          className="h-full w-full object-cover group-hover:brightness-75 transition-all"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Camera className="h-4 w-4 text-white drop-shadow" />
                        </div>
                      </div>
                      <div className="space-y-2 min-w-0">
                        <p className="text-xs text-muted-foreground">{t("avatarHint") || "JPG, PNG or GIF. Max 5 MB."}</p>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-accent/10 transition-colors"
                        >
                          <Upload className="h-3 w-3" />
                          {t("changePhoto") || "Change photo"}
                        </button>
                        {selectedFile && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground truncate max-w-[120px]">{selectedFile.name}</span>
                            <button
                              type="button"
                              disabled={saveAvatarAction.isPending}
                              onClick={() => void saveAvatarAction.run(undefined)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                            >
                              {saveAvatarAction.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
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
                        {(fileError || saveAvatarAction.error) && (
                          <p className="text-xs text-destructive">{fileError ?? saveAvatarAction.error}</p>
                        )}
                      </div>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </div>
                  </section>

                  {/* Display name */}
                  <section>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      {t("displayName") || "Display name"}
                    </p>
                    <div className="flex gap-2 items-start">
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={saveNameAction.isPending}
                        placeholder={t("displayNamePlaceholder") || "Your name"}
                        className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50 transition-all min-w-0"
                      />
                      <button
                        type="button"
                        disabled={!nameHasChanged || !name.trim() || saveNameAction.isPending}
                        onClick={() => void saveNameAction.run(undefined)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
                      >
                        {saveNameAction.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : nameSaved.saved ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : null}
                        {nameSaved.saved ? (tCommon("actions.saved") || "Saved!") : (tCommon("actions.save") || "Save")}
                      </button>
                    </div>
                    {saveNameAction.error && <p className="text-xs text-destructive mt-1">{saveNameAction.error}</p>}
                  </section>

                  {/* Email read-only */}
                  {email && (
                    <section>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        {t("email") || "Email address"}
                      </p>
                      <div className="flex h-9 w-full items-center rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground select-all">
                        {email}
                      </div>
                    </section>
                  )}

                  {/* Bio + Timezone + Locale — group saved together */}
                  <section className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("subtitle") || "Public information"}
                    </p>

                    {/* Bio */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5">{t("bio") || "Bio"}</label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder={t("bioPlaceholder") || "Tell your team a little about yourself"}
                        rows={3}
                        maxLength={300}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 resize-none transition-all"
                      />
                      <p className="text-xs text-muted-foreground text-right mt-0.5">{bio.length}/300</p>
                    </div>

                    {/* Timezone */}
                    <div>
                      <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("timezone") || "Timezone"}
                      </label>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-all"
                      >
                        <option value="">— {t("timezone") || "Timezone"} —</option>
                        {allTimezones.map((tz) => (
                          <option key={tz} value={tz}>{tz}</option>
                        ))}
                      </select>
                    </div>

                    {/* Locale */}
                    <div>
                      <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("locale") || "Language"}
                      </label>
                      <select
                        value={locale}
                        onChange={(e) => setLocale(e.target.value)}
                        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-all"
                      >
                        <option value="">— {t("locale") || "Language"} —</option>
                        <option value="en">{t("locales.en") || "English"}</option>
                        <option value="es">{t("locales.es") || "Español"}</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      {saveInfoAction.error && <p className="text-xs text-destructive flex-1">{saveInfoAction.error}</p>}
                      <button
                        type="button"
                        disabled={!infoHasChanged || saveInfoAction.isPending}
                        onClick={() => void saveInfoAction.run(undefined)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                      >
                        {saveInfoAction.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : infoSaved.saved ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : null}
                        {infoSaved.saved ? (tCommon("actions.saved") || "Saved!") : (tCommon("actions.save") || "Save")}
                      </button>
                    </div>
                  </section>

                  {/* Default AI model */}
                  {activeTeamId && (
                    <section>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        {t("defaultModel.title") || "Default AI model"}
                      </p>
                      <div className="flex items-center gap-1.5 mb-2 text-sm font-medium">
                        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                        {t("defaultModel.label") || "Preferred model"}
                        {modelSaved.saved && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-500 font-medium">
                            <Check className="h-3 w-3" />
                            {tCommon("actions.saved") || "Saved!"}
                          </span>
                        )}
                      </div>
                      <ModelSelector
                        teamId={activeTeamId}
                        value={defaultModel}
                        onChange={(modelId) => void saveModelAction.run(modelId)}
                        variant="full"
                      />
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {t("defaultModel.hint") || "Used as the starting model for new conversations."}
                      </p>
                      {saveModelAction.error && <p className="text-xs text-destructive mt-1">{saveModelAction.error}</p>}
                    </section>
                  )}
                </>
              )}

              {activeTab === "security" && (
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    {t("tabs.security") || "Security"}
                  </p>
                  <div className="rounded-xl border border-border/70 bg-background/50 p-4">
                    <label className="flex items-start gap-3 cursor-pointer" htmlFor="otp-login-enabled">
                      <div className="relative mt-0.5 shrink-0">
                        <input
                          id="otp-login-enabled"
                          type="checkbox"
                          checked={otpLoginEnabled}
                          onChange={(e) => void otpAction.run(e.target.checked)}
                          disabled={isOtpLoading || otpAction.isPending || !accessToken}
                          className="sr-only peer"
                        />
                        <div className="h-5 w-9 rounded-full border border-input bg-muted peer-checked:bg-primary peer-disabled:opacity-50 transition-colors">
                          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${otpLoginEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{t("otpLogin.title") || "One-time password login"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t("otpLogin.description") || "Receive a code by email each time you log in"}</p>
                      </div>
                    </label>
                    {(isOtpLoading || otpAction.isPending) && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>{tCommon("actions.loading")}</span>
                      </div>
                    )}
                    {otpAction.error && <p className="mt-2 text-xs text-destructive">{otpAction.error}</p>}
                  </div>
                </section>
              )}

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-border shrink-0 bg-card">
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
