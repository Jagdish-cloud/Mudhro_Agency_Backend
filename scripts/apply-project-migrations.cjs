/**
 * Applies agency project + agreement DDL (sql/016–022) using DATABASE_URL.
 * Safe to re-run: migrations use IF NOT EXISTS / CREATE OR REPLACE where applicable.
 */
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || typeof url !== "string") {
    console.error("DATABASE_URL is not set. Add it to .env in the backend folder.");
    process.exit(1);
  }

  const files = [
    "016_agency_projects.sql",
    "017_agency_project_clients.sql",
    "018_agency_agreements.sql",
    "019_agency_blob_files.sql",
    "020_agreement_blob_refactor.sql",
    "021_agency_invoice_payment_deductions.sql",
    "022_reconcile_invoice_pending_deductions.sql",
  ];
  const sqlDir = path.join(__dirname, "..", "sql");

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    for (const file of files) {
      const full = path.join(sqlDir, file);
      if (!fs.existsSync(full)) {
        throw new Error(`Missing migration file: ${full}`);
      }
      const sql = fs.readFileSync(full, "utf8");
      // eslint-disable-next-line no-console
      console.log(`Applying ${file} …`);
      await client.query(sql);
    }
  } finally {
    await client.end();
  }

  // eslint-disable-next-line no-console
  console.log("Project/agreement migrations applied successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
