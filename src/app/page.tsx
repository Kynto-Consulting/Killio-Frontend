"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import WorkspacesPage from "./(dashboard)/page";
import { LayoutWeb } from "./(dashboard)/layout.web";
import { LayoutMobile } from "./(dashboard)/layout.mobile";
import LandingPageMobile from "./page.mobile";
import { useSession } from "@/components/providers/session-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import "./landing.css";

// ─── Scroll fade hook ─────────────────────────────────────────────────────────
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

// ─── SVG Icon library ─────────────────────────────────────────────────────────
const Ic = {
  Arrow:    () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>,
  Check:    () => <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5l2.5 2.5L8 3"/></svg>,
  Kanban:   () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="2" width="4" height="10" rx="1"/><rect x="6" y="2" width="4" height="7" rx="1"/><rect x="11" y="2" width="4" height="12" rx="1"/></svg>,
  File:     () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V6L9 1z"/><path d="M9 1v5h5M5 9h6M5 12h4"/></svg>,
  Mesh:     () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="3" cy="8" r="1.5"/><circle cx="13" cy="3" r="1.5"/><circle cx="13" cy="13" r="1.5"/><circle cx="8" cy="8" r="1.5"/><path d="M4.5 8h2M9.5 8l2-3.5M9.5 8l2 3.5"/></svg>,
  Zap:      () => <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 1.5L2 9.5h6l-1.5 6 8-8H8.5l1-6z"/></svg>,
  Brain:    () => <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8.5 14v-4"/><ellipse cx="8.5" cy="7" rx="4" ry="4.5"/><path d="M4.5 7H2a2 2 0 000 4h2.5"/><path d="M12.5 7H15a2 2 0 010 4h-2.5"/></svg>,
  Database: () => <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><ellipse cx="8.5" cy="4.5" rx="5.5" ry="2"/><path d="M3 4.5v4c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2v-4"/><path d="M3 8.5v4c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2v-4"/></svg>,
  GitHub:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.63-5.37-12-12-12z"/></svg>,
  Slack:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z"/></svg>,
  Notion:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"/></svg>,
  Phone:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="5" y="1" width="14" height="22" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg>,
  Webhook:  () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 16.5a3 3 0 100-6 3 3 0 000 6z"/><path d="M6 16.5a3 3 0 100-6 3 3 0 000 6z"/><path d="M15 10.5A6 6 0 009 7.5"/><path d="M9 13.5h6"/></svg>,
  Mail:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>,
  Trello:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect width="24" height="24" rx="4" fill="#0052CC"/><rect x="3.5" y="3.5" width="7" height="14" rx="1.5" fill="white"/><rect x="13.5" y="3.5" width="7" height="9" rx="1.5" fill="white"/></svg>,
  History:  () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 12a9 9 0 109-9H3"/><path d="M3 7v5h5"/><path d="M12 7v5l3 3"/></svg>,
  BarChart: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="6" width="4" height="15"/><rect x="17" y="2" width="4" height="19"/></svg>,
  Shield:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M12 2L3 6v6c0 5.25 3.75 10.15 9 11.25C18.25 22.15 22 17.25 22 12V6L12 2z"/><path d="M9 12l2 2 4-4"/></svg>,
  Monitor:  () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>,
  Globe:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
  Folder:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z"/></svg>,
  Users:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  Sparkle:  () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M7 1v2M7 11v2M1 7h2M11 7h2M3.05 3.05l1.41 1.41M9.54 9.54l1.41 1.41M3.05 10.95l1.41-1.41M9.54 4.46l1.41-1.41"/><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/></svg>,
  SlashCmd: () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 2L5 12"/><path d="M3 7h8"/></svg>,
};

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <nav>
      <div className="nav-inner">
        <a href="/" className="nav-logo">
          <img src="/killio_white.webp" alt="Killio" />
          <span>Killio</span>
        </a>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#ai">AI & Automation</a>
          <a href="#integrations">Integrations</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className="nav-actions">
          <a href="/login" className="btn-ghost">Sign in</a>
          <a href="/signup" className="btn-lime">Get started free</a>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) setTimeout(() => { el.style.opacity = "1"; el.style.transform = "none"; }, 80);
  }, []);
  return (
    <section className="hero-section">
      <div className="glow-lime" />
      <div className="grid-bg" />
      <div className="container" ref={ref} style={{ opacity: 0, transform: "translateY(20px)", transition: "all 0.8s ease" }}>
        <div className="hero-badge">
          <span className="hero-badge-dot" />
          Now in public beta
        </div>
        <h1 className="hero-title">
          Where teams <span className="accent">kill it.</span><br />Every. Single. Day.
        </h1>
        <p className="hero-sub">
          Kanban boards, rich documents, infinite mesh canvases — wired together with AI automation. One workspace. Zero friction.
        </p>
        <div className="hero-actions">
          <a href="/signup" className="btn-lime-lg">Start for free <Ic.Arrow /></a>
          <a href="#features" className="btn-outline-lg">Explore features</a>
        </div>
        <div className="hero-notice">
          <Ic.Sparkle /> No credit card required · Free plan forever
        </div>
        <div className="stats-row">
          <div className="stat-item"><div className="stat-val">2,400+</div><div className="stat-label">Teams onboarded</div></div>
          <div className="stat-item"><div className="stat-val">1.2M</div><div className="stat-label">Actions automated</div></div>
          <div className="stat-item"><div className="stat-val">99.9%</div><div className="stat-label">Uptime SLA</div></div>
        </div>
      </div>
    </section>
  );
}

