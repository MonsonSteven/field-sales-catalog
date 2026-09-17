"use client";

import { usePathname } from "next/navigation";
import HeaderSearch from "@/components/HeaderSearch";
import PriceToggle from "@/components/PriceToggle";
import { InstallCoach } from "@/components/InstallCoach";
import { SnapshotWarmer } from "@/components/SnapshotWarmer";
import { OfflineDownload } from "@/components/OfflineDownload";
import SignOutButton from "@/components/SignOutButton";
import EstimateBadge from "@/components/EstimateBadge";

/**
 * The catalog's app chrome (header + search + offline controls + sign-out, plus the
 * invisible install/warm helpers). Rendered by the frontend root layout on every
 * page EXCEPT /login — the sign-in screen stands alone with no header, search, or
 * snapshot-warming (which would just 401 before login).
 */
export default function AppChrome() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <>
      <header className="site-header">
        <div className="container">
          <a href="/" className="brand" aria-label="Summit Home Improvement — Summit Catalog">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/summit-logo.svg" alt="Summit Home Improvement" className="brand-logo" />
          </a>
          <div className="header-actions">
            <PriceToggle />
            <HeaderSearch />
            <EstimateBadge />
            <OfflineDownload />
            <SignOutButton />
          </div>
        </div>
      </header>
      <InstallCoach />
      <SnapshotWarmer />
    </>
  );
}
