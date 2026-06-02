-- Adds branding + state_code metadata to organizations so invoice PDFs can
-- render a logo and the GST CGST/SGST vs IGST split can be derived from the
-- seller's state code.
--
-- state_code is the first two digits of the GST number (per Indian GST rules).
-- For unregistered orgs it is NULL; invoices will default to IGST in that case.
--
-- Down migration (manual):
--   ALTER TABLE organizations
--     DROP COLUMN IF EXISTS state_code,
--     DROP COLUMN IF EXISTS logo_path;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS logo_path TEXT NULL;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS state_code VARCHAR(2) NULL;

-- Backfill state_code from existing GST numbers where present.
UPDATE organizations
SET state_code = substring(gst_number FROM 1 FOR 2)
WHERE gst_number IS NOT NULL AND state_code IS NULL;
