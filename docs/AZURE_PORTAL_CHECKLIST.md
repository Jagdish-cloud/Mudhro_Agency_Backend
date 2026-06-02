# Azure Portal checklist (backend)

Repository: `https://github.com/Jagdish-cloud/Mudhro_Agency_Backend.git` (branch `main`).

See [AZURE_ENV_REFERENCE.md](./AZURE_ENV_REFERENCE.md) for every environment variable and frontend/backend URL wiring.

## 1. Create Web App

| Field | Value |
|-------|--------|
| Resource group | e.g. `rg-mudhro-agency-prod` |
| Name | e.g. `mudhro-agency-api` → `https://mudhro-agency-api.azurewebsites.net` |
| Publish | Code |
| Runtime | Node 20 LTS |
| OS | Linux |
| Plan | B1+ (Always On, WebSockets, Puppeteer PDF) |

## 2. PostgreSQL

1. Create **Azure Database for PostgreSQL** (Flexible Server recommended).
2. Create database e.g. `MudhroAgency`.
3. Run migrations in order: `sql/001_init_organization_registration.sql` through `sql/026_invoice_reminder_offsets.sql`.
4. **Networking:** allow App Service outbound IPs or enable access from Azure services.
5. Set `DATABASE_URL` with `?sslmode=require`.

## 3. Blob Storage

1. Create Storage Account.
2. Create container `agencyuatfiles` (optional: `signatures`, `agreements`).
3. Copy connection string → `AZURE_STORAGE_CONNECTION_STRING`.

## 4. Application settings

Configuration → Application settings → add variables from [AZURE_ENV_REFERENCE.md](./AZURE_ENV_REFERENCE.md).

Minimum set:

| Name | Value |
|------|--------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | *(PostgreSQL connection string)* |
| `JWT_SECRET` | *(32+ chars)* |
| `APP_PUBLIC_URL` | `https://<FRONTEND-APP>.azurewebsites.net` |
| `SOCKET_CORS_ORIGIN` | same as `APP_PUBLIC_URL` |
| `AZURE_STORAGE_CONNECTION_STRING` | *(from Storage Account)* |
| `AZURE_BLOB_CONTAINER` | `agencyuatfiles` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` |

Add SMTP variables for real email. Set `UPLOAD_DIR=/home/uploads` if using mounted storage (step 6).

## 5. General settings

| Setting | Value |
|---------|--------|
| Startup Command | *(empty — uses `npm start`)* |
| Always On | On |
| HTTPS Only | On |
| Web sockets | **On** (required for chat) |

## 6. Persistent invoice attachments (optional but recommended)

Invoice attachment files use `UPLOAD_DIR` on local disk (not Blob).

1. Configuration → **General settings** → enable **App Service storage** (if available on your plan).
2. Mount Azure Files share to `/home/uploads` (or use Path mappings).
3. Set `UPLOAD_DIR=/home/uploads`.

Without this, attachments are lost on restart or redeploy.

## 7. Deployment Center

| Setting | Value |
|---------|--------|
| Source | GitHub |
| Repo | `Jagdish-cloud/Mudhro_Agency_Backend` |
| Branch | `main` |
| Build provider | App Service Build Service (Oryx) |

Oryx runs: `npm install` (includes Puppeteer Chrome via `postinstall`) → `npm run build` → `npm start`.

## 8. Wire frontend

On **frontend** App Service:

| Name | Value |
|------|--------|
| `VITE_API_BASE_URL` | `https://mudhro-agency-api.azurewebsites.net` |

Save and **redeploy** frontend (build-time variable).

## 9. Verify

1. `GET https://mudhro-agency-api.azurewebsites.net/health` → `{ "status": "ok" }`
2. Admin login from frontend.
3. Invoice PDF download (Puppeteer).
4. Chat message / file upload (Blob + WebSockets).
5. Send invoice email (SMTP).

If PDF fails, check **Deployment Center** logs for Puppeteer `postinstall` errors.
