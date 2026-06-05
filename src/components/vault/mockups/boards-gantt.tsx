"use client";

import { PhoneFrame } from "@/components/vault/phone-frame";
import { useTranslations } from "@/components/providers/i18n-provider";

interface Bar {
  task: string;
  color: "lime" | "indigo" | "cyan" | "amber";
  start: number; // 0..6 day index
  span: number;  // days
}

export function BoardsGanttMockup() {
  const t = useTranslations("vault");
  const bars: Bar[] = [
    { task: t("boardsGantt.mockup.task1"), color: "lime", start: 0, span: 3 },
    { task: t("boardsGantt.mockup.task2"), color: "indigo", start: 1, span: 4 },
    { task: t("boardsGantt.mockup.task3"), color: "cyan", start: 3, span: 2 },
    { task: t("boardsGantt.mockup.task4"), color: "amber", start: 5, span: 2 },
  ];

  return (
    <PhoneFrame title={t("boardsGantt.title")} subline="Sprint Q3">
      <div className="gantt-toggle" aria-hidden="true">
        <button type="button">{t("boardsGantt.mockup.toggleDay")}</button>
        <button type="button" className="active">{t("boardsGantt.mockup.toggleWeek")}</button>
        <button type="button">{t("boardsGantt.mockup.toggleMonth")}</button>
      </div>
      <div className="gantt-grid">
        {bars.map((b, i) => (
          <div key={i} className="gantt-row">
            <div className="gantt-label">{b.task}</div>
            <div className="gantt-track">
              <div
                className={`gantt-bar ${b.color}`}
                style={{
                  left: `${(b.start / 7) * 100}%`,
                  width: `${(b.span / 7) * 100}%`,
                  animationDelay: `${0.1 + i * 0.12}s`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="gantt-days" aria-hidden="true">
        <div />
        <div className="days">
          <span>L</span>
          <span>M</span>
          <span>X</span>
          <span>J</span>
          <span>V</span>
          <span>S</span>
          <span>D</span>
        </div>
      </div>
    </PhoneFrame>
  );
}
