"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { saveNotionCallback, saveTrelloCallback } from "@/lib/api/integrations";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

export default function IntegrationCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, user } = useSession();
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!accessToken || !user) {
      router.replace("/login");
      return;
    }

    // Trello returns token in hash fragment: #token=ABC123
    // Notion/others return code as query param: ?code=ABC
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const trelloToken = hashParams.get("token");

    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError(errorParam);
      return;
    }

    // Determine provider from state (present in both query and hash)
    const stateStr = searchParams.get("state") ?? hashParams.get("state");

    // If Trello flow: token in hash, state in query
    if (trelloToken) {
      if (!stateStr) {
        setError("Missing state parameter.");
        return;
      }
      let stateObj;
      try {
        stateObj = JSON.parse(atob(stateStr));
      } catch {
        setError("Invalid state parameter format.");
        return;
      }
      const { teamId } = stateObj;
      if (!teamId) {
        setError("Incomplete state information.");
        return;
      }
      saveTrelloCallback(teamId, trelloToken, accessToken)
        .then(() => { setSuccess(true); setTimeout(() => router.replace("/integrations"), 1500); })
        .catch((err: any) => setError(err.message || "Failed to finalize Trello integration."));
      return;
    }

    // Notion / other OAuth2 flow: code in query params
    if (!code || !stateStr) {
      setError("Missing code or state parameters from OAuth provider.");
      return;
    }

    let stateObj;
    try {
      const decoded = atob(stateStr);
      stateObj = JSON.parse(decoded);
    } catch {
      setError("Invalid state parameter format.");
      return;
    }

    const { teamId, provider } = stateObj;

    if (!teamId || !provider) {
      setError("Incomplete state information.");
      return;
    }

    const processCallback = async () => {
      try {
        if (provider === "notion") {
          await saveNotionCallback(teamId, code, accessToken);
        } else {
          throw new Error("Unsupported provider callback");
        }
        setSuccess(true);
        setTimeout(() => {
          router.replace("/integrations");
        }, 1500);
      } catch (err: any) {
        setError(err.message || "Failed to finalize integration setup.");
      }
    };

    processCallback();
  }, [accessToken, user, router, searchParams]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-destructive/20 bg-card p-8 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Integration Failed
            </h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <button
            onClick={() => router.replace("/integrations")}
            className="w-full rounded-md bg-secondary px-4 py-3 text-sm font-medium hover:bg-secondary/90 transition-colors"
          >
            Return to Integrations
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
          <h1 className="text-xl font-semibold text-foreground">Integration Connected!</h1>
          <p className="text-sm text-muted-foreground">Redirecting you back...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="space-y-4 text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
        <h1 className="text-lg font-medium text-foreground">Finalizing Authorization...</h1>
        <p className="text-sm text-muted-foreground">Please wait while we connect your account.</p>
      </div>
    </div>
  );
}
