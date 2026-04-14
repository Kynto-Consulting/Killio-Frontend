import { PlatformComponent } from "@/lib/platform";
import { StatisticsMobilePage } from "./page.mobile";
import { StatisticsWebPage } from "./page.web";

export default async function StatisticsPage() {
  return PlatformComponent({
    web: StatisticsWebPage,
    mobile: StatisticsMobilePage,
    props: {},
  });
}
