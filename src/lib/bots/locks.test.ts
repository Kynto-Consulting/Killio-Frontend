import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  authorLines, botLockUi, botPatch, botProfileFacts, lockedErrorKind, normalizeAuthorship, normalizeLock, publishableScripts, scriptLockUi, withCodeLocks,
  type Authorship,
} from "./locks.ts";
import { normalizeBot } from "./model.ts";

const none: Authorship = { originalAuthorName: null, source: null, forkedFrom: null };
const imported: Authorship = { originalAuthorName: "Killio Labs", source: { packId: "p1", packTitle: "Comunidad", packVersion: "2.0.0", publisherName: "Killio Labs" }, forkedFrom: null };
const base = { locked: false, lockSource: null, codeLocked: false, codeLockSource: null, authorship: none, scriptId: "s1" } as const;

test("a bot from scratch is fully editable; pause/delete are never blocked", () => {
  const ui = botLockUi({ ...base });
  assert.deepEqual([ui.canEditSettings, ui.descriptionFixed, ui.canEditCommands, ui.canOpenScript, ui.canBindScript, ui.canDuplicate], [true, false, true, true, true, true]);
  assert.deepEqual([ui.canPause, ui.canDelete], [true, true]);
  assert.deepEqual([ui.canLockBot, ui.canUnlockBot, ui.canLockCode, ui.canUnlockCode], [true, false, true, false]);
});

test("an imported bot without locks: creator and description fixed, code readable and editable", () => {
  const ui = botLockUi({ ...base, authorship: imported });
  assert.equal(ui.descriptionFixed, true);
  assert.equal(ui.canEditSettings, true, "its name can still change");
  assert.equal(ui.canOpenScript, true);
  assert.equal(ui.canEditCommands, true);
});

test("a pack-locked bot: nothing editable, cannot be unlocked, cannot be copied; pause and delete stay", () => {
  const ui = botLockUi({ ...base, authorship: imported, locked: true, lockSource: "pack", codeLocked: true, codeLockSource: "pack" });
  assert.deepEqual([ui.canEditSettings, ui.canEditCommands, ui.canBindScript, ui.canOpenScript, ui.canDuplicate], [false, false, false, false, false]);
  assert.deepEqual([ui.canUnlockBot, ui.canUnlockCode, ui.canLockBot, ui.canLockCode], [false, false, false, false]);
  assert.deepEqual([ui.canPause, ui.canDelete], [true, true]);
});

test("the two locks are independent", () => {
  const botOnly = botLockUi({ ...base, locked: true, lockSource: "owner" });
  assert.deepEqual([botOnly.canEditSettings, botOnly.canOpenScript, botOnly.canUnlockBot, botOnly.canLockCode], [false, true, true, true], "bot locked, code readable");
  const codeOnly = botLockUi({ ...base, codeLocked: true, codeLockSource: "owner" });
  assert.deepEqual([codeOnly.canEditSettings, codeOnly.canEditCommands, codeOnly.canOpenScript, codeOnly.canDuplicate, codeOnly.canUnlockCode], [true, true, false, false, true], "code locked, bot editable");
});

test("a bot without script cannot lock a code; a non-manager sees nothing editable", () => {
  assert.equal(botLockUi({ ...base, scriptId: null }).canLockCode, false);
  const ro = botLockUi({ ...base }, false);
  assert.deepEqual([ro.canEditSettings, ro.canEditCommands, ro.canLockBot, ro.canDuplicate], [false, false, false, false]);
});

test("script lock ui: locked = no open, edit or duplicate; pack lock cannot be unlocked", () => {
  assert.deepEqual(scriptLockUi({}), { codeLocked: false, canOpen: true, canEdit: true, canDuplicate: true, canPause: true, canDelete: true, canLock: true, canUnlock: false });
  const owner = scriptLockUi({ locked: true, lockSource: "owner" });
  assert.deepEqual([owner.canOpen, owner.canEdit, owner.canDuplicate, owner.canLock, owner.canUnlock, owner.canPause, owner.canDelete], [false, false, false, false, true, true, true]);
  assert.equal(scriptLockUi({ locked: true, lockSource: "pack" }).canUnlock, false);
});

