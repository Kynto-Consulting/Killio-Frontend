import assert from "node:assert/strict";
import test from "node:test";

import { LINK_TOOLS } from "./link-tools.ts";

const link = (tool: string, input: Record<string, unknown>) => LINK_TOOLS[tool](input);

test("only web links are opened as-is; other schemes from the model are refused", () => {
  assert.equal(link("open_browser", { url: "https://example.com/a?b=1" }), "https://example.com/a?b=1");
  for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "ms-settings:", "", "https://exa mple.com", undefined]) {
    assert.equal(link("open_browser", { url: bad }), null, String(bad));
    assert.equal(link("open_deeplink", { uri: bad }), null, String(bad));
  }
});

test("phone tools keep only digits", () => {
  assert.equal(link("call_number", { number: "+51 (999) 111-222" }), "tel:+51999111222");
  assert.equal(link("call_number", { number: "abc" }), null);
  assert.equal(link("whatsapp_message", { phone: "+51 999 111 222", text: "hola & chau" }), "https://wa.me/51999111222?text=hola%20%26%20chau");
  assert.equal(link("whatsapp_message", { text: "sin número" }), null);
  assert.equal(link("send_sms", { numbers: ["999 111", "+51 2"], body: "a b" }), "sms:999111,+512?body=a%20b");
  assert.equal(link("send_sms", { numbers: ["999"] }), null);
});

test("search tools encode the query so it cannot add parameters", () => {
  assert.equal(link("youtube_search", { query: "lo-fi & chill" }), "https://www.youtube.com/results?search_query=lo-fi%20%26%20chill");
  assert.equal(link("maps_navigate", { destination: "Av. Larco 123, Lima" }), "https://www.google.com/maps/dir/?api=1&destination=Av.%20Larco%20123%2C%20Lima");
  assert.equal(link("twitter_search", { query: "a&b=c" }), "https://x.com/search?q=a%26b%3Dc");
  assert.equal(link("youtube_search", {}), null);
});

test("profile tools cannot be steered to another site through the username", () => {
  assert.equal(link("instagram_open", { username: "@killio.dev" }), "https://www.instagram.com/killio.dev/");
  assert.equal(link("telegram_open", { username: "evil.com/x?y" }), "https://t.me/evil.comxy");
  assert.equal(link("x_open", { url: "https://evil.example.com/x.com" }), null);
  assert.equal(link("x_open", { url: "https://x.com/killio" }), "https://x.com/killio");
  assert.equal(link("youtube_open", { url: "https://evil.example.com/watch?v=1" }), null);
  assert.equal(link("youtube_open", { videoId: "dQw4w9WgXcQ" }), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

test("spotify accepts its own URIs and falls back to search", () => {
  assert.equal(link("spotify_play", { uri: "spotify:track:4uLU6hMCjMI75M1A2tKUQC" }), "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
  assert.equal(link("spotify_play", { query: "queen" }), "https://open.spotify.com/search/queen");
  assert.equal(link("spotify_open", { uri: "spotify:evil:../../x" }), "https://open.spotify.com/");
});

test("mail compose cannot smuggle extra headers through the address", () => {
  assert.equal(link("gmail_compose", { to: "a@b.com?bcc=x@y.com", subject: "Hola", body: "línea 1" }), "mailto:a@b.combcc=x@y.com?subject=Hola&body=l%C3%ADnea%201");
  assert.equal(link("gmail_compose", {}), "mailto:");
});

test("system settings open only pages on the list", () => {
  assert.equal(link("windows_open_settings", { page: "bluetooth" }), "ms-settings:bluetooth");
  assert.equal(link("windows_open_settings", { page: "ms-settings:evil" }), null);
  assert.equal(link("windows_open_settings", { page: "constructor" }), null);
  assert.equal(link("macos_open_settings", { pane: "sound" }), "x-apple.systempreferences:com.apple.Sound-Settings.extension");
  assert.equal(link("macos_open_settings", { pane: "toString" }), null);
});

test("an Apple shortcut is run by name, with the name and input encoded", () => {
  assert.equal(link("apple_run_shortcut", { name: "Modo foco & más" }), "shortcuts://run-shortcut?name=Modo%20foco%20%26%20m%C3%A1s");
  assert.equal(link("apple_run_shortcut", { name: "Nota", input: "a=b" }), "shortcuts://run-shortcut?name=Nota&input=text&text=a%3Db");
  assert.equal(link("apple_run_shortcut", {}), null);
});
