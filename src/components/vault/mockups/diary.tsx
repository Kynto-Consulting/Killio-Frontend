"use client";

import { PhoneFrame } from "@/components/vault/phone-frame";
import { useTranslations } from "@/components/providers/i18n-provider";

export function DiaryMockup() {
  const t = useTranslations("vault");
  return (
    <PhoneFrame title={t("diary.title")} subline={t("diary.mockup.date")}>
      <div className="ai-chip">
        <span style={{ width: 6, height: 6, borderRadius: 3, background: "#c7d2fe" }} />
        {t("diary.mockup.summary")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="diary-entry">
          <div className="diary-wave" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
          <span>{t("diary.mockup.entry1")}</span>
        </div>
        <div className="diary-entry">
          <div className="diary-wave" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
          <span>{t("diary.mockup.entry2")}</span>
        </div>
        <div className="diary-entry">
          <div className="diary-wave" aria-hidden="true">
            <span /><span /><span /><span /><span />
          </div>
          <span>{t("diary.mockup.entry3")}</span>
        </div>
      </div>
    </PhoneFrame>
  );
}
