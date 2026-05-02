import { PlatformComponent } from "@/lib/platform";
import { MarketplaceSellerProfileMobilePage } from "./page.mobile";
import { MarketplaceSellerProfilePageView } from "./page.web";

export default async function MarketplaceSellerProfilePage() {
  return PlatformComponent({
    web: MarketplaceSellerProfilePageView,
    mobile: MarketplaceSellerProfileMobilePage,
    props: {},
  });
}
