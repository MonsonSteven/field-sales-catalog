// Summit brand fonts, self-hosted via next/font/local (no runtime calls to Google —
// faster + keeps user IPs off third-party font CDNs, per the security posture).
// Baskervville (serif) = display headings; Poppins (sans) = body + UI.
import localFont from "next/font/local";

export const heading = localFont({
  src: "./fonts/Baskervville-VariableFont_wght.ttf",
  weight: "400 700",
  style: "normal",
  variable: "--font-heading",
  display: "swap",
});

export const body = localFont({
  src: [
    { path: "./fonts/Poppins-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Poppins-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Poppins-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/Poppins-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/Poppins-ExtraBold.ttf", weight: "800", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});
