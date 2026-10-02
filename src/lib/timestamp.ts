/**
 * WIB (UTC+7) Timestamp Helper — Registration Insert Only
 *
 * This utility is strictly for generating created_at timestamps
 * in colorfun_registrations and festival_registrations insert payloads.
 *
 * DO NOT use this for promo schedules, phase configs, admin display,
 * or any other timestamp logic in the application.
 */

/**
 * Returns an ISO-8601 timestamp string with explicit +07:00 (WIB) offset.
 * This ensures Supabase stores the correct Indonesian Western Time
 * instead of a bare UTC (Z) timestamp that appears 7 hours behind.
 *
 * Format: YYYY-MM-DDTHH:mm:ss+07:00
 */
export const getWIBTimestamp = (): string => {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const p: Record<string, string> = {};
  parts.forEach(({ type, value }) => {
    p[type] = value;
  });

  // Format: YYYY-MM-DDTHH:mm:ss+07:00
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+07:00`;
};
