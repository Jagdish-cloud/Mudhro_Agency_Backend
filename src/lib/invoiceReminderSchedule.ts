import type {
  AgencyReminderChannel,
  AgencyReminderType,
} from "../types/agencyInvoice.js";
import { HttpError } from "../utils/httpError.js";

export const ALLOWED_REMINDER_OFFSETS = [-3, 0, 7, 10, 15] as const;
export type AllowedReminderOffset = (typeof ALLOWED_REMINDER_OFFSETS)[number];

export type ReminderScheduleEntry = {
  type: AgencyReminderType;
  offsetDays: number;
  scheduledFor: Date;
  channel: AgencyReminderChannel;
};

export function normalizeReminderOffsets(offsets: number[]): number[] {
  const allowed = new Set<number>(ALLOWED_REMINDER_OFFSETS);
  const unique = [...new Set(offsets)].filter((offset) => allowed.has(offset));
  unique.sort((a, b) => a - b);
  return unique;
}

export function assertReminderOffsets(
  offsets: number[] | null | undefined,
  remindersEnabled: boolean,
): number[] | null {
  if (!remindersEnabled) return null;
  const normalized = normalizeReminderOffsets(offsets ?? []);
  if (normalized.length === 0) {
    throw new HttpError(
      400,
      "Select at least one payment reminder when reminders are enabled.",
    );
  }
  return normalized;
}

function offsetToReminderType(offset: number): AgencyReminderType {
  if (offset < 0) return "before_due";
  if (offset === 0) return "on_due";
  return "overdue";
}

export function buildReminderSchedule(
  dueDate: string,
  offsets: number[],
): ReminderScheduleEntry[] {
  const normalized = normalizeReminderOffsets(offsets);
  const due = new Date(`${dueDate}T09:00:00.000Z`);

  return normalized.map((offsetDays) => {
    const scheduledFor = new Date(due);
    scheduledFor.setUTCDate(scheduledFor.getUTCDate() + offsetDays);
    return {
      type: offsetToReminderType(offsetDays),
      offsetDays,
      scheduledFor,
      channel: "email",
    };
  });
}

export function seedRemindersFromOffsets(
  dueDate: string,
  offsets: number[],
): ReminderScheduleEntry[] {
  return buildReminderSchedule(dueDate, offsets);
}
