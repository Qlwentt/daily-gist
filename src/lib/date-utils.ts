export function getCurrentHourInTimezone(timezone: string): number {
  const hourStr = new Date().toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });
  // toLocaleString with hour12:false returns "0"-"23" (or "24" at midnight in some locales)
  return parseInt(hourStr, 10) % 24;
}

export function getTodayInTimezone(timezone: string): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

export function getFormattedDateInTimezone(timezone: string): string {
  return new Date().toLocaleDateString("en-US", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Returns 0 (Sunday) through 6 (Saturday) in the given timezone. */
export function getDayOfWeekInTimezone(timezone: string): number {
  const dayStr = new Date().toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[dayStr] ?? new Date().getDay();
}
