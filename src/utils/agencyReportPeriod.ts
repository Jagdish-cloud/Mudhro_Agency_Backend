import { HttpError } from "./httpError.js";
import type { AgencyReportPeriodQuery } from "../validators/agencyReport.schema.js";
import { hasAnyPeriodParam } from "../validators/agencyReport.schema.js";

export type BoundedPeriod = {
  label: string;
  fromInclusive: string;
  toInclusive: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function utcDefaultMonthKey(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${y}-${pad2(m)}`;
}

/**
 * Priority: month > year > from/to > current UTC calendar month.
 * When only `from` is set, `to` becomes the last day of that month.
 * When only `to` is set, `from` becomes the first day of that month.
 */
export function resolveBoundedPeriod(query: AgencyReportPeriodQuery): BoundedPeriod {
  if (query.month) {
    const [y, mo] = query.month.split("-").map((p) => Number(p));
    if (!y || !mo || mo < 1 || mo > 12) {
      throw new HttpError(400, "Invalid month.");
    }
    const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return {
      label: query.month,
      fromInclusive: `${y}-${pad2(mo)}-01`,
      toInclusive: `${y}-${pad2(mo)}-${pad2(lastDay)}`,
    };
  }
  if (query.year != null) {
    const y = query.year;
    return {
      label: String(y),
      fromInclusive: `${y}-01-01`,
      toInclusive: `${y}-12-31`,
    };
  }
  if (query.from || query.to) {
    let from = query.from;
    let to = query.to;
    if (from && !to) {
      const [yy, mm] = from.split("-").map((p) => Number(p));
      const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      to = `${yy}-${pad2(mm)}-${pad2(lastDay)}`;
    } else if (!from && to) {
      const [yy, mm] = to.split("-").map((p) => Number(p));
      from = `${yy}-${pad2(mm)}-01`;
    }
    if (!from || !to) {
      throw new HttpError(400, "Invalid date range.");
    }
    if (from > to) {
      throw new HttpError(400, "from must be on or before to.");
    }
    return { label: `${from}–${to}`, fromInclusive: from, toInclusive: to };
  }
  const key = utcDefaultMonthKey();
  const [y, mo] = key.split("-").map((p) => Number(p));
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return {
    label: key,
    fromInclusive: `${y}-${pad2(mo)}-01`,
    toInclusive: `${y}-${pad2(mo)}-${pad2(lastDay)}`,
  };
}

/** When no period keys are present, payment-pending is unbounded on due_date. */
export function resolvePendingDueDatePeriod(query: AgencyReportPeriodQuery): BoundedPeriod | null {
  if (!hasAnyPeriodParam(query)) return null;
  return resolveBoundedPeriod(query);
}
