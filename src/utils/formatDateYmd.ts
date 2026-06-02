/** Normalize API/pg values to YYYY-MM-DD for reports and PDFs. */
export function formatDateYmd(value: string | number | Date | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const s = String(value).trim();
  if (!s.length) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return formatDateYmd(new Date(t));
  return "";
}

export function formatDateYmdOrDash(value: string | number | Date | null | undefined): string {
  const ymd = formatDateYmd(value);
  return ymd.length ? ymd : "—";
}
