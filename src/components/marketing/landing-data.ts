// Facts shared by the desktop landing (killio-landing.tsx) and the mobile landing (app/page.mobile.tsx).
// Both pages read their sections, plans, integrations and preview content from here, so a plan,
// a limit or an integration is changed in one place. Text lives in the `landing` i18n namespace;
// this file only holds keys, icons and the demo content of the previews.
import type { ComponentType } from "react";
import {
  BarChart3,
  BrainCircuit,
  Database,
  Folder,
  Globe,
  History,
  Mail,
  Monitor,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
import {
  SiGithub,
  SiGoogledrive,
  SiNotion,
  SiSlack,
  SiTrello,
  SiWhatsapp,
  SiZapier,
} from "react-icons/si";
import { TbBrandOnedrive } from "react-icons/tb";

export type LandingIcon = ComponentType<{ className?: string }>;
export type LandingAccent = "lime" | "indigo" | "cyan";

/** Links of the landing navigation, in order. `hash` ones are sections of the landing itself. */
export const LANDING_NAV_LINKS: { key: string; href: string; hash: boolean }[] = [
  { key: "features", href: "#features", hash: true },
  { key: "ai", href: "#ai", hash: true },
  { key: "integrations", href: "#integrations", hash: true },
  { key: "marketplace", href: "/marketplace", hash: false },
  { key: "pricing", href: "#pricing", hash: true },
  { key: "download", href: "/download", hash: false },
];

/** Hero stats: `kl.hero.stats.<key>Value` / `<key>Label`. */

/** Pills under the Mesh Board feature: `kl.features.mesh.<pill>`. */
export const MESH_PILLS = ["pill1", "pill2", "pill3", "pill4", "pill5"] as const;

/** AI section items: `kl.ai.<key>.title` / `.desc`. */
export const AI_FEATURES: { Icon: LandingIcon; cls: LandingAccent; key: string }[] = [
  { Icon: Zap, cls: "lime", key: "builder" },
  { Icon: BrainCircuit, cls: "indigo", key: "chat" },
  { Icon: Database, cls: "cyan", key: "rag" },
];

/** Integrations: `kl.integrations.<key>`. */
export const LANDING_INTEGRATIONS: { Icon: LandingIcon; key: string }[] = [
  { Icon: SiGithub, key: "github" },
  { Icon: SiNotion, key: "notion" },
  { Icon: SiGoogledrive, key: "googledrive" },
  { Icon: TbBrandOnedrive, key: "onedrive" },
  { Icon: SiSlack, key: "slack" },
  { Icon: SiTrello, key: "trello" },
  { Icon: SiWhatsapp, key: "whatsapp" },
  { Icon: Webhook, key: "webhooks" },
  { Icon: Mail, key: "email" },
  { Icon: SiZapier, key: "zapier" },
];

/**
 * Plans: `kl.pricing.<key>.*`. `features` are the keys of the included lines.
 * Paid plans also have `priceYearly` and `badge`.
 */
export const LANDING_PLANS: { key: "free" | "pro" | "max"; accent: LandingAccent; paid: boolean; features: string[] }[] = [
  { key: "free", accent: "lime", paid: false, features: ["f1", "f2", "f3", "f4", "f5", "f6"] },
  { key: "pro", accent: "indigo", paid: true, features: ["f1", "f2", "f3", "f4", "f5", "f6", "f7"] },
  { key: "max", accent: "cyan", paid: true, features: ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"] },
];

export const SALES_MAILTO = "mailto:sales@killio.app";

/** "Every detail, covered" strip: `kl.strip.<key>.title` / `.desc`. */
export const STRIP_ITEMS: { Icon: LandingIcon; key: string }[] = [
  { Icon: History, key: "history" },
  { Icon: BarChart3, key: "metrics" },
  { Icon: Users, key: "roles" },
  { Icon: Monitor, key: "mobile" },
  { Icon: Globe, key: "sharing" },
  { Icon: Folder, key: "folders" },
];

// ─── Demo content of the previews (illustrative, not translated) ─────────────

export const KANBAN_COLUMNS: {
  name: string;
  count: number;
  cards: { title: string; tag: string; tc: "blue" | "red" | "green"; av: string; ac: string }[];
}[] = [
  {
    name: "To Do", count: 3, cards: [
      { title: "Design new onboarding", tag: "design", tc: "blue", av: "A", ac: "#6366f1" },
      { title: "Refactor auth module", tag: "urgent", tc: "red", av: "B", ac: "#ef4444" },
    ],
  },
  {
    name: "In Progress", count: 2, cards: [
      { title: "Build API rate limiter", tag: "backend", tc: "green", av: "C", ac: "#10b981" },
      { title: "Write release notes", tag: "docs", tc: "blue", av: "A", ac: "#6366f1" },
    ],
  },
  {
    name: "Done", count: 2, cards: [
      { title: "Setup CI/CD pipeline", tag: "devops", tc: "green", av: "D", ac: "#f59e0b" },
    ],
  },
];

export const DOC_PREVIEW_TITLE = "Q4 Planning Document";

/** Mesh preview nodes. Coordinates and colours are the desktop canvas ones. */
export const MESH_NODES: {
  id: "a" | "b" | "c" | "d" | "e";
  x: number; y: number; w: number; h: number;
  label: string; bg: string; border: string; color: string;
}[] = [
  { id: "a", x: 20, y: 28, w: 130, h: 38, label: "Project Kick-off", bg: "rgba(216,255,114,0.1)", border: "rgba(216,255,114,0.4)", color: "#d8ff72" },
  { id: "b", x: 200, y: 10, w: 130, h: 38, label: "Scope Review", bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.4)", color: "#a5b4fc" },
  { id: "c", x: 200, y: 90, w: 130, h: 38, label: "Tech Planning", bg: "rgba(34,211,238,0.08)", border: "rgba(34,211,238,0.35)", color: "#67e8f9" },
  { id: "d", x: 380, y: 50, w: 130, h: 38, label: "Sprint Start", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.35)", color: "#fcd34d" },
  { id: "e", x: 110, y: 160, w: 150, h: 38, label: "Decision Gate", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.3)", color: "#fca5a5" },
];

/** Steps of the automation shown in the AI section. `dot` is the desktop dot colour. */
export const SCRIPT_STEPS: { cls: "trigger" | "condition" | "action1" | "action2" | "end"; label: string; dot: string }[] = [
  { cls: "trigger", label: "Card Created", dot: "#d8ff72" },
  { cls: "condition", label: "Urgency = High?", dot: "#fcd34d" },
  { cls: "action1", label: "Notify Slack", dot: "#a5b4fc" },
  { cls: "action2", label: "Send WhatsApp", dot: "#67e8f9" },
  { cls: "end", label: "Log & Done", dot: "#fca5a5" },
];
