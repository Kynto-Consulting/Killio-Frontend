import { useCallback } from "react";
import { Tag, MessageSquare, Edit2, Sparkles, Trash2, RefreshCcw, Layout } from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";

export function useActionTheme() {
  const t = useTranslations("common");

  return useCallback((action: string) => {
    const lower = action.toLowerCase();
    if (lower === "card.tag_added") return { icon: Tag, badge: t("actionThemes.tagAdded"), badgeClass: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30" };
    if (lower === "card.tag_removed") return { icon: Tag, badge: t("actionThemes.tagRemoved"), badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
    if (lower === "card.commented" || lower === "board.commented") return { icon: MessageSquare, badge: t("actionThemes.comment"), badgeClass: "bg-amber-500/15 text-amber-500 border-amber-500/30" };
    if (lower === "card.updated") return { icon: Edit2, badge: t("actionThemes.updated"), badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
    if (lower.includes("created")) return { icon: Sparkles, badge: t("actionThemes.created"), badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    if (lower.includes("deleted") || lower.includes("removed")) return { icon: Trash2, badge: t("actionThemes.deleted"), badgeClass: "bg-red-500/15 text-red-400 border-red-500/30" };
    if (lower.includes("updated") || lower.includes("edited")) return { icon: RefreshCcw, badge: t("actionThemes.changed"), badgeClass: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
    
    return { icon: Layout, badge: t("actionThemes.activity"), badgeClass: "bg-accent/10 text-accent border-accent/20" };
  }, [t]);
}