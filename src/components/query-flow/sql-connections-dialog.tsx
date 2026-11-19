"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Trash2 } from "lucide-react";

import { useTranslations } from "@/components/providers/i18n-provider";
import { createSqlConnection, deleteSqlConnection, listSqlConnections, testSqlConnection, type SqlConnection, type SqlTestResult } from "@/lib/api/sql-connections";
import { ModalShell } from "./dialogs";
import { SmallButton, TextInput } from "./fields";

const EMPTY = { name: "", host: "", port: "5432", database: "", username: "", password: "", vaultKey: "", ssl: true, members: false };

/** Manage the team's read-only SQL connections: list, test, delete and add. The password is only ever typed here and sent once. */
export function SqlConnectionsDialog({ teamId, accessToken, onClose, onChanged }: { teamId: string; accessToken: string; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("query-flow");
  const [items, setItems] = useState<SqlConnection[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, SqlTestResult | "running">>({});
  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  const load = useCallback(() => {
    listSqlConnections(teamId, accessToken).then(setItems).catch((e: Error) => { setItems([]); setError(e.message); });
  }, [teamId, accessToken]);
  useEffect(load, [load]);

  const valid = form.name.trim() && form.host.trim() && form.database.trim() && form.username.trim() && (form.password || form.vaultKey.trim()) && !(form.password && form.vaultKey.trim()) && !form.name.includes("/");

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await createSqlConnection(teamId, accessToken, { name: form.name.trim(), host: form.host.trim(), port: Number(form.port) || 5432, database: form.database.trim(), username: form.username.trim(), ...(form.vaultKey.trim() ? { passwordEnvVar: form.vaultKey.trim() } : { password: form.password }), sslMode: form.ssl ? "require" : "disable", membersCanQuery: form.members });
      setForm(EMPTY);
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const test = async (id: string) => {
    setTests((s) => ({ ...s, [id]: "running" }));
    try {
      const result = await testSqlConnection(teamId, accessToken, id);
      setTests((s) => ({ ...s, [id]: result }));
    } catch (e) {
      setTests((s) => ({ ...s, [id]: { ok: false, error: e instanceof Error ? e.message : String(e) } }));
    }
  };
  const remove = async (id: string) => {
    try {
      await deleteSqlConnection(teamId, accessToken, id);
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ModalShell title={t("sql.title")} wide onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("sql.hint")}</p>
        {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
        {items === null ? <p className="text-xs text-muted-foreground">{t("sources.loading")}</p> : null}
        {items?.length === 0 ? <p className="text-xs text-muted-foreground">{t("sql.none")}</p> : null}
        <ul className="space-y-1.5">
          {(items ?? []).map((c) => {
            const r = tests[c.id];
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
                <Database className="h-4 w-4 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{c.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{c.username}@{c.host}:{c.port}/{c.database}{c.membersCanQuery ? ` · ${t("sql.membersCan")}` : ""}</div>
                  {c.passwordEnvVar ? <div className="truncate text-[11px] text-muted-foreground">{t("sql.vaultKeyUsed", { key: c.passwordEnvVar })}</div> : null}
                  {r && r !== "running" ? <div className={r.ok ? "text-[11px] text-emerald-600" : "text-[11px] text-destructive"}>{r.ok ? t("sql.testOk", { ms: r.latencyMs ?? 0 }) : r.error}</div> : null}
                </div>
                <SmallButton onClick={() => void test(c.id)} disabled={r === "running"}>{r === "running" ? t("sql.testing") : t("sql.test")}</SmallButton>
                <SmallButton onClick={() => void remove(c.id)} aria-label={t("sql.remove")}><Trash2 className="h-3.5 w-3.5" /></SmallButton>
              </li>
            );
          })}
        </ul>

        <fieldset className="space-y-1.5 rounded-md border border-border p-2">
          <legend className="px-1 text-xs font-semibold text-foreground">{t("sql.add")}</legend>
          <div className="grid grid-cols-2 gap-1.5">
            <TextInput value={form.name} placeholder={t("sql.name")} aria-label={t("sql.name")} onChange={(e) => set({ name: e.target.value })} />
            <TextInput value={form.database} placeholder={t("sql.database")} aria-label={t("sql.database")} onChange={(e) => set({ database: e.target.value })} />
            <TextInput value={form.host} placeholder={t("sql.host")} aria-label={t("sql.host")} onChange={(e) => set({ host: e.target.value })} />
            <TextInput value={form.port} inputMode="numeric" placeholder="5432" aria-label={t("sql.port")} onChange={(e) => set({ port: e.target.value.replace(/\D/g, "") })} />
            <TextInput value={form.username} placeholder={t("sql.username")} aria-label={t("sql.username")} autoComplete="off" onChange={(e) => set({ username: e.target.value })} />
            <TextInput type="password" value={form.password} disabled={!!form.vaultKey.trim()} placeholder={t("sql.password")} aria-label={t("sql.password")} autoComplete="new-password" onChange={(e) => set({ password: e.target.value })} />
            <TextInput value={form.vaultKey} disabled={!!form.password} placeholder={t("sql.vaultKey")} aria-label={t("sql.vaultKey")} autoComplete="off" onChange={(e) => set({ vaultKey: e.target.value.toUpperCase() })} />
          </div>
          <p className="text-[11px] text-muted-foreground">{t("sql.vaultKeyHint")}</p>
          <label className="flex items-center gap-2 text-xs text-foreground"><input type="checkbox" checked={form.ssl} onChange={(e) => set({ ssl: e.target.checked })} />{t("sql.ssl")}</label>
          <label className="flex items-center gap-2 text-xs text-foreground"><input type="checkbox" checked={form.members} onChange={(e) => set({ members: e.target.checked })} />{t("sql.membersCanQuery")}</label>
          <p className="text-[11px] text-muted-foreground">{t("sql.secretNote")}</p>
          <SmallButton onClick={() => void add()} disabled={!valid || busy}>{busy ? t("sql.saving") : t("sql.save")}</SmallButton>
        </fieldset>
      </div>
    </ModalShell>
  );
}
