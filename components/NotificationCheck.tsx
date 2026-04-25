"use client";

import { useEffect } from "react";
import { checkAndNotifySubscriptions } from "@/lib/notifications";

export default function NotificationCheck() {
  useEffect(() => {
    checkAndNotifySubscriptions();
  }, []);
  return null;
}
