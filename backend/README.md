# PO/Inventory Sync — Backend API

Node.js + Express REST API. PostgreSQL via Prisma. JWT auth with `OWNER` / `MANAGER` / `STAFF` roles. Multi-tenant: every table (except `Business` itself) is scoped by `businessId`, and every query filters on the authenticated user's `businessId`.

## Setup

```bash
cp .env.example .env      # edit DATABASE_URL / JWT_SECRET
npm install
npx prisma migrate dev --name init   # creates the DB schema
npm run seed                          # sample business, users, suppliers, products, mock POS connections, sample messy CSVs
npm run dev                           # http://localhost:4000
```

Requires a running PostgreSQL instance matching `DATABASE_URL`.

Seeded logins (password `password123` for all):
- `owner@lhpoultry.test` — OWNER
- `manager@lhpoultry.test` — MANAGER
- `staff@lhpoultry.test` — STAFF

The seed script also writes two intentionally messy sample supplier files to `backend/uploads/` — `seed-coastal-feed.csv` (currency symbols, thousands separators, a leading-zero SKU, blank/duplicate/negative/non-numeric rows) and `seed-harbor-supply.csv` (a completely different header vocabulary, paired with a pre-saved column mapping for its supplier so a repeat import auto-applies it). Upload either through the web app to see the pipeline work.

## Role permissions

| Action | Staff | Manager | Owner |
|---|---|---|---|
| View import jobs, products | ✅ | ✅ | ✅ |
| Upload/scan, map columns, edit/approve rows, export | | ✅ | ✅ |
| Push to a connected POS | | ✅ | ✅ |
| Manage suppliers, saved mappings | | ✅ | ✅ |
| Manage users | | | ✅ |
| Manage POS connections | | | ✅ |

Enforced server-side via `requireRole(minRole)` — never trusted from the client.

## Auth

All routes below require `Authorization: Bearer <token>` except `/api/auth/*`.

- `POST /api/auth/register-business` — `{ businessName, ownerName, email, password }` → creates a `Business` + its first `OWNER`
- `POST /api/auth/login` — `{ email, password }` → `{ token, user }`
- `GET /api/auth/me`

## Suppliers

- `GET /api/suppliers`, `GET /api/suppliers/:id`
- `POST /api/suppliers` / `PATCH /api/suppliers/:id` / `DELETE /api/suppliers/:id` (Manager+)
- `GET /api/suppliers/:id/mapping`, `PUT /api/suppliers/:id/mapping` (Manager+) — the saved `{ incomingHeader: internalField }` profile applied automatically on repeat imports

## Products

Products here are a **cached view of what's in the connected POS**, not a source of truth — they populate as an `ImportJob` gets pushed.

- `GET /api/products?search=`, `GET /api/products/:id`
- `POST /api/products` / `PATCH /api/products/:id` (Manager+) — manual create/edit, mainly useful for local dev/testing

## Import jobs (Feature 1 + 2 — CSV/XLSX and scan normalization)

Internal schema every source gets normalized to: `sku`, `name`, `description`, `quantity`, `unitCost`, `category`.

