import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Footer } from "@/components/Footer";
import { LogoMark } from "@/components/LogoMark";
import { MotionSwitch } from "@/components/MotionSwitch";
import { MOTION_BOOT_SCRIPT } from "@/lib/motion";
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
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#content" className="skip-link">
          Skip to content
        </a>
        <header className="border-b border-line print:hidden">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-2 text-base font-semibold tracking-tight">
              <LogoMark />
              Framejury
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <p className="hidden items-center gap-2 text-sm text-muted sm:flex">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-keep"
                />
                Runs on your machine
              </p>
              <MotionSwitch />
            </div>
          </div>
        </header>
        <div id="content" className="flex-1">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
