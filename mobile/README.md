# PO/Inventory Sync — Mobile App

React Native (Expo) app for capturing paper POs/invoices on the go. Talks to the `../backend` API.

## Setup

```bash
npm install
```

Set the API base URL in `app.json` → `expo.extra.apiBaseUrl` (defaults to `http://localhost:4000/api`). On a physical device, use your machine's LAN IP instead of `localhost`.

```bash
npm start        # Expo Dev Tools; scan the QR code with Expo Go, or press i / a
npm run ios
npm run android
```

Log in with a business registered through either the web app or `POST /api/auth/register-business`.

## Screens

| Screen | Purpose |
|---|---|
| Login / RegisterBusiness | Auth |
| Dashboard | Count of imports needing review, quick actions |
| Scan | Camera capture, image library import, or PDF import → uploads to `/api/scan/purchase-order` |
| Import Jobs | List/filter by status |
| Import Review | Per-row edit/approve (mirrors the web review screen), bulk-approve clean rows, approve the job, pick a supplier if OCR couldn't match one, push to a connected POS with per-row new-product confirmation, and view push history |

Camera capture and CSV/XLSX upload split deliberately by device: scanning is what you do standing at a delivery with a phone; column-mapping a spreadsheet is a desk job better suited to the web app (`../web`). Both converge on the exact same `ImportJob`/`ImportRow` review pipeline once a file's been ingested.

## Notes on testing this app

Validated by bundling the full app through Metro (`expo export`, 761 modules, zero errors) to confirm every screen and import resolves. Not exercised in an iOS/Android simulator or against a live backend in this environment — do that locally with `npm run ios`/`npm run android` pointed at a running backend before shipping.
