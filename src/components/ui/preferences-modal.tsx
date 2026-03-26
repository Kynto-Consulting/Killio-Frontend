"use client";

import { useEffect, useState } from "react";
import { X, Settings, Loader2, Moon, Globe } from "lucide-react";
import { Locale } from "@/i18n";
import { useI18n, useTranslations } from "@/components/providers/i18n-provider";

interface AppPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppPreferencesModal({ isOpen, onClose }: AppPreferencesModalProps) {
  const { locale, setLocale } = useI18n();
  const t = useTranslations("preferences");
  const tCommon = useTranslations("common");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [language, setLanguage] = useState<Locale>(locale);

  useEffect(() => {
    setLanguage(locale);
  }, [locale]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      setLocale(language);
      await new Promise(resolve => setTimeout(resolve, 300));
      onClose();
    } catch (error) {
      console.error(error);
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
          <span className="sr-only">{tCommon("actions.close")}</span>
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            
            <div className="space-y-3">
              <label className="text-sm font-medium leading-none flex items-center">
                <Moon className="w-4 h-4 mr-2 text-muted-foreground" />
                {t("themeLabel")}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {["light", "dark", "system"].map((themeOption) => (
                  <div 
                    key={themeOption}
                    onClick={() => setTheme(themeOption)}
                    className={`flex items-center justify-center px-3 py-2 border rounded-md cursor-pointer transition-colors text-sm font-medium ${
                      theme === themeOption ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent/10 text-muted-foreground"
                    }`}
                  >
                    <span className="capitalize">{themeOption === "light" ? t("themes.light") : themeOption === "dark" ? t("themes.dark") : t("themes.system")}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px w-full bg-border/50"></div>

            <div className="space-y-3">
              <label className="text-sm font-medium leading-none flex items-center">
                <Globe className="w-4 h-4 mr-2 text-muted-foreground" />
                {t("languageLabel")}
              </label>
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value as Locale)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="en">{t("languages.en")}</option>
                <option value="es">{t("languages.es")}</option>
              </select>
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
              disabled={isSubmitting}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tCommon("actions.saving")}
                </>
              ) : (
                t("save")
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
