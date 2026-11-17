import assert from "node:assert/strict";
import test from "node:test";

import { backgroundTone, hslTripletToHex, isLightColor, resolveThemeTokens } from "./board-theme.ts";

// WCAG contrast between two #rrggbb colours.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("today's default (dark background, default preset) is unchanged", () => {
  const t = resolveThemeTokens({});
  assert.equal(t.accent, "#d8ff72");
  assert.equal(t.surface, "#0b0f14");
  assert.equal(t.text, "#f8fafc");
  const dark = resolveThemeTokens({ backgroundKind: "preset", backgroundValue: "#0a0a0a" }, { appIsLight: true });
  assert.equal(dark.text, "#f8fafc", "a dark board stays dark even inside a light app");
});

test("a white background turns the default theme light: dark text and a readable accent", () => {
  for (const background of [{ backgroundKind: "preset", backgroundValue: "#ffffff" }, { backgroundKind: "color", backgroundValue: "rgb(250, 250, 250)" }] as const) {
    const t = resolveThemeTokens(background);
    assert.equal(t.surface, "#ffffff");
    assert.equal(t.text, "#111827");
    assert.ok(contrast(t.text, "#ffffff") > 12, "text is readable on white");
    assert.ok(contrast(t.accent, "#ffffff") >= 4.5, `accent ${t.accent} is readable on white`);
    assert.notEqual(t.border, "#ffffff", "borders are visible on white");
  }
});

test("no background chosen follows the app theme", () => {
  assert.equal(resolveThemeTokens({}, { appIsLight: true }).text, "#111827");
  assert.equal(resolveThemeTokens({}, { appIsLight: false }).text, "#f8fafc");
});

test("the tenant's primary colour is used as the light accent", () => {
  const accent = hslTripletToHex("209.9 100% 44.7%");
  assert.match(accent, /^#[0-9a-f]{6}$/);
  const t = resolveThemeTokens({ backgroundKind: "preset", backgroundValue: "#ffffff" }, { lightAccent: accent });
  assert.equal(t.accent, accent);
  assert.equal(hslTripletToHex("nonsense"), "#2563eb");
});

test("presets and custom colours chosen by the user are kept as chosen", () => {
  const ocean = resolveThemeTokens({ themePreset: "trello-ocean", backgroundKind: "preset", backgroundValue: "#ffffff" });
  assert.equal(ocean.surface, "#0c2233");
  const custom = resolveThemeTokens({ themeKind: "custom", themeCustom: { surface: "#101010", accent: "#ff00ff" }, backgroundKind: "preset", backgroundValue: "#ffffff" });
  assert.equal(custom.surface, "#101010");
  assert.equal(custom.accent, "#ff00ff");
  const explicitLight = resolveThemeTokens({ themePreset: "killio-light" });
  assert.equal(explicitLight.surface, "#ffffff");
  assert.equal(explicitLight.text, "#111827");
});

test("background tone: colours, gradients, tailwind classes and images", () => {
  assert.equal(backgroundTone({ backgroundKind: "preset", backgroundValue: "#ffffff" }), "light");
  assert.equal(backgroundTone({ backgroundKind: "preset", backgroundValue: "#1e293b" }), "dark");
  assert.equal(backgroundTone({ backgroundKind: "preset", backgroundValue: "bg-white" }), "light");
  assert.equal(backgroundTone({ backgroundKind: "preset", backgroundValue: "bg-slate-900" }), "dark");
  assert.equal(backgroundTone({ backgroundKind: "gradient", backgroundGradient: "linear-gradient(135deg,#ffffff 0%,#e5f2ff 100%)" }), "light");
  assert.equal(backgroundTone({ backgroundKind: "gradient", backgroundGradient: "linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)" }), "dark");
  assert.equal(backgroundTone({ backgroundKind: "image", backgroundImageUrl: "https://x/y.png" }), "dark");
  assert.equal(backgroundTone({}), "app");
  assert.ok(isLightColor("#ffffff") && !isLightColor("#0b0f14"));
});
