import type { Metadata, Viewport } from "next";
import "./globals.css";
import { heading, body } from "./fonts";
import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "Summit Catalog",
  description: "Summit Home Improvement — product catalog",
  applicationName: "Summit Catalog",
  manifest: "/manifest.webmanifest",
  // iOS Safari doesn't read the manifest for standalone/icon behavior — it needs
  // these apple-* tags. Enables Add-to-Home-Screen launching full-screen on iPads.
  appleWebApp: {
    capable: true,
    title: "Summit Catalog",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/summit-logo.svg",
    apple: "/summit-logo.svg",
  },
  // Next emits the modern `mobile-web-app-capable`; add the legacy Apple tag too
  // so older iPadOS Safari versions also launch full-screen when installed.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#14532d", // Summit blue
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>
        {/* No-flash price visibility: set the <html> attribute BEFORE first paint so hidden prices
            never flash on screen (or into a printed estimate). Mirrors the theme-flash pattern.
            See lib/price-visibility.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('summit-hide-price')==='1')document.documentElement.setAttribute('data-hide-price','1')}catch(e){}",
          }}
        />
        <AppChrome />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
