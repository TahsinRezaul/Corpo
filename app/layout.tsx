import type { Metadata } from "next";
import "./globals.css";
import ConditionalNavBar from "@/components/ConditionalNavBar";
import ConditionalPadding from "@/components/ConditionalPadding";
import ScrollToTop from "@/components/ScrollToTop";
import BackgroundParser from "@/components/BackgroundParser";
import { SessionProvider } from "next-auth/react";

export const metadata: Metadata = {
  title: "CORPO",
  description: "Canadian business tax, simplified",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Prevent flash of wrong theme on load */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem("corpo-theme");
            if (t === "light") document.documentElement.setAttribute("data-theme", "light");
          } catch(e) {}
        ` }} />
      </head>
      <body>
        <SessionProvider>
          <ConditionalNavBar />
          <BackgroundParser />
          <ConditionalPadding>{children}</ConditionalPadding>
          <ScrollToTop />
        </SessionProvider>
      </body>
    </html>
  );
}
