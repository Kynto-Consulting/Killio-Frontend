"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowRight,
  Check,
  Kanban,
  FileText,
  Orbit,
  Sparkles,
  Slash,
} from "lucide-react";
import { useTranslations } from "@/components/providers/i18n-provider";
import {
  AI_FEATURES,
  KANBAN_COLUMNS,
  LANDING_INTEGRATIONS,
  LANDING_NAV_LINKS,
  LANDING_PLANS,
  LANDING_STATS,
  MESH_NODES,
  MESH_PILLS,
  SCRIPT_STEPS,
  STRIP_ITEMS,
} from "@/components/marketing/landing-data";
import "@/app/landing.css";

type T = (key: string, params?: Record<string, string | number>) => string;

// â”€â”€â”€ Scroll fade hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function useFadeRef() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add("visible"); obs.disconnect(); } },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

// â”€â”€â”€ SVG Icon library â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// `base` is "/" on pages other than the landing, so the section links lead back to it.
export function Nav({ t, base = "" }: { t: T; base?: string }) {
  return (
    <nav>
      <div className="nav-inner">
        <a href="/" className="nav-logo">
          <img src="/killio_white.webp" alt="Killio" />
          <span>Killio</span>
        </a>
        <div className="nav-links">
          {LANDING_NAV_LINKS.map((link) => (
            <a key={link.key} href={link.hash ? `${base}${link.href}` : link.href}>{t(`kl.nav.${link.key}`)}</a>
          ))}
        </div>
        <div className="nav-actions">
          <a href="/login" className="btn-ghost">{t("kl.nav.signIn")}</a>
          <a href="/signup" className="btn-lime">{t("kl.nav.getStarted")}</a>
        </div>
      </div>
    </nav>
  );
}

// â”€â”€â”€ Hero â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Hero({ t }: { t: T }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = setTimeout(() => { el.style.opacity = "1"; el.style.transform = "none"; }, 80);
    return () => clearTimeout(id);
  }, []);
  return (
    <section className="hero-section">
      <div className="glow-lime" />
      <div className="grid-bg" />
      <div className="container" ref={ref} style={{ opacity: 0, transform: "translateY(20px)", transition: "all 0.8s ease" }}>
        <div className="hero-badge">
          <span className="hero-badge-dot" />
          {t("kl.hero.badge")}
        </div>
        <h1 className="hero-title">
          {t("kl.hero.titlePrefix")} <span className="accent">{t("kl.hero.titleAccent")}</span><br />{t("kl.hero.titleSuffix")}
        </h1>
        <p className="hero-sub">
          {t("kl.hero.sub")}</p>
        <div className="hero-actions">
          <a href="/signup" className="btn-lime-lg">{t("kl.hero.ctaPrimary")} <ArrowRight className="h-4 w-4" /></a>
          <a href="#features" className="btn-outline-lg">{t("kl.hero.ctaSecondary")}</a>
        </div>
        <div className="flex items-center justify-center mt-5 text-xs">
          {/* Trust signal — light inline line, no box */}
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2.5} />
            {t("kl.hero.noCard")}
          </span>
        </div>
        <div className="stats-row">
          {LANDING_STATS.map((stat) => (
            <div className="stat-item" key={stat}><div className="stat-val">{t(`kl.hero.stats.${stat}Value`)}</div><div className="stat-label">{t(`kl.hero.stats.${stat}Label`)}</div></div>
          ))}
        </div>
      </div>
    </section>
  );
}

