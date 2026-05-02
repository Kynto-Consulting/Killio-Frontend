import { PlatformComponent } from "@/lib/platform";
import { MarketplaceMobilePage } from "./page.mobile";
import { MarketplacePageView } from "./page.web";

export default async function MarketplacePage() {
  return PlatformComponent({
    web: MarketplacePageView,
    mobile: MarketplaceMobilePage,
    props: {},
  });
}
