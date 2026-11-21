"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import {
  PASSWORD_CHANGE_REQUIRED_EVENT,
  decidePasswordChangeRedirect,
  isMustChangePassword,
} from "@/lib/auth/password-change";

/**
 * Pins users whose account carries a temporary password to the "choose your
 * password" page. Mounted once in the root layout, so it covers the dashboard
 * and every other route. It also reacts to any API call answered with
 * 403 PASSWORD_CHANGE_REQUIRED (event dispatched by the API clients).
 * Renders nothing.
 */
export function PasswordChangeGuard() {
  const { user, accessToken, isLoading, updateUser } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const mustChange = isMustChangePassword(user);

  // Session state is the single source of truth: the event only flips the flag,
  // the effect below does the (single) redirect, and it is idempotent because
  // it returns null once the user is on the page.
  useEffect(() => {
    const onRequired = () => updateUser({ mustChangePassword: true });
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, onRequired);
  }, [updateUser]);

  useEffect(() => {
    const target = decidePasswordChangeRedirect({
      pathname,
      sessionReady: !isLoading,
      isAuthenticated: Boolean(user && accessToken),
      mustChangePassword: mustChange,
    });
    // The page itself handles the "not flagged" case (it needs to show the
    // success state before leaving), so the guard only enforces the pin.
    if (target && mustChange) router.replace(target);
  }, [pathname, isLoading, user, accessToken, mustChange, router]);

  return null;
}
