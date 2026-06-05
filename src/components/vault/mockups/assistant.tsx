"use client";

import { PhoneFrame } from "@/components/vault/phone-frame";
import { useTranslations } from "@/components/providers/i18n-provider";

export function AssistantMockup() {
  const t = useTranslations("vault");
  return (
    <PhoneFrame title={t("assistant.title")} subline="killio.dev / workspace">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 12 }}>
        <span className="wake-pill">
          <span className="wake-dot" />
          {t("assistant.mockup.wake")}
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
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em" }}>
          {t("assistant.mockup.status")}
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
        {t("assistant.mockup.transcript")}
      </div>
      <div
        style={{
          background: "rgba(216,255,114,0.08)",
          border: "1px solid rgba(216,255,114,0.25)",
          borderRadius: 12,
          padding: "10px 12px",
          fontSize: 11,
          color: "rgba(216,255,114,0.9)",
          lineHeight: 1.4,
        }}
      >
        {t("assistant.mockup.reply")}
      </div>
    </PhoneFrame>
  );
}
