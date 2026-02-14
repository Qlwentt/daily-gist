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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var h=location.hash;if(h&&(h.indexOf("access_token")!==-1||h.indexOf("error=")!==-1)){var s=document.createElement("style");s.id="__auth_hide";s.textContent="body{visibility:hidden}";document.head.appendChild(s)}})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
