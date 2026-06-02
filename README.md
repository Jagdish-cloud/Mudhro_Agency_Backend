# Mudhro Agency Backend

Node.js + Express + TypeScript backend for organization registration, admin sign-in, and member management, using PostgreSQL.

## Setup

Requires **Node 20.19+** (see `.nvmrc`).

1. Install dependencies:
   - `npm install` (runs `postinstall` → installs Puppeteer Chrome for PDF generation)
2. Configure environment:
   - copy `.env.example` to `.env`
3. Run database migrations (in order, against your PostgreSQL database):
   - `sql/001_init_organization_registration.sql`
   - `sql/002_admin_email_globally_unique.sql`
   - `sql/003_add_role_to_organization_admins.sql`
   - `sql/004_add_organization_branding.sql`
   - `sql/005_agency_clients.sql`
   - `sql/006_agency_invoices.sql`
   - `sql/007_agency_invoice_items.sql`
   - `sql/008_agency_invoice_installments.sql`
   - `sql/009_agency_invoice_payments.sql`
   - `sql/010_agency_invoice_reminders.sql`
   - `sql/011_agency_attachments_and_notifications.sql`
   - `sql/012_agency_invoice_sequences.sql`
   - `sql/013_agency_client_items.sql`
   - `sql/014_agency_invoices_inclusive_tax.sql`
   - `sql/015_agency_invoices_reminders_flag.sql`
   - `sql/016_agency_projects.sql`
   - `sql/017_agency_project_clients.sql`
   - `sql/018_agency_agreements.sql`
   - `sql/019_agency_blob_files.sql`
   - `sql/020_agreement_blob_refactor.sql`
   - `sql/021_agency_invoice_payment_deductions.sql`
   - `sql/022_reconcile_invoice_pending_deductions.sql`
   - `sql/023_agency_expenses.sql`
   - `sql/024_agency_vendors.sql`
   - `sql/025_internal_chat.sql`
   - `sql/026_invoice_reminder_offsets.sql`
4. Start the API:
   - `npm run dev`
5. Run tests:
   - `npm test`

## Deploy to Azure App Service (Linux, Node 20)

Repository: `https://github.com/Jagdish-cloud/Mudhro_Agency_Backend.git` (branch `main`).

Oryx: `npm install` → `npm run build` → `npm start` (`node dist/server.js` on `0.0.0.0:$PORT`).

| Doc | Purpose |
|-----|---------|
| [docs/AZURE_PORTAL_CHECKLIST.md](docs/AZURE_PORTAL_CHECKLIST.md) | Portal steps (Web App, PostgreSQL, Blob, Deployment Center) |
| [docs/AZURE_ENV_REFERENCE.md](docs/AZURE_ENV_REFERENCE.md) | **All** backend + frontend environment variables |

**Cross-app URLs:** set frontend `VITE_API_BASE_URL` to this API’s URL (redeploy frontend). Set backend `APP_PUBLIC_URL` and `SOCKET_CORS_ORIGIN` to the frontend URL.

**Invoice attachments:** `UPLOAD_DIR` is local disk — on App Service use mounted Azure Files (e.g. `/home/uploads`) or files are lost on restart.

**PDF:** uses Puppeteer (Chrome installed via `postinstall` on deploy).

## Role mapping

`organization_admins.role` is an integer:

| Role code | Meaning | Permissions |
|-----------|---------|-------------|
| `1`       | Admin   | Full CRUD on members + organization. Issued on organization registration. |
| `2`       | Member  | Can sign in and read the member list. Cannot create/edit/delete anyone. |

JWTs issued by `POST /api/auth/admin/login` carry a `role` claim, which is enforced by the `requireAuth`, `requireSameOrg`, and `requireOrgAdmin` middlewares.

## API

### Public

- `POST /api/organizations/register` — create organization + seed admin (role = 1).
- `POST /api/auth/admin/login` — returns `{ token, expiresIn, admin: { id, email, name, role }, organization }`.

### Authenticated (JWT required)

All of these live under `/api/organizations/:orgId` and require the caller's JWT `organizationId` to match `:orgId`.

| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET    | `/members`         | `requireAuth` + `requireSameOrg`                      | List members; filter by `role`, `status`, `search`, `page`, `limit`. Admins and Members can call. |
| POST   | `/admins`          | `requireAuth` + `requireSameOrg` + `requireOrgAdmin`  | Create a new Admin (role is forced to `1`). |
| POST   | `/members`         | `requireAuth` + `requireSameOrg` + `requireOrgAdmin`  | Create a new Member (role is forced to `2`). |
| PATCH  | `/members/:id`     | `requireAuth` + `requireSameOrg` + `requireOrgAdmin`  | Update name/number/designation/status/role. Role change requires Admin. |
| DELETE | `/members/:id`     | `requireAuth` + `requireSameOrg` + `requireOrgAdmin`  | Soft delete (sets `deleted_at` + `status = 'inactive'`). Blocks the last active admin. |

