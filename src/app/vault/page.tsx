"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  Download,
  FileText,
  Mic,
  Phone,
  Smartphone,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import "@/app/landing.css";

/**
 * Standalone marketing page for Killio Vault.
 *
 * Linked from the landing page's #vault section and from the in-app
 * "What is Vault?" prompt. The download CTA always points at
 * /download/vault which the route handler resolves to the latest finished
 * EAS Android build.
 */
export default function VaultMarketingPage() {
  const t = useTranslations("landing");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("visible");
        }),
      { threshold: 0.1 },
    );
    document.querySelectorAll(".kl-root .fade-up").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const pillars = [
    { icon: <Mic className="h-5 w-5" />, key: "diary" },
    { icon: <BrainCircuit className="h-5 w-5" />, key: "assistant" },
    { icon: <Phone className="h-5 w-5" />, key: "voice" },
    { icon: <Sparkles className="h-5 w-5" />, key: "memory" },
    { icon: <FileText className="h-5 w-5" />, key: "tools" },
    { icon: <Workflow className="h-5 w-5" />, key: "workspaces" },
  ];

  return (
    <div className="kl-root">
      <nav>
        <div className="nav-inner">
          <Link href="/" className="nav-logo">
            <img src="/killio_white.webp" alt="Killio" />
            <span>Killio</span>
          </Link>
          <div className="nav-links">
            <Link href="/#features">{t("kl.nav.features")}</Link>
            <Link href="/#pricing">{t("kl.nav.pricing")}</Link>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ArrowLeft className="h-3 w-3" /> {t("kl.nav.signIn")}
            </Link>
          </div>
          <div className="nav-actions">
            <a href="/download/vault" className="btn-lime" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Download className="h-3 w-3" /> APK
            </a>
          </div>
        </div>
      </nav>

      <section className="hero-section">
        <div className="glow-lime" />
        <div className="grid-bg" />
        <div className="container">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            <Smartphone className="h-3 w-3" /> {t("kl.vaultPage.badge")}
          </div>
          <h1 className="hero-title">
            {t("kl.vaultPage.titlePrefix")} <span className="accent">{t("kl.vaultPage.titleAccent")}</span>
            <br />
            {t("kl.vaultPage.titleSuffix")}
          </h1>
          <p className="hero-sub">{t("kl.vaultPage.sub")}</p>
          <div className="hero-actions">
            <a
              href="/download/vault"
              className="btn-lime-lg"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Download className="h-4 w-4" /> {t("kl.vault.ctaDownload")}
            </a>
            <Link href="/signup" className="btn-outline-lg">
              {t("kl.vaultPage.ctaAccount")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 16 }}>
            {t("kl.vaultPage.platform")}
          </p>
        </div>
      </section>

      <section className="features-section">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">{t("kl.vaultPage.pillarsEyebrow")}</span>
            <h2 className="section-title">{t("kl.vaultPage.pillarsTitle")}</h2>
            <p className="section-sub">{t("kl.vaultPage.pillarsSub")}</p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
              gap: 16,
            }}
          >
            {pillars.map((p) => (
              <div
                key={p.key}
                className="bento-card"
                style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div style={{ color: "var(--lime)", opacity: 0.85 }}>{p.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
                  {t(`kl.vault.bullets.${p.key === "workspaces" ? "tools" : p.key}`).split(" ").slice(0, 4).join(" ") + "…"}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                  {t(`kl.vaultPage.pillars.${p.key}`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="features-section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="bento-card" style={{ padding: 32 }}>
            <div className="bento-card-body">
              <span className="bento-tag lime">
                <Workflow className="h-4 w-4" /> {t("kl.vaultPage.modesTag")}
              </span>
              <h3 className="bento-title">{t("kl.vaultPage.modesTitle")}</h3>
              <p className="bento-desc">{t("kl.vaultPage.modesDesc")}</p>
              <ul
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginTop: 20,
                }}
              >
                {["mode1", "mode2", "mode3", "mode4"].map((k) => (
                  <li
                    key={k}
                    style={{
                      display: "flex",
                      gap: 10,
                      fontSize: 13,
                      color: "var(--muted)",
                      lineHeight: 1.55,
                    }}
                  >
                    <Check className="h-4 w-4" style={{ marginTop: 3, color: "var(--lime)", flexShrink: 0 }} />
                    <span>{t(`kl.vaultPage.modes.${k}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="container">
          <div className="cta-box">
            <div className="cta-glow" />
            <div style={{ position: "relative", zIndex: 1 }}>
              <span className="eyebrow" style={{ display: "block", marginBottom: 16 }}>
                {t("kl.vaultPage.ctaEyebrow")}
              </span>
              <h2 className="cta-title">{t("kl.vaultPage.ctaTitle")}</h2>
              <p className="cta-sub">{t("kl.vaultPage.ctaSub")}</p>
              <div className="hero-actions">
                <a
                  href="/download/vault"
                  className="btn-lime-lg"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <Download className="h-4 w-4" /> {t("kl.vault.ctaDownload")}
                </a>
                <Link href="/#pricing" className="btn-outline-lg">
                  {t("kl.nav.pricing")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-inner">
          <Link href="/" className="footer-logo">
            <img src="/killio_white.webp" alt="Killio" />
            <span>Killio</span>
          </Link>
          <div className="footer-links">
            <Link href="/privacy">{t("kl.footer.privacy")}</Link>
            <Link href="/terms">{t("kl.footer.terms")}</Link>
            <a href="mailto:killio@kynto.studio">{t("kl.footer.contact")}</a>
          </div>
          <div className="footer-copy">{t("kl.footer.copyright")}</div>
        </div>
      </footer>
    </div>
  );
}
