import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import { brand, brandCssVariables } from "@kickoff/shared";
import { ClientProviders } from "@/components/providers";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.ADMIN_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "KickOff Admin · Matchday operations",
    template: "%s · KickOff Admin",
  },
  description: "KickOff admin dashboard for fixtures, seating, news and gate validation.",
  applicationName: "KickOff Admin",
  openGraph: {
    type: "website",
    siteName: "KickOff",
    locale: "en_US",
    url: "/",
    title: "KickOff Admin · Matchday operations",
    description: "Fixtures, seating, orders and gate validation in one operations console.",
  },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
    shortcut: "/favicon.ico",
  },
  // The console is staff-only: never index it, and keep it out of caches.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

// Next 16 moved themeColor out of Metadata; it is a viewport field now.
export const viewport: Viewport = {
  themeColor: brand.night,
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${barlow.variable} h-full`}
      style={brandCssVariables as CSSProperties}
    >
      <body className="min-h-full antialiased">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