- `POST /api/import-jobs/upload` (Manager+, multipart `file`, optional `supplierId`) — parses headers, applies the supplier's saved mapping if it still fits (≥70% of its columns present) or fuzzy-suggests one otherwise. Returns headers/preview/suggested mapping/confidence — **does not create rows yet**.
- `POST /api/import-jobs/:id/confirm-mapping` (Manager+) — `{ mapping, saveAsSupplierDefault? }`. Builds every `ImportRow`: coerced (currency symbols/thousands separators stripped, leading-zero SKUs preserved, blank rows dropped), validated (`CLEAN`/`NEEDS_REVIEW`/`ERROR` with specific reasons — missing SKU/name and unparseable/negative quantity or cost are errors; zero cost, outlier quantity/cost, and duplicate SKUs are flagged for review, never silently auto-corrected), and fuzzy-matched against the cached product catalog.
- `GET /api/import-jobs?status=&supplierId=`, `GET /api/import-jobs/:id`
- `PATCH /api/import-jobs/:id` (Manager+) — `{ supplierId }`, to set/correct the supplier (mainly for scans where OCR couldn't confidently match one)
- `PATCH /api/import-jobs/:id/rows/:rowId` (Manager+) — human correction of one row's fields; re-coerces, re-validates, re-matches
- `POST /api/import-jobs/:id/rows/:rowId/approve` (Manager+) — `{ approved }`; an `ERROR` row can't be approved until fixed
- `POST /api/import-jobs/:id/approve-all-clean` (Manager+) — bulk-approves every `CLEAN` row
- `POST /api/import-jobs/:id/approve` (Manager+) — marks the job `APPROVED`; requires ≥1 approved row and no approved row left in `ERROR`
- `GET /api/import-jobs/:id/export?format=csv|xlsx` — corrected file of approved rows (the no-POS-integration fallback)
- `POST /api/import-jobs/:id/push` (Manager+) — `{ posConnectionId, confirmedNewProductRowIds? }` — see below
- `GET /api/import-jobs/:id/push-log` — full push audit trail for the job

## Scan-to-import (OCR)

- `POST /api/scan/purchase-order` (Manager+, multipart `file`, optional `supplierId`) — runs the configured OCR adapter, fuzzy-matches the extracted supplier name if `supplierId` wasn't given, then builds `ImportRow`s through the **exact same pipeline** CSV imports use (scanning is an alternate entry point, not a separate data path) and lands the job straight in `NEEDS_REVIEW` — there's no ambiguous column mapping to confirm for OCR output. Scanned line items never carry a SKU, so a confident product match backfills one from the matched product before validating; an unmatched line still correctly errors on a missing SKU.

  `OCR_PROVIDER` env var selects the adapter: `mock` (default, no cloud creds — for local dev), `textract` (AWS Textract `AnalyzeExpense`, needs `npm install @aws-sdk/client-textract`), `documentai` (Google Document AI, needs `npm install @google-cloud/documentai`). See `src/services/ocr/`.

## POS connections + push (Feature 3)

- `GET /api/pos-connections` — `authToken`/`refreshToken` redacted in responses
- `PUT /api/pos-connections/:platform` (Owner) — `{ accessToken, externalLocationId?, config? }`. `platform` is `square`/`clover`/`shopify`/`lightspeed`. Shopify additionally needs `config: { shopDomain }`.
- `POST /api/pos-connections/:platform/test` (Manager+) — verifies credentials against the real platform API
- `DELETE /api/pos-connections/:platform` (Owner)

Pushing (`POST /api/import-jobs/:id/push`) only sends **approved** rows. A row already matched to a cached product with an `externalId` gets an inventory adjustment (this import represents newly received stock); a row with no match — or a match with no `externalId` yet — is a new-to-the-POS product and is **only pushed if its row id is in `confirmedNewProductRowIds`**, otherwise it's skipped with a "needs confirmation" result. Every row attempted gets a `PushLog` entry (success or fail) for the audit trail, and the cached `Product` is upserted on success. The job's status rolls to `PUSHED` (all attempted rows succeeded), `PARTIALLY_PUSHED` (some didn't), or `FAILED` (none did).

Adapters (`src/services/pos/`) all implement the same `{ testConnection(connection), pushRows(connection, rows) }` contract:
- **Square** — fully implemented. New products go through Catalog `batch-upsert` (chunked); a rejected chunk retries its rows individually via the single-object endpoint, since Square fails an entire batch over one bad row. Inventory receiving uses the Inventory API's `ADJUSTMENT` change type.
- **Shopify** — fully implemented. No bulk-upsert in the REST Admin API, so each row is already an independent request — no batch-rejection handling needed. Rate-limit `429`s are retried once after honoring `Retry-After`.
- **Clover, Lightspeed** — stubbed behind the same interface (`testConnection` returns `not implemented`, `pushRows` throws `501`), ready to fill in following the Square/Shopify pattern.

Outbound network to Square's and Shopify's real APIs is blocked by this development environment's proxy, so neither could be exercised against a live account here — see the adapter test files for what was actually verified (payload-shape unit tests plus mocked-network orchestration tests covering the chunk/retry and rate-limit logic).

## Testing

```bash
npm test
```

70 tests across `backend/tests/`, all pure/mocked (no live DB or network required to run them):
- `headerMatcher.test.js` — column-mapping/fuzzy header matching
- `coercion.test.js` — currency symbols, thousands separators, accounting-negative parentheses, leading-zero SKU preservation, blank-vs-unparseable distinction
- `validation.test.js` — every CLEAN/NEEDS_REVIEW/ERROR rule
- `productMatcher.test.js`, `pipeline.test.js` — fuzzy product matching and the full row-build pipeline, including the scan-specific SKU-backfill behavior
- `parseFile.test.js`, `exportFile.test.js` — CSV/XLSX round-tripping
- `squareAdapter.test.js`, `squareAdapterPushRows.test.js`, `shopifyAdapter.test.js` — Square/Shopify payload mapping and mocked-network orchestration (chunking, per-row failure isolation, rate limiting)
