import test from "node:test";
import assert from "node:assert/strict";
import { buildTripCalendar, escapeIcsText } from "../lib/calendar.ts";

test("calendar export creates valid escaped events with CRLF endings", () => {
  const result = buildTripCalendar(
    {
      id: "trip-1",
      title: "杭州,周末",
      days: [
        {
          date: "2026-07-23",
          items: [
            {
              id: "item-1",
              title: "西湖;漫步",
              startTime: "09:30",
              durationMinutes: 90,
              notes: "断桥集合\n带伞",
            },
          ],
        },
      ],
    },
    new Date("2026-07-21T00:00:00.000Z"),
  );
  assert.equal(result.eventCount, 1);
  assert.match(result.text, /DTSTAMP:20260721T000000Z\r\n/);
  assert.match(result.text, /DTSTART:20260723T093000\r\n/);
  assert.match(result.text, /SUMMARY:西湖\\;漫步\r\n/);
  assert.match(result.text, /DESCRIPTION:断桥集合\\n带伞\r\n/);
  assert.ok(result.text.endsWith("END:VCALENDAR\r\n"));
});

test("calendar export skips undated arrangements", () => {
  const result = buildTripCalendar({
    id: "trip-2",
    title: "日期待定",
    days: [
      {
        date: "",
        items: [
          { id: "x", title: "待定", startTime: "09:00", durationMinutes: 60 },
        ],
      },
    ],
  });
  assert.equal(result.eventCount, 0);
});

test("calendar text escapes reserved characters", () => {
  assert.equal(escapeIcsText("A,B;C\\D"), "A\\,B\\;C\\\\D");
});
