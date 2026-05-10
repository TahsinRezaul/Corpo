"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { driveDownload } from "@/lib/drive-sync";

// On first login (or new device), fetch the user's saved data and seed
// localStorage, then reload so all pages read the correct data.
// sessionStorage flag prevents re-seeding on subsequent navigations.
export default function DataSync() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    const flag = `synced:${session.user.id}`;
    if (sessionStorage.getItem(flag)) return;

    const googleToken = session.googleAccessToken;

    async function sync() {
      try {
        let data: Record<string, unknown> | null = null;

        if (googleToken) {
          data = await driveDownload(googleToken);
        } else {
          const res = await fetch("/api/userdata");
          if (res.ok) data = await res.json() as Record<string, unknown>;
        }

        if (data && Object.keys(data).length > 0) {
          for (const [key, value] of Object.entries(data)) {
            if (value !== null && value !== undefined) {
              localStorage.setItem(key, JSON.stringify(value));
            }
          }
          sessionStorage.setItem(flag, "1");
          window.location.reload();
        } else {
          sessionStorage.setItem(flag, "1");
        }
      } catch {
        sessionStorage.setItem(flag, "1");
      }
    }

    sync();
  }, [session?.user?.id, status, session?.googleAccessToken]);

  return null;
}
