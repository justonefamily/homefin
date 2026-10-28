import { createElement } from "react";
import { Baby, BookOpen, CalendarDays, Camera, Car, Church, Dumbbell, Film, Gamepad2, Gift, GraduationCap, Heart, House, Leaf, ListChecks, Map, Music, PawPrint, PiggyBank, Plane, Receipt, Shield, ShoppingCart, Sparkles, Star, Sun, Users, UtensilsCrossed, Wallet, Wrench, type LucideIcon } from "lucide-react";

/** The icons an app can wear on the store — drawn as SVG, in the app's color. Stored by name in hub_apps.icon. */
export const HUB_ICONS: Record<string, LucideIcon> = {
  house: House, wallet: Wallet, "piggy-bank": PiggyBank, receipt: Receipt, "calendar-days": CalendarDays, "list-checks": ListChecks,
  "utensils-crossed": UtensilsCrossed, "shopping-cart": ShoppingCart, heart: Heart, users: Users, baby: Baby, "paw-print": PawPrint,
  "book-open": BookOpen, "graduation-cap": GraduationCap, church: Church, camera: Camera, film: Film, music: Music, "gamepad-2": Gamepad2,
  dumbbell: Dumbbell, plane: Plane, map: Map, car: Car, wrench: Wrench, gift: Gift, leaf: Leaf, sun: Sun, shield: Shield, star: Star, sparkles: Sparkles,
};
export const hubIcon = (name: string): LucideIcon => HUB_ICONS[name] ?? Sparkles;

/** Render an icon by name (a component, so the lookup isn't "creating a component during render"). */
export function HubIcon({ name, ...props }: { name: string } & React.ComponentProps<LucideIcon>) {
  return createElement(hubIcon(name), props);
}
