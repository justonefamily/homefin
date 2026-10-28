import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Just One Family",
  description: "Our family's apps, in one place.",
  applicationName: "Just One Family",
  appleWebApp: { capable: true, title: "Just One Family", statusBarStyle: "default" },
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: "#141821", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-surface text-ink">{children}</body>
    </html>
  );
}