Organization profile (read-only for both roles):

| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET    | `/api/organizations/:orgId` | `requireAuth` + `requireSameOrg` | Returns org profile + contact persons. |

Self-service profile endpoints (any authenticated user):

| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET    | `/api/auth/me`          | `requireAuth` | Returns the signed-in user's profile DTO. |
| PATCH  | `/api/auth/me`          | `requireAuth` | Self-edit `name`, `number`, `designation` (all optional, at least one required). Email/role/status cannot be changed here. |
| PATCH  | `/api/auth/me/password` | `requireAuth` | Change own password. Requires `currentPassword` + strong `newPassword` + `confirmPassword`. |

All responses for these endpoints follow the envelope:

```json
{ "success": true, "data": <payload>, "message": "..." }
```

`password_hash` is never projected into responses.

### Sample: create member

```http
POST /api/organizations/<orgId>/members
Authorization: Bearer <admin JWT>
Content-Type: application/json

{
  "name": "Riya Sharma",
  "email": "riya@acme.com",
  "number": "9876543210",
  "designation": "Project Manager",
  "password": "Strong@123"
}
```

Response `201`:

```json
{
  "success": true,
  "message": "Member created successfully.",
  "data": {
    "id": "…",
    "organizationId": "…",
    "name": "Riya Sharma",
    "email": "riya@acme.com",
    "number": "9876543210",
    "designation": "Project Manager",
    "role": 2,
    "status": "active",
    "createdAt": "2025-04-20T12:00:00.000Z",
    "updatedAt": "2025-04-20T12:00:00.000Z"
  }
}
```

### Error shape

Errors are plain (no envelope):

```json
{ "message": "…", "errors"?: [{ "path": "email", "message": "…" }] }
```

Key status codes:

- `401` — missing/invalid token or inactive account.
- `403` — wrong org scope, or Member trying a mutation.
- `404` — member not found.
- `409` — duplicate email / cannot delete-or-demote last active admin.

## Curl

### Organization registration

```bash
curl -X POST http://localhost:4000/api/organizations/register \
  -H "Content-Type: application/json" \
  -d @payload.json
```

### Admin login

```bash
curl -X POST http://localhost:4000/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"rahul@acme.com","password":"Strong@123"}'
```

### List members

```bash
curl 'http://localhost:4000/api/organizations/<orgId>/members?role=2&page=1&limit=20' \
  -H "Authorization: Bearer <token>"
```

### Get own profile

```bash
curl http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

### Update own profile

```bash
curl -X PATCH http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Riya Kumar","designation":"Senior PM"}'
```

### Change own password

```bash
curl -X PATCH http://localhost:4000/api/auth/me/password \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"OldP@ss1","newPassword":"NewStrong@123","confirmPassword":"NewStrong@123"}'
```

### Get organization profile

```bash
curl http://localhost:4000/api/organizations/<orgId> \
  -H "Authorization: Bearer <token>"
