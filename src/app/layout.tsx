import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Daily Gist",
  description: "Your newsletters, as a daily podcast",
  metadataBase: new URL("https://www.dailygist.fyi"),
  openGraph: {
    title: "Daily Gist",
    description: "Your newsletters, as a daily podcast",
    siteName: "Daily Gist",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Daily Gist",
    description: "Your newsletters, as a daily podcast",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
