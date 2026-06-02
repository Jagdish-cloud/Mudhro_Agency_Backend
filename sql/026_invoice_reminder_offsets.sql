-- Per-invoice user-selected reminder offsets (days relative to due date).
-- Allowed values: -3, 0, 7, 10, 15. NULL when reminders are disabled.
--
-- Down migration (manual):
--   ALTER TABLE agency_invoices DROP COLUMN reminder_offsets;

ALTER TABLE agency_invoices
  ADD COLUMN IF NOT EXISTS reminder_offsets INT[] NULL;
