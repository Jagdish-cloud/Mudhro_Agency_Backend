-- Adds a per-invoice toggle for automatic payment reminders.
--
-- When FALSE, sendInvoiceEmailService skips seeding the default
-- before-due / on-due / overdue reminder schedule on first send. The
-- reminder scheduler tick still ignores paid/cancelled invoices, but
-- this flag lets a creator opt out of any future automatic writes.
--
-- Down migration (manual, destructive):
--   ALTER TABLE agency_invoices DROP COLUMN reminders_enabled;

ALTER TABLE agency_invoices
  ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE;
