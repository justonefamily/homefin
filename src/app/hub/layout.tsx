import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Just One Family",
  description: "Our family's apps, in one place.",
  applicationName: "Just One Family",
  manifest: "/hub.webmanifest",
  appleWebApp: { capable: true, title: "Just One Family", statusBarStyle: "default" },
  icons: { icon: "/hub-icon.svg", apple: "/hub-icon-192.png" },
};

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex flex-col bg-surface text-ink">{children}</div>;
}
