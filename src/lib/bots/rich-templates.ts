/**
 * Starting points for the structured editor of a bot message: blocks (and components) that already follow the v2 contract and the
 * limits. Texts are looked up through `tr` (i18n keys under `canvas.room.templates.<id>.*`), so the module stays pure and testable.
 * Every template validates cleanly with validateBlocks / validateComponents (rich-templates.test.ts).
 */
import type { ComponentRow } from "./components.ts";
import type { RichBlock } from "./rich.ts";

export type TemplateId = "rolePanel" | "welcomeCard" | "poll" | "serverStatus";
export const TEMPLATE_IDS: readonly TemplateId[] = ["rolePanel", "welcomeCard", "poll", "serverStatus"];

export interface RichTemplate {
  id: TemplateId;
  blocks: RichBlock[];
  components?: ComponentRow[];
  expiresInMinutes?: number;
}

type Tr = (key: string) => string;

export function richTemplate(id: TemplateId, tr: Tr): RichTemplate {
  const k = (name: string) => tr(`canvas.room.templates.${id}.${name}`);
  switch (id) {
    case "rolePanel":
      return {
        id,
        blocks: [
          { type: "section", text: `${k("title")}\n${k("body")}` },
          { type: "callout", variant: "info", title: k("calloutTitle"), text: k("calloutText") },
        ],
        components: [
          { components: [{ type: "role_select", customId: "role:pick", placeholder: k("placeholder"), minValues: 1, maxValues: 1, selfAssignableOnly: true }] },
          { components: [{ type: "button", label: k("remove"), style: "secondary", customId: "role:clear" }] },
        ],
        expiresInMinutes: 30,
      };
    case "welcomeCard":
      return {
        id,
        blocks: [
          {
            type: "container",
            accentColor: "#6366f1",
            blocks: [
              { type: "section", text: `${k("title")}\n${k("body")}`, accessory: { type: "thumbnail", url: "https://killio.dev/icon.png", alt: k("logoAlt") } },
              { type: "badges", items: [{ text: k("badgeNew"), color: "green" }, { text: k("badgeCommunity"), color: "blue" }] },
              { type: "timestamp", value: "{{ receivedAt }}", style: "relative", label: k("joined") },
            ],
          },
        ],
      };
    case "poll":
      return {
        id,
        blocks: [
          { type: "poll", question: k("question"), options: [{ label: k("optionA"), votes: 0 }, { label: k("optionB"), votes: 0 }, { label: k("optionC"), votes: 0 }], multiple: false, closed: false },
          { type: "footer", text: k("footer") },
        ],
        components: [
          { components: [
            { type: "button", label: k("optionA"), style: "primary", customId: "vote:a" },
            { type: "button", label: k("optionB"), style: "primary", customId: "vote:b" },
            { type: "button", label: k("optionC"), style: "primary", customId: "vote:c" },
          ] },
        ],
        expiresInMinutes: 1440,
      };
    case "serverStatus":
      return {
        id,
        blocks: [
          { type: "heading", level: 2, text: k("title") },
          { type: "stats", items: [{ label: k("uptime"), value: "99.9%", delta: "+0.1%", trend: "up" }, { label: k("latency"), value: "120 ms", delta: "-8 ms", trend: "up" }, { label: k("errors"), value: "3", delta: "+1", trend: "down" }] },
          { type: "progress", value: 64, max: 100, label: k("capacity"), showPercent: true, tone: "success" },
          { type: "key_value", items: [{ key: k("region"), value: "eu-west" }, { key: k("version"), value: "1.0.0" }] },
          { type: "timestamp", value: "{{ receivedAt }}", style: "relative", label: k("updated") },
        ],
      };
  }
}
