-- Agency invoice reminders. Scheduled entries are dispatched by the
-- reminderScheduler job; the `status` field is transitioned by that job
-- (scheduled -> sent | failed). `type` values mirror the frontend
-- `ReminderType` contract (before_due / on_due / overdue) plus 'custom'
-- for ad-hoc user-scheduled reminders.
--
-- Down migration (manual):
--   DROP TABLE IF EXISTS agency_invoice_reminders;

CREATE TABLE IF NOT EXISTS agency_invoice_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES agency_invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  offset_days INT NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'scheduled',
  sent_at TIMESTAMPTZ NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_reminders_type_chk CHECK (
    type IN ('before_due', 'on_due', 'overdue', 'custom')
  ),
  CONSTRAINT agency_reminders_channel_chk CHECK (channel IN ('email', 'in_app')),
  CONSTRAINT agency_reminders_status_chk CHECK (
    status IN ('scheduled', 'sent', 'failed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS agency_reminders_invoice_idx
  ON agency_invoice_reminders (invoice_id, scheduled_for);

CREATE INDEX IF NOT EXISTS agency_reminders_due_idx
  ON agency_invoice_reminders (status, scheduled_for)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS agency_reminders_org_idx
  ON agency_invoice_reminders (organization_id, scheduled_for DESC);
