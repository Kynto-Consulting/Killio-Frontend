import { PlatformComponent } from "@/lib/platform";
import { LayoutWeb } from "./layout.web";
import { LayoutMobile } from "./layout.mobile";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <PlatformComponent
      web={LayoutWeb}
      mobile={LayoutMobile}
      props={{ children }}
    />
  );
}
