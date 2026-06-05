"use client";

import { PhoneFrame } from "@/components/vault/phone-frame";
import { useTranslations } from "@/components/providers/i18n-provider";

export function BoardsKanbanMockup() {
  const t = useTranslations("vault");
  return (
    <PhoneFrame title={t("boardsKanban.title")} subline="Sprint Q3">
      <div className="kanban-chips">
        <span className="kanban-chip">{t("boardsKanban.mockup.listTodo")}</span>
        <span className="kanban-chip active">{t("boardsKanban.mockup.listDoing")}</span>
        <span className="kanban-chip">{t("boardsKanban.mockup.listDone")}</span>
      </div>
      <div className="kanban-cards">
        <div className="kanban-card">
          <div className="kanban-card-title">{t("boardsKanban.mockup.card1")}</div>
          <div className="kanban-meta">
            <div className="kanban-tags">
              <span className="kanban-tag blue">{t("boardsKanban.mockup.tagDesign")}</span>
            </div>
            <div className="kanban-right">
              <span className="kanban-prio med" />
              <span className="kanban-avatar" style={{ background: "#6366f1" }}>A</span>
            </div>
          </div>
        </div>
        <div className="kanban-card">
          <div className="kanban-card-title">{t("boardsKanban.mockup.card2")}</div>
          <div className="kanban-meta">
            <div className="kanban-tags">
              <span className="kanban-tag red">{t("boardsKanban.mockup.tagUrgent")}</span>
            </div>
            <div className="kanban-right">
              <span className="kanban-prio high" />
              <span className="kanban-avatar" style={{ background: "#ef4444" }}>C</span>
            </div>
          </div>
        </div>
        <div className="kanban-card">
          <div className="kanban-card-title">{t("boardsKanban.mockup.card3")}</div>
          <div className="kanban-meta">
            <div className="kanban-tags">
              <span className="kanban-tag amber">{t("boardsKanban.mockup.tagBug")}</span>
            </div>
            <div className="kanban-right">
              <span className="kanban-prio low" />
              <span className="kanban-avatar" style={{ background: "#10b981" }}>S</span>
            </div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}
