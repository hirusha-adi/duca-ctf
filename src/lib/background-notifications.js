import { after } from "next/server";
import { createNotificationScheduler } from "./notification-delivery.mjs";

// Keep Redis and feed reads out of the saved mutation's response path.
export const scheduleNotification = createNotificationScheduler(
  after,
  (label, error) => console.error(`${label} notification failed:`, error)
);
