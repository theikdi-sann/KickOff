import type { Metadata } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";

import { AdminProvider } from "@/lib/store";

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
  title: "XClub Admin · Matchday operations",
  description: "XClub admin dashboard prototype for fixtures, seating, news and gate validation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${barlow.variable} h-full`}>
      <body className="min-h-full antialiased">
        <AdminProvider>{children}</AdminProvider>
      </body>
    </html>
  );
}
