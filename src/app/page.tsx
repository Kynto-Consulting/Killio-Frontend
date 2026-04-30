"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import WorkspacesPage from "./(dashboard)/page";
import { LayoutWeb } from "./(dashboard)/layout.web";
import { LayoutMobile } from "./(dashboard)/layout.mobile";
import LandingPageMobile from "./page.mobile";
import { useSession } from "@/components/providers/session-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { KillioLanding } from "@/components/marketing/killio-landing";
import "./landing.css";

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { accessToken, isLoading: isSessionLoading } = useSession();
  const platform = usePlatform();

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1 },
    );
    document.querySelectorAll(".kl-root .fade-up").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  if (isSessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (accessToken) {
    if (platform === "mobile") {
      return (
        <LayoutMobile>
          <WorkspacesPage />
        </LayoutMobile>
      );
    }

    return (
      <LayoutWeb>
        <WorkspacesPage />
      </LayoutWeb>
    );
  }

  if (platform === "mobile") {
    return <LandingPageMobile />;
  }

  return <KillioLanding />;
}
