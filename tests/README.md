# Backend tests

## Unit tests (no database required)

Run:

```bash
npm test
```

Covers:

- `tests/validators.member.test.ts` — Zod schemas for create admin, create member, update, list query.
- `tests/responses.test.ts` — `{ success, data, message }` envelope helpers.
- `tests/auth.middleware.test.ts` — `requireAuth`, `requireOrgAdmin`, `requireSameOrg` using real JWTs.
- `tests/member.service.test.ts` — service-layer behaviour with a mocked repository:
  - Creating an Admin forces `role = 1`.
  - Creating a Member forces `role = 2`.
  - Duplicate email (PG `23505`) maps to HTTP 409.
  - `password_hash` is never present on the DTO.
  - Members cannot change roles; only Admins can.
  - Last active admin cannot be demoted, deactivated or deleted.
  - Missing records return HTTP 404.
- `tests/validators.profile.test.ts` — Zod schemas for self-edit profile and change password:
  - Empty patch rejected; disallowed fields (email/role/status) rejected.
  - Mobile regex enforced; password policy enforced.
  - Confirm-password mismatch and "new == current" both rejected.
- `tests/profile.service.test.ts` — self-service profile behaviour with mocks:
  - `getMyProfileService` returns a DTO without `password_hash` and 401s if the row is gone.
  - `updateMyProfileService` only forwards name/number/designation; never email/role/status/organizationId.
  - `changeMyPasswordService` verifies current password via bcrypt, hashes new, and updates.
- `tests/organization.service.test.ts` — `getOrganizationProfileService` aggregates org + contacts and 404s if the org is missing.

## End-to-end verification (requires a running Postgres)

These steps assume you've run migrations `001` → `003` and have at least one organization + admin registered.

1. Sign in:

   ```bash
   curl -X POST http://localhost:4000/api/auth/admin/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"rahul@acme.com","password":"Strong@123"}'
   ```

   Response includes `admin.role = 1` and a JWT with a `role` claim.

2. Create a member (admin token required):

   ```bash
   curl -X POST http://localhost:4000/api/organizations/<orgId>/members \
     -H "Authorization: Bearer <token>" \
     -H 'Content-Type: application/json' \
     -d '{"name":"Riya","email":"riya@acme.com","number":"9876543210","designation":"PM","password":"Strong@123"}'
   ```

   Expect `201 { "success": true, "data": { ..., "role": 2, "status": "active" } }`.

3. Duplicate email (same email reused):

   Expect `409 { "message": "This email is already registered." }`.

4. List members with filters:

   ```bash
   curl 'http://localhost:4000/api/organizations/<orgId>/members?role=2&search=riya&page=1&limit=20' \
     -H "Authorization: Bearer <token>"
   ```

5. Member token trying to create another member:

   Expect `403 { "message": "Admins only." }`.

6. Delete the last active admin:

   Expect `409 { "message": "Cannot delete the last active admin." }`.

7. Cross-organization access:

   Use an `<orgId>` different from the token's `organizationId` → `403 { "message": "Organization scope mismatch." }`.

8. Missing Authorization header → `401`.

9. Self-service profile:

   ```bash
   # Get my profile
   curl http://localhost:4000/api/auth/me \
     -H "Authorization: Bearer <token>"

   # Edit name/number/designation (email/role/status ignored)
   curl -X PATCH http://localhost:4000/api/auth/me \
     -H "Authorization: Bearer <token>" \
     -H 'Content-Type: application/json' \
     -d '{"name":"Riya Kumar"}'

   # Change password (wrong current -> 401)
   curl -X PATCH http://localhost:4000/api/auth/me/password \
     -H "Authorization: Bearer <token>" \
     -H 'Content-Type: application/json' \
     -d '{"currentPassword":"OldP@ss1","newPassword":"NewStrong@123","confirmPassword":"NewStrong@123"}'
   ```

10. Organization profile:

    ```bash
    curl http://localhost:4000/api/organizations/<orgId> \
      -H "Authorization: Bearer <token>"
    ```

    Members (`role = 2`) can call it too; cross-org `orgId` returns `403`.