```

## Agency Clients + Invoices module

Everything in this module is mounted under `/api/organizations/:orgId/*` and is
protected by `requireAuth` + `requireSameOrg`. Destructive and "send" operations
additionally require `requireOrgAdmin`.

### Environment (see `.env.example` and `docs/AZURE_ENV_REFERENCE.md`)

| Variable | Purpose |
|----------|---------|
| `APP_PUBLIC_URL`         | Base URL used in invoice emails & client portal links. |
| `SOCKET_CORS_ORIGIN`     | Allowed origin(s) for Socket.IO chat (frontend URL in production). |
| `AZURE_STORAGE_CONNECTION_STRING` | Blob storage for agreements, chat, and file uploads. |
| `ENABLE_SCHEDULER`       | `true` to boot the node-cron reminder dispatcher + overdue recompute. |
| `SCHEDULER_SECRET`       | Secret for `POST /api/internal/jobs/reminder-tick` (Azure Timer). |
| `UPLOAD_DIR`             | Root folder for invoice attachments (local disk; use persistent mount on Azure). |
| `INVOICE_NUMBER_PREFIX`  | Prefix for allocated invoice numbers. Default `INV`. |
| `INVOICE_NUMBER_PAD`     | Zero-pad width for the per-org/per-year sequence. Default `5`. |
| `SMTP_HOST` + `SMTP_PORT` + `SMTP_SECURE` + `SMTP_USER` + `SMTP_PASS` + `SMTP_FROM` + `SMTP_FROM_NAME` | Nodemailer transport. If `SMTP_HOST` is empty, mail is **logged to stdout** in dev and returns success. |

### SMTP configuration

The module ships a thin wrapper around Nodemailer (`src/services/mail.service.ts`).
It lazily constructs a singleton transport from `SMTP_*` variables. When
`SMTP_HOST` is unset (local dev / CI), `sendMail` prints the rendered message to
stdout and resolves, so tests and local flows never crash on missing SMTP.

Minimal Gmail configuration:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com
SMTP_PASS=<google-app-password>
SMTP_FROM=invoices@yourdomain.com
SMTP_FROM_NAME="Your Agency"
```

### Reminder scheduler

Enable background reminder dispatch by setting `ENABLE_SCHEDULER=true`. The job
(see `src/jobs/reminderScheduler.ts`) runs every few minutes and:

1. Picks reminders with `status = 'scheduled'` and `scheduled_for <= NOW()`.
2. Sends email (or writes an in-app notification) and marks the row `sent` or
   `failed` with the error message.
3. Re-computes `status = 'overdue'` on invoices whose `due_date < today` and
   that are neither `draft`, `paid`, nor `cancelled`.

### Endpoints

All tables below live under `/api/organizations/:orgId`.

#### Clients — `/clients`

| Method | Path | Admin-only | Purpose |
|--------|------|------------|---------|
| POST   | `/clients` | no  | Create a client. |
| GET    | `/clients` | no  | List/search/filter. Supports `search`, `status`, `tag`, `page`, `limit`. |
| GET    | `/clients/:clientId` | no | Fetch one client. |
| PATCH  | `/clients/:clientId` | no | Update client fields. |
| DELETE | `/clients/:clientId` | yes | Soft delete (rejected with 409 if active invoices exist). |
| GET    | `/clients/:clientId/items` | no | List per-client catalog items. Query: `search`. |
| POST   | `/clients/:clientId/items` | no | Create a catalog item (`409` on `(name, hsn)` duplicate). |
| GET    | `/clients/:clientId/items/:itemId` | no | Read a catalog item. |
| PATCH  | `/clients/:clientId/items/:itemId` | no | Update. |
| DELETE | `/clients/:clientId/items/:itemId` | no | Soft delete. |
| POST   | `/clients/:clientId/items/save-from-row` | no | Upsert from an Invoice Builder row; used by the "Save to catalog" button. |

#### Invoices — `/invoices`

| Method | Path | Admin-only | Purpose |
|--------|------|------------|---------|
| POST   | `/invoices` | no  | Create invoice (transactional, allocates number, computes CGST/SGST/IGST). `created_by_*` is set from the JWT. |
| GET    | `/invoices` | no  | List/filter: `search`, `clientId`, `status`, `from`, `to`, `currency`, `createdBy`, `overdue=true`. |
| GET    | `/invoices/:id` | no | Detail with items + installments + reminders. |
| PATCH  | `/invoices/:id` | varies | Admins can edit any non-paid/non-cancelled invoice; members can edit only their own drafts. `created_by_*` is never overwritten. |
| DELETE | `/invoices/:id` | yes | Soft delete. Blocked (409) if any payment has been recorded. |
| POST   | `/invoices/:id/send` | yes | Email the client a rendered PDF + portal link, seed default reminders. |
| POST   | `/invoices/:id/rotate-token` | yes | Invalidate the old portal token and return a new one. |
| GET    | `/invoices/:id/pdf` | no | Stream the server-generated PDF. |

#### Installments — `/invoices/:id/installments`

Installments are created/updated as part of the invoice body; query list via
`GET /invoices/:id` (returned inside `installments[]`). The sum of `amount`
across installments must equal the invoice grand total; the API returns 400
otherwise.

#### Payments — `/invoices/:id/payments`

| Method | Path | Admin-only | Purpose |
|--------|------|------------|---------|
| POST   | `/invoices/:id/payments` | yes | Record a payment. The sum of net **amount** plus **paymentGatewayFee**, **tdsDeducted**, and **otherDeduction** cannot exceed the remaining invoice face (`grand_total − amount_received − existing deductions`). `amount_pending` subtracts recorded deductions; status becomes `paid` when received + deductions cover `grand_total`. Marks installments as paid, writes a notification. |
| GET    | `/invoices/:id/payments` | no  | List recorded payments for the invoice. |

#### Reminders — `/invoices/:id/reminders`

| Method | Path | Admin-only | Purpose |
|--------|------|------------|---------|
| GET    | `/invoices/:id/reminders` | no | List reminders + their dispatch status. |
| POST   | `/invoices/:id/reminders` | yes | Queue a custom reminder (`type=custom`, `scheduledFor`, `channel`). |
| DELETE | `/invoices/:id/reminders/:reminderId` | yes | Cancel a reminder still in `scheduled` state. |

#### Attachments — `/invoices/:id/attachments`

| Method | Path | Admin-only | Purpose |
|--------|------|------------|---------|
| POST   | `/invoices/:id/attachments` | yes | `multipart/form-data` upload (field `file`). Stored under `UPLOAD_DIR/orgs/:orgId/invoices/:invoiceId/`. Mime type and size are validated. |
| GET    | `/invoices/:id/attachments` | no | List attachments (metadata only). |
| GET    | `/invoices/:id/attachments/:attachmentId` | no | Download the file stream. |
| DELETE | `/invoices/:id/attachments/:attachmentId` | yes | Remove (hard delete + unlinks the file). |

#### Reports — `/reports`

| Method | Path | Admin-only | Purpose |
|--------|------|------------|---------|
| GET    | `/reports/monthly?month=YYYY-MM` | no | Revenue, receivables, overdue count, status breakdown, and top 5 clients. |

### Public Portal (unauthenticated)

Mounted under `/api/public/*`. Access is keyed entirely by the invoice's
`portal_token` UUID, so an org can revoke access by calling
`POST /invoices/:id/rotate-token`. Basic IP-based rate limiting is applied.

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/public/invoices/:token` | Client-facing read-only invoice view. |
| GET    | `/api/public/invoices/:token/pdf` | Public PDF download. |
| POST   | `/api/public/invoices/:token/viewed` | Marks the invoice as `viewed` (one-shot). |

### Multi-tenant guarantees

- Every repository query includes `organization_id = $1`.
- Controllers resolve `orgId` from the JWT first (`req.auth.organizationId`) and
  compare to `:orgId` via `requireSameOrg`; mismatches return `403`.
- Invoice creation verifies the referenced `clientId` belongs to the caller's
  org; a matching DB check constraint / trigger rejects cross-org linkage.
- `created_by_org_user_id` is copied from the JWT during the transactional
  invoice insert, and the update patch explicitly strips `created_by_*` fields.
- The public portal is the only path that doesn't require a JWT, and it scopes
  lookups to a single invoice by a rotating UUID token.

### Sample: create an invoice

```http
POST /api/organizations/<orgId>/invoices
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "clientId": "…",
  "issueDate": "2026-04-10",
  "dueDate":   "2026-05-10",
  "currency":  "INR",
  "status":    "draft",
  "paymentTerms": "Net 30",
  "placeOfSupply": "27",
  "items": [
    {
      "itemName": "Landing page redesign",
      "hsnCode":  "998314",
      "qty":      1,
      "rate":     80000,
      "discountPercent": 0,
      "taxPercent": 18
    }
  ],
  "installments": [
    { "sequence": 1, "dueDate": "2026-04-25", "amount": 47200 },
    { "sequence": 2, "dueDate": "2026-05-10", "amount": 47200 }
  ]
}
```

The service allocates an invoice number via
`agency_invoice_sequences (organization_id, year) -> seq`, computes CGST+SGST
(same-state) or IGST (inter-state) from `organization.state_code` vs
`client.state_code`, and returns the full DTO (invoice + items + installments +
reminders).

### Tests

```bash
npm test
```

Covers:

- `tests/agencyClient.service.test.ts` — cross-org isolation, same email
  allowed across orgs, soft-delete guards.
- `tests/agencyInvoice.service.test.ts` — tax split logic, number allocation,
  `created_by_*` preservation, cross-org 404, RBAC on edit.
- `tests/agencyInvoicePayment.service.test.ts` — status transitions
  (draft → partial → paid), over-payment rejection, installment matching.
- `tests/agencyInvoiceReminder.service.test.ts` — default seed schedule,
  cross-invoice reminder rejection.
- `tests/validators.agencyInvoice.test.ts` — HSN required, installments
  optional, due ≥ issue date, payment schema.

## Verification checklist

- Registered org + valid GST inserts successfully; seed admin gets `role = 1`.
- Admins can invite Admins and Members; invites hash the password with bcrypt.
- Duplicate admin/member email (case-insensitive, globally unique) fails with `409`.
- Invalid PAN/GST/mobile fails validation.
- Transaction rolls back if nested insert fails (no partial organization records).
- Member accounts (role `2`) can sign in and list members but get `403` for mutations.
- Cross-organization `orgId` in URL returns `403`.
- Deleting or demoting the last active admin returns `409`.
- No response ever includes `password_hash` or `passwordHash`.
- `GET /api/auth/me` returns the signed-in user's DTO (no `password_hash`).
- `PATCH /api/auth/me` rejects `email`, `role`, `status`, `organizationId` (strict schema).
- `PATCH /api/auth/me/password` returns `401` for a wrong current password.
- `GET /api/organizations/:orgId` is accessible to both Admins and Members of the same org; cross-org requests return `403`.
