import type { Metadata } from "next";
import type { ReactNode } from "react";

import TopNav from "@/components/TopNav";

import "./globals.css";

export const metadata: Metadata = {
  title: "ADMEDCO & MOBILIX — Production Management System",
  description:
    "Dual-factory production management: metal fabrication at ADMEDCO, wood and upholstery at MOBILIX.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-100 antialiased">
        <TopNav />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <footer className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-4 text-[11px] text-slate-600 sm:px-6 lg:px-8">
          ADMEDCO &amp; MOBILIX — Production Management System · two factories, ten stations, one
          route
        </footer>
      </body>
    </html>
  );
}
