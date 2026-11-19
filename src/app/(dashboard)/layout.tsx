import { PlatformComponent } from "@/lib/platform";
import { LayoutWeb } from "./layout.web";
import { LayoutMobile } from "./layout.mobile";
import { FeatureRouteGuard } from "@/components/tenant/feature-route-guard";
import { ModeRouteGuard } from "@/components/onboarding/onboarding-host";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  // LocalWorkspaceProvider is mounted inside the client layouts (layout.web /
  // layout.mobile) so the React context is guaranteed to wrap the switcher +
  // pages on the client (an async server component here can break the context).
  return (
    <FeatureRouteGuard>
      <PlatformComponent
        web={LayoutWeb}
        mobile={LayoutMobile}
        props={{ children: <ModeRouteGuard>{children}</ModeRouteGuard> }}
      />
    </FeatureRouteGuard>
  );
}
