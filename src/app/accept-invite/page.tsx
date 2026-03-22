"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { acceptTeamInvite } from "@/lib/api/contracts";
import { useSession } from "@/components/providers/session-provider";

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useSession();

  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [teamName, setTeamName] = useState<string>("");

  const loginHref = useMemo(() => {
    const encodedTarget = `/accept-invite?token=${encodeURIComponent(token)}`;
    return `/login?from=${encodeURIComponent(encodedTarget)}`;
  }, [token]);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("El enlace no contiene token de invitacion.");
      return;
    }

    if (!accessToken) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setMessage("");

    acceptTeamInvite(token, accessToken)
      .then((result) => {
        if (cancelled) return;
        setStatus("success");
        setTeamName(result.teamName);
        setMessage(`Te uniste al workspace ${result.teamName} como ${result.role}.`);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(typeof error?.message === "string" ? error.message : "No se pudo aceptar la invitacion.");
      });

    return () => {
      cancelled = true;
    };
  }, [token, accessToken]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
        <h1 className="text-xl font-semibold tracking-tight">Aceptar invitacion</h1>
        <p className="text-sm text-muted-foreground mt-1">Estamos procesando tu acceso al workspace.</p>

        <div className="mt-6 rounded-lg border border-border/60 bg-background/60 p-4">
          {!accessToken && token ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground">Necesitas iniciar sesion para aceptar esta invitacion.</p>
              <Link
                href={loginHref}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Iniciar sesion
              </Link>
            </div>
          ) : null}

          {status === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Aceptando invitacion...
            </div>
          ) : null}

          {status === "success" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                {message}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push("/")}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Ir al dashboard
                </button>
                <button
                  onClick={() => router.push("/teams")}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-input px-3.5 text-sm font-medium hover:bg-accent/10"
                >
                  Ver equipo
                </button>
              </div>
              {teamName ? <p className="text-xs text-muted-foreground">Workspace: {teamName}</p> : null}
            </div>
          ) : null}

          {status === "error" ? (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <ShieldAlert className="h-4 w-4 mt-0.5" />
              <span>{message}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
