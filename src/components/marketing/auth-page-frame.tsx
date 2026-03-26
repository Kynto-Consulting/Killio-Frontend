"use client";

import Link from "next/link";
import { PublicFooter } from "@/components/marketing/public-footer";
import { useTranslations } from "@/components/providers/i18n-provider";

type AuthMode = "login" | "signup";

type AuthPageFrameProps = {
  mode: AuthMode;
  children: React.ReactNode;
};

export function AuthPageFrame({ mode, children }: AuthPageFrameProps) {
  const tAuth = useTranslations("auth");

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,rgba(216,255,114,0.12),transparent_58%)]" />
        <div className="absolute left-[-5rem] top-20 h-64 w-64 rounded-full bg-[#d8ff72]/10 blur-3xl" />
        <div className="absolute right-[-3rem] top-16 h-72 w-72 rounded-full bg-[#3a4722]/20 blur-3xl" />
      </div>

      <header className="z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <img src="/killio_white.webp" alt="Killio" className="h-7 w-auto" />
            <span className="text-lg font-semibold tracking-tight">Killio</span>
          </Link>

          <Link
            href={mode === "login" ? "/signup" : "/login"}
            className="inline-flex h-9 items-center rounded-full border border-border/70 px-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {mode === "login" ? tAuth("login.goSignup") : tAuth("signup.goLogin")}
          </Link>
        </div>
      </header>

      <main className="z-10 flex flex-1 items-center justify-center px-4 py-10 md:px-6 md:py-14">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
          </div>
          {children}
        </div>
      </main>

      <PublicFooter className="z-10" />
    </div>
  );
}