// ─── Kanban Preview ───────────────────────────────────────────────────────────
function KanbanPreview() {
  const cols = [
    { name: "To Do", count: 3, cards: [
      { title: "Design new onboarding", tag: "design", tc: "blue", av: "A", ac: "#6366f1" },
      { title: "Refactor auth module",  tag: "urgent", tc: "red",  av: "B", ac: "#ef4444" },
    ]},
    { name: "In Progress", count: 2, cards: [
      { title: "Build API rate limiter", tag: "backend", tc: "green", av: "C", ac: "#10b981" },
      { title: "Write release notes",    tag: "docs",    tc: "blue",  av: "A", ac: "#6366f1" },
    ]},
    { name: "Done", count: 2, cards: [
      { title: "Setup CI/CD pipeline", tag: "devops", tc: "green", av: "D", ac: "#f59e0b" },
    ]},
  ];
  return (
    <div className="kanban-preview">
      {cols.map((col) => (
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

// ─── Doc Preview ──────────────────────────────────────────────────────────────
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
          <Ic.Sparkle />
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
          <Ic.SlashCmd />
          <span className="doc-slash-text">Type / for commands — text, table, graph, checklist, code…</span>
        </div>
      </div>
    </div>
  );
}

// ─── Mesh Preview ─────────────────────────────────────────────────────────────
function MeshPreview() {
  const nodes = [
    { id: "a", x: 20,  y: 28,  w: 130, h: 38, label: "Project Kick-off", bg: "rgba(216,255,114,0.1)", border: "rgba(216,255,114,0.4)", color: "#d8ff72" },
    { id: "b", x: 200, y: 10,  w: 130, h: 38, label: "Scope Review",     bg: "rgba(99,102,241,0.1)",  border: "rgba(99,102,241,0.4)",   color: "#a5b4fc" },
    { id: "c", x: 200, y: 90,  w: 130, h: 38, label: "Tech Planning",    bg: "rgba(34,211,238,0.08)", border: "rgba(34,211,238,0.35)",  color: "#67e8f9" },
    { id: "d", x: 380, y: 50,  w: 130, h: 38, label: "Sprint Start",     bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.35)",  color: "#fcd34d" },
    { id: "e", x: 110, y: 160, w: 150, h: 38, label: "Decision Gate",    bg: "rgba(248,113,113,0.08)",border: "rgba(248,113,113,0.3)",  color: "#fca5a5" },
  ];
  const right = (id: string) => { const n = nodes.find((x) => x.id === id)!; return { x: n.x + n.w, y: n.y + n.h / 2 }; };
  const left  = (id: string) => { const n = nodes.find((x) => x.id === id)!; return { x: n.x,       y: n.y + n.h / 2 }; };
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

// ─── Features Section ─────────────────────────────────────────────────────────
function FeaturesSection() {
  const ref = useFadeRef();
  return (
    <section className="features-section" id="features">
      <div className="container">
        <div className="section-header fade-up" ref={ref}>
          <span className="eyebrow">Features</span>
          <h2 className="section-title">Everything your team needs.<br />Nothing you don&apos;t.</h2>
          <p className="section-sub">Three powerful workspaces, one seamless experience. Move between boards, docs, and canvases without missing a beat.</p>
        </div>
        <div className="bento-grid">
          <div className="bento-card">
            <div className="bento-card-body">
              <span className="bento-tag lime"><Ic.Kanban /> Kanban Board</span>
              <h3 className="bento-title">Drag-and-drop project flow</h3>
              <p className="bento-desc">Visual pipelines with cards, tags, assignees, checklists, file attachments, comments, and urgency levels. DnD across columns in real time.</p>
            </div>
            <div className="bento-preview"><KanbanPreview /></div>
          </div>
          <div className="bento-card">
            <div className="bento-card-body">
              <span className="bento-tag indigo"><Ic.File /> Documents</span>
              <h3 className="bento-title">Block-based rich editor</h3>
              <p className="bento-desc">Write with slash commands. Add tables, graphs, checklists, code blocks, callouts, media, forms, and math — all draggable and nestable.</p>
            </div>
            <div className="bento-preview"><DocPreview /></div>
          </div>
          <div className="bento-card span-2">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 280 }}>
              <div className="bento-card-body" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span className="bento-tag cyan"><Ic.Mesh /> Mesh Board</span>
                <h3 className="bento-title">Infinite canvas for visual thinkers</h3>
                <p className="bento-desc">Freeform nodes, connections, shapes, frames, and portals on an infinite whiteboard. Freehand pen tool, AI-assisted context, and collaborative real-time editing.</p>
                <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {["Shapes & frames", "Pen drawing", "Node connections", "Portals", "AI context"].map((f) => (
                    <span key={f} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 999, background: "rgba(34,211,238,0.07)", border: "1px solid rgba(34,211,238,0.2)", color: "#67e8f9" }}>{f}</span>
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

// ─── Script Canvas ────────────────────────────────────────────────────────────
function ScriptCanvas() {
  const paths = [
    { from: { x: 148, y: 62  }, to: { x: 178, y: 166 }, color: "rgba(216,255,114,0.35)" },
    { from: { x: 318, y: 166 }, to: { x: 330, y: 98  }, color: "rgba(251,191,36,0.35)"  },
    { from: { x: 318, y: 166 }, to: { x: 330, y: 218 }, color: "rgba(251,191,36,0.35)"  },
    { from: { x: 448, y: 98  }, to: { x: 486, y: 158 }, color: "rgba(99,102,241,0.35)"  },
    { from: { x: 460, y: 218 }, to: { x: 486, y: 158 }, color: "rgba(34,211,238,0.35)"  },
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
      <div className="sn trigger"><div className="sn-dot" style={{ background: "#d8ff72" }} />Card Created</div>
      <div className="sn condition"><div className="sn-dot" style={{ background: "#fcd34d" }} />Urgency = High?</div>
      <div className="sn action1"><div className="sn-dot" style={{ background: "#a5b4fc" }} />Notify Slack</div>
      <div className="sn action2"><div className="sn-dot" style={{ background: "#67e8f9" }} />Send WhatsApp</div>
      <div className="sn end"><div className="sn-dot" style={{ background: "#fca5a5" }} />Log & Done</div>
      <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", fontSize: 11, fontWeight: 600, color: "#a5b4fc" }}>
        <Ic.Sparkle /> AI Script Generator
      </div>
    </div>
  );
}

// ─── AI Section ───────────────────────────────────────────────────────────────
function AISection() {
  const ref = useFadeRef();
  const features = [
    { icon: <Ic.Zap />,      cls: "lime",   title: "Visual Script Builder", desc: "Build automation workflows with a node-based canvas editor. Connect triggers, conditions, and actions — no code required." },
    { icon: <Ic.Brain />,    cls: "indigo", title: "AI Generation & Chat",  desc: "Ask AI to generate scripts, suggest improvements, summarize cards, or chat directly inside any board or document." },
    { icon: <Ic.Database />, cls: "cyan",   title: "RAG Knowledge Base",    desc: "Killio indexes your workspace into a vector store. AI answers are grounded in your actual data — always accurate, never hallucinated." },
  ];
  return (
    <section className="ai-section" id="ai" style={{ position: "relative" }}>
      <div className="glow-indigo" style={{ left: "-200px", top: "50%", transform: "translateY(-50%)" }} />
      <div className="container">
        <div className="ai-grid fade-up" ref={ref}>
          <div>
            <span className="eyebrow">AI & Automation</span>
            <h2 className="section-title" style={{ textAlign: "left", marginBottom: 16 }}>Your team,<br />amplified by AI.</h2>
            <p className="section-sub" style={{ textAlign: "left", margin: "0 0 40px" }}>Automate the repetitive. Unlock the creative. Killio&apos;s AI layer works across every workspace feature.</p>
            <div className="ai-features-list">
              {features.map((f) => (
                <div className="ai-feature-item" key={f.title}>
                  <div className={`ai-icon ${f.cls}`}>{f.icon}</div>
                  <div>
                    <div className="ai-feature-title">{f.title}</div>
                    <div className="ai-feature-desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <ScriptCanvas />
        </div>
      </div>
    </section>
  );
}

// ─── Integrations ─────────────────────────────────────────────────────────────
function IntegrationsSection() {
  const ref = useFadeRef();
  const integrations = [
    { icon: <Ic.GitHub />,  name: "GitHub"       },
    { icon: <Ic.Notion />,  name: "Notion"       },
    { icon: <Ic.Slack />,   name: "Slack"        },
    { icon: <Ic.Trello />,  name: "Trello"       },
    { icon: <Ic.Phone />,   name: "WhatsApp"     },
    { icon: <Ic.Webhook />, name: "Webhooks"     },
    { icon: <Ic.Mail />,    name: "Email"        },
    { icon: <Ic.Sparkle />, name: "Zapier (soon)"},
  ];
  return (
    <section className="integrations-section" id="integrations">
      <div className="container">
        <div className="section-header fade-up" ref={ref}>
          <span className="eyebrow">Integrations</span>
          <h2 className="section-title">Plays well with<br />your whole stack.</h2>
          <p className="section-sub">Connect Killio to the tools your team already loves. Trigger automations, sync data, and get notified where you work.</p>
        </div>
        <div className="integrations-grid">
          {integrations.map((int) => (
            <div className="int-pill" key={int.name}>
              <div className="int-icon">{int.icon}</div>
              <span>{int.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function PricingSection() {
  const [cycle, setCycle] = useState("monthly");
  const ref = useFadeRef();
  const plans = [
    {
      key: "free", label: "Free", variant: "free",
      headline: "For individuals getting started.",
      monthly: "S/ 0", yearly: "S/ 0", priceSub: "Forever free",
      features: [
        { text: "50 script runs / month",    chk: "lime" },
        { text: "0.20 AI credits / month",   chk: "lime" },
        { text: "7-day activity history",    chk: "lime" },
        { text: "Up to 2 Mesh boards",       chk: "lime" },
        { text: "Unlimited boards & docs",   chk: "lime" },
      ],
      cta: "Get started free", ctaV: "free",
    },
    {
      key: "pro", label: "Pro", variant: "pro",
      headline: "For growing teams that need more power.",
      monthly: "S/ 39", yearly: "S/ 31", priceSub: "per user / month",
      badge: "Most popular", badgeV: "pro",
      features: [
        { text: "500 script runs / month",  chk: "indigo" },
        { text: "2.00 AI credits / month",  chk: "indigo" },
        { text: "30-day activity history",  chk: "indigo" },
        { text: "Up to 10 Mesh boards",     chk: "indigo" },
        { text: "Priority support",         chk: "indigo" },
        { text: "14-day free trial",        chk: "indigo" },
      ],
      cta: "Start Pro trial", ctaV: "pro",
    },
    {
      key: "max", label: "Max", variant: "max",
      headline: "For power users who need unlimited scale.",
      monthly: "S/ 89", yearly: "S/ 71", priceSub: "per user / month",
      badge: "Best value", badgeV: "max",
      features: [
        { text: "Unlimited script runs",          chk: "cyan" },
        { text: "10.00 AI credits / month",       chk: "cyan" },
        { text: "Unlimited activity history",     chk: "cyan" },
        { text: "Unlimited Mesh boards",          chk: "cyan" },
        { text: "SSO & SCIM provisioning",        chk: "cyan" },
        { text: "Audit logs + custom support",    chk: "cyan" },
        { text: "14-day free trial",              chk: "cyan" },
      ],
      cta: "Start Max trial", ctaV: "max",
    },
  ];
  return (
    <section className="pricing-section" id="pricing" style={{ position: "relative" }}>
      <div className="glow-cyan" style={{ right: "-200px", top: "20%" }} />
      <div className="container">
        <div className="section-header fade-up" ref={ref}>
          <span className="eyebrow">Pricing</span>
          <h2 className="section-title">Simple, honest pricing.<br />No surprises.</h2>
          <p className="section-sub">Start free. Scale when you&apos;re ready. All plans include unlimited boards, docs, and team members.</p>
        </div>
        <div className="billing-toggle">
          <div className="billing-toggle-inner">
            <button className={`toggle-btn ${cycle === "monthly" ? "active" : "inactive"}`} onClick={() => setCycle("monthly")}>Monthly</button>
            <button className={`toggle-btn ${cycle === "yearly" ? "active" : "inactive"}`} onClick={() => setCycle("yearly")}>
              Yearly <span className="save-badge">Save 20%</span>
            </button>
          </div>
        </div>
        <div className="pricing-grid">
          {plans.map((plan) => (
            <div className={`plan-card ${plan.variant}`} key={plan.key}>
              {plan.variant !== "free" && <div className={`plan-bar ${plan.variant}`} />}
              {"badge" in plan && plan.badge && <div className={`plan-badge ${"badgeV" in plan ? plan.badgeV : ""}`}>{plan.badge}</div>}
              <div className="plan-name">{plan.label}</div>
              <div className="plan-headline">{plan.headline}</div>
              <div className="plan-price-row">
                <div className="plan-price">{cycle === "monthly" ? plan.monthly : plan.yearly}</div>
                <div className="plan-price-sub">{plan.key === "free" ? plan.priceSub : (cycle === "yearly" ? `${plan.priceSub} · billed annually` : plan.priceSub)}</div>
                {plan.key !== "free" && cycle === "yearly" && <div style={{ fontSize: 11, color: "#a5b4fc", fontWeight: 700, marginTop: 4 }}>vs {plan.monthly}/mo billed monthly</div>}
              </div>
              <div className="plan-features">
                <div className="pf-label">What&apos;s included</div>
                {plan.features.map((f, i) => (
                  <div className="pf-item" key={i}>
                    <div className={`pf-check ${f.chk}`}><Ic.Check /></div>
                    <span>{f.text}</span>
                  </div>
                ))}
              </div>
              <div className="plan-cta">
                <button className={`plan-btn ${plan.ctaV}`} onClick={() => window.location.href = "/signup"}>{plan.cta}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="enterprise-banner">
          <div>
            <div className="ent-title">Need Enterprise?</div>
            <div className="ent-sub">Custom contracts, dedicated infrastructure, SLA guarantees, SSO/SCIM, and a dedicated account manager.</div>
          </div>
          <a href="mailto:sales@killio.com" className="btn-ghost" style={{ whiteSpace: "nowrap" }}>Contact sales <Ic.Arrow /></a>
        </div>
      </div>
    </section>
  );
}

// ─── Features Strip ───────────────────────────────────────────────────────────
function FeaturesStrip() {
  const ref = useFadeRef();
  const items = [
    { icon: <Ic.History />,  title: "Activity History",   desc: "Full audit trail of every action across boards, documents, and automations." },
    { icon: <Ic.BarChart />, title: "Workspace Metrics",  desc: "Track team velocity, script usage, AI credit consumption, and more." },
    { icon: <Ic.Users />,    title: "Team Roles & Invites",desc: "Owner, admin, member, and guest roles. Email invites with delivery tracking." },
    { icon: <Ic.Monitor />,  title: "Mobile Ready",       desc: "Full mobile layout for boards and documents. Work from anywhere." },
    { icon: <Ic.Globe />,    title: "Public Sharing",     desc: "Share any board, document, or mesh canvas publicly with a single link." },
    { icon: <Ic.Folder />,   title: "Folder Organization",desc: "Organize boards and documents into nested folders for clean workspace structure." },
  ];
  return (
    <section className="features-strip">
      <div className="container">
        <div className="section-header fade-up" ref={ref} style={{ marginBottom: 40 }}>
          <span className="eyebrow">Built for teams</span>
          <h2 className="section-title">Every detail, covered.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
          {items.map((item) => (
            <div key={item.title} className="bento-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ color: "var(--lime)", opacity: 0.85 }}>{item.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{item.title}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────
function CTASection() {
  const ref = useFadeRef();
  return (
    <section className="cta-section">
      <div className="container">
        <div className="cta-box fade-up" ref={ref}>
          <div className="cta-glow" />
          <div style={{ position: "relative", zIndex: 1 }}>
            <span className="eyebrow" style={{ display: "block", marginBottom: 16 }}>Get started today</span>
            <h2 className="cta-title">Stop managing chaos.<br />Start shipping results.</h2>
            <p className="cta-sub">Join thousands of teams already using Killio to move faster, think clearer, and build better.</p>
            <div className="hero-actions">
              <a href="/signup" className="btn-lime-lg">Create free account <Ic.Arrow /></a>
              <a href="#pricing" className="btn-outline-lg">View plans</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <a href="/" className="footer-logo">
          <img src="/killio_white.webp" alt="Killio" />
          <span>Killio</span>
        </a>
        <div className="footer-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/cookies">Cookies</a>
          <a href="mailto:killio@kynto.studio">Contact</a>
        </div>
        <div className="footer-copy">© 2026 Killio. Built by Kynto Studio.</div>
      </div>
    </footer>
  );
}

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

  return (
    <div className="kl-root">
      <Nav />
      <Hero />
      <FeaturesSection />
      <AISection />
      <IntegrationsSection />
      <PricingSection />
      <FeaturesStrip />
      <CTASection />
      <Footer />
    </div>
  );
}
