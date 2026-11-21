"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { fetchApi } from "@/lib/api/client";
import { useSession } from "@/components/providers/session-provider";

/** Landing page of "Connect with killio.dev": finishes the OAuth flow with the user's own session. */
function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accessToken } = useSession();
  const [message, setMessage] = useState("Conectando con killio.dev…");
  const done = useRef(false);

  useEffect(() => {
    if (!accessToken || done.current) return;
    done.current = true;
    const providerError = searchParams.get("error");
    if (providerError) {
      setMessage(providerError === "access_denied" ? "Cancelaste la conexión." : "killio.dev rechazó la conexión.");
      return;
    }
    fetchApi("/oauth/connect/complete", {
      method: "POST",
      accessToken,
      body: JSON.stringify({ code: searchParams.get("code"), state: searchParams.get("state") }),
    })
      .then(() => router.replace("/marketplace"))
      .catch((e: Error) => setMessage(e.message));
  }, [accessToken, searchParams, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-sm">
      <Loader2 className="h-5 w-5 animate-spin" />
      <p>{message}</p>
    </main>
  );
}

export default function OAuthConnectCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackContent />
    </Suspense>
  );
}
