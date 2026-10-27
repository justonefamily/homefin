import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/PWA";

export const metadata: Metadata = {
  title: "HomeFin",
  description: "Bills, budget and debt payoff for your home — every strategy, your data, your storage.",
  manifest: "/manifest.webmanifest",
  applicationName: "HomeFin",
  appleWebApp: { capable: true, title: "HomeFin", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon-512.png", sizes: "512x512", type: "image/png" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#141821", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      </head>
      <body className="min-h-full flex flex-col font-sans"><RegisterSW />{children}</body>
    </html>
  );
}
