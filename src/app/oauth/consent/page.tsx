"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { fetchApi } from "@/lib/api/client";
import { useSession } from "@/components/providers/session-provider";

const SCOPE_LABELS: Record<string, string> = {
  openid: "Verificar tu identidad",
  profile: "Ver tu nombre y foto",
  email: "Ver tu correo electrónico",
  offline_access: "Mantener la conexión sin pedirte iniciar sesión de nuevo",
  "marketplace:read": "Ver los packs que compraste",
  "marketplace:purchase": "Comprar packs en tu nombre (siempre con tu confirmación)",
};

type Described = { clientName: string; scopes: string[] };

function ConsentContent() {
  const searchParams = useSearchParams();
  const { accessToken } = useSession();
  const [info, setInfo] = useState<Described | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const params = useMemo(() => Object.fromEntries(searchParams.entries()), [searchParams]);
  const loginHref = `/login?from=${encodeURIComponent(`/oauth/consent?${searchParams.toString()}`)}`;

  useEffect(() => {
    if (!accessToken) return;
    fetchApi<Described>(`/oauth/authorize/describe?${searchParams.toString()}`, { accessToken })
      .then(setInfo)
      .catch((e: Error) => setError(e.message));
  }, [accessToken, searchParams]);

  async function decide(approve: boolean) {
    if (!accessToken) return;
    setBusy(true);
    try {
      const { redirectUrl } = await fetchApi<{ redirectUrl: string }>("/oauth/authorize/decision", {
        method: "POST",
        accessToken,
        body: JSON.stringify({ ...params, approve }),
      });
      window.location.href = redirectUrl;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="h-5 w-5" /> Autorizar acceso
      </div>
      {!accessToken ? (
        <a className="rounded-md bg-accent px-4 py-2 text-center text-sm text-white" href={loginHref}>
          Inicia sesión para continuar
        </a>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : !info ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <>
          <p className="text-sm">
            <strong>{info.clientName}</strong> quiere acceder a tu cuenta de Killio para:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {info.scopes.map((s) => (
              <li key={s}>{SCOPE_LABELS[s] ?? s}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => decide(true)} className="flex-1 rounded-md bg-accent px-4 py-2 text-sm text-white disabled:opacity-60">
              Permitir
            </button>
            <button disabled={busy} onClick={() => decide(false)} className="flex-1 rounded-md border border-border px-4 py-2 text-sm disabled:opacity-60">
              Cancelar
            </button>
          </div>
        </>
      )}
    </main>
  );
}

export default function OAuthConsentPage() {
  return (
    <Suspense fallback={null}>
      <ConsentContent />
    </Suspense>
  );
}