// â”€â”€â”€ Kanban Preview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function KanbanPreview() {
  return (
    <div className="kanban-preview">
      {KANBAN_COLUMNS.map((col) => (
        <div className="kp-col" key={col.name}>
          <div className="kp-col-header"><span>{col.name}</span><span className="kp-count">{col.count}</span></div>
          {col.cards.map((c, i) => (
            <div className="kp-card" key={i}>
              <div className="kp-card-title">{c.title}</div>
              <div className="kp-card-meta">
                <span className={`kp-tag ${c.tc}`}>{c.tag}</span>
                <div className="kp-avatar" style={{ background: c.ac + "22", border: `1px solid ${c.ac}55`, color: c.ac }}>{c.av}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// â”€â”€â”€ Doc Preview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DocPreview() {
  return (
    <div className="doc-preview">
      <div className="doc-topbar">
        <div className="doc-dot" style={{ background: "#ef4444" }} />
        <div className="doc-dot" style={{ background: "#f59e0b" }} />
        <div className="doc-dot" style={{ background: "#10b981" }} />
        <span className="doc-title-bar">Q4 Planning Document</span>
      </div>
      <div className="doc-body">
        <div className="doc-h1" />
        <div style={{ height: 4 }} />
        <div className="doc-p" style={{ width: "90%" }} />
        <div className="doc-p" style={{ width: "72%" }} />
        <div style={{ height: 2 }} />
        <div className="doc-callout">
          <Sparkles className="h-3.5 w-3.5" />
          <div className="doc-callout-text" />
        </div>
        <div className="doc-table">
          {[
            ["50%", "50%", "50%"],
            ["60%", "80%", "40%"],
            ["75%", "55%", "65%"],
          ].map((row, ri) => (
            <div className={`doc-table-row${ri === 0 ? " header" : ""}`} key={ri}>
              {row.map((w, ci) => (
                <div className="doc-cell" key={ci}><div className="doc-cell-inner" style={{ width: w }} /></div>
              ))}
            </div>
          ))}
        </div>
        <div className="doc-slash">
          <Slash className="h-3.5 w-3.5" />
          <span className="doc-slash-text">Type / for commands â€” text, table, graph, checklist, codeâ€¦</span>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Mesh Preview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MeshPreview() {
  const nodes = MESH_NODES;
  const right = (id: string) => { const n = nodes.find((x) => x.id === id)!; return { x: n.x + n.w, y: n.y + n.h / 2 }; };
  const left = (id: string) => { const n = nodes.find((x) => x.id === id)!; return { x: n.x, y: n.y + n.h / 2 }; };
  const nc = nodes.find((n) => n.id === "c")!;
  const ne = nodes.find((n) => n.id === "e")!;
  const conns: [{ x: number; y: number }, { x: number; y: number }][] = [
    [right("a"), left("b")],
    [right("a"), left("c")],
    [right("b"), left("d")],
    [right("c"), left("d")],
    [{ x: nc.x + 65, y: nc.y + 38 }, { x: ne.x + 75, y: ne.y }],
  ];
  return (
    <div style={{ position: "relative", width: "100%", height: "220px", background: "rgba(0,0,0,0.4)", borderRadius: 16, border: "1px solid var(--card-border)", overflow: "hidden" }}>
      <div className="mesh-dots" />
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} preserveAspectRatio="none">
        {conns.map(([from, to], i) => (
          <path key={i}
            d={`M ${from.x} ${from.y} C ${from.x + 30} ${from.y} ${to.x - 30} ${to.y} ${to.x} ${to.y}`}
            fill="none" stroke="rgba(148,163,184,0.3)" strokeWidth="1.5" strokeDasharray="4 3"
          />
        ))}
      </svg>
      {nodes.map((n) => (
        <div key={n.id} className="mesh-node" style={{ left: n.x, top: n.y, width: n.w, height: n.h, background: n.bg, borderColor: n.border, color: n.color }}>
          {n.label}
        </div>
      ))}
    </div>
  );
}

// â”€â”€â”€ Features Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FeaturesSection({ t }: { t: T }) {
  const ref = useFadeRef();
  return (
    <section className="features-section" id="features">
      <div className="container">
        <div className="section-header fade-up" ref={ref}>
          <span className="eyebrow">{t("kl.features.eyebrow")}</span>
          <h2 className="section-title">{t("kl.features.title")}</h2>
          <p className="section-sub">{t("kl.features.sub")}</p>
        </div>
        <div className="bento-grid">
          <div className="bento-card">
            <div className="bento-card-body">
              <span className="bento-tag lime"><Kanban className="h-4 w-4" /> {t("kl.features.kanban.tag")}</span>
              <h3 className="bento-title">{t("kl.features.kanban.title")}</h3>
              <p className="bento-desc">{t("kl.features.kanban.desc")}</p>
            </div>
            <div className="bento-preview"><KanbanPreview /></div>
          </div>
          <div className="bento-card">
            <div className="bento-card-body">
              <span className="bento-tag indigo"><FileText className="h-4 w-4" /> {t("kl.features.docs.tag")}</span>
              <h3 className="bento-title">{t("kl.features.docs.title")}</h3>
              <p className="bento-desc">{t("kl.features.docs.desc")}</p>
            </div>
            <div className="bento-preview"><DocPreview /></div>
          </div>
          <div className="bento-card span-2">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 280 }}>
              <div className="bento-card-body" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span className="bento-tag cyan"><Orbit className="h-4 w-4" /> {t("kl.features.mesh.tag")}</span>
                <h3 className="bento-title">{t("kl.features.mesh.title")}</h3>
                <p className="bento-desc">{t("kl.features.mesh.desc")}</p>
                <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {MESH_PILLS.map((pk) => (
                    <span key={pk} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 999, background: "rgba(34,211,238,0.07)", border: "1px solid rgba(34,211,238,0.2)", color: "#67e8f9" }}>{t(`kl.features.mesh.${pk}`)}</span>
                  ))}
                </div>
              </div>
              <div style={{ padding: "24px 24px 24px 0", display: "flex", alignItems: "center" }}>
                <div style={{ width: "100%" }}><MeshPreview /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// â”€â”€â”€ Script Canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ScriptCanvas({ t }: { t: T }) {
  const paths = [
    { from: { x: 148, y: 62 }, to: { x: 178, y: 166 }, color: "rgba(216,255,114,0.35)" },
    { from: { x: 318, y: 166 }, to: { x: 330, y: 98 }, color: "rgba(251,191,36,0.35)" },
    { from: { x: 318, y: 166 }, to: { x: 330, y: 218 }, color: "rgba(251,191,36,0.35)" },
    { from: { x: 448, y: 98 }, to: { x: 486, y: 158 }, color: "rgba(99,102,241,0.35)" },
    { from: { x: 460, y: 218 }, to: { x: 486, y: 158 }, color: "rgba(34,211,238,0.35)" },
  ];
  return (
    <div className="script-canvas">
      <div className="script-bg" />
      <svg className="sc-svg">
        <defs>
          <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 1l4 2-4 2" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="1" />
          </marker>
        </defs>
        {paths.map((p, i) => (
          <path key={i}
            d={`M ${p.from.x} ${p.from.y} C ${p.from.x + 40} ${p.from.y} ${p.to.x - 40} ${p.to.y} ${p.to.x} ${p.to.y}`}
            fill="none" stroke={p.color} strokeWidth="1.8" strokeDasharray="5 3"
            markerEnd="url(#arr)"
          />
        ))}
      </svg>
      {SCRIPT_STEPS.map((step) => (
        <div className={`sn ${step.cls}`} key={step.cls}><div className="sn-dot" style={{ background: step.dot }} />{step.label}</div>
      ))}
      <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", fontSize: 11, fontWeight: 600, color: "#a5b4fc" }}>
        <Sparkles className="h-3.5 w-3.5" /> {t("kl.ai.scriptBadge")}
      </div>
    </div>
  );
}

// â”€â”€â”€ AI Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AISection({ t }: { t: T }) {
  const ref = useFadeRef();
  return (
    <section className="ai-section" id="ai" style={{ position: "relative" }}>
      <div className="glow-indigo" style={{ left: "-200px", top: "50%", transform: "translateY(-50%)" }} />
      <div className="container">
        <div className="ai-grid fade-up" ref={ref}>
          <div>
            <span className="eyebrow">{t("kl.ai.eyebrow")}</span>
            <h2 className="section-title" style={{ textAlign: "left", marginBottom: 16 }}>{t("kl.ai.title1")}<br />{t("kl.ai.title2")}</h2>
            <p className="section-sub" style={{ textAlign: "left", margin: "0 0 40px" }}>{t("kl.ai.sub")}</p>
            <div className="ai-features-list">
              {AI_FEATURES.map((f) => (
                <div className="ai-feature-item" key={f.key}>
                  <div className={`ai-icon ${f.cls}`}><f.Icon className="h-4 w-4" /></div>
                  <div>
                    <div className="ai-feature-title">{t(`kl.ai.${f.key}.title`)}</div>
                    <div className="ai-feature-desc">{t(`kl.ai.${f.key}.desc`)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <ScriptCanvas t={t} />
        </div>
      </div>
    </section>
  );
}

// â”€â”€â”€ Integrations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function IntegrationsSection({ t }: { t: T }) {
  const ref = useFadeRef();
  return (
    <section className="integrations-section" id="integrations">
      <div className="container">
        <div className="section-header fade-up" ref={ref}>
          <span className="eyebrow">{t("kl.integrations.eyebrow")}</span>
          <h2 className="section-title">{t("kl.integrations.title")}</h2>
          <p className="section-sub">{t("kl.integrations.sub")}</p>
        </div>
        <div className="integrations-grid">
          {LANDING_INTEGRATIONS.map((int) => (
            <div className="int-pill" key={int.key}>
              <div className="int-icon"><int.Icon className="h-4 w-4" /></div>
              <span>{t(`kl.integrations.${int.key}`)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// â”€â”€â”€ Pricing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PricingSection({ t }: { t: T }) {
  const [cycle, setCycle] = useState("monthly");
  const ref = useFadeRef();
  const plans = LANDING_PLANS.map((plan) => ({
    key: plan.key, variant: plan.key, ctaV: plan.key,
    monthly: t(`kl.pricing.${plan.key}.price`),
    yearly: t(plan.paid ? `kl.pricing.${plan.key}.priceYearly` : `kl.pricing.${plan.key}.price`),
    features: plan.features.map((fk) => ({ text: t(`kl.pricing.${plan.key}.${fk}`), chk: plan.accent })),
  }));
  return (
    <section className="pricing-section" id="pricing" style={{ position: "relative" }}>
      <div className="glow-cyan" style={{ right: "-200px", top: "20%" }} />
      <div className="container">
        <div className="section-header fade-up" ref={ref}>
          <span className="eyebrow">{t("kl.pricing.eyebrow")}</span>
          <h2 className="section-title">{t("kl.pricing.title1")}<br />{t("kl.pricing.title2")}</h2>
          <p className="section-sub">{t("kl.pricing.sub")}</p>
        </div>
        <div className="billing-toggle">
          <div className="billing-toggle-inner">
            <button className={`toggle-btn ${cycle === "monthly" ? "active" : "inactive"}`} onClick={() => setCycle("monthly")}>{t("kl.pricing.monthly")}</button>
            <button className={`toggle-btn ${cycle === "yearly" ? "active" : "inactive"}`} onClick={() => setCycle("yearly")}>
              {t("kl.pricing.yearly")} <span className="save-badge">{t("kl.pricing.save")}</span>
            </button>
          </div>
        </div>
        <div className="pricing-grid">
          {plans.map((plan) => (
            <div className={`plan-card ${plan.variant}`} key={plan.key}>
              {plan.variant !== "free" && <div className={`plan-bar ${plan.variant}`} />}
              {plan.key !== "free" && <div className={`plan-badge ${plan.key}`}>{t(`kl.pricing.${plan.key}.badge`)}</div>}
              <div className="plan-name">{t(`kl.pricing.${plan.key}.label`)}</div>
              <div className="plan-headline">{t(`kl.pricing.${plan.key}.headline`)}</div>
              <div className="plan-price-row">
                <div className="plan-price">{cycle === "monthly" ? plan.monthly : plan.yearly}</div>
                <div className="plan-price-sub">{plan.key === "free" ? t("kl.pricing.free.priceSub") : (cycle === "yearly" ? `${t(`kl.pricing.${plan.key}.priceSub`)} Â· ${t("kl.pricing.billedAnnually")}` : t(`kl.pricing.${plan.key}.priceSub`))}</div>
                {plan.key !== "free" && cycle === "yearly" && <div style={{ fontSize: 11, color: "#a5b4fc", fontWeight: 700, marginTop: 4 }}>{t("kl.pricing.vsMonthly", { price: t(`kl.pricing.${plan.key}.price`) })}</div>}
              </div>
              <div className="plan-features">
                <div className="pf-label">{t("kl.pricing.included")}</div>
                {plan.features.map((f, i) => (
                  <div className="pf-item" key={i}>
                    <div className={`pf-check ${f.chk}`}><Check className="h-3 w-3" /></div>
                    <span>{f.text}</span>
                  </div>
                ))}
              </div>
              <div className="plan-cta">
                <button className={`plan-btn ${plan.ctaV}`} onClick={() => window.location.href = "/signup"}>{t(`kl.pricing.${plan.key}.cta`)}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="enterprise-banner">
          <div>
            <div className="ent-title">{t("kl.pricing.enterprise.title")}</div>
            <div className="ent-sub">{t("kl.pricing.enterprise.sub")}</div>
          </div>
          <a href="mailto:sales@killio.app" className="btn-ghost" style={{ whiteSpace: "nowrap" }}>{t("kl.pricing.enterprise.cta")} <ArrowRight className="h-4 w-4" /></a>
        </div>
      </div>
    </section>
  );
}

// â”€â”€â”€ Features Strip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FeaturesStrip({ t }: { t: T }) {
  const ref = useFadeRef();
  return (
    <section className="features-strip">
      <div className="container">
        <div className="section-header fade-up" ref={ref} style={{ marginBottom: 40 }}>
          <span className="eyebrow">{t("kl.strip.eyebrow")}</span>
          <h2 className="section-title">{t("kl.strip.title")}</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
          {STRIP_ITEMS.map((item) => (
            <div key={item.key} className="bento-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ color: "var(--lime)", opacity: 0.85 }}><item.Icon className="h-5 w-5" /></div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{t(`kl.strip.${item.key}.title`)}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{t(`kl.strip.${item.key}.desc`)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// â”€â”€â”€ CTA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CTASection({ t }: { t: T }) {
  const ref = useFadeRef();
  return (
    <section className="cta-section">
      <div className="container">
        <div className="cta-box fade-up" ref={ref}>
          <div className="cta-glow" />
          <div style={{ position: "relative", zIndex: 1 }}>
            <span className="eyebrow" style={{ display: "block", marginBottom: 16 }}>{t("kl.cta.eyebrow")}</span>
            <h2 className="cta-title">{t("kl.cta.title1")}<br />{t("kl.cta.title2")}</h2>
            <p className="cta-sub">{t("kl.cta.sub")}</p>
            <div className="hero-actions">
              <a href="/signup" className="btn-lime-lg">{t("kl.cta.primary")} <ArrowRight className="h-4 w-4" /></a>
              <a href="#pricing" className="btn-outline-lg">{t("kl.cta.secondary")}</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// â”€â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function Footer({ t }: { t: T }) {
  return (
    <footer>
      <div className="footer-inner">
        <a href="/" className="footer-logo">
          <img src="/killio_white.webp" alt="Killio" />
          <span>Killio</span>
        </a>
        <div className="footer-links">
          <a href="/download">{t("kl.footer.download")}</a>
          <a href="/privacy">{t("kl.footer.privacy")}</a>
          <a href="/terms">{t("kl.footer.terms")}</a>
          <a href="/cookies">{t("kl.footer.cookies")}</a>
          <a href="mailto:killio@kynto.studio">{t("kl.footer.contact")}</a>
        </div>
        <div className="footer-copy">{t("kl.footer.copyright")}</div>
      </div>
    </footer>
  );
}

// â”€â”€â”€ KillioLanding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function KillioLanding() {
  const t = useTranslations("landing");
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1 },
    );
    document.querySelectorAll(".kl-root .fade-up").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="kl-root">
      <Nav t={t} />
      <Hero t={t} />
      <FeaturesSection t={t} />
      <AISection t={t} />
      <IntegrationsSection t={t} />
      <PricingSection t={t} />
      <FeaturesStrip t={t} />
      <CTASection t={t} />
      <Footer t={t} />
    </div>
  );
}
