"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Sparkles, CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { getTeamAiUsage, type TeamAiUsage } from "@/lib/api/contracts";
import { useTeamAiCreditsUpdate } from "@/hooks/use-team-ai-credits-update";
import { useTranslations } from "@/components/providers/i18n-provider";

interface NavbarAiCreditsProps {
  teamId: string;
  accessToken: string;
}

export function NavbarAiCredits({ teamId, accessToken }: NavbarAiCreditsProps) {
  const router = useRouter();
  const t = useTranslations("common");
  const tPricing = useTranslations("pricing");
  const [aiUsage, setAiUsage] = useState<TeamAiUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId || !accessToken) {
      setLoading(false);
      return;
    }

    const loadUsage = async () => {
      setLoading(true);
      try {
        const usage = await getTeamAiUsage(teamId, accessToken);
        setAiUsage(usage);
      } catch (err) {
        console.error("Failed to load AI usage:", err);
      } finally {
        setLoading(false);
      }
    };

    loadUsage();
  }, [teamId, accessToken]);

  // Subscribe to real-time credits updates
  const handleCreditsUsed = useCallback((event: any) => {
    setAiUsage((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        creditsUsed: parseFloat((prev.creditsUsed + event.credits).toFixed(6)),
        tokensUsed: prev.tokensUsed + event.tokens,
        remaining: parseFloat((prev.remaining - event.credits).toFixed(6)),
      };
    });
  }, []);

  useTeamAiCreditsUpdate(teamId, handleCreditsUsed);

  return (
    <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-card/80 px-2 py-1 text-[11px] text-muted-foreground">
      {loading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="hidden sm:inline">{t("actions.loading")}</span>
        </>
      ) : aiUsage ? (
        <>
          <span className="inline-flex items-center gap-1 text-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="font-medium">{t("agent.credits.used", { used: aiUsage.creditsUsed.toFixed(2), limit: aiUsage.limit.toFixed(2) })}</span>
          </span>
          <span className="hidden xl:inline truncate">Credits</span>
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            className="hidden items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 font-medium text-foreground hover:bg-accent/10 xl:inline-flex"
          >
            <CreditCard className="h-3.5 w-3.5" />
            {tPricing("actions.upgrade")}
          </button>
        </>
      ) : (
        <span>-</span>
      )}
    </div>
  );
}
