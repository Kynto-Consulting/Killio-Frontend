"use client";

import { PhoneFrame } from "@/components/vault/phone-frame";
import { useTranslations } from "@/components/providers/i18n-provider";

export function DocumentsMockup() {
  const t = useTranslations("vault");
  return (
    <PhoneFrame title={t("documents.title")} subline={t("documents.mockup.folder")}>
      <div className="doc-mini">
        <div className="doc-mini-title">{t("documents.mockup.docTitle")}</div>
        <div className="doc-mini-h">{t("documents.mockup.h1")}</div>
        <div className="doc-mini-p">{t("documents.mockup.p")}</div>
        <div className="doc-mini-callout">{t("documents.mockup.callout")}</div>
        <div className="doc-mini-table">
          <div className="doc-mini-table-row head">
            <div className="doc-mini-table-cell">{t("documents.mockup.tableHeader")}</div>
          </div>
          <div className="doc-mini-table-row">
            <div className="doc-mini-table-cell">Auth · Ana · doing</div>
          </div>
          <div className="doc-mini-table-row">
            <div className="doc-mini-table-cell">QA · Sam · todo</div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}
