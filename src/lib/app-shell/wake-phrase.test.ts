import { test } from "node:test";
import assert from "node:assert/strict";
import { wakeCommand } from "./wake-phrase.ts";

test("a phrase that starts by calling Killio is an order", () => {
  assert.equal(wakeCommand("Killio, crea una tarjeta para llamar a Marta"), "crea una tarjeta para llamar a Marta");
  assert.equal(wakeCommand("Oye Killio, ¿qué tengo pendiente hoy?"), "¿qué tengo pendiente hoy?");
  assert.equal(wakeCommand("hey killio summarize my last meeting"), "summarize my last meeting");
  assert.equal(wakeCommand("¡Kilio! abre el tablero de ventas"), "abre el tablero de ventas");
  assert.equal(wakeCommand("  OK, Quilio: resume el documento  "), "resume el documento");
});

test("anything else is just diary", () => {
  for (const phrase of [
    "",
    "Killio",
    "Oye Killio.",
    "Killio gracias",
    "Ayer hablamos de Killio, crea una tarjeta",
    "Me gusta killio porque ordena todo",
    "Killiofobia es una palabra inventada que no existe",
    "kilo y medio de arroz por favor",
  ]) {
    assert.equal(wakeCommand(phrase), null, phrase);
  }
});
