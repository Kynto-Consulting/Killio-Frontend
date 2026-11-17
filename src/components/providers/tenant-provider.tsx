"use client";

import { createContext, useContext } from "react";
import { DEFAULT_TENANT_CONFIG, type PublicTenantConfig } from "@/lib/tenant/types";

const TenantContext = createContext<PublicTenantConfig>(DEFAULT_TENANT_CONFIG);

export function TenantProvider({ value, children }: { value: PublicTenantConfig; children: React.ReactNode }) {
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

/** The deployment's white-label config. Outside the provider it is the public Killio. */
export function useTenant(): PublicTenantConfig {
  return useContext(TenantContext);
}

/** "Killio" on killio.dev, the customer's brand name in tenant mode. */
export function useBrandName(): string {
  const tenant = useTenant();
  return tenant.mode === "tenant" ? tenant.brand.name : "Killio";
}
