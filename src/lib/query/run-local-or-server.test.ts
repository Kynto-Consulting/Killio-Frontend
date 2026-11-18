import assert from "node:assert/strict";
import test from "node:test";

import type { KqlOutput, KqlTable } from "./kql.ts";
import { canRunLocally, runLocalOrServer } from "./run-local-or-server.ts";

const tables: KqlTable[] = [
  {
    id: "t1",
    title: "Ventas",
    kind: "table",
    columns: ["Estado", "Monto"],
    rows: [
      { id: "t1:1", title: "Pagado", fields: { Estado: "Pagado", Monto: 10 } },
      { id: "t1:2", title: "Pagado", fields: { Estado: "Pagado", Monto: 5 } },
      { id: "t1:3", title: "Pendiente", fields: { Estado: "Pendiente", Monto: 7 } },
    ],
  } as KqlTable,
];

const fake: KqlOutput[] = [{ title: null, result: { columns: [], rows: [], shape: "scalar", matched: 0, total: 0 } }];

test("table-only scripts run locally with the real engine", async () => {
  let calls = 0;
  const out = await runLocalOrServer(
    { script: 'rows of "ventas" group by Estado sum(Monto)', tables, teamId: "team" },
    { runServer: async () => { calls++; return fake; } },
  );
  assert.equal(out.via, "local");
  assert.equal(calls, 0);
  assert.deepEqual(out.outputs[0].result.rows.map((r) => [r.labels[0], r.values[0]]), [["Pagado", 15], ["Pendiente", 7]]);
});

test("cards, named sources and unknown tables go to the server", () => {
  assert.equal(canRunLocally("cards where done group by assignee count", tables), false);
  assert.equal(canRunLocally("documents group by month(created) count", tables), false);
  assert.equal(canRunLocally('rows of "Otra" count', tables), false);
  assert.equal(canRunLocally('rows of "Ventas" count', tables), true);
  assert.equal(canRunLocally('rows of "t1" count', tables), true);
});

test("server results are cached per team and script for 30 s", async () => {
  const cache = new Map();
  let calls = 0;
  let clock = 1000;
  const deps = { cache, now: () => clock, runServer: async () => { calls++; return fake; } };
  const args = { script: "cards group by list count", tables, teamId: "a" };

  assert.equal((await runLocalOrServer(args, deps)).via, "server");
  await runLocalOrServer(args, deps);
  assert.equal(calls, 1);

  await runLocalOrServer({ ...args, teamId: "b" }, deps);
  assert.equal(calls, 2);

  clock += 30_001;
  await runLocalOrServer(args, deps);
  assert.equal(calls, 3);
});

test("a failing server call is not cached and propagates", async () => {
  const cache = new Map();
  let calls = 0;
  const deps = { cache, runServer: async () => { calls++; throw new Error("boom"); } };
  const args = { script: "cards count", tables, teamId: "a" };
  await assert.rejects(runLocalOrServer(args, deps), /boom/);
  await assert.rejects(runLocalOrServer(args, deps), /boom/);
  assert.equal(calls, 2);
});

test("server scripts need a team", async () => {
  await assert.rejects(runLocalOrServer({ script: "cards count", tables, teamId: null }, { runServer: async () => fake }), /team/);
});

test("a syntax error throws before anything runs", async () => {
  await assert.rejects(runLocalOrServer({ script: "cards where (done", tables, teamId: "a" }, { runServer: async () => fake }));
});
