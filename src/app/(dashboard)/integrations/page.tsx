import { PlatformComponent } from "@/lib/platform";
import { IntegrationsMobilePage } from "./page.mobile";
import { IntegrationsWebPage } from "./page.web";

export default async function IntegrationsPage() {
  return PlatformComponent({
    web: IntegrationsWebPage,
    mobile: IntegrationsMobilePage,
    props: {},
  });
}
