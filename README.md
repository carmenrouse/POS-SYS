# PO/Inventory Sync

A mobile + web tool that helps small retailers manage purchase orders and inventory data **without replacing their existing POS**. It ingests messy supplier data — scanned paper POs, PDFs, and CSVs in inconsistent formats — cleans and validates it, and pushes clean data into the retailer's existing POS platform (Square, Shopify, and eventually Clover/Lightspeed) via that platform's API, or exports a corrected file if no integration is configured yet.

- **`backend/`** — Node.js/Express REST API, PostgreSQL via Prisma, JWT auth. See `backend/README.md` for the full route reference.
- **`web/`** — React (Vite) app: CSV/XLSX upload, column-mapping UI, review/approve screen, supplier mapping management, POS connection settings. The desk-based half of the workflow.
- **`mobile/`** — React Native (Expo) app: camera capture for scan-to-import, the same review/approve pipeline, push status/history. The phone-in-hand half.

## Quick start

```bash
# 1. Backend
cd backend
cp .env.example .env          # point DATABASE_URL at a local Postgres instance
npm install
npx prisma migrate dev --name init
npm run seed                  # sample business, users, suppliers, products, mock POS connections, 2 messy sample CSVs
npm run dev                   # http://localhost:4000

# 2. Web app (separate terminal)
cd web
npm install
npm run dev                   # http://localhost:5173 (proxies /api and /uploads to the backend)

# 3. Mobile app (separate terminal, optional)
cd mobile
npm install
npm start                     # press i / a, or scan the QR code with Expo Go
```

Log in with a seeded account (password `password123` for all):
- `owner@lhpoultry.test` — Owner
- `manager@lhpoultry.test` — Manager
- `staff@lhpoultry.test` — Staff

Try it: log into the web app, go to **Upload File**, and upload `backend/uploads/seed-coastal-feed.csv` — a deliberately messy sample (currency symbols, a leading-zero SKU, blank/duplicate/negative/non-numeric rows) — to watch the mapping suggestion and per-row validation work.

## What's implemented

- **Multi-tenant data model** (`Business` → `User`, `Supplier`/`SupplierFieldMapping`, `ImportJob`/`ImportRow`, `Product`, `POSConnection`, `PushLog`) with every query scoped to the authenticated user's business.
- **Role-based permissions** (Owner > Manager > Staff), enforced server-side.
- **CSV/XLSX normalization** (Feature 1, validated end-to-end first per the build brief): fuzzy header-to-schema matching with a synonym dictionary, saved per-supplier mapping profiles that auto-apply on repeat imports, type coercion (currency symbols, thousands separators, leading-zero SKUs preserved), and per-row validation with specific human-readable reasons — mechanical problems (missing SKU/name, unparseable/negative numbers) are errors; ambiguous ones (zero cost, outlier quantities/costs, duplicate SKUs) are flagged for a human, never silently guessed at.
- **Scan-to-import** (Feature 2): a pluggable OCR adapter (mock/Textract/DocumentAI) extracts line items from a photo or PDF, which then flow through the *exact same* validation/review/push pipeline as a CSV import — scanning is an alternate entry point, not a separate code path.
- **POS push** (Feature 3): a generic adapter interface (`testConnection`, `pushRows`) with Square and Shopify fully implemented — each handling that platform's real quirks (Square's all-or-nothing catalog batches vs. Shopify's per-request rate limiting) — and Clover/Lightspeed stubbed behind the same interface. New products are only created in the POS after explicit per-row confirmation; every push attempt is logged to `PushLog` for a full audit trail.
- **Tests**: 70 unit tests in `backend/tests/` covering column-mapping, type-coercion edge cases, validation rules, product matching, and the Square/Shopify adapters' payload mapping and orchestration logic (see `backend/README.md` for the breakdown and a note on what couldn't be tested against live POS APIs in this environment).

See `backend/README.md`, `web/README.md`, and `mobile/README.md` for the full details on each piece.
