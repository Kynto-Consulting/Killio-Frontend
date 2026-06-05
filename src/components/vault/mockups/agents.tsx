"use client";

import { PhoneFrame } from "@/components/vault/phone-frame";
import { useTranslations } from "@/components/providers/i18n-provider";

export function AgentsMockup() {
  const t = useTranslations("vault");
  return (
    <PhoneFrame title={t("agents.title")} subline="Local · on-device">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="agent-card">
          <div className="agent-card-title">
            <span>{t("agents.mockup.agent1")}</span>
            <span className="agent-card-wake">{t("agents.mockup.agent1Wake")}</span>
          </div>
          <div className="agent-card-desc">{t("agents.mockup.agent1Desc")}</div>
        </div>
        <div className="agent-card active">
          <div className="agent-card-title">
            <span>{t("agents.mockup.agent2")}</span>
            <span className="agent-card-wake">{t("agents.mockup.agent2Wake")}</span>
          </div>
          <div className="agent-card-desc">{t("agents.mockup.agent2Desc")}</div>
        </div>
        <div className="agent-card">
          <div className="agent-card-title">
            <span>{t("agents.mockup.agent3")}</span>
            <span className="agent-card-wake">{t("agents.mockup.agent3Wake")}</span>
          </div>
          <div className="agent-card-desc">{t("agents.mockup.agent3Desc")}</div>
        </div>
      </div>
    </PhoneFrame>
  );
}
