import { PlatformComponent } from "@/lib/platform";
import { MetricsMobilePage } from "./page.mobile";
import { MetricsWebPage } from "./page.web";

export default async function MetricsPage() {
  return PlatformComponent({
    web: MetricsWebPage,
    mobile: MetricsMobilePage,
    props: {},
  });
}