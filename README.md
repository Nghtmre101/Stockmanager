# Stock Manager

A local-first point-of-sale and inventory management web app built with TanStack Start (React, TypeScript, Tailwind CSS). All data is stored on-device (localStorage) so the shop keeps working offline, with optional cloud sync via Firebase Realtime Database.

## Features
- Sales (POS), purchases, refunds, and cash sessions
- Inventory with stock-movement ledger and low-stock alerts
- Customers, suppliers, staff payroll (salary / advances / bonuses / expenses)
- Reports (sales, profit, stock value)
- Local SQLite-like store exported/imported as a single JSON file
- Optional Firebase sync across devices

## Tech stack
- TanStack Start (React, file-based routing)
- TypeScript
- Tailwind CSS
- Firebase Realtime Database (optional sync)

## Development

Requires Node.js (>= 20) and pnpm.

```sh
pnpm install
pnpm dev
```

Open the printed local URL in your browser.

## Build

```sh
pnpm build
```

The production output is emitted to `.output/`.