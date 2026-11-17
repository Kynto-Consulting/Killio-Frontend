"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTenant } from "@/components/providers/tenant-provider";
import { isPathEnabled } from "@/lib/tenant/features";

/** Sends the user home when they open a page of a module this deployment has switched off. */
export function FeatureRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { features } = useTenant();
  const allowed = isPathEnabled(pathname, features);

  useEffect(() => {
    if (!allowed) router.replace("/");
  }, [allowed, router]);

  return allowed ? <>{children}</> : null;
}
