import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { BLOCK_TYPES } from "./rich.ts";
import { BUTTON_STYLES } from "./components.ts";
import { OPTION_TYPES } from "./options.ts";
import { ROOM_NODE_SPECS, varI18nKey } from "./room-nodes.ts";

// Run from the repository root (npm run test:bots).
const load = (lang: string, ns: string) => JSON.parse(readFileSync(`src/i18n/locales/${lang}/${ns}.json`, "utf8")) as Record<string, unknown>;
const get = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((a, p) => (a && typeof a === "object" ? (a as Record<string, unknown>)[p] : undefined), o);

const NODE_ISSUES = ["role_required", "user_required", "room_required", "emoji_required", "content_required", "schedule_one", "every_range", "daily_format", "weekdays_range", "weekdays_need_daily", "expires_range", "command_name", "message_id_uuid", "room_uuid", "custom_id_pattern"];
const BLOCK_ISSUES = ["not_list", "empty", "too_many", "too_large", "type_unknown", "text_required", "text_long", "heading_level", "items_empty", "items_many", "item_required", "item_long", "columns_range", "rows_many", "row_wide", "cell_long", "url_required", "url_https", "color_format", "embed_empty", "fields_many", "field_name", "field_value", "timestamp", "title_long", "alt_long", "code_long"];
const COMPONENT_ISSUES = ["too_many_rows", "row_empty", "select_alone", "too_many_buttons", "type_invalid", "style_invalid", "label_required", "label_long", "custom_id_required", "custom_id_invalid", "custom_id_duplicate", "link_url", "link_custom_id", "url_extra", "options_empty", "options_many", "option_label", "option_value", "option_value_duplicate", "option_description_long", "values_range", "placeholder_long", "expires_range"];
const OPTION_ISSUES = ["too_many", "name_invalid", "name_duplicate", "description_long", "sub_nesting", "group_empty", "group_only_subs", "sub_only_values", "choices_count", "choices_exclusive", "choice_name", "choice_value", "choice_integer", "choice_duplicate", "minmax_number", "minmax_integer", "min_gt_max", "length_range", "length_order", "length_zero_max", "required_order", "mixed_levels"];
const ARG_ERRORS = ["required", "unknown_option", "given_twice", "extra_argument", "too_many", "unclosed_quote", "choose_one", "min_length", "max_length", "integer", "number", "min", "max", "boolean", "user", "user_kind", "role", "channel", "attachment", "choice"];
const INTERACT = ["forbidden", "notFound", "notListening", "expired", "tooMany", "invalid", "generic"];

for (const lang of ["en", "es"]) {
  test(`i18n ${lang}: every key the room / bot UI builds dynamically exists, and none has a dot in its name`, () => {
    const integrations = load(lang, "integrations");
    const bots = load(lang, "bots");
    const rooms = load(lang, "rooms");
    const missing: string[] = [];
    const need = (o: unknown, ns: string, key: string) => {
      if (typeof get(o, key) !== "string") missing.push(`${ns}:${key}`);
    };

    for (const spec of Object.values(ROOM_NODE_SPECS)) {
      need(integrations, "integrations", `canvas.nodes.${spec.labelKey}`);
      need(integrations, "integrations", `canvas.room.nodes.${spec.labelKey}`);
      for (const f of spec.fields) {
        const base = f.key === "roomId" ? "roomId" : f.key;
        need(integrations, "integrations", `canvas.room.fields.${base}.label`);
        for (const o of f.options ?? []) need(integrations, "integrations", `canvas.room.fields.${f.key}.options.${o}`);
      }
      for (const v of spec.emits) need(integrations, "integrations", `canvas.room.vars.${varI18nKey(v.name)}`);
    }
    need(integrations, "integrations", "canvas.room.fields.roomIdRequired.hint");
    for (const c of NODE_ISSUES) need(integrations, "integrations", `canvas.room.issues.node.${c}`);
    for (const c of BLOCK_ISSUES) need(integrations, "integrations", `canvas.room.issues.blocks.${c}`);
    for (const c of COMPONENT_ISSUES) need(integrations, "integrations", `canvas.room.issues.components.${c}`);
    for (const b of BLOCK_TYPES) need(integrations, "integrations", `canvas.room.blocks.types.${b}`);
    for (const s of BUTTON_STYLES) need(integrations, "integrations", `canvas.room.components.styles.${s}`);
    for (const ty of OPTION_TYPES) {
      need(integrations, "integrations", `canvas.room.optionTypes.${ty}`);
      need(bots, "bots", `options.types.${ty}`);
    }
    for (let d = 0; d < 7; d++) need(integrations, "integrations", `canvas.room.weekdays.${d}`);
    for (const c of OPTION_ISSUES) need(bots, "bots", `options.issues.${c}`);
    for (const c of ARG_ERRORS) need(rooms, "rooms", `composer.args.errors.${c}`);
    for (const k of ["subcommand", "option", "choice", "boolean", "user", "role", "channel"]) need(rooms, "rooms", `composer.args.kinds.${k}`);
    for (const k of INTERACT) need(rooms, "rooms", `bot.interact.errors.${k}`);
    for (const k of ["name_required", "name_long", "avatar_invalid"]) need(rooms, "rooms", `webhooks.new.errors.${k}`);
    for (const k of ["rotate", "revoke"]) for (const s of ["Title", "Body", "Button"]) need(rooms, "rooms", `webhooks.confirm.${k}${s}`);
    assert.deepEqual(missing, []);

    const dotted: string[] = [];
    const walk = (o: unknown, trail: string) => {
      if (!o || typeof o !== "object") return;
      for (const [k, v] of Object.entries(o)) {
        if (k.includes(".")) dotted.push(`${trail}/${k}`);
        walk(v, `${trail}/${k}`);
      }
    };
    walk(integrations, "integrations");
    walk(bots, "bots");
    walk(rooms, "rooms");
    assert.deepEqual(dotted, []);
  });
}
