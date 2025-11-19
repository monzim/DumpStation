// Utility functions for formatting

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDate(dateString: string): string {
  if (!dateString) return "N/A";

  const date = new Date(dateString);

  // Check if date is valid
  if (isNaN(date.getTime())) return "Invalid Date";

  // Format as: Jan 15, 2025 at 2:30 PM
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function parseCronExpression(cron: string): string {
  if (!cron) return "No schedule configured";

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron; // Invalid cron, return as-is

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Common patterns
  if (cron === "0 0 * * *") return "Daily at midnight";
  if (cron === "0 */6 * * *") return "Every 6 hours";
  if (cron === "0 */12 * * *") return "Every 12 hours";
  if (cron === "0 2 * * *") return "Daily at 2:00 AM";
  if (cron === "0 0 * * 0") return "Weekly on Sunday at midnight";
  if (cron === "0 0 1 * *") return "Monthly on the 1st at midnight";

  // Build description
  let description = "";

  // Minute
  if (minute === "*") {
    description += "Every minute";
  } else if (minute.startsWith("*/")) {
    const interval = minute.slice(2);
    description += `Every ${interval} minutes`;
  } else {
    description += `At minute ${minute}`;
  }

  // Hour
  if (hour !== "*") {
    if (hour.startsWith("*/")) {
      const interval = hour.slice(2);
      description += ` of every ${interval} hours`;
    } else {
      const hourNum = parseInt(hour);
      const period = hourNum >= 12 ? "PM" : "AM";
      const displayHour =
        hourNum > 12 ? hourNum - 12 : hourNum === 0 ? 12 : hourNum;
      description += `, ${displayHour}:${minute.padStart(2, "0")} ${period}`;
    }
  }

  // Day of month
  if (dayOfMonth !== "*") {
    if (dayOfMonth.startsWith("*/")) {
      const interval = dayOfMonth.slice(2);
      description += ` every ${interval} days`;
    } else {
      description += ` on day ${dayOfMonth}`;
    }
  }

  // Month
  if (month !== "*") {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthNum = parseInt(month) - 1;
    if (monthNum >= 0 && monthNum < 12) {
      description += ` in ${monthNames[monthNum]}`;
    }
  }

  // Day of week
  if (dayOfWeek !== "*") {
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const dayNum = parseInt(dayOfWeek);
    if (dayNum >= 0 && dayNum < 7) {
      description += ` on ${dayNames[dayNum]}`;
    }
  }

  return description || cron;
}
