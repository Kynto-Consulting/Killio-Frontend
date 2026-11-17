"use client";

import { useBrandName, useTenant } from "@/components/providers/tenant-provider";

/** The product name as text: "Killio" on killio.dev, the customer's brand in tenant mode. */
export function BrandName() {
  return <>{useBrandName()}</>;
}

/** The product logo: Killio's on killio.dev, the customer's in tenant mode. */
export function BrandLogo({ className }: { className?: string }) {
  const tenant = useTenant();
  const isTenant = tenant.mode === "tenant";
  const src = isTenant && tenant.brand.logoUrl ? tenant.brand.logoUrl : "/killio_white.webp";
  const alt = isTenant ? tenant.brand.name : "Killio";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
