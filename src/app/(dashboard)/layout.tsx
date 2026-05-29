import { PlatformComponent } from "@/lib/platform";
import { LayoutWeb } from "./layout.web";
import { LayoutMobile } from "./layout.mobile";
import { LocalWorkspaceProvider } from "@/components/providers/local-workspace-provider";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <LocalWorkspaceProvider>
      <PlatformComponent
        web={LayoutWeb}
        mobile={LayoutMobile}
        props={{ children }}
      />
    </LocalWorkspaceProvider>
  );
}
