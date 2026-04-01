import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import GoogleAnalytics from "@/components/analytics/GoogleAnalytics";
import GoogleSearchConsole from "@/components/analytics/GoogleSearchConsole";
import {
  GoogleTagManagerScript,
  GoogleTagManagerNoScript,
} from "@/components/analytics/GoogleTagManager";
import { generateHomeMetadata } from "@/lib/seo/metadata";
import { generateOrganizationSchema, generateWebsiteSchema } from "@/lib/seo/structured-data";

export const metadata: Metadata = generateHomeMetadata();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Generate structured data
  const organizationSchema = generateOrganizationSchema();
  const websiteSchema = generateWebsiteSchema();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <link rel="icon" href="/icons/fab.png" />
        {/* Google Tag Manager - Script (loads as early as possible) */}
        <GoogleTagManagerScript />

        <GoogleSearchConsole />
        
        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
      </head>
      <body className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col antialiased">
        {/* Google Tag Manager - NoScript fallback (immediately after <body>) */}
        <GoogleTagManagerNoScript />

        {/* Google Analytics */}
        <GoogleAnalytics />
        
        {/* Skip to main content link for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Skip to main content
        </a>
        
        <ErrorBoundary>
          <Navbar />
          <main id="main-content" className="flex-1" role="main">
            {children}
          </main>
          <Footer />
        </ErrorBoundary>
      </body>
    </html>
  );
}
