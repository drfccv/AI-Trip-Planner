type CalendarItem = {
  id: string;
  title: string;
  startTime: string;
  durationMinutes: number;
  notes?: string;
};
type CalendarTrip = {
  id: string;
  title: string;
  days?: Array<{ date: string; items: CalendarItem[] }>;
};
const encoder = new TextEncoder();

export function escapeIcsText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

export function foldIcsLine(line: string) {
  const chunks: string[] = [];
  let chunk = "";
  let limit = 75;
  for (const character of line) {
    if (chunk && encoder.encode(chunk + character).length > limit) {
      chunks.push(chunk);
      chunk = character;
      limit = 74;
    } else chunk += character;
  }
  if (chunk || !chunks.length) chunks.push(chunk);
  return chunks.join("\r\n ");
}

export function buildTripCalendar(trip: CalendarTrip, now = new Date()) {
  const stamp = now
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const events = (trip.days || []).flatMap((day) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return [];
    return day.items.flatMap((item) => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.startTime)) return [];
      return [
        "BEGIN:VEVENT",
        `UID:${item.id}@lvji.local`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${day.date.replaceAll("-", "")}T${item.startTime.replace(":", "")}00`,
        `DURATION:PT${Math.max(1, Math.round(item.durationMinutes))}M`,
        `SUMMARY:${escapeIcsText(item.title)}`,
        ...(item.notes ? [`DESCRIPTION:${escapeIcsText(item.notes)}`] : []),
        "END:VEVENT",
      ];
    });
  });
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "PRODID:-//Lvji//Trip Planner//ZH-CN",
    `X-WR-CALNAME:${escapeIcsText(trip.title)}`,
    ...events,
    "END:VCALENDAR",
  ];
  return {
    text: `${lines.map(foldIcsLine).join("\r\n")}\r\n`,
    eventCount: events.filter((line) => line === "BEGIN:VEVENT").length,
  };
}
