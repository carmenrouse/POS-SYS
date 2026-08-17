# PO/Inventory Sync — Web App

React (Vite) app for the desk-based half of the workflow: uploading supplier CSV/XLSX files, mapping columns, reviewing/approving rows, managing suppliers and their saved mappings, and configuring POS connections.

## Setup

```bash
npm install
npm run dev     # http://localhost:5173
```

`vite.config.js` proxies `/api` and `/uploads` to `http://localhost:4000` (the backend) in dev. For a production build, serve the built app from the same origin as the API, or update the proxy target / add a full API base URL.

```bash
npm run build   # outputs to dist/
```

Log in with a seeded account (see `../backend/README.md`), e.g. `owner@lhpoultry.test` / `password123`.

## Pages

| Page | Purpose |
|---|---|
| Login / RegisterBusiness | Auth |
| Dashboard | Count of imports needing review, quick actions |
| Upload File | CSV/XLSX upload → column-mapping UI (fuzzy-suggested, editable, confidence-indicated per column) → confirm |
| Scan Document | Desktop-side OCR import (photo/PDF from disk) — mobile has the camera-native version |
| Import Jobs | List/filter by status |
| Import Review | Per-row inline edit + re-validate, bulk-approve clean rows, approve the job, export CSV/XLSX, push to a connected POS with per-row new-product confirmation, scan attachment preview, supplier picker when OCR couldn't match one |
| Suppliers / Supplier Detail | CRUD + saved column-mapping management + that supplier's import history |
| Products | Read-only cached view of what's in the connected POS |
| POS Connections | Credentials + location/shop config per platform, test connection |

## Notes on testing this app

Validated in a real Chromium browser via Playwright against a live backend + Postgres DB — registered a business, created a supplier, uploaded a deliberately messy sample CSV, walked the mapping UI, fixed a flagged row inline, bulk-approved the clean ones, approved the job, and downloaded the export. That run caught two real bugs (now fixed): the sidebar logout button was invisible (white text on the secondary button variant's white background), and file export used to be a plain `window.open()` that sent no `Authorization` header against an endpoint that requires one — it now streams an authenticated blob download instead. The push-to-POS panel's live network calls (Square/Shopify) could not be exercised the same way — this environment's outbound proxy blocks both platforms' APIs — see `../backend/README.md` for what was verified there instead.
