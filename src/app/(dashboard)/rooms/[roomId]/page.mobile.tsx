"use client";

import dynamic from "next/dynamic";

const RoomDetail = dynamic(() => import("./page.web"));

export default function RoomDetailMobile() {
  return <RoomDetail />;
}
