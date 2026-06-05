"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Download,
  FileText,
  Layers,
  Lock,
  Mic,
  Phone,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { SiGithub } from "react-icons/si";
import { useTranslations } from "@/components/providers/i18n-provider";
import { PhoneFrame } from "@/components/vault/phone-frame";
import { AssistantMockup } from "@/components/vault/mockups/assistant";
import { DiaryMockup } from "@/components/vault/mockups/diary";
import { DocumentsMockup } from "@/components/vault/mockups/documents";
import { BoardsKanbanMockup } from "@/components/vault/mockups/boards-kanban";
import { BoardsGanttMockup } from "@/components/vault/mockups/boards-gantt";
import { RoomsMockup } from "@/components/vault/mockups/rooms";
import { AgentsMockup } from "@/components/vault/mockups/agents";
import "@/app/landing.css";
import "@/app/vault/vault.css";

/**
 * Public, unauthenticated Killio Vault showcase.
 *
 * Renders a marketing tour of the Android Vault app with seven phone-frame
 * mockups (one per main screen), a how-it-works strip, a privacy block and
 * a final APK CTA. Scoped under .kl-root + .kl-vault so it inherits the
 * landing aesthetic but doesn't bleed into other routes.
 */
export function VaultMarketingPage() {
  const t = useTranslations("vault");

  const features = [
    { key: "assistant" as const, Icon: Mic },
    { key: "diary" as const, Icon: Radio },
    { key: "workspace" as const, Icon: Layers },
    { key: "agents" as const, Icon: BrainCircuit },
    { key: "wakeword" as const, Icon: Sparkles },
    { key: "clientTools" as const, Icon: Phone },
  ];

  const mockupSections = [
    { key: "assistant", node: <AssistantMockup /> },
    { key: "diary", node: <DiaryMockup />, reverse: true },
    { key: "documents", node: <DocumentsMockup /> },
    { key: "boardsKanban", node: <BoardsKanbanMockup />, reverse: true },
    { key: "boardsGantt", node: <BoardsGanttMockup /> },
    { key: "rooms", node: <RoomsMockup />, reverse: true },
    { key: "agents", node: <AgentsMockup /> },
  ];

  const bulletKeys = ["one", "two", "three"] as const;

  return (
    <div className="kl-root kl-vault">
      {/* NAV */}
      <nav>
        <div className="nav-inner">
          <Link href="/" className="nav-logo">
            <img src="/killio_white.webp" alt="Killio" />
            <span>Killio Vault</span>
          </Link>
          <div className="nav-links">
            <a href="#features">{t("nav.features")}</a>
            <a href="#screens">{t("nav.screens")}</a>
            <a href="#privacy">{t("nav.privacy")}</a>
            <Link
              href="/"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <ArrowLeft className="h-3 w-3" /> {t("nav.backToHome")}
            </Link>
          </div>
          <div className="nav-actions">
            <a
              href="/download/vault"
              className="btn-lime"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Download className="h-3 w-3" /> {t("nav.download")}
            </a>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero-section">
        <div className="glow-lime" />
        <div className="grid-bg" />
        <div className="container">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            <Smartphone className="h-3 w-3" /> {t("hero.badge")}
          </div>
          <h1 className="hero-title">
            {t("hero.titlePrefix")}{" "}
            <span className="accent">{t("hero.titleAccent")}</span>
            <br />
            {t("hero.titleSuffix")}
          </h1>
          <p className="hero-sub">{t("hero.sub")}</p>
          <div className="hero-actions">
            <a
              href="/download/vault"
              className="btn-lime-lg"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Download className="h-4 w-4" /> {t("hero.ctaDownload")}
            </a>
            <a
              href="https://killio.dev"
              className="btn-outline-lg"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {t("hero.ctaWeb")} <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 16 }}>
            {t("hero.platformNote")}
          </p>

          {/* Hero phone */}
          <div className="hero-phone-wrap">
            <PhoneFrame title={t("assistant.title")} subline="killio.dev / workspace">
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                  marginTop: 12,
                }}
              >
                <span className="wake-pill">
                  <span className="wake-dot" />
                  {t("hero.phoneWake")}
                </span>
                <div className="voice-bars" aria-hidden="true">
                  <div className="voice-bar" />
                  <div className="voice-bar" />
                  <div className="voice-bar" />
                  <div className="voice-bar" />
                  <div className="voice-bar" />
                  <div className="voice-bar" />
                  <div className="voice-bar" />
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.5)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {t("hero.phoneListening")}
                </div>
              </div>
              <div
                style={{
                  marginTop: "auto",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.85)",
                  lineHeight: 1.4,
                }}
              >
                {t("hero.phoneTranscript")}
              </div>
            </PhoneFrame>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features-section" id="features">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">{t("features.eyebrow")}</span>
            <h2 className="section-title">{t("features.title")}</h2>
            <p className="section-sub">{t("features.sub")}</p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
              gap: 16,
            }}
          >
            {features.map(({ key, Icon }) => (
              <div
                key={key}
                className="bento-card"
                style={{
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: "rgba(216,255,114,0.12)",
                    border: "1px solid rgba(216,255,114,0.3)",
                    color: "#d8ff72",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                  {t(`features.items.${key}.title`)}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--muted)",
                    lineHeight: 1.6,
                  }}
                >
                  {t(`features.items.${key}.desc`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SCREENS */}
      <section className="features-section" id="screens" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">{t("screens.eyebrow")}</span>
            <h2 className="section-title">{t("screens.title")}</h2>
            <p className="section-sub">{t("screens.sub")}</p>
          </div>
          {mockupSections.map(({ key, node, reverse }) => (
            <div
              key={key}
              className={`mockup-section${reverse ? " reverse" : ""}`}
            >
              <div className="mockup-phone">{node}</div>
              <div className="mockup-content">
                <span className="mockup-eyebrow">{t(`${key}.title`)}</span>
                <h3 className="mockup-title">{t(`${key}.title`)}</h3>
                <p className="mockup-desc">{t(`${key}.desc`)}</p>
                <ul className="mockup-bullets">
                  {bulletKeys.map((b) => (
                    <li key={b} className="mockup-bullet">
                      <span className="mockup-bullet-dot" />
                      <span>{t(`${key}.bullets.${b}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="features-section" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="section-header">
            <span className="eyebrow">{t("how.eyebrow")}</span>
            <h2 className="section-title">{t("how.title")}</h2>
          </div>
          <div className="how-grid">
            {(["one", "two", "three"] as const).map((s, i) => (
              <div key={s} className="how-card">
                <div className="how-step-num">{i + 1}</div>
                <div className="how-card-title">{t(`how.steps.${s}.title`)}</div>
                <div className="how-card-desc">{t(`how.steps.${s}.desc`)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRIVACY */}
      <section className="features-section" id="privacy" style={{ paddingTop: 40 }}>
        <div className="container">
          <div className="privacy-block">
            <div>
              <span className="eyebrow" style={{ display: "block", marginBottom: 12 }}>
                <ShieldCheck className="inline h-3 w-3" style={{ marginRight: 4 }} />
                {t("privacy.eyebrow")}
              </span>
              <h2
                className="section-title"
                style={{ fontSize: "clamp(28px,3vw,40px)", textAlign: "left" }}
              >
                {t("privacy.title")}
              </h2>
              <p
                className="section-sub"
                style={{ textAlign: "left", margin: "12px 0 0" }}
              >
                {t("privacy.desc")}
              </p>
            </div>
            <ul className="privacy-bullets">
              {(["one", "two", "three"] as const).map((b) => (
                <li key={b} className="privacy-bullet">
                  <Lock
                    className="h-4 w-4"
                    style={{
                      marginTop: 3,
                      color: "#d8ff72",
                      flexShrink: 0,
                    }}
                  />
                  <span>{t(`privacy.bullets.${b}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="container">
          <div className="cta-box">
            <div className="cta-glow" />
            <div style={{ position: "relative", zIndex: 1 }}>
              <span
                className="eyebrow"
                style={{ display: "block", marginBottom: 16 }}
              >
                {t("cta.eyebrow")}
              </span>
              <h2 className="cta-title">{t("cta.title")}</h2>
              <p className="cta-sub">{t("cta.sub")}</p>
              <div className="hero-actions">
                <a
                  href="/download/vault"
                  className="btn-lime-lg"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Download className="h-4 w-4" /> {t("cta.primary")}
                </a>
                <a
                  href="https://github.com/kynto/killio"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-outline-lg"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <SiGithub className="h-4 w-4" /> {t("cta.secondary")}
                </a>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  marginTop: 16,
                }}
              >
                {t("cta.platform")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-inner">
          <Link href="/" className="footer-logo">
            <img src="/killio_white.webp" alt="Killio" />
            <span>Killio</span>
          </Link>
          <div className="footer-links">
            <Link href="/privacy">
              <FileText className="inline h-3 w-3" style={{ marginRight: 4 }} />
              Privacy
            </Link>
            <Link href="/terms">Terms</Link>
            <a href="mailto:killio@kynto.studio">Contact</a>
          </div>
          <div className="footer-copy">Killio by Kynto</div>
        </div>
      </footer>
    </div>
  );
}
