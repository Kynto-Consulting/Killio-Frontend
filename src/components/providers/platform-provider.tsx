"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

const PlatformContext = createContext<"mobile" | "web">("web");

export function PlatformProvider({
  children,
  platform,
}: {
  children: React.ReactNode;
  platform: "mobile" | "web";
}) {
  return (
    <PlatformContext.Provider value={platform}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  return useContext(PlatformContext);
}