test("lock refusals are recognised by their stable code", () => {
  assert.equal(lockedErrorKind(Object.assign(new Error("x"), { code: "SCRIPT_LOCKED" })), "SCRIPT_LOCKED");
  assert.equal(lockedErrorKind({ code: "BOT_LOCKED" }), "BOT_LOCKED");
  assert.equal(lockedErrorKind({ code: "UNLOCK_FORBIDDEN" }), "UNLOCK_FORBIDDEN");
  assert.equal(lockedErrorKind(new Error("boom")), null);
  assert.equal(lockedErrorKind(null), null);
});

test("authorship is normalised from bots (nested) and scripts (flat) and shown read-only", () => {
  const fromBot = normalizeAuthorship({ originalAuthor: { userId: null, name: "Killio Labs" }, source: { packId: "p1", packTitle: "Comunidad", packVersion: "2.0.0", publisherName: "Killio Labs" }, forkedFrom: null });
  assert.deepEqual(fromBot, imported);
  assert.equal(normalizeAuthorship({ originalAuthorName: "Ana" }).originalAuthorName, "Ana");
  assert.deepEqual(normalizeAuthorship(undefined), none);
  assert.deepEqual(authorLines(imported), [
    { kind: "originalAuthor", values: { name: "Killio Labs" } },
    { kind: "importedFrom", values: { pack: "Comunidad", publisher: "Killio Labs", version: "2.0.0" } },
  ]);
  assert.deepEqual(authorLines({ ...none, originalAuthorName: "Ana", forkedFrom: { id: "x", name: "Original" } }).map((l) => l.kind), ["originalAuthor", "forkedFrom"]);
  assert.deepEqual(authorLines(none), []);
  assert.deepEqual(authorLines({ ...imported, source: { ...imported.source!, publisherName: null, packVersion: null } })[1], { kind: "importedFrom", values: { pack: "Comunidad" } });
});

test("normalizeBot carries both locks and the authorship; an older server means unlocked", () => {
  const bot = normalizeBot({ id: "b", name: "Guardián", locked: true, lockSource: "pack", codeLocked: true, codeLockSource: "pack", originalAuthor: { name: "Killio Labs" }, source: { packId: "p1", packTitle: "Comunidad", packVersion: "2", publisherName: "Killio Labs" } })!;
  assert.deepEqual([bot.locked, bot.lockSource, bot.codeLocked, bot.codeLockSource], [true, "pack", true, "pack"]);
  assert.equal(bot.authorship.originalAuthorName, "Killio Labs");
  const old = normalizeBot({ id: "b", name: "Viejo" })!;
  assert.deepEqual([old.locked, old.codeLocked, old.lockSource, old.authorship.source], [false, false, null, null]);
  assert.deepEqual(normalizeLock(true, "weird"), { locked: true, lockSource: "owner" }, "an unknown source is treated as an owner lock (the server decides unlocking)");
});

test("botPatch sends only what changed and may change (a PATCH that merely names a frozen field is refused)", () => {
  const bot = { name: "A", description: "d", avatarUrl: null, allowBotTriggers: false, roleIds: ["r1"] };
  const same = { name: "A", description: "d", avatarUrl: "", allowBotTriggers: false, roleIds: ["r1"] };
  const ui = { canEditSettings: true, descriptionFixed: false };
  assert.deepEqual(botPatch(bot, same, ui), {});
  assert.deepEqual(botPatch(bot, { ...same, name: " B ", description: "" }, ui), { name: "B", description: null });
  // locked: only the roles may travel
  assert.deepEqual(botPatch(bot, { ...same, name: "Hacked", roleIds: ["r1", "r2"] }, { canEditSettings: false, descriptionFixed: true }), { roleIds: ["r1", "r2"] });
  // imported (not locked): the description never travels, the name may
  assert.deepEqual(botPatch(bot, { ...same, name: "B", description: "mine" }, { canEditSettings: true, descriptionFixed: true }), { name: "B" });
});

