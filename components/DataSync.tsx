"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

export default function DataSync() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    const flag = `synced:${session.user.id}`;
    if (sessionStorage.getItem(flag)) return;

    fetch("/api/userdata")
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(data)) {
          if (value !== null && value !== undefined) {
            localStorage.setItem(key, JSON.stringify(value));
          }
        }
        sessionStorage.setItem(flag, "1");
        window.location.reload();
      })
      .catch(() => {
        sessionStorage.setItem(flag, "1");
      });
  }, [session?.user?.id, status]);

  return null;
}
