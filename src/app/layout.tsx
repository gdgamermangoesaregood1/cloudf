import type { Metadata } from "next";
import "./globals.css";
import LocalWarningBanner from "@/components/LocalWarningBanner";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "SecTrain — Local Security Training Lab",
  description:
    "A local-only, self-hosted security training lab with sequential IDOR, SQL injection and stored XSS challenges.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentSession();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <LocalWarningBanner />
        <SiteHeader username={current?.user.username ?? null} />
        <main id="main-content">{children}</main>
        <footer className="site-footer">
          SecTrain is a local training lab. It must never be exposed to the
          public internet. See the README for details.
        </footer>
      </body>
    </html>
  );
}
