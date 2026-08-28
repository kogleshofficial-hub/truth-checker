import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import StructuredData from "./structured-data";

const SITE_URL = "https://truth-checker-app.vercel.app";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Truth Checker — Evidence Before Certainty",
  description:
    "Investigate claims with web evidence and AI analysis. Compare sources, understand the reasoning, and make better-informed decisions.",
  applicationName: "Truth Checker",
  category: "technology",
  creator: "Koglesh R. Murugan",
  publisher: "Koglesh R. Murugan",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Truth Checker",
    title: "Truth Checker — Evidence Before Certainty",
    description:
      "Investigate claims with web evidence and AI analysis. Compare sources, understand the reasoning, and make better-informed decisions.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Truth Checker — Evidence Before Certainty",
    description:
      "Investigate claims with web evidence and AI analysis. Compare sources, understand the reasoning, and make better-informed decisions.",
  },
  verification: {
    google: "LI6z3Avdq6RsVP2faZ6nlhcbRwvnMIdjJkrSBygvnZM",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <StructuredData />
        {children}
      </body>
    </html>
  );
}
