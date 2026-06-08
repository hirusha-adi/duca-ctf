import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { formatDistanceToNow } from "date-fns";
import { TIMEZONE } from "./constants";

export function formatInAEST(date, fmt = "dd MMM yyyy HH:mm zzz") {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, TIMEZONE, fmt);
}

export function toAEST(date) {
  const d = typeof date === "string" ? new Date(date) : date;
  return toZonedTime(d, TIMEZONE);
}

export function timeAgoInAEST(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function parseDatetimeLocalToUTC(datetimeLocal) {
  if (!datetimeLocal) return null;
  const [datePart, timePart] = datetimeLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(utcGuess);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);

  const zonedAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute")
  );

  const offset = zonedAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offset);
}

export function toDatetimeLocalInAEST(date) {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const formatted = formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd'T'HH:mm");
  return formatted;
}
