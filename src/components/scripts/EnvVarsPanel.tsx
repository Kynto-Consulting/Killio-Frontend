"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/components/providers/i18n-provider";
import { EnvVarSummary, listEnvVars, upsertEnvVar, deleteEnvVar } from "@/lib/api/scripts";
import { KeyRound, Plus, Trash2, Eye, EyeOff, Pencil, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface Props {
  teamId: string;
  accessToken: string;
}

interface FormState {
  key: string;
  value: string;
  description: string;
  isSecret: boolean;
}

const EMPTY_FORM: FormState = { key: "", value: "", description: "", isSecret: true };

export function EnvVarsPanel({ teamId, accessToken }: Props) {
  const t = useTranslations("integrations");

  const [vars, setVars] = useState<EnvVarSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showValue, setShowValue] = useState(false);

  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listEnvVars(teamId, accessToken);
      setVars(data);
    } catch {
      setError(t("envVars.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [teamId, accessToken, t]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowValue(false);
    setShowForm(true);
  };

  const openEdit = (v: EnvVarSummary) => {
    setEditingId(v.id);
    setForm({ key: v.key, value: "", description: v.description ?? "", isSecret: v.isSecret });
    setShowValue(false);
    setShowForm(true);
  };

  const cancelForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); };

  const handleSave = async () => {
    if (!form.key.trim() || (!form.value.trim() && !editingId)) return;
    setSaving(true);
    setError(null);
    try {
      await upsertEnvVar(
        { teamId, key: form.key.trim().toUpperCase(), value: form.value, description: form.description || undefined, isSecret: form.isSecret },
        accessToken,
      );
      flash(t("envVars.saveSuccess"));
      cancelForm();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("envVars.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (v: EnvVarSummary) => {
    if (!confirm(t("envVars.deleteConfirm", { key: v.key }))) return;
    setDeletingId(v.id);
    setError(null);
    try {
      await deleteEnvVar(teamId, v.id, accessToken);
      flash(t("envVars.deleteSuccess"));
      await load();
    } catch {
      setError(t("envVars.errorDelete"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 pb-10 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">{t("envVars.title")}</h2>
          </div>
          <p className="text-sm text-slate-400">{t("envVars.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-sm font-semibold text-indigo-300 hover:bg-indigo-500/20 transition"
        >
          <Plus className="h-4 w-4" />
          {t("envVars.add")}
        </button>
      </div>

      {/* Feedback */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm text-red-300">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Inline form */}
      {showForm && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("envVars.keyLabel")}</label>
              <input
                type="text"
                value={form.key}
                onChange={e => setForm(f => ({ ...f, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") }))}
                disabled={!!editingId}
                placeholder="MY_SECRET_KEY"
                className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-400 disabled:opacity-50"
              />
              <span className="text-[10px] text-slate-500">{t("envVars.keyHint")}</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("envVars.valueLabel")}</label>
              <div className="relative">
                <input
                  type={showValue ? "text" : "password"}
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                  placeholder={editingId ? "Leave blank to keep current" : ""}
                  className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 pr-9 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-400"
                />
                <button
                  type="button"
                  onClick={() => setShowValue(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t("envVars.descriptionLabel")}</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-400"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.isSecret}
                onChange={e => setForm(f => ({ ...f, isSecret: e.target.checked }))}
                className="rounded"
              />
              {t("envVars.secretLabel")}
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={cancelForm} className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 transition">
                {t("envVars.cancel")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.key.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("envVars.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : vars.length === 0 && !showForm ? (
        <p className="text-sm text-slate-500 italic">{t("envVars.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {vars.map(v => (
            <div key={v.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <KeyRound className="h-4 w-4 shrink-0 text-indigo-400" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm font-semibold text-white truncate">{v.key}</p>
                {v.description && <p className="text-xs text-slate-400 truncate">{v.description}</p>}
              </div>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${v.hasValue ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                {v.hasValue ? t("envVars.hasValue") : t("envVars.noValue")}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(v)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
                  title={t("envVars.edit")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(v)}
                  disabled={deletingId === v.id}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-400 transition disabled:opacity-40"
                  title={t("envVars.delete")}
                >
                  {deletingId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
