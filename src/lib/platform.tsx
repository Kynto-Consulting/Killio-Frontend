import React from "react";
import { headers } from "next/headers";

/**
 * Platform loader to allow resolving between Component.mobile and Component.web 
 * directly inside React Server Components dynamically based on Edge/Middleware headers.
 */
export async function getPlatform() {
  const headerStore = await headers();
  const deviceType = headerStore.get("x-device-type");
  return deviceType === "mobile" ? "mobile" : "web";
}

/**
 * Render a platform specific component dynamically.
 */
export async function PlatformComponent<TProps extends Record<string, any>>({
  mobile: MobileComponent,
  web: WebComponent,
  props,
}: {
  mobile: React.ComponentType<TProps>;
  web: React.ComponentType<TProps>;
  props: TProps;
}) {
  const platform = await getPlatform();
  if (platform === "mobile" && MobileComponent) {
    return React.createElement(MobileComponent, props);
  }
  return React.createElement(WebComponent, props);
}
