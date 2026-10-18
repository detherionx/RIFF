import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "RIFF — Find your rhythm",
  description:
    "Your music. Your pace. A guitar teacher that listens. Learn an original E-minor study with private, on-device feedback.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "RIFF",
    statusBarStyle: "black-translucent",
  },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};
export const viewport: Viewport = {
  themeColor: "#161615",
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
