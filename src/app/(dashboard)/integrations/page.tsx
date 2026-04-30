import { PlatformComponent } from "@/lib/platform";
import { IntegrationsMobilePage } from "./page.mobile.tsx";
import { IntegrationsPageView } from "./page.web.tsx";

export default async function IntegrationsPage() {
  return PlatformComponent({
    web: IntegrationsPageView,
    mobile: IntegrationsMobilePage,
    props: {},
  });
}
