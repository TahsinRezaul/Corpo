import { getSaved, getSettings, parseIntervalDays } from "./storage";

export function getBrowserPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

export async function requestBrowserPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export function fireBrowserNotification(title: string, body: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try { new Notification(title, { body }); } catch { /* unsupported */ }
}

// Call once per session on the client. Fires browser notifications for due subscriptions.
export function checkAndNotifySubscriptions() {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem("subNotifChecked")) return;
  sessionStorage.setItem("subNotifChecked", "1");

  const settings = getSettings();
  if (!settings.notif_subscriptionReminders) return;
  if (!settings.notif_browserEnabled) return;
  if (getBrowserPermission() !== "granted") return;

  const today = new Date();
  const seen = new Set<string>();

  getSaved()
    .filter((r) => r.recurring && r.recurringInterval && r.date)
    .forEach((r) => {
      const key = r.vendor.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const days = parseIntervalDays(r.recurringInterval);
      if (!days) return;
      const daysSince = Math.floor((today.getTime() - new Date(r.date).getTime()) / 86_400_000);
      if (daysSince >= days) {
        fireBrowserNotification(
          `${r.vendor} subscription due`,
          `${daysSince} days since last receipt — time to upload.`
        );
      }
    });
}
