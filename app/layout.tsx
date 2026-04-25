import type { Metadata } from "next";
import "./globals.css";
import ConditionalNavBar from "@/components/ConditionalNavBar";
import ConditionalPadding from "@/components/ConditionalPadding";
import ScrollToTop from "@/components/ScrollToTop";
import BackgroundParser from "@/components/BackgroundParser";
import DataSync from "@/components/DataSync";
import { SessionProvider } from "next-auth/react";
import { BackgroundTasksProvider } from "@/contexts/BackgroundTasksContext";
import NotificationCheck from "@/components/NotificationCheck";

export const metadata: Metadata = {
  title: "CORPO",
  description: "Canadian business tax, simplified",
  icons: { icon: "/favicon.svg" },
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
        <BackgroundTasksProvider>
          <SessionProvider>
            <DataSync />
            <NotificationCheck />
            <ConditionalNavBar />
            <BackgroundParser />
            <ConditionalPadding>{children}</ConditionalPadding>
            <ScrollToTop />
          </SessionProvider>
        </BackgroundTasksProvider>
      </body>
    </html>
  );
}
