"use client";

import { PhoneFrame } from "@/components/vault/phone-frame";
import { useTranslations } from "@/components/providers/i18n-provider";

export function RoomsMockup() {
  const t = useTranslations("vault");
  return (
    <PhoneFrame title={t("rooms.title")} subline={t("rooms.mockup.channelName")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="room-msg">
          <div className="room-avatar" style={{ background: "#6366f1" }}>A</div>
          <div className="room-bubble">
            <div className="room-user">{t("rooms.mockup.user1")}</div>
            <div className="room-text">{t("rooms.mockup.msg1")}</div>
          </div>
        </div>
        <div className="room-msg">
          <div className="room-avatar" style={{ background: "#f59e0b" }}>C</div>
          <div className="room-bubble">
            <div className="room-user">{t("rooms.mockup.user2")}</div>
            <div className="room-text">
              <span className="room-mention">@killio</span> {t("rooms.mockup.msg2")}
            </div>
          </div>
        </div>
        <div className="room-msg">
          <div className="room-avatar" style={{ background: "#d8ff72", color: "#0a1200" }}>K</div>
          <div className="room-bubble">
            <div className="room-user killio">{t("rooms.mockup.killio")}</div>
            <div className="room-text killio">{t("rooms.mockup.killioReply")}</div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}
