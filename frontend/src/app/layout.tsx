import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Framejury",
  description:
    "Local photo culling for event photographers. Every decision comes with its reason.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        <header className="border-b border-line">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="square"
              >
                <path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
              </svg>
              Framejury
            </div>
            <p className="flex items-center gap-2 text-sm text-muted">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-keep"
              />
              Runs on your machine
            </p>
          </div>
        </header>
        <div id="content">{children}</div>
      </body>
    </html>
  );
}
