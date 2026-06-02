import { describe, expect, it } from "vitest";

import {
  buildReminderSchedule,
  normalizeReminderOffsets,
  seedRemindersFromOffsets,
} from "../src/lib/invoiceReminderSchedule.js";

describe("invoiceReminderSchedule", () => {
  it("builds only the selected offsets around the due date", () => {
    const seed = seedRemindersFromOffsets("2026-02-15", [-3, 0, 7, 10, 15]);
    expect(seed.map((r) => r.offsetDays)).toEqual([-3, 0, 7, 10, 15]);
    expect(seed.map((r) => r.type)).toEqual([
      "before_due",
      "on_due",
      "overdue",
      "overdue",
      "overdue",
    ]);
    expect(seed.every((r) => r.channel === "email")).toBe(true);
    expect(seed[0].scheduledFor.getTime()).toBeLessThan(seed[1].scheduledFor.getTime());
    expect(seed[1].scheduledFor.getTime()).toBeLessThan(seed[2].scheduledFor.getTime());
  });

  it("deduplicates and filters unsupported offsets", () => {
    expect(normalizeReminderOffsets([-3, 0, 7, 7, 3, 99])).toEqual([-3, 0, 7]);
  });

  it("schedules reminders at 09:00 UTC on offset day", () => {
    const [onDue] = buildReminderSchedule("2026-02-15", [0]);
    expect(onDue.scheduledFor.toISOString()).toBe("2026-02-15T09:00:00.000Z");
  });
});