test("profile card facts: the publisher is the creator, the pack is named, locks are shown, code never", () => {
  const facts = botProfileFacts({
    description: "Moderation", isActive: false, createdByName: "Installer", locked: true, codeLocked: true, originalAuthorName: "Killio Labs",
    origin: { packId: "p1", packTitle: "Comunidad", packVersion: "2.0.0", publisherName: "Killio Labs" },
  });
  assert.deepEqual(facts, { description: "Moderation", isActive: false, creatorName: "Killio Labs", importedFrom: { pack: "Comunidad", publisher: "Killio Labs", version: "2.0.0" }, botLocked: true, codeLocked: true });
  assert.deepEqual(Object.keys(facts).sort(), ["botLocked", "codeLocked", "creatorName", "description", "importedFrom", "isActive"], "nothing but facts");
  const own = botProfileFacts({ description: "  ", isActive: true, createdByName: "Ana" });
  assert.deepEqual([own.description, own.creatorName, own.importedFrom, own.botLocked], [null, "Ana", null, false]);
});

test("publishing: locked scripts are not offered, and only ticked scripts carry lockCode", () => {
  assert.deepEqual(publishableScripts([{ id: "a" }, { id: "b", locked: true }, { id: "c", locked: false }]).map((s) => s.id), ["a", "c"]);
  const selected = [{ key: "script:1", assetType: "script", id: 1 }, { key: "script:2", assetType: "script", id: 2 }, { key: "document:3", assetType: "document", id: 3 }];
  const out = withCodeLocks(selected, ["script:2", "document:3"], (a) => ({ id: a.id }));
  assert.deepEqual(out, [{ id: 1 }, { id: 2, lockCode: true }, { id: 3 }], "a document never carries lockCode");
});

for (const lang of ["es", "en"]) {
  test(`i18n ${lang}: every lock, authorship and profile string exists`, () => {
    const load = (ns: string) => JSON.parse(readFileSync(`src/i18n/locales/${lang}/${ns}.json`, "utf8")) as Record<string, any>;
    const get = (o: unknown, p: string) => p.split(".").reduce<any>((a, k) => (a && typeof a === "object" ? a[k] : undefined), o);
    const missing: string[] = [];
    const bots = load("bots");
    for (const k of [
      "botLocked", "codeLocked", "botLockedHint", "codeLockedHint", "byPublisher", "byWorkspace", "lockBot", "unlockBot", "lockCode", "unlockCode", "lockBotHelp", "lockCodeHelp",
      "confirmLockBot", "confirmLockCode", "toast.botLocked", "toast.botUnlocked", "toast.codeLocked", "toast.codeUnlocked", "toast.duplicated", "duplicate", "duplicateScript",
      "errors.SCRIPT_LOCKED", "errors.BOT_LOCKED", "errors.UNLOCK_FORBIDDEN", "scriptPane.title", "scriptPane.body", "scriptPane.bodyWorkspace", "descriptionFixed",
      "author.title", "author.originalAuthor", "author.importedFrom", "author.importedFromNoPublisher", "author.version", "author.forkedFrom", "author.readOnly",
    ]) if (typeof get(bots, `locks.${k}`) !== "string") missing.push(`bots:locks.${k}`);
    const rooms = load("rooms");
    for (const k of ["importedFrom", "importedFromNoPublisher", "botLocked", "codeLocked", "originalAuthor"]) if (typeof get(rooms, `profile.${k}`) !== "string") missing.push(`rooms:profile.${k}`);
    const market = load("marketplace");
    for (const k of ["lockCodeTitle", "lockCodeHelp", "lockCodeScript", "lockedScriptsNote"]) if (typeof get(market, `profile.${k}`) !== "string") missing.push(`marketplace:profile.${k}`);
    assert.deepEqual(missing, []);
    // "Bot bloqueado" / "Código bloqueado": two different, clearly worded locks
    assert.notEqual(bots.locks.botLocked, bots.locks.codeLocked);
  });
}
